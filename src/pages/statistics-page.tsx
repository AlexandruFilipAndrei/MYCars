import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { differenceInCalendarDays, endOfMonth, endOfYear, format, isValid, parseISO, startOfMonth, startOfYear, subMonths } from 'date-fns'

import { useFleetFilter } from '@/components/fleet-filter'
import { PageHeader } from '@/components/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { calculateSegmentAccruedRevenue, formatCurrency } from '@/lib/format'
import { useAppStore } from '@/store/app-store'
import type { Maintenance, Rental, RentalPriceSegment } from '@/types/models'

type StatisticsBucket = {
  key: string
  label: string
  start: Date
  end: Date
}

const monthLabels = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Noi', 'Dec']

function parseDate(value: string) {
  const parsed = parseISO(value)
  return isValid(parsed) ? parsed : null
}

function dateMax(first: Date, second: Date) {
  return first > second ? first : second
}

function dateMin(first: Date, second: Date) {
  return first < second ? first : second
}

function getInclusiveOverlapDays(start: Date, end: Date, bucketStart: Date, bucketEnd: Date) {
  const overlapStart = dateMax(start, bucketStart)
  const overlapEnd = dateMin(end, bucketEnd)
  const days = differenceInCalendarDays(overlapEnd, overlapStart) + 1

  return Math.max(days, 0)
}

function getSegmentRevenueInBucket(segment: RentalPriceSegment, bucketStart: Date, bucketEnd: Date) {
  const start = parseDate(segment.startDate)
  const end = parseDate(segment.endDate)

  if (!start || !end) {
    return 0
  }

  const overlapDays = getInclusiveOverlapDays(start, end, bucketStart, bucketEnd)

  return overlapDays > 0 ? calculateSegmentAccruedRevenue(segment, overlapDays) : 0
}

function getMaintenanceCostInBucket(item: Maintenance, bucketStart: Date, bucketEnd: Date) {
  const datePerformed = parseDate(item.datePerformed)

  if (!datePerformed || datePerformed < bucketStart || datePerformed > bucketEnd) {
    return 0
  }

  return item.cost
}

function getFinancialYears(rentals: Rental[], maintenance: Maintenance[]) {
  const currentYear = new Date().getFullYear()
  const years = new Set<number>([currentYear])

  rentals.forEach((rental) => {
    rental.segments.forEach((segment) => {
      const start = parseDate(segment.startDate)
      const end = parseDate(segment.endDate)

      if (start) years.add(start.getFullYear())
      if (end) years.add(end.getFullYear())
    })
  })

  maintenance.forEach((item) => {
    const datePerformed = parseDate(item.datePerformed)
    if (datePerformed) years.add(datePerformed.getFullYear())
  })

  return [...years].sort((first, second) => second - first)
}

function buildMonthBuckets(year: number) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const lastMonthIndex = year === currentYear ? now.getMonth() : 11

  return Array.from({ length: lastMonthIndex + 1 }).map((_, monthIndex) => {
    const date = new Date(year, monthIndex, 1)

    return {
      key: format(date, 'yyyy-MM'),
      label: monthLabels[monthIndex],
      start: startOfMonth(date),
      end: endOfMonth(date),
    }
  })
}

function buildLastSixMonthBuckets() {
  return Array.from({ length: 6 }).map((_, index) => {
    const date = subMonths(new Date(), 5 - index)

    return {
      key: format(date, 'yyyy-MM'),
      label: monthLabels[date.getMonth()],
      start: startOfMonth(date),
      end: endOfMonth(date),
    }
  })
}

function buildAllTimeBuckets(years: number[]) {
  const sortedYears = [...years].sort((first, second) => first - second)

  return sortedYears.map((year) => {
    const date = new Date(year, 0, 1)

    return {
      key: String(year),
      label: String(year),
      start: startOfYear(date),
      end: endOfYear(date),
    }
  })
}

function buildBuckets(period: string, years: number[]) {
  if (period === 'last-6') {
    return buildLastSixMonthBuckets()
  }

  if (period === 'all') {
    return buildAllTimeBuckets(years)
  }

  const [, rawYear] = period.split(':')
  const year = Number(rawYear)

  return buildMonthBuckets(Number.isFinite(year) ? year : new Date().getFullYear())
}

function getPeriodLabel(period: string) {
  if (period === 'last-6') return 'ultimele 6 luni'
  if (period === 'all') return 'toata perioada'

  const [, rawYear] = period.split(':')
  return `anul ${rawYear}`
}

