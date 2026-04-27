import { differenceInCalendarDays, format, parseISO, subDays } from 'date-fns'

import { calculateSegmentAccruedRevenue } from '@/lib/format'
import type {
  Car,
  CarStatus,
  FleetReportAiAction,
  FleetReportAiSummary,
  FleetReportCarCommentary,
  FleetReportCarScore,
  FleetReportPeriodKind,
  FleetReportSnapshot,
  FleetReportTotals,
  FleetReportVerdict,
  Maintenance,
  Rental,
} from '@/types/models'

export const FLEET_REPORT_SCORING_VERSION = 'fleet-report-v1'

type DateInterval = {
  start: string
  end: string
}

type BuildFleetReportInput = {
  cars: Car[]
  rentals: Rental[]
  maintenance: Maintenance[]
  selectedOwnerIds: string[]
  periodKind: FleetReportPeriodKind
  generatedAt?: string
}

type BaseCarMetrics = Omit<FleetReportCarScore, 'score' | 'verdict'>

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function toDateOnly(value: string) {
  return value.slice(0, 10)
}

function todayDateString() {
  return format(new Date(), 'yyyy-MM-dd')
}

function inclusiveDayCount(startDate: string, endDate: string) {
  if (startDate > endDate) {
    return 0
  }

  return Math.max(differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1, 0)
}

function getOverlapInterval(first: DateInterval, second: DateInterval): DateInterval | null {
  const start = first.start > second.start ? first.start : second.start
  const end = first.end < second.end ? first.end : second.end

  return start <= end ? { start, end } : null
}

function mergeIntervals(intervals: DateInterval[]) {
  if (intervals.length === 0) {
    return []
  }

  const sortedIntervals = [...intervals].sort((first, second) => {
    if (first.start !== second.start) {
      return first.start.localeCompare(second.start)
    }

    return first.end.localeCompare(second.end)
  })

  return sortedIntervals.reduce<DateInterval[]>((merged, interval) => {
    const previous = merged[merged.length - 1]

    if (!previous) {
      merged.push({ ...interval })
      return merged
    }

    const previousEndWithGap = format(subDays(parseISO(interval.start), 1), 'yyyy-MM-dd')
    if (interval.start <= previous.end || previousEndWithGap <= previous.end) {
      previous.end = previous.end > interval.end ? previous.end : interval.end
      return merged
    }

    merged.push({ ...interval })
    return merged
  }, [])
}

function getIntervalsDayCount(intervals: DateInterval[]) {
  return mergeIntervals(intervals).reduce((sum, interval) => sum + inclusiveDayCount(interval.start, interval.end), 0)
}

function normalizeMarginScore(profitMargin: number) {
  return clamp((profitMargin - -0.2) / 0.8, 0, 1)
}

function getVerdict(score: number): FleetReportVerdict {
  if (score >= 80) return 'very_good'
  if (score >= 60) return 'good'
  if (score >= 40) return 'monitor'
  return 'replace_candidate'
}

export function getFleetReportVerdictLabel(verdict: FleetReportVerdict) {
  return {
    very_good: 'Foarte buna',
    good: 'Buna',
    monitor: 'De urmarit',
    replace_candidate: 'Candidata pentru inlocuire',
  }[verdict]
}

export function getFleetReportAiActionLabel(action: FleetReportAiAction) {
  return {
    keep: 'Pastreaza',
    monitor: 'Monitorizeaza',
    replace_candidate: 'Ia in calcul schimbarea',
  }[action]
}

export function getFleetReportPeriodLabel(periodKind: FleetReportPeriodKind) {
  return {
    '90d': 'Ultimele 90 zile',
    '180d': 'Ultimele 180 zile',
    '365d': 'Ultimul an',
    all: 'De la inceput',
  }[periodKind]
}

