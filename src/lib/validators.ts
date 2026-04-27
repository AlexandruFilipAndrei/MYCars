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
    z.string().min(3, 'Numele complet trebuie sa aiba cel putin 3 caractere.').optional(),
  ),
  email: z.string().trim().toLowerCase().email('Introdu o adresa de email valida.'),
  password: z.string().min(6, 'Parola trebuie sa aiba minimum 6 caractere.'),
})

export const carSchema = z.object({
  ownerId: z.string().optional(),
  licensePlate: z
    .string()
    .transform(normalizeLicensePlate)
    .pipe(z.string().min(1, 'Acest camp este obligatoriu.').min(4, 'Numarul de inmatriculare este obligatoriu.')),
  brand: z.string().trim().min(1, 'Acest camp este obligatoriu.').min(2, 'Marca este obligatorie.'),
  model: z.string().trim().min(1, 'Acest camp este obligatoriu.'),
  year: optionalNumberSchema(z.coerce.number().min(1950, 'Anul trebuie sa fie dupa 1950.').max(2100, 'Anul nu este valid.')),
  color: z.string().optional(),
  engineHp: z.coerce.number().min(1, 'Acest camp este obligatoriu.'),
  engineDisplacement: z.coerce.number().min(1, 'Acest camp este obligatoriu.'),
  transmission: z.enum(['manual', 'automatic'], { message: 'Selectati o optiune.' }),
  chassisNumber: z
    .string()
    .transform(normalizeChassisNumber)
    .pipe(z.string().min(1, 'Acest camp este obligatoriu.').regex(chassisNumberPattern, 'Seria de sasiu trebuie sa aiba exact 17 caractere valide.')),
  category: z.literal('general').default('general'),
  status: z.enum(['available', 'archived']),
  purchasePrice: optionalNumberSchema(z.coerce.number().min(0, 'Pretul de achizitie nu poate fi negativ.')),
  purchaseCurrency: currencySchema.default('RON'),
  annualInsuranceCost: z.coerce.number().min(0, 'Costul asigurarii nu poate fi negativ.'),
  currentKm: z.coerce.number().min(0, 'Kilometrajul nu poate fi negativ.'),
  notes: z.string().optional(),
  itpExpiryDate: z.string().min(1, 'Acest camp este obligatoriu.'),
  rcaExpiryDate: z.string().min(1, 'Acest camp este obligatoriu.'),
})

export const maintenanceSchema = z
  .object({
    carId: z.string().min(1, 'Selectati o optiune.'),
    type: z.enum(['repair', 'investment', 'other'], { message: 'Selectati o optiune.' }),
    description: z.string().trim().min(1, 'Acest camp este obligatoriu.').min(3, 'Titlul este obligatoriu.'),
    cost: z.coerce.number().min(0, 'Costul nu poate fi negativ.'),
    datePerformed: z.string().min(1, 'Acest camp este obligatoriu.'),
    serviceEndDate: z.string().min(1, 'Acest camp este obligatoriu.'),
    blocksAvailability: z.boolean().default(false),
    kmAtService: optionalNumberSchema(z.coerce.number().min(0, 'Kilometrajul nu poate fi negativ.')),
    notes: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (value.serviceEndDate < value.datePerformed) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Data iesirii din service nu poate fi inaintea datei interventiei.',
        path: ['serviceEndDate'],
      })
    }
  })

export const rentalSegmentSchema = z
  .object({
    pricePerUnit: z.coerce.number().min(1, 'Acest camp este obligatoriu.'),
    priceUnit: z.enum(['day', 'week', 'month'], { message: 'Selectati o optiune.' }),
    startDate: z.string().min(1, 'Acest camp este obligatoriu.'),
    endDate: z.string().min(1, 'Acest camp este obligatoriu.'),
  })
  .superRefine((value, context) => {
    if (!isOrderedDateRange(value.startDate, value.endDate)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Data de sfarsit nu poate fi inaintea datei de inceput.',
        path: ['endDate'],
      })
    }
  })

export const rentalSchema = z
  .object({
    carId: z.string().min(1, 'Selectati o optiune.'),
    renterName: z.string().trim().min(1, 'Acest camp este obligatoriu.').min(2, 'Prenumele este obligatoriu.'),
    renterSurname: z.string().trim().min(1, 'Acest camp este obligatoriu.').min(2, 'Numele este obligatoriu.'),
    renterCnp: z.string().trim().regex(/^\d{13}$/, 'CNP-ul trebuie sa aiba exact 13 cifre.'),
    startDate: z.string().min(1, 'Acest camp este obligatoriu.'),
    endDate: z.string().min(1, 'Acest camp este obligatoriu.'),
    advancePayment: z.coerce.number().min(0, 'Avansul nu poate fi negativ.'),
    status: z.enum(['active', 'completed', 'cancelled']),
    kmStart: optionalNumberSchema(z.coerce.number().min(0, 'Kilometrajul nu poate fi negativ.')),
    kmEnd: optionalNumberSchema(z.coerce.number().min(0, 'Kilometrajul nu poate fi negativ.')),
    notes: z.string().optional(),
    segments: z.array(rentalSegmentSchema),
  })
  .superRefine((value, context) => {
    const seen = new Set<string>()

    if (!isOrderedDateRange(value.startDate, value.endDate)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Data de sfarsit nu poate fi inaintea datei de inceput.',
        path: ['endDate'],
      })
    }

    if (value.kmStart !== undefined && value.kmEnd !== undefined && value.kmEnd < value.kmStart) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Kilometrajul de retur nu poate fi mai mic decat cel de predare.',
        path: ['kmEnd'],
      })
    }

    value.segments.forEach((segment, index) => {
      const key = `${segment.startDate}-${segment.endDate}-${segment.pricePerUnit}-${segment.priceUnit}`

      if (seen.has(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Acest segment de pret este deja adaugat.',
          path: ['segments', index],
        })
      }
      seen.add(key)

      if (segment.startDate < value.startDate || segment.endDate > value.endDate) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Segmentul trebuie sa fie inclus in perioada inchirierii.',
          path: ['segments', index],
        })
      }

      value.segments.forEach((otherSegment, otherIndex) => {
        if (index >= otherIndex) return

        const overlaps = segment.startDate <= otherSegment.endDate && otherSegment.startDate <= segment.endDate
        if (overlaps) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Segmentele de pret nu se pot suprapune.',
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
