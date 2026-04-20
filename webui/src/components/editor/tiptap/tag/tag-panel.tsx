import type { TagGroup } from "./tag-utils"


type Props = { tags: TagGroup[] }


/** Displays extracted #tag and #key:value tokens grouped by key above the editor. */
export function TagPanel({ tags }: Props) {
  if (tags.length === 0) return null

  return (
    <div className="tag-panel">
      {tags.map(({ key, values }) => (
        <div key={key} className="tag-row">
          <span className="tag-row-key">{key}</span>
          <div className="tag-row-values">
            {values.length > 0
              ? values.map((v) => (
                  <span key={v} className="tag-chip tag-chip--kv">
                    <span className="tag-chip-key">{key}</span>
                    <span className="tag-chip-sep">›</span>
                    <span className="tag-chip-val">{v}</span>
                  </span>
                ))
              : (
                  <span className="tag-chip tag-chip--plain">
                    #{key}
                  </span>
                )}
          </div>
        </div>
      ))}
    </div>
  )
}