export function deriveOperationalCarState(
  car: Car,
  rentals: Rental[],
  maintenance: Maintenance[],
  referenceDate = todayDateString(),
) {
  if (car.archivedAt || car.status === 'archived') {
    return {
      status: 'archived' as CarStatus,
      serviceReturnDate: undefined as string | undefined,
    }
  }

  const activeServiceIntervals = maintenance
    .filter((item) => item.carId === car.id && item.blocksAvailability)
    .filter((item) => item.datePerformed <= referenceDate && item.serviceEndDate >= referenceDate)
    .sort((first, second) => second.serviceEndDate.localeCompare(first.serviceEndDate))

  if (activeServiceIntervals.length > 0) {
    return {
      status: 'maintenance' as CarStatus,
      serviceReturnDate: activeServiceIntervals[0]?.serviceEndDate,
    }
  }

  const hasActiveRental = rentals.some(
    (rental) =>
      rental.carId === car.id &&
      rental.status !== 'cancelled' &&
      rental.startDate <= referenceDate &&
      rental.endDate >= referenceDate,
  )

  if (hasActiveRental) {
    return {
      status: 'rented' as CarStatus,
      serviceReturnDate: undefined,
    }
  }

  return {
    status: 'available' as CarStatus,
    serviceReturnDate: undefined,
  }
}

export function deriveCarsOperationalState(cars: Car[], rentals: Rental[], maintenance: Maintenance[], referenceDate = todayDateString()) {
  return cars.map((car) => {
    const derived = deriveOperationalCarState(car, rentals, maintenance, referenceDate)

    return {
      ...car,
      status: derived.status,
      serviceReturnDate: derived.serviceReturnDate,
    }
  })
}

function getReportRange(periodKind: FleetReportPeriodKind, cars: Car[]) {
  const periodEnd = todayDateString()

  if (periodKind === 'all') {
    const earliestCarDate =
      [...cars]
        .map((car) => toDateOnly(car.createdAt))
        .sort((first, second) => first.localeCompare(second))[0] ?? periodEnd

    return {
      periodStart: earliestCarDate,
      periodEnd,
    }
  }

  const days = periodKind === '90d' ? 89 : periodKind === '180d' ? 179 : 364

  return {
    periodStart: format(subDays(new Date(), days), 'yyyy-MM-dd'),
    periodEnd,
  }
}

function buildBaseCarMetrics(
  car: Car,
  rentals: Rental[],
  maintenance: Maintenance[],
  periodStart: string,
  periodEnd: string,
): BaseCarMetrics {
  const effectivePeriodStart = periodStart > toDateOnly(car.createdAt) ? periodStart : toDateOnly(car.createdAt)
  const totalDays = effectivePeriodStart <= periodEnd ? inclusiveDayCount(effectivePeriodStart, periodEnd) : 0
  const maintenanceForCar = maintenance.filter((item) => item.carId === car.id)
  const rentalsForCar = rentals.filter((item) => item.carId === car.id && item.status !== 'cancelled')
  const serviceIntervals = maintenanceForCar
    .filter((item) => item.blocksAvailability)
    .map((item) => getOverlapInterval({ start: item.datePerformed, end: item.serviceEndDate }, { start: effectivePeriodStart, end: periodEnd }))
    .filter((item): item is DateInterval => Boolean(item))
  const rentalIntervals = rentalsForCar
    .map((item) => getOverlapInterval({ start: item.startDate, end: item.endDate }, { start: effectivePeriodStart, end: periodEnd }))
    .filter((item): item is DateInterval => Boolean(item))
  const serviceDays = totalDays > 0 ? getIntervalsDayCount(serviceIntervals) : 0
  const rentedDays = totalDays > 0 ? getIntervalsDayCount(rentalIntervals) : 0
  const availableDays = Math.max(totalDays - serviceDays, 0)
  const idleDays = Math.max(availableDays - rentedDays, 0)
  const revenue = rentalsForCar.reduce((sum, rental) => {
    const rentalRevenue = rental.segments.reduce((segmentSum, segment) => {
      const overlap = getOverlapInterval(
        { start: segment.startDate, end: segment.endDate },
        { start: effectivePeriodStart, end: periodEnd },
      )

      if (!overlap) {
        return segmentSum
      }

      const overlapDays = inclusiveDayCount(overlap.start, overlap.end)

      if (overlapDays <= 0) {
        return segmentSum
      }

      return segmentSum + calculateSegmentAccruedRevenue(segment, overlapDays)
    }, 0)

    return sum + rentalRevenue
  }, 0)
  const maintenanceCost = maintenanceForCar
    .filter((item) => item.datePerformed >= effectivePeriodStart && item.datePerformed <= periodEnd)
    .reduce((sum, item) => sum + item.cost, 0)
  const insuranceAllocated = totalDays > 0 ? (car.annualInsuranceCost * totalDays) / 365 : 0
  const totalCost = maintenanceCost + insuranceAllocated
  const profit = revenue - totalCost
  const profitMargin = revenue > 0 ? profit / revenue : 0
  const utilization = availableDays > 0 ? rentedDays / availableDays : 0
  const availability = totalDays > 0 ? availableDays / totalDays : 0
  const profitPerAvailableDay = availableDays > 0 ? profit / availableDays : 0
  const label = `${car.brand} ${car.model} - ${car.licensePlate}`

  return {
    carId: car.id,
    ownerId: car.ownerId,
    brand: car.brand,
    model: car.model,
    licensePlate: car.licensePlate,
    label,
    status: car.status,
    totalDays,
    serviceDays,
    availableDays,
    rentedDays,
    idleDays,
    revenue,
    maintenanceCost,
    insuranceAllocated,
    totalCost,
    profit,
    profitMargin,
    utilization,
    availability,
    profitPerAvailableDay,
  }
}

