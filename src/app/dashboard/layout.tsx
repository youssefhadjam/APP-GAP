import LogoutButton from "./LogoutButton";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-sm">
              <span className="text-base font-bold text-white">G</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                APP-GAP
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Plateforme unifiée
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                admin
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Administrateur
              </p>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
