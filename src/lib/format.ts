import { differenceInCalendarDays, format, isValid, parseISO } from 'date-fns'

import type { BadgeProps } from '@/components/ui/badge'
import type { CarStatus, CurrencyCode, NotificationType, PriceUnit, RentalPriceSegment } from '@/types/models'

function getPriceUnitDivisor(unit: PriceUnit) {
  return unit === 'day' ? 1 : unit === 'week' ? 7 : 30
}

export function formatCurrency(value: number, currency: CurrencyCode = 'RON') {
  try {
    return new Intl.NumberFormat('ro-RO', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value)
  } catch {
    return new Intl.NumberFormat('ro-RO', {
      style: 'currency',
      currency: 'RON',
      maximumFractionDigits: 0,
    }).format(value)
  }
}

export function formatDate(date?: string) {
  if (!date) return 'Nu este setat'
  const parsed = parseISO(date)
  return isValid(parsed) ? format(parsed, 'dd.MM.yyyy') : 'Data invalidă'
}

export function getStatusBadgeVariant(status: CarStatus): NonNullable<BadgeProps['variant']> {
  if (status === 'available') return 'success'
  if (status === 'rented') return 'info'
  if (status === 'maintenance') return 'warning'
  return 'muted'
}

export function getStatusLabel(status: CarStatus) {
  return {
    available: 'Disponibilă',
    rented: 'Închiriată',
    maintenance: 'Service',
    archived: 'Arhivată',
  }[status]
}

export function getPriceUnitLabel(unit: PriceUnit) {
  return {
    day: 'zi',
    week: 'săptămână',
    month: 'lună',
  }[unit]
}

export function getNotificationVariant(type: NotificationType): NonNullable<BadgeProps['variant']> {
  switch (type) {
    case 'expiry_30':
      return 'info'
    case 'expiry_14':
    case 'expiry_7':
      return 'warning'
    case 'expired':
      return 'danger'
  }
}

export function getNotificationLabel(type: NotificationType) {
  return {
    expiry_30: '15-30 zile',
    expiry_14: '8-14 zile',
    expiry_7: '0-7 zile',
    expired: 'Expirat',
  }[type]
}

export function getDocumentUrgency(expiryDate?: string): NotificationType | 'ok' {
  if (!expiryDate) return 'ok'
  const days = differenceInCalendarDays(parseISO(expiryDate), new Date())
  if (days < 0) return 'expired'
  if (days <= 7) return 'expiry_7'
  if (days <= 14) return 'expiry_14'
  if (days <= 30) return 'expiry_30'
  return 'ok'
}

export function getDocumentUrgencyLabel(expiryDate?: string) {
  const urgency = getDocumentUrgency(expiryDate)
  if (urgency === 'ok') return 'Valabil'
  return getNotificationLabel(urgency)
}

export function compareDocumentsByExpiry(firstDate?: string, secondDate?: string) {
  const firstHasDate = Boolean(firstDate)
  const secondHasDate = Boolean(secondDate)

  if (firstHasDate && !secondHasDate) return -1
  if (!firstHasDate && secondHasDate) return 1
  if (!firstHasDate && !secondHasDate) return 0

  const firstUrgency = getDocumentUrgency(firstDate)
  const secondUrgency = getDocumentUrgency(secondDate)
  const firstDaysUntilExpiry = differenceInCalendarDays(parseISO(firstDate!), new Date())
  const secondDaysUntilExpiry = differenceInCalendarDays(parseISO(secondDate!), new Date())

  if (firstUrgency === 'expired' && secondUrgency === 'expired') {
    return secondDaysUntilExpiry - firstDaysUntilExpiry
  }

  if (firstUrgency === 'expired') return -1
  if (secondUrgency === 'expired') return 1

  return firstDaysUntilExpiry - secondDaysUntilExpiry
}

export function calculateSegmentTotal(segment: RentalPriceSegment) {
  const start = parseISO(segment.startDate)
  const end = parseISO(segment.endDate)
  const days = Math.max(differenceInCalendarDays(end, start) + 1, 1)
  const divisor = getPriceUnitDivisor(segment.priceUnit)
  return Math.ceil(days / divisor) * segment.pricePerUnit
}

export function calculateSegmentAccruedRevenue(segment: RentalPriceSegment, accruedDays?: number) {
  const start = parseISO(segment.startDate)
  const end = parseISO(segment.endDate)
  const totalDays = Math.max(differenceInCalendarDays(end, start) + 1, 1)
  const effectiveDays = Math.min(Math.max(accruedDays ?? totalDays, 0), totalDays)

  return (effectiveDays / getPriceUnitDivisor(segment.priceUnit)) * segment.pricePerUnit
}

export function calculateRentalTotal(segments: RentalPriceSegment[]) {
  return segments.reduce((sum, segment) => sum + calculateSegmentTotal(segment), 0)
}