function buildTotals(cars: FleetReportCarScore[]): FleetReportTotals {
  const totalDays = cars.reduce((sum, car) => sum + car.totalDays, 0)
  const totalServiceDays = cars.reduce((sum, car) => sum + car.serviceDays, 0)
  const totalAvailableDays = cars.reduce((sum, car) => sum + car.availableDays, 0)
  const totalRentedDays = cars.reduce((sum, car) => sum + car.rentedDays, 0)
  const totalIdleDays = cars.reduce((sum, car) => sum + car.idleDays, 0)
  const totalRevenue = cars.reduce((sum, car) => sum + car.revenue, 0)
  const totalMaintenanceCost = cars.reduce((sum, car) => sum + car.maintenanceCost, 0)
  const totalInsuranceCost = cars.reduce((sum, car) => sum + car.insuranceAllocated, 0)
  const totalCost = cars.reduce((sum, car) => sum + car.totalCost, 0)
  const totalProfit = cars.reduce((sum, car) => sum + car.profit, 0)

  return {
    carCount: cars.length,
    totalDays,
    totalServiceDays,
    totalAvailableDays,
    totalRentedDays,
    totalIdleDays,
    totalRevenue,
    totalMaintenanceCost,
    totalInsuranceCost,
    totalCost,
    totalProfit,
    utilization: totalAvailableDays > 0 ? totalRentedDays / totalAvailableDays : 0,
    availability: totalDays > 0 ? totalAvailableDays / totalDays : 0,
    profitMargin: totalRevenue > 0 ? totalProfit / totalRevenue : 0,
    profitPerAvailableDay: totalAvailableDays > 0 ? totalProfit / totalAvailableDays : 0,
  }
}

export function buildFleetReportSnapshot(input: BuildFleetReportInput): FleetReportSnapshot {
  const generatedAt = input.generatedAt ?? new Date().toISOString()
  const derivedCars = deriveCarsOperationalState(input.cars, input.rentals, input.maintenance)
  const { periodStart, periodEnd } = getReportRange(input.periodKind, derivedCars)
  const baseCarMetrics = derivedCars.map((car) => buildBaseCarMetrics(car, input.rentals, input.maintenance, periodStart, periodEnd))
  const productionValues = baseCarMetrics.map((item) => item.profitPerAvailableDay)
  const maxProduction = Math.max(...productionValues, 0)
  const minProduction = Math.min(...productionValues, 0)

  const scoredCars: FleetReportCarScore[] = baseCarMetrics
    .map((item) => {
      const productionScore =
        maxProduction <= 0
          ? 0
          : maxProduction === minProduction
            ? 1
            : clamp((item.profitPerAvailableDay - minProduction) / (maxProduction - minProduction), 0, 1)
      const marginScore = normalizeMarginScore(item.profitMargin)
      const weightedScore = productionScore * 0.35 + marginScore * 0.25 + item.utilization * 0.2 + item.availability * 0.2
      const score = Math.round(weightedScore * 100)

      return {
        ...item,
        score,
        verdict: getVerdict(score),
      }
    })
    .sort((first, second) => {
      if (first.score !== second.score) {
        return second.score - first.score
      }

      if (first.profit !== second.profit) {
        return second.profit - first.profit
      }

      return first.licensePlate.localeCompare(second.licensePlate, 'ro-RO')
    })

  const totalWeight = scoredCars.reduce((sum, car) => sum + car.totalDays, 0)
  const overallScore =
    totalWeight > 0
      ? Math.round(scoredCars.reduce((sum, car) => sum + car.score * car.totalDays, 0) / totalWeight)
      : 0

  return {
    generatedAt,
    periodKind: input.periodKind,
    periodStart,
    periodEnd,
    selectedOwnerIds: input.selectedOwnerIds,
    scoringVersion: FLEET_REPORT_SCORING_VERSION,
    overallScore,
    totals: buildTotals(scoredCars),
    cars: scoredCars,
  }
}

