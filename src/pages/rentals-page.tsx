import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { isAfter, isBefore, parseISO } from 'date-fns'
import { Loader2, Pencil, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useSearchParams } from 'react-router-dom'
import { z } from 'zod'

import { EmptyState, PageHeader } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { canEditCar } from '@/lib/fleet-access'
import { calculateRentalTotal, formatCurrency, formatDate, getPriceUnitLabel } from '@/lib/format'
import { rentalSchema } from '@/lib/validators'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'
import type { PriceUnit, Rental } from '@/types/models'

type SegmentDraft = {
  pricePerUnit: number
  priceUnit: PriceUnit
  startDate: string
  endDate: string
}

type RentalValues = z.input<typeof rentalSchema>
type RentalSubmitValues = z.output<typeof rentalSchema>

const initialDate = new Date().toISOString().slice(0, 10)

const defaultSegment: SegmentDraft = {
  pricePerUnit: 300,
  priceUnit: 'week',
  startDate: initialDate,
  endDate: initialDate,
}

function rangesOverlap(startA: string, endA: string, startB: string, endB: string) {
  const aStart = parseISO(startA)
  const aEnd = parseISO(endA)
  const bStart = parseISO(startB)
  const bEnd = parseISO(endB)

  return !isBefore(aEnd, bStart) && !isAfter(aStart, bEnd)
}

