import { ProfileSidebar } from "../profile/components/ProfileSidebar"

interface CustomerPageShellProps {
  children: React.ReactNode
}

export function CustomerPageShell({ children }: CustomerPageShellProps) {
  return (
    <div className="min-h-screen bg-muted/30 px-4 py-6 md:px-6">
      <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="lg:sticky lg:top-6">
            <ProfileSidebar />
          </div>
        </aside>
        <main className="min-w-0 space-y-5">
          {children}
        </main>
      </div>
    </div>
  )
}
