import { useState } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  clearDesktopApiBase,
  getDesktopApiBase,
  isInsecureRemote,
  normalizeApiBase,
  setDesktopApiBase,
} from "./desktop-config"


type DesktopServerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}


/**
 * Desktop-only dialog to point the app at a remote server. Saving persists the
 * URL and reloads the app (so `API_URL` re-resolves everywhere), after which
 * sign-in unlocks managed AI + synced boards. Disconnecting returns to local-only.
 */
export function DesktopServerDialog({ open, onOpenChange }: DesktopServerDialogProps) {
  const current = getDesktopApiBase()
  // Prefill with the effective server: the user's override if set, else the
  // baked-in default (VITE_API_URL), so this "change server" screen shows what's
  // in use. Disconnect below is gated on `current` — it only clears an override.
  const [url, setUrl] = useState(current ?? import.meta.env.VITE_API_URL ?? "")
  const [testing, setTesting] = useState(false)

  const save = (): void => {
    try {
      setDesktopApiBase(url) // validates, persists, then reloads the app
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid server URL")
    }
  }

  const test = async (): Promise<void> => {
    let base: string
    try {
      base = normalizeApiBase(url)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid server URL")
      return
    }
    setTesting(true)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    try {
      const res = await fetch(`${base}/billing/public-config`, {
        method: "GET",
        signal: ctrl.signal,
      })
      if (res.ok) toast.success("Server reachable")
      else toast.error(`Server responded ${res.status}`)
    } catch {
      toast.error("Couldn't reach the server (network, CORS, or wrong URL)")
    } finally {
      clearTimeout(timer)
      setTesting(false)
    }
  }

  // Warn when the entered URL would send credentials/data over plaintext http.
  const insecure = (() => {
    try {
      return isInsecureRemote(normalizeApiBase(url))
    } catch {
      return false
    }
  })()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect to a server</DialogTitle>
          <DialogDescription>
            Point this app at a Dim0 server to sign in, use managed AI, and sync
            boards across devices. Leave it unset to stay fully local and offline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="server-url">Server URL</Label>
          <Input
            id="server-url"
            placeholder="https://your-dim0-server.example"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          {insecure ? (
            <p className="text-xs text-destructive">
              This server uses plain http — your sign-in and board data would be sent
              unencrypted. Use https unless it&apos;s a trusted local network.
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {current ? (
              <Button variant="ghost" onClick={() => clearDesktopApiBase()}>
                Disconnect
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={test} disabled={testing || !url.trim()}>
              {testing ? "Testing…" : "Test"}
            </Button>
            <Button onClick={save} disabled={!url.trim()}>
              Save &amp; reload
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
