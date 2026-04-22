import { useMemo } from 'react'
import { BellRing, CarFront, HandCoins, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'

import { FleetOwnerBadge, PageHeader } from '@/components/shared'
import { useFleetFilter } from '@/components/fleet-filter'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  calculateRentalTotal,
  compareDocumentsByExpiry,
  formatCurrency,
  formatDate,
  getDocumentUrgency,
  getDocumentUrgencyLabel,
  getStatusBadgeVariant,
  getStatusLabel,
} from '@/lib/format'
import { getSharedFleetLabel } from '@/lib/fleet-access'
import { useAppStore } from '@/store/app-store'

export function DashboardPage() {
  const { cars, documents, rentals, maintenance, profile, incomingInvites } = useAppStore()
  const { matchesOwner } = useFleetFilter()
  const carsById = useMemo(() => new Map(cars.map((car) => [car.id, car])), [cars])
  const filteredCars = useMemo(() => cars.filter((car) => matchesOwner(car.ownerId)), [cars, matchesOwner])
  const filteredDocuments = useMemo(
    () => documents.filter((document) => matchesOwner(carsById.get(document.carId)?.ownerId ?? '')),
    [carsById, documents, matchesOwner],
  )
  const filteredRentals = useMemo(
    () => rentals.filter((rental) => matchesOwner(carsById.get(rental.carId)?.ownerId ?? '')),
    [carsById, matchesOwner, rentals],
  )
  const filteredMaintenance = useMemo(
    () => maintenance.filter((item) => matchesOwner(carsById.get(item.carId)?.ownerId ?? '')),
    [carsById, maintenance, matchesOwner],
  )

  const income = filteredRentals
    .filter((rental) => rental.status !== 'cancelled')
    .reduce((sum, rental) => sum + calculateRentalTotal(rental.segments), 0)
  const expenses = filteredMaintenance.reduce((sum, item) => sum + item.cost, 0)

  const stats = [
    { label: 'Total masini', value: filteredCars.length, icon: CarFront },
    { label: 'Disponibile acum', value: filteredCars.filter((item) => item.status === 'available').length, icon: BellRing },
    { label: 'Inchirieri active', value: filteredRentals.filter((item) => item.status === 'active').length, icon: HandCoins },
    { label: 'Interventii', value: filteredMaintenance.length, icon: Wrench },
  ]

  const sortedDocumentAlerts = useMemo(
    () =>
      [...filteredDocuments]
        .filter((document) => getDocumentUrgency(document.expiryDate) !== 'ok')
        .sort((first, second) => compareDocumentsByExpiry(first.expiryDate, second.expiryDate))
        .slice(0, 4)
        .map((document) => ({
          document,
          car: carsById.get(document.carId),
        })),
    [carsById, filteredDocuments],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        action={
          <Link to="/masini/nou">
            <Button>Adauga masina</Button>
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => {
          const Icon = item.icon
          return (
            <Card key={item.label}>
              <CardContent className="flex items-center justify-between p-6">
                <div>
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  <p className="mt-2 font-display text-4xl font-bold">{item.value}</p>
                </div>
                <div className="rounded-2xl bg-secondary p-4">
                  <Icon className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rezumat financiar</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <FinanceBox label="Venituri estimate" value={formatCurrency(income)} tone="text-emerald-600 dark:text-emerald-300" />
          <FinanceBox label="Cheltuieli" value={formatCurrency(expenses)} tone="text-red-600 dark:text-red-300" />
          <FinanceBox label="Profit" value={formatCurrency(income - expenses)} tone="text-primary" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alerte documente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {sortedDocumentAlerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nu exista documente de afisat momentan.</p>
          ) : (
            sortedDocumentAlerts.map(({ document, car }) => (
              <div key={document.id} className="rounded-2xl border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{document.customName ?? document.type}</p>
                    <p className="text-sm text-muted-foreground">
                      {car?.licensePlate ?? 'Masina necunoscuta'}
                      {' • '}
                      {document.expiryDate ? `Expira la ${formatDate(document.expiryDate)}` : 'Fara data de expirare setata'}
                    </p>
                    <FleetOwnerBadge label={car ? getSharedFleetLabel(profile, incomingInvites, car.ownerId) : undefined} className="mt-2" />
                  </div>
                  <Badge variant={document.expiryDate ? 'warning' : 'muted'}>{getDocumentUrgencyLabel(document.expiryDate)}</Badge>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Masini disponibile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-3">
          {filteredCars.filter((item) => item.status === 'available').map((car) => (
            <Link key={car.id} to={`/masini/${car.id}`} className="rounded-3xl border bg-card p-5 transition hover:-translate-y-0.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-display text-xl font-bold">
                    {car.brand} {car.model}
                  </p>
                  <p className="text-sm text-muted-foreground">{car.licensePlate}</p>
                  <FleetOwnerBadge label={getSharedFleetLabel(profile, incomingInvites, car.ownerId)} className="mt-2" />
                </div>
                <Badge variant={getStatusBadgeVariant(car.status)}>{getStatusLabel(car.status)}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                <div>
                  <p>An</p>
                  <p className="font-semibold text-foreground">{car.year}</p>
                </div>
                <div>
                  <p>KM</p>
                  <p className="font-semibold text-foreground">{car.currentKm.toLocaleString('ro-RO')}</p>
                </div>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function FinanceBox({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-3xl border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-2 font-display text-3xl font-bold ${tone}`}>{value}</p>
    </div>
  )
}
