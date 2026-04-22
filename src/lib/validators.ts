import { z } from 'zod'

function isOrderedDateRange(startDate: string, endDate: string) {
  return startDate <= endDate
}

const currencySchema = z.enum(['RON', 'EUR', 'USD', 'GBP'])
const chassisNumberPattern = /^[A-HJ-NPR-Z0-9]{17}$/

function optionalNumberSchema<TSchema extends z.ZodTypeAny>(schema: TSchema) {
  return z.preprocess((value) => (value === '' || value === null || value === undefined ? undefined : value), schema.optional())
}

function normalizeLicensePlate(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
}

function normalizeChassisNumber(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
}

export const authSchema = z.object({
  fullName: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().min(3, 'Numele complet trebuie să aibă cel puțin 3 caractere.').optional(),
  ),
  email: z.string().trim().toLowerCase().email('Introdu o adresă de email validă.'),
  password: z.string().min(6, 'Parola trebuie să aibă minimum 6 caractere.'),
})

export const carSchema = z.object({
  ownerId: z.string().optional(),
  licensePlate: z
    .string()
    .transform(normalizeLicensePlate)
    .pipe(z.string().min(1, 'Acest câmp este obligatoriu.').min(4, 'Numărul de înmatriculare este obligatoriu.')),
  brand: z.string().trim().min(1, 'Acest câmp este obligatoriu.').min(2, 'Marca este obligatorie.'),
  model: z.string().trim().min(1, 'Acest câmp este obligatoriu.'),
  year: optionalNumberSchema(z.coerce.number().min(1950, 'Anul trebuie să fie după 1950.').max(2100, 'Anul nu este valid.')),
  color: z.string().optional(),
  engineHp: z.coerce.number().min(1, 'Acest câmp este obligatoriu.'),
  engineDisplacement: z.coerce.number().min(1, 'Acest câmp este obligatoriu.'),
  transmission: z.enum(['manual', 'automatic'], { message: 'Selectați o opțiune.' }),
  chassisNumber: z
    .string()
    .transform(normalizeChassisNumber)
    .pipe(
      z
        .string()
        .min(1, 'Acest câmp este obligatoriu.')
        .regex(chassisNumberPattern, 'Seria de șasiu trebuie să aibă exact 17 caractere valide.'),
    ),
  category: z.literal('general').default('general'),
  status: z.enum(['available', 'rented', 'maintenance', 'archived']),
  purchasePrice: optionalNumberSchema(z.coerce.number().min(0, 'Prețul de achiziție nu poate fi negativ.')),
  purchaseCurrency: currencySchema.default('RON'),
  currentKm: z.coerce.number().min(0, 'Kilometrajul nu poate fi negativ.'),
  notes: z.string().optional(),
  serviceReturnDate: z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? undefined : value),
    z.string().optional(),
  ),
  itpExpiryDate: z.string().min(1, 'Acest câmp este obligatoriu.'),
  rcaExpiryDate: z.string().min(1, 'Acest câmp este obligatoriu.'),
}).superRefine((value, context) => {
  if (value.serviceReturnDate && value.status !== 'maintenance') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Data de disponibilitate poate fi setată doar când mașina este în service.',
      path: ['serviceReturnDate'],
    })
  }
})

export const maintenanceSchema = z
  .object({
    carId: z.string().min(1, 'Selectați o opțiune.'),
    type: z.enum(['repair', 'investment', 'other'], { message: 'Selectați o opțiune.' }),
    description: z.string().trim().min(1, 'Acest câmp este obligatoriu.').min(3, 'Titlul este obligatoriu.'),
    cost: z.coerce.number().min(0, 'Costul nu poate fi negativ.'),
    datePerformed: z.string().min(1, 'Acest câmp este obligatoriu.'),
    expectedCompletionDate: z.preprocess(
      (value) => (value === '' || value === null || value === undefined ? undefined : value),
      z.string().optional(),
    ),
    kmAtService: optionalNumberSchema(z.coerce.number().min(0, 'Kilometrajul nu poate fi negativ.')),
    notes: z.string().optional(),
    markCarAsMaintenance: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    if (value.expectedCompletionDate && value.expectedCompletionDate < value.datePerformed) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Data estimată de ieșire din service nu poate fi înaintea datei intervenției.',
        path: ['expectedCompletionDate'],
      })
    }
  })

