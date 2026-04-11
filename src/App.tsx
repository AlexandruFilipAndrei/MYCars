import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { useAuthStore } from '@/store/auth-store'

const AppShell = lazy(() => import('@/components/app-shell').then((module) => ({ default: module.AppShell })))
const AuthPage = lazy(() => import('@/pages/auth-page').then((module) => ({ default: module.AuthPage })))
const CarDetailsPage = lazy(() => import('@/pages/car-details-page').then((module) => ({ default: module.CarDetailsPage })))
const CarFormPage = lazy(() => import('@/pages/car-form-page').then((module) => ({ default: module.CarFormPage })))
const CarsPage = lazy(() => import('@/pages/cars-page').then((module) => ({ default: module.CarsPage })))
const DashboardPage = lazy(() => import('@/pages/dashboard-page').then((module) => ({ default: module.DashboardPage })))
const MaintenancePage = lazy(() => import('@/pages/maintenance-page').then((module) => ({ default: module.MaintenancePage })))
const NotificationsPage = lazy(() => import('@/pages/notifications-page').then((module) => ({ default: module.NotificationsPage })))
const RentalsPage = lazy(() => import('@/pages/rentals-page').then((module) => ({ default: module.RentalsPage })))
const SettingsPage = lazy(() => import('@/pages/settings-page').then((module) => ({ default: module.SettingsPage })))
const StatisticsPage = lazy(() => import('@/pages/statistics-page').then((module) => ({ default: module.StatisticsPage })))

function FullScreenLoader({ message }: { message: string }) {
  return <div className="flex min-h-screen items-center justify-center text-lg font-semibold">{message}</div>
}

function ProtectedRoute() {
  const { user, isLoading } = useAuthStore()

  if (isLoading) {
    return <FullScreenLoader message="Se încarcă aplicația..." />
  }

  if (!user) {
    return <Navigate to="/autentificare" replace />
  }

  return <AppShell />
}

export default function App() {
  const { initialize } = useAuthStore()

  useEffect(() => {
    void initialize()
  }, [initialize])

  return (
    <BrowserRouter>
      <Suspense fallback={<FullScreenLoader message="Se încarcă aplicația..." />}>
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
