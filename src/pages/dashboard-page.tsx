import { useMemo } from 'react'
import { BellRing, CarFront, HandCoins, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'

import { PageHeader } from '@/components/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { calculateRentalTotal, compareDocumentsByExpiry, formatCurrency, formatDate, getDocumentUrgencyLabel, getStatusBadgeVariant, getStatusLabel } from '@/lib/format'
import { useAppStore } from '@/store/app-store'

export function DashboardPage() {
  const { cars, documents, rentals, maintenance } = useAppStore()
  const income = rentals.reduce((sum, rental) => sum + calculateRentalTotal(rental.segments), 0)
  const expenses = maintenance.reduce((sum, item) => sum + item.cost, 0)

  const stats = [
    { label: 'Total mașini', value: cars.length, icon: CarFront },
    { label: 'Disponibile acum', value: cars.filter((item) => item.status === 'available').length, icon: BellRing },
    { label: 'Închirieri active', value: rentals.filter((item) => item.status === 'active').length, icon: HandCoins },
    { label: 'Intervenții', value: maintenance.length, icon: Wrench },
  ]

  const sortedDocumentAlerts = useMemo(
    () =>
      [...documents]
        .sort((first, second) => compareDocumentsByExpiry(first.expiryDate, second.expiryDate))
        .slice(0, 4)
        .map((document) => ({
          document,
          car: cars.find((carItem) => carItem.id === document.carId),
        })),
    [cars, documents],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        action={
          <Link to="/masini/nou">
            <Button>Adaugă mașină</Button>
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
            <p className="text-sm text-muted-foreground">Nu există documente de afișat momentan.</p>
          ) : (
            sortedDocumentAlerts.map(({ document, car }) => (
              <div key={document.id} className="rounded-2xl border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{document.customName ?? document.type}</p>
                    <p className="text-sm text-muted-foreground">
                      {car?.licensePlate ?? 'Mașină necunoscută'}
                      {' • '}
                      {document.expiryDate ? `Expiră la ${formatDate(document.expiryDate)}` : 'Fără dată de expirare setată'}
                    </p>
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
          <CardTitle>Mașini disponibile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-3">
          {cars.filter((item) => item.status === 'available').map((car) => (
            <Link key={car.id} to={`/masini/${car.id}`} className="rounded-3xl border bg-card p-5 transition hover:-translate-y-0.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-display text-xl font-bold">
                    {car.brand} {car.model}
                  </p>
                  <p className="text-sm text-muted-foreground">{car.licensePlate}</p>
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
