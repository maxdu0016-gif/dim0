/**
 * SQLite implementation of `StorageEngine` — the desktop (Tauri) storage backend.
 *
 * Mirrors `IndexedDbEngine` semantics over a SQL database: one table per
 * collection (see `sqlite-schema.ts`), the value stored as a JSON `data` column,
 * and key/index fields mirrored into affinity-free columns so ranges, secondary
 * indexes, ordering, and atomic transactions all resolve in SQL. Repositories are
 * unchanged — this is a drop-in swap for `IndexedDbEngine` behind the port.
 *
 * The concrete SQL driver is injected (`SqlDb`) so the same engine runs on the
 * Tauri rusqlite commands (`sql_execute`/`sql_select`/`sql_tx`) in production and
 * on an in-process SQLite in tests — both exercised by `runEngineContract`.
 */
import { isKeyRange } from "./engine"
import type { Collection, Key, KeyRange, Query, StorageEngine, Txn } from "./engine"
import { ALL_DDL, tablePlan } from "./sqlite-schema"
import type { TablePlan } from "./sqlite-schema"


/** Values a SQL driver can bind/return. */
export type SqlValue = string | number | null


/** One statement in a transaction batch. */
export type SqlStatement = { sql: string; params?: SqlValue[] }


/**
 * Minimal SQL driver the engine needs. Satisfied by the Tauri rusqlite commands
 * in production and by an in-process SQLite adapter in tests. `batch` MUST run
 * its statements in one atomic transaction (all-or-nothing) — that is what makes
 * `tx()` real; separate `execute` calls are not guaranteed to be transactional.
 */
export interface SqlDb {
  execute(query: string, bind?: SqlValue[]): Promise<void>
  select<T = Record<string, unknown>>(query: string, bind?: SqlValue[]): Promise<T[]>
  batch(statements: SqlStatement[]): Promise<void>
  close(): Promise<void>
}


const asArray = (kp: string | string[]): string[] => (Array.isArray(kp) ? kp : [kp])

const keyToArray = (key: Key): SqlValue[] => (Array.isArray(key) ? key : [key])

const field = (value: unknown, name: string): SqlValue =>
  ((value as Record<string, unknown>)[name] ?? null) as SqlValue


/** `col = ?`-per-column match for an exact (primary) key lookup. */
const eqClause = (cols: string[]): string => cols.map((c) => `"${c}" = ?`).join(" AND ")


/** One bound comparison over `cols` (row-value tuple when compound). */
const compare = (cols: string[], op: string): string =>
  cols.length === 1
    ? `"${cols[0]}" ${op} ?`
    : `(${cols.map((c) => `"${c}"`).join(", ")}) ${op} (${cols.map(() => "?").join(", ")})`


/** Translate a `KeyRange` over `cols` into a WHERE fragment + bound params. */
const rangeClause = (cols: string[], r: KeyRange): { sql: string; params: SqlValue[] } => {
  const parts: string[] = []
  const params: SqlValue[] = []
  // A bound may be a prefix of a compound key (fewer values than pk columns);
  // compare only the columns it provides, so the placeholder count matches the
  // param count and the prefix semantics track the IndexedDb/in-memory engines.
  const addBound = (op: string, key: Key): void => {
    const vals = keyToArray(key)
    parts.push(compare(cols.slice(0, vals.length), op))
    params.push(...vals)
  }
  if (r.lower !== undefined) addBound(r.lowerOpen ? ">" : ">=", r.lower)
  if (r.upper !== undefined) addBound(r.upperOpen ? "<" : "<=", r.upper)
  return { sql: parts.join(" AND "), params }
}


export class SqliteEngine implements StorageEngine {
  private readonly db: SqlDb


  private constructor(db: SqlDb) {
    this.db = db
  }


  /**
   * Open the desktop SQLite database (rusqlite, opened by the Tauri shell) and
   * run migrations. Drives the `sql_execute` / `sql_select` / `sql_tx` commands.
   */
  static async open(): Promise<SqliteEngine> {
    const { invoke } = await import("@tauri-apps/api/core")
    const db: SqlDb = {
      execute: async (sql, params = []) => {
        await invoke("sql_execute", { sql, params })
      },
      select: <T>(sql: string, params: SqlValue[] = []) =>
        invoke<T[]>("sql_select", { sql, params }),
      batch: async (statements) => {
        await invoke("sql_tx", { statements })
      },
      close: async () => {},
    }
    return SqliteEngine.fromDb(db)
  }


  /** Build an engine over an already-open driver (used by tests). Runs migrations. */
  static async fromDb(db: SqlDb): Promise<SqliteEngine> {
    const engine = new SqliteEngine(db)
    for (const stmt of ALL_DDL) await db.execute(stmt)
    return engine
  }


  private plan(c: Collection): TablePlan {
    return tablePlan(c)
  }


  /** Primary-key column values for a write: from the value, or the out-of-line key. */
  private pkValues(p: TablePlan, value: unknown, key?: Key): SqlValue[] {
    if (p.keyPath === null) {
      if (key === undefined) throw new Error(`${p.name}: out-of-line key required`)
      if (Array.isArray(key)) throw new Error(`${p.name}: compound out-of-line keys unsupported`)
      return [key]
    }
    return asArray(p.keyPath).map((f) => field(value, f))
  }


