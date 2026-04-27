export type CarTransmission = 'manual' | 'automatic'
export type CarCategory =
  | 'general'
  | 'rent'
  | 'uber'
  | 'bolt'
  | 'service_replacement'
  | 'personal'
export type CarStatus = 'available' | 'rented' | 'maintenance' | 'archived'
export type CurrencyCode = 'RON' | 'EUR' | 'USD' | 'GBP'
export type DocumentType = 'ITP' | 'RCA' | 'CASCO' | 'ROVINIETA' | 'TALON' | 'CI_VEHICUL' | 'OTHER'
export type ReminderType = 'date' | 'km'
export type RentalStatus = 'active' | 'completed' | 'cancelled'
export type PriceUnit = 'day' | 'week' | 'month'
export type MaintenanceType = 'repair' | 'investment' | 'other'
export type FleetRole = 'viewer' | 'editor'
export type NotificationType = 'expiry_30' | 'expiry_14' | 'expiry_7' | 'expired'
export type FleetReportPeriodKind = '90d' | '180d' | '365d' | 'all'
export type FleetReportVerdict = 'very_good' | 'good' | 'monitor' | 'replace_candidate'
export type FleetReportAiAction = 'keep' | 'monitor' | 'replace_candidate'

export interface Profile {
  id: string
  fullName: string
  email: string
  createdAt: string
}

export interface CarPhoto {
  id: string
  carId: string
  fileUrl: string
  description?: string
  createdAt: string
}

export interface CarDocument {
  id: string
  carId: string
  type: DocumentType
  customName?: string
  expiryDate?: string
  issueDate?: string
  fileUrl?: string
  notes?: string
  isMandatory: boolean
  createdAt: string
}

export interface CarReminder {
  id: string
  carId: string
  title: string
  description?: string
  reminderType: ReminderType
  reminderDate?: string
  reminderKm?: number
  isDone: boolean
  createdAt: string
}

export interface Car {
  id: string
  ownerId: string
  licensePlate: string
  brand: string
  model: string
  year?: number
  color?: string
  engineHp: number
  engineKw: number
  engineDisplacement: number
  transmission: CarTransmission
  chassisNumber: string
  category: CarCategory
  status: CarStatus
  purchasePrice?: number
  purchaseCurrency: CurrencyCode
  annualInsuranceCost: number
  notes?: string
  serviceReturnDate?: string
  currentKm: number
  archivedAt?: string
  createdAt: string
  updatedAt: string
}

export type FleetPermissionLevel = 'owner' | 'editor' | 'viewer' | 'none'

export interface RentalPriceSegment {
  id: string
  rentalId: string
  pricePerUnit: number
  priceUnit: PriceUnit
  startDate: string
  endDate: string
  createdAt: string
}

export interface RentalPhoto {
  id: string
  rentalId: string
  photoType: 'pickup' | 'return'
  fileUrl: string
  createdAt: string
}

export interface Rental {
  id: string
  carId: string
  renterName: string
  renterSurname: string
  renterCnp: string
  renterIdPhotoUrl?: string
  startDate: string
  endDate: string
  advancePayment: number
  status: RentalStatus
  notes?: string
  kmStart?: number
  kmEnd?: number
  createdAt: string
  updatedAt: string
  segments: RentalPriceSegment[]
  photos: RentalPhoto[]
}

export interface MaintenanceDocument {
  id: string
  maintenanceId: string
  fileUrl: string
  fileName?: string
  createdAt: string
}

export interface Maintenance {
  id: string
  carId: string
  type: MaintenanceType
  description: string
  cost: number
  datePerformed: string
  serviceEndDate: string
  blocksAvailability: boolean
  kmAtService?: number
  notes?: string
  createdAt: string
  documents: MaintenanceDocument[]
}

export interface FleetAccess {
  id: string
  ownerId: string
  invitedEmail: string
  role: FleetRole
  acceptedAt?: string
  acceptedUserId?: string
  createdAt: string
  ownerName?: string
  ownerEmail?: string
}

export interface NotificationItem {
  id: string
  userId: string
  carId?: string
  documentId?: string
  title: string
  message: string
  type: NotificationType
  isRead: boolean
  createdAt: string
}

export interface FleetReportCarCommentary {
  carId: string
  label: string
  summary: string
  action: FleetReportAiAction
}

export interface FleetReportAiSummary {
  executiveSummary: string
  highlights: string[]
  risks: string[]
  recommendations: string[]
  carCommentaries: FleetReportCarCommentary[]
  generatedAt: string
}

export interface FleetReportCarScore {
  carId: string
  ownerId: string
  brand: string
  model: string
  licensePlate: string
  label: string
  status: CarStatus
  totalDays: number
  serviceDays: number
  availableDays: number
  rentedDays: number
  idleDays: number
  revenue: number
  maintenanceCost: number
  insuranceAllocated: number
  totalCost: number
  profit: number
  profitMargin: number
  utilization: number
  availability: number
  profitPerAvailableDay: number
  score: number
  verdict: FleetReportVerdict
}

export interface FleetReportTotals {
  carCount: number
  totalDays: number
  totalServiceDays: number
  totalAvailableDays: number
  totalRentedDays: number
  totalIdleDays: number
  totalRevenue: number
  totalMaintenanceCost: number
  totalInsuranceCost: number
  totalCost: number
  totalProfit: number
  utilization: number
  availability: number
  profitMargin: number
  profitPerAvailableDay: number
}

export interface FleetReportSnapshot {
  generatedAt: string
  periodKind: FleetReportPeriodKind
  periodStart: string
  periodEnd: string
  selectedOwnerIds: string[]
  scoringVersion: string
  overallScore: number
  totals: FleetReportTotals
  cars: FleetReportCarScore[]
  aiSummary?: FleetReportAiSummary
}

export interface FleetReportRecord {
  id: string
  createdBy: string
  periodKind: FleetReportPeriodKind
  periodStart: string
  periodEnd: string
  selectedOwnerIds: string[]
  scoringVersion: string
  aiProvider?: string
  aiModel?: string
  report: FleetReportSnapshot
  createdAt: string
}
