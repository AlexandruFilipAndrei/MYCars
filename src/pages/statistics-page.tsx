import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { format as formatDate, subMonths } from 'date-fns'

import { useFleetFilter } from '@/components/fleet-filter'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { calculateRentalTotal, formatCurrency } from '@/lib/format'
import { useAppStore } from '@/store/app-store'

export function StatisticsPage() {
  const { cars, rentals, maintenance } = useAppStore()
  const { matchesOwner } = useFleetFilter()
  const carsById = useMemo(() => new Map(cars.map((car) => [car.id, car])), [cars])
  const filteredRentals = useMemo(
    () => rentals.filter((item) => matchesOwner(carsById.get(item.carId)?.ownerId ?? '')),
    [carsById, matchesOwner, rentals],
  )
  const filteredMaintenance = useMemo(
    () => maintenance.filter((item) => matchesOwner(carsById.get(item.carId)?.ownerId ?? '')),
    [carsById, maintenance, matchesOwner],
  )
  const tooltipFormatter = (value: unknown) => {
    const normalized = Array.isArray(value) ? Number(value[0] ?? 0) : Number(value ?? 0)
    return formatCurrency(normalized)
  }

  const monthlyData = Array.from({ length: 6 }).map((_, index) => {
    const date = subMonths(new Date(), 5 - index)
    const key = formatDate(date, 'yyyy-MM')
    const month = formatDate(date, 'MMM')

    const venituri = filteredRentals
      .filter((item) => item.status !== 'cancelled' && item.startDate.slice(0, 7) === key)
      .reduce((sum, item) => sum + calculateRentalTotal(item.segments), 0)

    const cheltuieli = filteredMaintenance
      .filter((item) => item.datePerformed.slice(0, 7) === key)
      .reduce((sum, item) => sum + item.cost, 0)

    return {
      month: month.charAt(0).toUpperCase() + month.slice(1),
      venituri,
      cheltuieli,
      profit: venituri - cheltuieli,
    }
  })

  const currentMonth = monthlyData[monthlyData.length - 1]

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Venituri vs cheltuieli</CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={tooltipFormatter} />
                <Legend />
                <Bar dataKey="venituri" fill="#2563eb" radius={[12, 12, 0, 0]} />
                <Bar dataKey="cheltuieli" fill="#f97316" radius={[12, 12, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Evolutie profit</CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={tooltipFormatter} />
                <Line type="monotone" dataKey="profit" stroke="#16a34a" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="grid gap-4 p-6 md:grid-cols-3">
          <Summary label="Venit luna curenta" value={formatCurrency(currentMonth.venituri)} />
          <Summary label="Cheltuieli luna curenta" value={formatCurrency(currentMonth.cheltuieli)} />
          <Summary label="Profit luna curenta" value={formatCurrency(currentMonth.profit)} />
        </CardContent>
      </Card>
    </div>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl font-bold">{value}</p>
    </div>
  )
}