function getTopCommentaryCars(report: FleetReportSnapshot) {
  const bestCars = report.cars.slice(0, 2)
  const weakestCars = [...report.cars].sort((first, second) => first.score - second.score).slice(0, 2)
  const uniqueCars = new Map<string, FleetReportCarScore>()

  ;[...bestCars, ...weakestCars].forEach((car) => {
    uniqueCars.set(car.carId, car)
  })

  return [...uniqueCars.values()]
}

export function buildFallbackFleetReportAiSummary(report: FleetReportSnapshot): FleetReportAiSummary {
  const strongestCar = report.cars[0]
  const weakestCar = [...report.cars].sort((first, second) => first.score - second.score)[0]
  const highlights = [
    strongestCar
      ? `${strongestCar.label} are cel mai bun scor, ${strongestCar.score}/100, si un profit actual de ${Math.round(strongestCar.profit)} RON.`
      : 'Nu exista masini suficient de bine populate pentru a scoate un lider clar.',
    `Profitul actual al flotei este de ${Math.round(report.totals.totalProfit)} RON.`,
    `Veniturile actuale ale flotei sunt de ${Math.round(report.totals.totalRevenue)} RON, iar costurile actuale sunt de ${Math.round(report.totals.totalCost)} RON.`,
  ]
  const risks = [
    weakestCar
      ? `${weakestCar.label} are cel mai slab scor, ${weakestCar.score}/100, si cere urmarire atenta a costurilor raportate la venituri.`
      : 'Nu exista suficiente date pentru a marca o masina cu risc clar.',
    report.totals.totalCost > report.totals.totalRevenue * 0.6
      ? 'Costurile actuale consuma o parte mare din veniturile flotei.'
      : 'Costurile actuale sunt inca tinute sub control la nivel de flota.',
    report.totals.totalProfit < 0
      ? 'Profitul actual al flotei este negativ.'
      : 'Profitul ramane pozitiv, dar merita urmarite masinile cu scor slab.',
  ]
  const recommendations = [
    strongestCar ? `Pastrati si promovati mai agresiv ${strongestCar.label}, pentru ca produce bine raportat la costuri.` : 'Pastrati masinile cu profit pozitiv si costuri bine controlate.',
    weakestCar ? `Monitorizati atent ${weakestCar.label} in urmatoarele rapoarte; daca ramane jos, merita comparata cu o alternativa.` : 'Urmariti masinile cu scor sub 40 in rapoartele urmatoare.',
    report.totals.totalCost > report.totals.totalRevenue * 0.6
      ? 'Verificati masinile la care costurile actuale cresc prea aproape de nivelul veniturilor actuale.'
      : 'Continuati sa urmariti masinile cu profit actual slab si comparati-le cu cele mai bune din flota.',
  ]

  const carCommentaries: FleetReportCarCommentary[] = getTopCommentaryCars(report).map((car) => ({
    carId: car.carId,
    label: car.label,
    summary:
      car.score >= 60
        ? `${car.label} are un profil economic sanatos, cu venituri actuale de ${Math.round(car.revenue)} RON si profit actual de ${Math.round(car.profit)} RON.`
        : `${car.label} are un scor modest, influentat de profitul slab din perioada si de costurile totale raportate la venituri.`,
    action: car.score >= 60 ? 'keep' : car.score >= 40 ? 'monitor' : 'replace_candidate',
  }))

  return {
    executiveSummary: `Raportul arata o flota cu scor general ${report.overallScore}/100. Profitul actual al flotei este ${Math.round(report.totals.totalProfit)} RON, iar focusul ar trebui sa ramana pe masinile care produc constant si pe cele care nu isi acopera costurile.`,
    highlights,
    risks,
    recommendations,
    carCommentaries,
    generatedAt: new Date().toISOString(),
  }
}
