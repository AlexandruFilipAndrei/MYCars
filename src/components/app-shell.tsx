import { useEffect, useMemo, useState } from 'react'
import { Bell, CarFront, ChartColumn, Gauge, Menu, Settings, ShieldAlert, Wrench } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'
import { useAuthStore } from '@/store/auth-store'

const navigation = [
  { to: '/', label: 'Dashboard', icon: Gauge },
  { to: '/masini', label: 'Mașini', icon: CarFront },
  { to: '/inchirieri', label: 'Închirieri', icon: ShieldAlert },
  { to: '/reparatii', label: 'Reparații', icon: Wrench },
  { to: '/statistici', label: 'Statistici', icon: ChartColumn },
  { to: '/notificari', label: 'Notificări', icon: Bell },
  { to: '/setari', label: 'Setări', icon: Settings },
]

function useDarkMode() {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('mycars-theme') === 'dark')

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    localStorage.setItem('mycars-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  return { isDark, setIsDark }
}

export function AppShell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const { notifications, bootstrap, isLoading, profile } = useAppStore()
  const { user, signOut, isDemo } = useAuthStore()
  const { isDark, setIsDark } = useDarkMode()
  const userId = user?.id ?? null
  const userEmail = user?.email ?? ''
  const userFullName = user?.fullName ?? ''

  useEffect(() => {
    void bootstrap(userId ? { id: userId, email: userEmail, fullName: userFullName } : null)
  }, [bootstrap, userEmail, userFullName, userId])

  const unreadCount = useMemo(() => notifications.filter((item) => !item.isRead).length, [notifications])

  return (
    <div className="page-shell">
      <aside
        className={cn(
          'glass-panel fixed inset-y-3 left-3 z-40 w-72 shrink-0 p-4 transition-transform md:static md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-[120%]',
        )}
      >
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
            <CarFront className="h-6 w-6" />
          </div>
          <div>
            <p className="font-display text-xl font-bold">MYCars</p>
            <p className="text-sm text-muted-foreground">Manage Your Cars</p>
          </div>
        </div>

        <nav className="space-y-2">
          {navigation.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-colors',
                    isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                  )
                }
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </NavLink>
            )
          })}
        </nav>

        {isDemo ? (
          <div className="mt-8 rounded-3xl bg-secondary p-4">
            <p className="font-semibold">Mod demo activ</p>
            <p className="mt-1 text-sm text-muted-foreground">Datele sunt locale și doar pentru test.</p>
          </div>
        ) : null}
      </aside>

      {open ? <button className="fixed inset-0 z-30 bg-slate-950/30 md:hidden" onClick={() => setOpen(false)} /> : null}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col gap-4 md:pl-0">
        <header className="glass-panel sticky top-3 z-20 flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="outline" size="icon" className="md:hidden" onClick={() => setOpen((value) => !value)}>
              <Menu className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Bine ai revenit</p>
              <p className="truncate font-display text-xl font-bold">{profile?.fullName ?? user?.fullName ?? 'Utilizator MYCars'}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <button className="relative rounded-2xl border bg-card p-3" onClick={() => navigate('/notificari')} aria-label="Notificări">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-xs text-white">
                  {unreadCount}
                </span>
              ) : null}
            </button>
            <Button variant="outline" onClick={() => setIsDark(!isDark)}>
              {isDark ? 'Mod luminos' : 'Mod întunecat'}
            </Button>
            <Badge variant="default" className="hidden lg:inline-flex">
              {user?.email}
            </Badge>
            <Button variant="ghost" onClick={() => void signOut()}>
              Ieșire
            </Button>
          </div>
        </header>

        <main className="min-w-0 flex-1 pb-6">
          {isLoading ? (
            <div className="flex min-h-[50vh] items-center justify-center text-lg font-semibold">Se încarcă datele contului...</div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>

      <Toaster position="top-right" toastOptions={{ className: '!rounded-2xl !bg-card !text-foreground !border !border-border' }} />
    </div>
  )
}
