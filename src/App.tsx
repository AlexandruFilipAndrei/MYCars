import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { useAuthStore } from '@/store/auth-store'

const loadAppShell = () => import('@/components/app-shell')
const loadAuthPage = () => import('@/pages/auth-page')
const loadCarDetailsPage = () => import('@/pages/car-details-page')
const loadCarFormPage = () => import('@/pages/car-form-page')
const loadCarsPage = () => import('@/pages/cars-page')
const loadDashboardPage = () => import('@/pages/dashboard-page')
const loadMaintenancePage = () => import('@/pages/maintenance-page')
const loadNotificationsPage = () => import('@/pages/notifications-page')
const loadRentalsPage = () => import('@/pages/rentals-page')
const loadSettingsPage = () => import('@/pages/settings-page')
const loadStatisticsPage = () => import('@/pages/statistics-page')

const AppShell = lazy(() => loadAppShell().then((module) => ({ default: module.AppShell })))
const AuthPage = lazy(() => loadAuthPage().then((module) => ({ default: module.AuthPage })))
const CarDetailsPage = lazy(() => loadCarDetailsPage().then((module) => ({ default: module.CarDetailsPage })))
const CarFormPage = lazy(() => loadCarFormPage().then((module) => ({ default: module.CarFormPage })))
const CarsPage = lazy(() => loadCarsPage().then((module) => ({ default: module.CarsPage })))
const DashboardPage = lazy(() => loadDashboardPage().then((module) => ({ default: module.DashboardPage })))
const MaintenancePage = lazy(() => loadMaintenancePage().then((module) => ({ default: module.MaintenancePage })))
const NotificationsPage = lazy(() => loadNotificationsPage().then((module) => ({ default: module.NotificationsPage })))
const RentalsPage = lazy(() => loadRentalsPage().then((module) => ({ default: module.RentalsPage })))
const SettingsPage = lazy(() => loadSettingsPage().then((module) => ({ default: module.SettingsPage })))
const StatisticsPage = lazy(() => loadStatisticsPage().then((module) => ({ default: module.StatisticsPage })))

function preloadPrimaryRoutes() {
  void loadAppShell()
  void loadDashboardPage()
  void loadCarsPage()
  void loadRentalsPage()
  void loadMaintenancePage()
  void loadNotificationsPage()
  void loadSettingsPage()
  void loadCarFormPage()
}

function preloadSecondaryRoutes() {
  void loadCarDetailsPage()
  void loadStatisticsPage()
}

function AppBootScreen() {
  return (
    <div className="page-shell">
      <aside className="glass-panel hidden w-72 shrink-0 p-4 md:block" />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col gap-4 md:pl-0">
        <div className="glass-panel sticky top-3 h-[74px] shrink-0" />
        <div className="flex flex-1 items-center justify-center">
          <div role="status" aria-live="polite" className="glass-panel px-5 py-3 text-sm font-medium text-muted-foreground">
            Se incarca datele...
          </div>
        </div>
      </div>
    </div>
  )
}

function ProtectedRoute() {
  const { user, isLoading } = useAuthStore()

  if (user) {
    return <AppShell />
  }

  if (isLoading) {
    return <AppBootScreen />
  }

  return <Navigate to="/autentificare" replace />
}

export default function App() {
  const { initialize, user } = useAuthStore()

  useEffect(() => {
    void initialize()
  }, [initialize])

  useEffect(() => {
    if (!user) {
      return
    }

    const primaryTimer = window.setTimeout(() => {
      preloadPrimaryRoutes()
    }, 0)
    const secondaryTimer = window.setTimeout(() => {
      preloadSecondaryRoutes()
    }, 1200)

    return () => {
      window.clearTimeout(primaryTimer)
      window.clearTimeout(secondaryTimer)
    }
  }, [user])

  return (
    <BrowserRouter>
      <Suspense fallback={<AppBootScreen />}>
        <Routes>
          <Route path="/autentificare" element={<AuthPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/masini" element={<CarsPage />} />
            <Route path="/masini/nou" element={<CarFormPage />} />
            <Route path="/masini/:id" element={<CarDetailsPage />} />
            <Route path="/masini/:id/editeaza" element={<CarFormPage />} />
            <Route path="/inchirieri" element={<RentalsPage />} />
            <Route path="/reparatii" element={<MaintenancePage />} />
            <Route path="/statistici" element={<StatisticsPage />} />
            <Route path="/notificari" element={<NotificationsPage />} />
            <Route path="/setari" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