export function RentalsPage() {
  const { cars, rentals, profile, incomingInvites, saveRental, deleteRental } = useAppStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [open, setOpen] = useState(false)
  const [editingRental, setEditingRental] = useState<Rental | null>(null)
  const [segment, setSegment] = useState<SegmentDraft>(defaultSegment)

  const editableCars = useMemo(
    () => cars.filter((car) => canEditCar(profile, incomingInvites, car)),
    [cars, incomingInvites, profile],
  )
  const creatableCars = useMemo(
    () => editableCars.filter((car) => car.status !== 'maintenance' && car.status !== 'archived'),
    [editableCars],
  )
  const sortedRentals = useMemo(
    () =>
      [...rentals].sort((first, second) => {
        const firstPriority = getRentalPriority(first.status)
        const secondPriority = getRentalPriority(second.status)

        if (firstPriority !== secondPriority) {
          return firstPriority - secondPriority
        }

        if (first.startDate !== second.startDate) {
          return second.startDate.localeCompare(first.startDate)
        }

        return second.createdAt.localeCompare(first.createdAt)
      }),
    [rentals],
  )

  const form = useForm<RentalValues, unknown, RentalSubmitValues>({
    resolver: zodResolver(rentalSchema),
    defaultValues: {
      carId: creatableCars[0]?.id ?? editableCars[0]?.id ?? '',
      renterName: '',
      renterSurname: '',
      renterCnp: '',
      startDate: initialDate,
      endDate: initialDate,
      advancePayment: 0,
      status: 'active',
      kmStart: undefined,
      kmEnd: undefined,
      notes: '',
      segments: [],
    },
  })

  const selectedCarId = form.watch('carId')
  const selectedStartDate = form.watch('startDate')
  const selectedEndDate = form.watch('endDate')
  const selectedStatus = form.watch('status')
  const currentSegments = form.watch('segments') as SegmentDraft[]

  useEffect(() => {
    if (editingRental || editableCars.length === 0) return
    if (editableCars.some((car) => car.id === selectedCarId)) return
    form.setValue('carId', (creatableCars[0] ?? editableCars[0]).id, { shouldValidate: true })
  }, [creatableCars, editableCars, editingRental, form, selectedCarId])

  const unavailablePeriods = useMemo(
    () =>
      rentals
        .filter(
          (rental) =>
            rental.id !== editingRental?.id &&
            rental.carId === selectedCarId &&
            rental.status !== 'cancelled' &&
            rental.startDate &&
            rental.endDate,
        )
        .sort((first, second) => first.startDate.localeCompare(second.startDate)),
    [editingRental?.id, rentals, selectedCarId],
  )

  const hasConflict = useMemo(() => {
    if (selectedStatus === 'cancelled') return false
    if (!selectedCarId || !selectedStartDate || !selectedEndDate) return false
    return unavailablePeriods.some((rental) =>
      rangesOverlap(selectedStartDate, selectedEndDate, rental.startDate, rental.endDate),
    )
  }, [selectedCarId, selectedEndDate, selectedStartDate, selectedStatus, unavailablePeriods])

  useEffect(() => {
    if (hasConflict) {
      form.setError('startDate', { message: 'Mașina este deja închiriată în perioada selectată.' })
      form.setError('endDate', { message: 'Alege o perioadă liberă.' })
      return
    }

    form.clearErrors(['startDate', 'endDate'])
  }, [form, hasConflict])

  const total = calculateRentalTotal(
    currentSegments.map((item, index) => ({
      ...item,
      id: String(index),
      rentalId: editingRental?.id ?? 'draft',
      createdAt: new Date().toISOString(),
    })),
  )

  const resetDialog = (preferredCarId?: string) => {
    const nextCarId =
      (preferredCarId && editableCars.some((car) => car.id === preferredCarId) ? preferredCarId : undefined) ??
      creatableCars[0]?.id ??
      editableCars[0]?.id ??
      ''

    setEditingRental(null)
    setSegment(defaultSegment)
    form.reset({
      carId: nextCarId,
      renterName: '',
      renterSurname: '',
      renterCnp: '',
      startDate: initialDate,
      endDate: initialDate,
      advancePayment: 0,
      status: 'active',
      kmStart: undefined,
      kmEnd: undefined,
      notes: '',
      segments: [],
    })
  }

  const openCreate = (preferredCarId?: unknown) => {
    resetDialog(typeof preferredCarId === 'string' ? preferredCarId : undefined)
    setOpen(true)
  }

  const openEdit = (rental: Rental) => {
    setEditingRental(rental)
    form.reset({
      carId: rental.carId,
      renterName: rental.renterName,
      renterSurname: rental.renterSurname,
      renterCnp: rental.renterCnp,
      startDate: rental.startDate,
      endDate: rental.endDate,
      advancePayment: rental.advancePayment,
      status: rental.status,
      kmStart: rental.kmStart,
      kmEnd: rental.kmEnd,
      notes: rental.notes ?? '',
      segments: rental.segments.map((item) => ({
        pricePerUnit: item.pricePerUnit,
        priceUnit: item.priceUnit,
        startDate: item.startDate,
        endDate: item.endDate,
      })),
    })
    setSegment(defaultSegment)
    setOpen(true)
  }

  const addSegment = () => {
    if (!segment.startDate || !segment.endDate) {
      toast.error('Completează perioada segmentului.')
      return
    }

    if (segment.endDate < segment.startDate) {
      toast.error('Data de sfârșit a segmentului nu poate fi înaintea celei de început.')
      return
    }

    if (!selectedStartDate || !selectedEndDate) {
      toast.error('Completează mai întâi perioada închirierii.')
      return
    }

    if (segment.startDate < selectedStartDate || segment.endDate > selectedEndDate) {
      toast.error('Segmentul trebuie să fie inclus în perioada închirierii.')
      return
    }

    if (segment.pricePerUnit <= 0) {
      toast.error('Prețul segmentului trebuie să fie mai mare decât zero.')
      return
    }

    const duplicate = currentSegments.some(
      (item) =>
        item.startDate === segment.startDate &&
        item.endDate === segment.endDate &&
        item.pricePerUnit === segment.pricePerUnit &&
        item.priceUnit === segment.priceUnit,
    )

    if (duplicate) {
      toast.error('Acest segment de preț este deja adăugat.')
      return
    }

    const overlappingSegment = currentSegments.some((item) =>
      rangesOverlap(item.startDate, item.endDate, segment.startDate, segment.endDate),
    )

    if (overlappingSegment) {
      toast.error('Segmentele de preț nu se pot suprapune.')
      return
    }

    const next = [...form.getValues('segments'), segment]
    form.setValue('segments', next, { shouldValidate: true })
    form.clearErrors('segments')
    setSegment(defaultSegment)
  }

  const onSubmit = form.handleSubmit(async (values) => {
    if (hasConflict) {
      toast.error('Nu poți salva închirierea deoarece perioada selectată se suprapune cu una existentă.')
      return
    }

    const draftSegmentValid = segment.startDate && segment.endDate && segment.pricePerUnit > 0
    const segments = values.segments.length > 0 ? values.segments : draftSegmentValid ? [segment] : []

    if (segments.length === 0) {
      form.setError('segments', { message: 'Vă rugăm să completați acest câmp.' })
      toast.error('Adaugă cel puțin un segment de preț.')
      return
    }

    try {
      const rentalId = editingRental?.id ?? crypto.randomUUID()
      await saveRental({
        ...values,
        id: editingRental?.id,
        segments: segments.map((item) => ({
          ...item,
          id: crypto.randomUUID(),
          rentalId,
          createdAt: new Date().toISOString(),
        })),
      })
      toast.success(editingRental ? 'Modificat cu succes' : 'Salvat cu succes')
      resetDialog()
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nu am putut salva închirierea.')
    }
  })

  useEffect(() => {
    if (searchParams.get('action') !== 'create') {
      return
    }

    const requestedCarId = searchParams.get('carId') ?? undefined
    const preferredCarId = creatableCars.some((car) => car.id === requestedCarId) ? requestedCarId : undefined
    const fallbackCarId = preferredCarId ?? creatableCars[0]?.id ?? editableCars[0]?.id

    if (!fallbackCarId) {
      return
    }

    setEditingRental(null)
    setSegment(defaultSegment)
    form.reset({
      carId: fallbackCarId,
      renterName: '',
      renterSurname: '',
      renterCnp: '',
      startDate: initialDate,
      endDate: initialDate,
      advancePayment: 0,
      status: 'active',
      kmStart: undefined,
      kmEnd: undefined,
      notes: '',
      segments: [],
    })
    setOpen(true)

    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('action')
    nextParams.delete('carId')
    setSearchParams(nextParams, { replace: true })
  }, [creatableCars, editableCars, form, searchParams, setSearchParams])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Închirieri"
        action={creatableCars.length > 0 ? <Button onClick={openCreate}>Adaugă închiriere</Button> : undefined}
      />

      {rentals.length === 0 ? (
        <EmptyState title="Nu există închirieri" description="Adaugă prima închiriere pentru a urmări veniturile și perioadele active." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {sortedRentals.map((rental) => {
            const car = cars.find((item) => item.id === rental.carId)
            const rentalTotal = calculateRentalTotal(rental.segments)
            const canEdit = car ? canEditCar(profile, incomingInvites, car) : false

            return (
              <Card key={rental.id}>
                <CardHeader>
                  <CardTitle>
                    {rental.renterName} {rental.renterSurname}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {car?.brand} {car?.model} • {car?.licensePlate}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(rental.startDate)} - {formatDate(rental.endDate)}
                  </p>
                  <div className="rounded-2xl bg-muted p-4">
                    <p className="font-semibold">Total: {formatCurrency(rentalTotal)}</p>
                    <p className="text-sm text-muted-foreground">Avans: {formatCurrency(rental.advancePayment)}</p>
                    <p className="text-sm text-muted-foreground">Rest: {formatCurrency(rentalTotal - rental.advancePayment)}</p>
                  </div>
                  <div className="space-y-2">
                    {[...rental.segments].sort((first, second) => first.startDate.localeCompare(second.startDate)).map((item) => (
                      <div key={item.id} className="rounded-2xl border p-3 text-sm">
                        {formatDate(item.startDate)} - {formatDate(item.endDate)} • {getPriceUnitLabel(item.priceUnit)} • {formatCurrency(item.pricePerUnit)}
                      </div>
                    ))}
                  </div>
                  {canEdit ? (
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => openEdit(rental)}>
                        <Pencil className="h-4 w-4" />
                        Editează
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={async () => {
                          if (!window.confirm('Sigur vrei să ștergi această închiriere?')) return
                          try {
                            await deleteRental(rental.id)
                            toast.success('Șters cu succes')
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : 'Nu am putut șterge închirierea.')
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        Șterge
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) resetDialog()
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto lg:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{editingRental ? 'Editează închirierea' : 'Închiriere nouă'}</DialogTitle>
            <DialogDescription>Selectează o mașină, apoi alege perioada și segmentele de preț.</DialogDescription>
          </DialogHeader>

          <form className="space-y-5" onSubmit={onSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Mașină" required error={form.formState.errors.carId?.message}>
                <select className={fieldClass(Boolean(form.formState.errors.carId))} {...form.register('carId')}>
                  {cars.map((car) => (
                    <option
                      key={car.id}
                      value={car.id}
                      disabled={
                        !canEditCar(profile, incomingInvites, car) ||
                        (editingRental?.carId !== car.id && (car.status === 'maintenance' || car.status === 'archived'))
                      }
                    >
                      {car.brand} {car.model} - {car.licensePlate}
                      {!canEditCar(profile, incomingInvites, car)
                        ? ' (doar vizualizare)'
                        : car.status === 'maintenance'
                          ? ' (în service)'
                          : car.status === 'archived'
                            ? ' (arhivată)'
                            : ''}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Status" required>
                <select className={fieldClass(false)} {...form.register('status')}>
                  <option value="active">Activă</option>
                  <option value="completed">Finalizată</option>
                  <option value="cancelled">Anulată</option>
                </select>
              </Field>

              <Field label="Prenume" required error={form.formState.errors.renterName?.message}>
                <Input className={fieldClass(Boolean(form.formState.errors.renterName))} {...form.register('renterName')} />
              </Field>

              <Field label="Nume" required error={form.formState.errors.renterSurname?.message}>
                <Input className={fieldClass(Boolean(form.formState.errors.renterSurname))} {...form.register('renterSurname')} />
              </Field>

              <Field label="CNP" required error={form.formState.errors.renterCnp?.message}>
                <Input
                  className={fieldClass(Boolean(form.formState.errors.renterCnp))}
                  inputMode="numeric"
                  maxLength={13}
                  {...form.register('renterCnp')}
                />
              </Field>

              <Field label="Avans" required error={form.formState.errors.advancePayment?.message}>
                <Input className={fieldClass(Boolean(form.formState.errors.advancePayment))} type="number" {...form.register('advancePayment')} />
              </Field>

              <Field label="Data început" required error={form.formState.errors.startDate?.message}>
                <Input className={fieldClass(Boolean(form.formState.errors.startDate))} type="date" {...form.register('startDate')} />
              </Field>

              <Field label="Data sfârșit" required error={form.formState.errors.endDate?.message}>
                <Input className={fieldClass(Boolean(form.formState.errors.endDate))} type="date" {...form.register('endDate')} />
              </Field>

              <Field label="KM predare">
                <Input type="number" {...form.register('kmStart')} />
              </Field>

              <Field label="KM retur" error={form.formState.errors.kmEnd?.message}>
                <Input className={fieldClass(Boolean(form.formState.errors.kmEnd))} type="number" {...form.register('kmEnd')} />
              </Field>
            </div>

            <div className="rounded-3xl border p-4">
              <p className="font-semibold">Perioade indisponibile pentru mașina selectată</p>
              {unavailablePeriods.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Nu există alte închirieri active sau finalizate pentru această mașină.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {unavailablePeriods.map((rental) => (
                    <div key={rental.id} className="rounded-2xl bg-muted p-3 text-sm">
                      {formatDate(rental.startDate)} - {formatDate(rental.endDate)} • {rental.renterName} {rental.renterSurname}
                    </div>
                  ))}
                </div>
              )}
            </div>

              <Field label="Notițe">
              <Textarea {...form.register('notes')} />
            </Field>

            <div className="rounded-3xl border p-4">
              <p className="font-semibold">Segmente tarif</p>
              <p className="mb-4 mt-1 text-sm text-muted-foreground">
                Dacă nu ai adăugat niciun segment, primul segment completat mai jos va fi salvat automat.
              </p>
              <div className="grid items-end gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.2fr)_220px_1fr_1fr]">
                <Field label="Preț" required>
                  <Input
                    type="number"
                    value={segment.pricePerUnit}
                    onChange={(e) => setSegment((current) => ({ ...current, pricePerUnit: Number(e.target.value) }))}
                  />
                </Field>
                <Field label="Unitate" required>
                  <select
                    value={segment.priceUnit}
                    onChange={(e) => setSegment((current) => ({ ...current, priceUnit: e.target.value as PriceUnit }))}
                    className={fieldClass(false)}
                  >
                    <option value="day">Pe zi</option>
                    <option value="week">Pe săptămână</option>
                    <option value="month">Pe lună</option>
                  </select>
                </Field>
                <Field label="De la" required>
                  <Input type="date" value={segment.startDate} onChange={(e) => setSegment((current) => ({ ...current, startDate: e.target.value }))} />
                </Field>
                <Field label="Până la" required>
                  <Input type="date" value={segment.endDate} onChange={(e) => setSegment((current) => ({ ...current, endDate: e.target.value }))} />
                </Field>
              </div>
              <Button className="mt-3" type="button" variant="outline" onClick={addSegment}>
                Adaugă segment
              </Button>

              <div className="mt-4 space-y-2">
                {currentSegments.map((item, index) => (
                  <div key={`${item.startDate}-${index}`} className="flex items-center justify-between rounded-2xl border p-3 text-sm">
                    <span>
                      {formatDate(item.startDate)} - {formatDate(item.endDate)} • {formatCurrency(item.pricePerUnit)} / {getPriceUnitLabel(item.priceUnit)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => form.setValue('segments', currentSegments.filter((_, itemIndex) => itemIndex !== index), { shouldValidate: true })}
                    >
                      Șterge
                    </Button>
                  </div>
                ))}
              </div>
              {form.formState.errors.segments?.message ? <p className="mt-2 text-sm text-destructive">{form.formState.errors.segments.message}</p> : null}
            </div>

            <div className="rounded-3xl bg-secondary p-4">
              <p className="font-semibold">Total calculat: {formatCurrency(total)}</p>
              <p className="text-sm text-muted-foreground">Rest de încasat: {formatCurrency(total - Number(form.watch('advancePayment') || 0))}</p>
              {hasConflict ? <p className="mt-2 text-sm font-medium text-destructive">Perioada aleasă se suprapune cu o închiriere existentă.</p> : null}
            </div>

            <Button className="w-full" type="submit" disabled={hasConflict || form.formState.isSubmitting}>
              {form.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {form.formState.isSubmitting
                ? 'Se salvează...'
                : editingRental
                  ? 'Salvează modificările'
                  : 'Salvează închirierea'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function fieldClass(hasError: boolean) {
  return cn('h-11 w-full rounded-2xl border bg-card px-4 text-sm', hasError ? 'border-destructive focus-visible:ring-destructive' : '')
}

function Field({
  label,
  required = false,
  children,
  error,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
  error?: string
}) {
  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      {children}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}

function getRentalPriority(status: Rental['status']) {
  return {
    active: 0,
    completed: 1,
    cancelled: 2,
  }[status]
}