  async get<T>(c: Collection, key: Key): Promise<T | undefined> {
    const p = this.plan(c)
    const rows = await this.db.select<{ data: string }>(
      `SELECT "data" FROM "${c}" WHERE ${eqClause(p.pk)} LIMIT 1`,
      keyToArray(key),
    )
    return rows[0] ? (JSON.parse(rows[0].data) as T) : undefined
  }


  async list<T>(c: Collection, q: Query = {}): Promise<T[]> {
    const p = this.plan(c)
    let cols = p.pk
    const filters: string[] = []
    if (q.index) {
      const idx = p.indexes.find((i) => i.name === q.index)
      if (!idx) throw new Error(`${c}: unknown index "${q.index}"`)
      cols = [idx.col]
      // IndexedDB index iteration skips records missing the indexed key; match it.
      filters.push(`"${idx.col}" IS NOT NULL`)
    }
    const range = q.range ? rangeClause(cols, q.range) : { sql: "", params: [] }
    if (range.sql) filters.push(range.sql)
    const dir = q.order === "desc" ? "DESC" : "ASC"
    // Index reads order by the index column first, then the pk for a stable tie-break.
    const orderCols = [...new Set(q.index ? [...cols, ...p.pk] : p.pk)]
    const orderBy = orderCols.map((col) => `"${col}" ${dir}`).join(", ")
    const rows = await this.db.select<{ data: string }>(
      `SELECT "data" FROM "${c}"${filters.length ? ` WHERE ${filters.join(" AND ")}` : ""} ORDER BY ${orderBy}`,
      range.params,
    )
    return rows.map((r) => JSON.parse(r.data) as T)
  }


  /** Build the INSERT-OR-REPLACE for a value, plus its primary-key values. */
  private putStatement(p: TablePlan, value: unknown, key?: Key): SqlStatement & { pk: SqlValue[] } {
    const colValue = new Map<string, SqlValue>()
    const pkv = this.pkValues(p, value, key)
    p.pk.forEach((col, i) => colValue.set(col, pkv[i]))
    p.indexes.forEach((idx) => colValue.set(idx.col, field(value, idx.col)))
    const cols = [...colValue.keys()]
    const sql =
      `INSERT OR REPLACE INTO "${p.name}" (${[...cols, "data"].map((col) => `"${col}"`).join(", ")}) ` +
      `VALUES (${[...cols, "data"].map(() => "?").join(", ")})`
    const params: SqlValue[] = [...cols.map((col) => colValue.get(col) ?? null), JSON.stringify(value)]
    return { sql, params, pk: pkv }
  }


  /** Build the DELETE for a single key or a key range. */
  private deleteStatement(p: TablePlan, key: Key | KeyRange): SqlStatement {
    if (isKeyRange(key)) {
      const r = rangeClause(p.pk, key)
      return { sql: `DELETE FROM "${p.name}"${r.sql ? ` WHERE ${r.sql}` : ""}`, params: r.params }
    }
    return { sql: `DELETE FROM "${p.name}" WHERE ${eqClause(p.pk)}`, params: keyToArray(key) }
  }


  async put<T>(c: Collection, value: T, key?: Key): Promise<void> {
    const { sql, params } = this.putStatement(this.plan(c), value, key)
    await this.db.execute(sql, params)
  }


  async delete(c: Collection, key: Key | KeyRange): Promise<void> {
    const { sql, params } = this.deleteStatement(this.plan(c), key)
    await this.db.execute(sql, params)
  }


  /**
   * Run `fn` atomically. Writes made through the `Txn` handle are BUFFERED and
   * flushed as one transaction (`SqlDb.batch`) only if `fn` resolves; if it
   * throws, the buffer is discarded and nothing is written. Reads see committed
   * state plus this tx's own buffered writes (a `get` overlay), so read-your-writes
   * holds. This buffering is what makes `tx` truly atomic — issuing BEGIN/COMMIT
   * as separate calls is not, since the driver may spread them across connections.
   */
  async tx<R>(_collections: Collection[], fn: (t: Txn) => Promise<R>): Promise<R> {
    const writes: SqlStatement[] = []
    const overlay = new Map<string, { value?: unknown; deleted?: boolean }>()
    const okey = (c: Collection, key: Key): string => `${c}:${JSON.stringify(keyToArray(key))}`

    const handle: Txn = {
      get: async <T>(c: Collection, key: Key): Promise<T | undefined> => {
        const o = overlay.get(okey(c, key))
        if (o) return o.deleted ? undefined : (o.value as T)
        return this.get<T>(c, key)
      },
      // Reads a range/index from committed state. No current caller lists rows it
      // wrote earlier in the same tx, so a committed read is correct here.
      list: (c, q) => this.list(c, q),
      put: async (c, value, key) => {
        const p = this.plan(c)
        const st = this.putStatement(p, value, key)
        writes.push({ sql: st.sql, params: st.params })
        overlay.set(`${c}:${JSON.stringify(st.pk)}`, { value })
      },
      delete: async (c, key) => {
        const p = this.plan(c)
        writes.push(this.deleteStatement(p, key))
        if (!isKeyRange(key)) overlay.set(okey(c, key), { deleted: true })
      },
    }

    const result = await fn(handle)
    if (writes.length) await this.db.batch(writes)
    return result
  }


  close(): void {
    void this.db.close()
  }
}
