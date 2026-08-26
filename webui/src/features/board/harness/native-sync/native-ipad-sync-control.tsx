import { useCallback, useEffect, useRef, useState } from "react"
import type { CanvasStore } from "@canvas-harness/core"
import { LinkIcon, LoaderRefreshIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { applyNativeInkSnapshot } from "./apply-native-snapshot"
import { parseNativeSyncMessage } from "./wire"


type ConnectionState = "disconnected" | "connecting" | "connected" | "error"

const ADDRESS_KEY = "dim0.native-sync.address"
const CODE_KEY = "dim0.native-sync.code"

const storageValue = (key: string): string => {
  try {
    return window.localStorage.getItem(key) ?? ""
  } catch {
    return ""
  }
}

const storeValue = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // A private browser can reject storage; pairing still works for this tab.
  }
}

const websocketUrl = (address: string): string => {
  const withScheme = /^wss?:\/\//i.test(address) ? address : `ws://${address}`
  const url = new URL(withScheme)
  if (!url.port) url.port = "8765"
  return url.toString()
}

const stateLabel: Record<ConnectionState, string> = {
  disconnected: "未连接",
  connecting: "连接中",
  connected: "已连接",
  error: "连接失败",
}

const stateColor: Record<ConnectionState, string> = {
  disconnected: "bg-muted-foreground/50",
  connecting: "bg-amber-500",
  connected: "bg-emerald-500",
  error: "bg-destructive",
}


type NativeIpadSyncControlProps = {
  store: CanvasStore
  boardId: string
  parentId: string | null
}


/** Pair the current browser canvas with the foreground iPad PencilKit app over LAN. */
export function NativeIpadSyncControl({
  store,
  boardId,
  parentId,
}: NativeIpadSyncControlProps) {
  const socketRef = useRef<WebSocket | null>(null)
  const latestRevisionRef = useRef(new Map<string, number>())
  const [address, setAddress] = useState(() => storageValue(ADDRESS_KEY))
  const [code, setCode] = useState(() => storageValue(CODE_KEY))
  const [state, setState] = useState<ConnectionState>("disconnected")
  const [message, setMessage] = useState("iPad 和电脑需连接同一个 Wi-Fi")

  const disconnect = useCallback(() => {
    const socket = socketRef.current
    socketRef.current = null
    if (socket) {
      socket.onopen = null
      socket.onclose = null
      socket.onerror = null
      socket.onmessage = null
      socket.close()
    }
    setState("disconnected")
    setMessage("已断开，可随时重新连接")
  }, [])

  const requestSnapshot = useCallback(() => {
    const socket = socketRef.current
    if (socket?.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify({ kind: "dim0.native-ink.request-snapshot" }))
    setMessage("正在从 iPad 读取完整笔迹…")
  }, [])

  const connect = useCallback(() => {
    if (!address.trim() || !/^\d{6}$/.test(code.trim())) {
      setState("error")
      setMessage("请填写 iPad 地址和 6 位配对码")
      return
    }

    let url: string
    try {
      url = websocketUrl(address.trim())
    } catch {
      setState("error")
      setMessage("iPad 地址格式不正确")
      return
    }

    disconnect()
    storeValue(ADDRESS_KEY, address.trim())
    storeValue(CODE_KEY, code.trim())
    const socket = new WebSocket(url)
    socketRef.current = socket
    setState("connecting")
    setMessage("正在连接 iPad…")

    socket.onopen = () => {
      socket.send(JSON.stringify({
        kind: "dim0.native-ink.hello",
        code: code.trim(),
      }))
    }
    socket.onmessage = (event) => {
      if (typeof event.data !== "string") return
      const parsed = parseNativeSyncMessage(event.data)
      if (!parsed) {
        setState("error")
        setMessage("iPad 返回了无法识别的数据")
        return
      }
      if (parsed.kind === "dim0.native-ink.ready") {
        setState("connected")
        setMessage("已连接，正在读取 iPad 笔迹")
        requestSnapshot()
        return
      }

      const previousRevision = latestRevisionRef.current.get(parsed.sessionId) ?? -1
      if (parsed.revision < previousRevision) return
      latestRevisionRef.current.set(parsed.sessionId, parsed.revision)
      const result = applyNativeInkSnapshot(store, parsed, boardId, parentId)
      setState("connected")
      setMessage(`同步完成：${result.total} 笔（新增 ${result.added}，移除 ${result.removed}）`)
    }
    socket.onerror = () => {
      setState("error")
      setMessage("连接失败，请确认地址、Wi-Fi 和 iPad 应用保持打开")
    }
    socket.onclose = () => {
      if (socketRef.current !== socket) return
      socketRef.current = null
      setState((current) => current === "error" ? "error" : "disconnected")
      setMessage((current) => current.includes("失败") ? current : "连接已断开")
    }
  }, [address, boardId, code, disconnect, parentId, requestSnapshot, store])

  useEffect(() => disconnect, [disconnect])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2 bg-background/90 shadow-sm backdrop-blur"
          aria-label={`iPad 同步：${stateLabel[state]}`}
        >
          <span className={`size-2 rounded-full ${stateColor[state]}`} />
          <span className="hidden sm:inline">iPad</span>
          <LinkIcon className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-4">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">iPad 笔迹同步</h3>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`size-2 rounded-full ${stateColor[state]}`} />
              {stateLabel[state]}
            </span>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            写字始终在 iPad 本地完成；只有点击同步时才传输完整笔迹。
          </p>
        </div>

        <div className="space-y-3">
          <label className="block space-y-1.5 text-xs font-medium">
            iPad 地址
            <Input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="例如 192.168.1.25:8765"
              disabled={state === "connecting" || state === "connected"}
            />
          </label>
          <label className="block space-y-1.5 text-xs font-medium">
            6 位配对码
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              maxLength={6}
              disabled={state === "connecting" || state === "connected"}
              className="font-mono tracking-[0.28em]"
            />
          </label>
        </div>

        {state === "connected" ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={disconnect}>断开</Button>
            <Button size="sm" onClick={requestSnapshot}>
              <LoaderRefreshIcon />
              立即同步
            </Button>
          </div>
        ) : (
          <Button size="sm" className="w-full" onClick={connect} disabled={state === "connecting"}>
            {state === "connecting" ? <LoaderRefreshIcon className="animate-spin" /> : <LinkIcon />}
            {state === "connecting" ? "正在连接" : "连接 iPad"}
          </Button>
        )}

        <p className="rounded-md bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground">
          {message}
        </p>
      </PopoverContent>
    </Popover>
  )
}
