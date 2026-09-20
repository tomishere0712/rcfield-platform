import { createContext, useContext, type ReactNode } from "react"
import { PublicFooter } from "@/shared/components/PublicFooter"
import { PublicHeader } from "@/shared/components/PublicHeader"

const PublicShellContext = createContext(false)

export function PublicPageShell({ children }: { children: ReactNode }) {
  const isNestedShell = useContext(PublicShellContext)

  if (isNestedShell) {
    return <>{children}</>
  }

  return (
    <PublicShellContext.Provider value>
      <div className="flex min-h-screen flex-col bg-slate-50/80 text-slate-950">
        <PublicHeader />
        <main className="flex-1">{children}</main>
        <PublicFooter />
      </div>
    </PublicShellContext.Provider>
  )
}


