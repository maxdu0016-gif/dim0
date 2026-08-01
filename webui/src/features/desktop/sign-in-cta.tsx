import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { SidebarMenuButton } from "@/components/ui/sidebar"
import { GlobeIcon, UserProfileIcon } from "@/components/icons"
import { isTauri } from "@/platform"
import { getDesktopApiBase } from "./desktop-config"
import { DesktopServerDialog } from "./desktop-server-dialog"


const CTA_CLASS =
  "h-auto py-2 flex items-center gap-2 font-medium text-xs min-w-0 flex-1 text-secondary-foreground"


/**
 * Signed-out account CTA. In the browser it's just "Sign in". On desktop sign-in
 * needs a server first: with none configured the button opens the server dialog;
 * once a server is set it offers sign-in plus a way to change the server.
 */
export function SignInCta() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const desktop = isTauri()
  const server = desktop ? getDesktopApiBase() : undefined

  if (desktop && !server) {
    return (
      <>
        <SidebarMenuButton className={CTA_CLASS} onClick={() => setOpen(true)}>
          <GlobeIcon className="size-4 shrink-0" strokeWidth={2} />
          <span>Connect a server to sign in</span>
        </SidebarMenuButton>
        <DesktopServerDialog open={open} onOpenChange={setOpen} />
      </>
    )
  }

  return (
    <>
      <SidebarMenuButton className={CTA_CLASS} onClick={() => navigate({ to: "/signin" })}>
        <UserProfileIcon className="size-4 shrink-0" strokeWidth={2} />
        <span>Sign in to sync &amp; share</span>
      </SidebarMenuButton>
      {desktop ? (
        <>
          <button
            type="button"
            aria-label="Server settings"
            className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(true)}
          >
            <GlobeIcon className="size-4" strokeWidth={2} />
          </button>
          <DesktopServerDialog open={open} onOpenChange={setOpen} />
        </>
      ) : null}
    </>
  )
}