function buildStatisticsData(buckets: StatisticsBucket[], rentals: Rental[], maintenance: Maintenance[]) {
  return buckets.map((bucket) => {
    const venituri = rentals
      .filter((rental) => rental.status !== 'cancelled')
      .reduce(
        (rentalSum, rental) =>
          rentalSum + rental.segments.reduce((segmentSum, segment) => segmentSum + getSegmentRevenueInBucket(segment, bucket.start, bucket.end), 0),
        0,
      )

    const cheltuieli = maintenance.reduce((sum, item) => sum + getMaintenanceCostInBucket(item, bucket.start, bucket.end), 0)

    return {
      ...bucket,
      venituri,
      cheltuieli,
      profit: venituri - cheltuieli,
    }
  })
}

export function StatisticsPage() {
  const { cars, rentals, maintenance } = useAppStore()
  const { matchesOwner, selectedOwnerIds } = useFleetFilter()
  const [period, setPeriod] = useState(`year:${new Date().getFullYear()}`)
  const carsById = useMemo(() => new Map(cars.map((car) => [car.id, car])), [cars])
  const filteredCars = useMemo(() => cars.filter((car) => matchesOwner(car.ownerId)), [cars, matchesOwner])
  const filteredRentals = useMemo(
    () => rentals.filter((item) => matchesOwner(carsById.get(item.carId)?.ownerId ?? '')),
    [carsById, matchesOwner, rentals],
  )
  const filteredMaintenance = useMemo(
    () => maintenance.filter((item) => matchesOwner(carsById.get(item.carId)?.ownerId ?? '')),
    [carsById, maintenance, matchesOwner],
  )
  const years = useMemo(() => getFinancialYears(filteredRentals, filteredMaintenance), [filteredMaintenance, filteredRentals])
  const buckets = useMemo(() => buildBuckets(period, years), [period, years])
  const chartData = useMemo(() => buildStatisticsData(buckets, filteredRentals, filteredMaintenance), [buckets, filteredMaintenance, filteredRentals])
  const totals = useMemo(
    () =>
      chartData.reduce(
        (sum, item) => ({
          venituri: sum.venituri + item.venituri,
          cheltuieli: sum.cheltuieli + item.cheltuieli,
          profit: sum.profit + item.profit,
        }),
        { venituri: 0, cheltuieli: 0, profit: 0 },
      ),
    [chartData],
  )
  const tooltipFormatter = (value: unknown) => {
    const normalized = Array.isArray(value) ? Number(value[0] ?? 0) : Number(value ?? 0)
    return formatCurrency(normalized)
  }
  const periodLabel = getPeriodLabel(period)
  const profitMargin = totals.venituri > 0 ? totals.profit / totals.venituri : 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Statistici"
        description="Analizeaza veniturile, cheltuielile si profitul pentru flotele selectate."
        action={
          <div className="w-full min-w-[220px]">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger>
                <SelectValue placeholder="Alege perioada" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="last-6">Ultimele 6 luni</SelectItem>
                {years.map((year) => (
                  <SelectItem key={year} value={`year:${year}`}>
                    Anul {year}
                  </SelectItem>
                ))}
                <SelectItem value="all">Toata perioada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Summary label="Venituri perioada" value={formatCurrency(totals.venituri)} />
        <Summary label="Cheltuieli perioada" value={formatCurrency(totals.cheltuieli)} />
        <Summary label="Profit perioada" value={formatCurrency(totals.profit)} />
        <Summary label="Marja profit" value={`${Math.round(profitMargin * 100)}%`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Venituri vs cheltuieli</CardTitle>
            <p className="text-sm text-muted-foreground">
              {periodLabel}, {selectedOwnerIds.length} flote selectate, {filteredCars.length} masini.
            </p>
          </CardHeader>
          <CardContent className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
                <Tooltip formatter={tooltipFormatter} />
                <Legend />
                <Bar dataKey="venituri" name="Venituri" fill="#2563eb" radius={[8, 8, 0, 0]} />
                <Bar dataKey="cheltuieli" name="Cheltuieli" fill="#f97316" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Evolutie profit</CardTitle>
            <p className="text-sm text-muted-foreground">Profit calculat din veniturile alocate perioadei minus interventiile din perioada.</p>
          </CardHeader>
          <CardContent className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
                <Tooltip formatter={tooltipFormatter} />
                <Line type="monotone" dataKey="profit" name="Profit" stroke="#16a34a" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detalii perioada</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Summary label="Inchirieri analizate" value={String(filteredRentals.filter((rental) => rental.status !== 'cancelled').length)} compact />
          <Summary label="Interventii analizate" value={String(filteredMaintenance.length)} compact />
          <Summary label="Masini in filtrul actual" value={String(filteredCars.length)} compact />
        </CardContent>
      </Card>
    </div>
  )
}

function Summary({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className="min-w-0 rounded-3xl border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-2 break-words font-display font-bold leading-tight tabular-nums ${compact ? 'text-2xl' : 'text-3xl'}`}>{value}</p>
    </div>
  )
}