export const rentalSegmentSchema = z
  .object({
    pricePerUnit: z.coerce.number().min(1, 'Acest câmp este obligatoriu.'),
    priceUnit: z.enum(['day', 'week', 'month'], { message: 'Selectați o opțiune.' }),
    startDate: z.string().min(1, 'Acest câmp este obligatoriu.'),
    endDate: z.string().min(1, 'Acest câmp este obligatoriu.'),
  })
  .superRefine((value, context) => {
    if (!isOrderedDateRange(value.startDate, value.endDate)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Data de sfârșit nu poate fi înaintea datei de început.',
        path: ['endDate'],
      })
    }
  })

export const rentalSchema = z
  .object({
    carId: z.string().min(1, 'Selectați o opțiune.'),
    renterName: z.string().trim().min(1, 'Acest câmp este obligatoriu.').min(2, 'Prenumele este obligatoriu.'),
    renterSurname: z.string().trim().min(1, 'Acest câmp este obligatoriu.').min(2, 'Numele este obligatoriu.'),
    renterCnp: z.string().trim().regex(/^\d{13}$/, 'CNP-ul trebuie să aibă exact 13 cifre.'),
    startDate: z.string().min(1, 'Acest câmp este obligatoriu.'),
    endDate: z.string().min(1, 'Acest câmp este obligatoriu.'),
    advancePayment: z.coerce.number().min(0, 'Avansul nu poate fi negativ.'),
    status: z.enum(['active', 'completed', 'cancelled']),
    kmStart: optionalNumberSchema(z.coerce.number().min(0, 'Kilometrajul nu poate fi negativ.')),
    kmEnd: optionalNumberSchema(z.coerce.number().min(0, 'Kilometrajul nu poate fi negativ.')),
    notes: z.string().optional(),
    segments: z.array(rentalSegmentSchema).min(1, 'Vă rugăm să completați acest câmp.'),
  })
  .superRefine((value, context) => {
    const seen = new Set<string>()

    if (!isOrderedDateRange(value.startDate, value.endDate)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Data de sfârșit nu poate fi înaintea datei de început.',
        path: ['endDate'],
      })
    }

    if (value.kmStart !== undefined && value.kmEnd !== undefined && value.kmEnd < value.kmStart) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Kilometrajul de retur nu poate fi mai mic decât cel de predare.',
        path: ['kmEnd'],
      })
    }

    value.segments.forEach((segment, index) => {
      const key = `${segment.startDate}-${segment.endDate}-${segment.pricePerUnit}-${segment.priceUnit}`

      if (seen.has(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Acest segment de preț este deja adăugat.',
          path: ['segments', index],
        })
      }
      seen.add(key)

      if (segment.startDate < value.startDate || segment.endDate > value.endDate) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Segmentul trebuie să fie inclus în perioada închirierii.',
          path: ['segments', index],
        })
      }

      value.segments.forEach((otherSegment, otherIndex) => {
        if (index >= otherIndex) return

        const overlaps = segment.startDate <= otherSegment.endDate && otherSegment.startDate <= segment.endDate
        if (overlaps) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Segmentele de preț nu se pot suprapune.',
            path: ['segments', index],
          })
        }
      })
    })
  })

export const profileSchema = z.object({
  fullName: z.string().min(3, 'Numele complet este obligatoriu.'),
})

export const inviteSchema = z.object({
  invitedEmail: z.string().trim().toLowerCase().email('Introdu un email valid.'),
  role: z.enum(['viewer', 'editor']),
})
