import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { isAfter, isBefore, parseISO } from 'date-fns'
import { Loader2, Pencil, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useSearchParams } from 'react-router-dom'
import { z } from 'zod'

import { FleetOwnerBadge, EmptyState, PageHeader } from '@/components/shared'
import { useFleetFilter } from '@/components/fleet-filter'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { canEditCar, getSharedFleetLabel } from '@/lib/fleet-access'
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

function createDefaultSegment(startDate = '', endDate = ''): SegmentDraft {
  return {
    pricePerUnit: 300,
    priceUnit: 'week',
    startDate,
    endDate,
  }
}

function createDefaultRentalValues(carId = ''): RentalValues {
  return {
    carId,
    renterName: '',
    renterSurname: '',
    renterCnp: '',
    startDate: '',
    endDate: '',
    advancePayment: 0,
    status: 'active',
    kmStart: undefined,
    kmEnd: undefined,
    notes: '',
    segments: [],
  }
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
  const { matchesOwner } = useFleetFilter()
  const [searchParams, setSearchParams] = useSearchParams()
  const [open, setOpen] = useState(false)
  const [editingRental, setEditingRental] = useState<Rental | null>(null)
  const [segment, setSegment] = useState<SegmentDraft>(createDefaultSegment())

  const visibleCars = useMemo(() => cars.filter((car) => matchesOwner(car.ownerId)), [cars, matchesOwner])
  const visibleRentals = useMemo(
    () => rentals.filter((rental) => matchesOwner(cars.find((car) => car.id === rental.carId)?.ownerId ?? '')),
    [cars, matchesOwner, rentals],
  )
  const editableCars = useMemo(
    () => visibleCars.filter((car) => canEditCar(profile, incomingInvites, car)),
    [incomingInvites, profile, visibleCars],
  )
  const creatableCars = useMemo(
    () => editableCars.filter((car) => car.status !== 'maintenance' && car.status !== 'archived'),
    [editableCars],
  )
  const sortedRentals = useMemo(
    () =>
      [...visibleRentals].sort((first, second) => {
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
    [visibleRentals],
  )

  const form = useForm<RentalValues, unknown, RentalSubmitValues>({
    resolver: zodResolver(rentalSchema),
    defaultValues: createDefaultRentalValues(creatableCars[0]?.id ?? editableCars[0]?.id ?? ''),
  })

  const selectedCarId = form.watch('carId')
  const selectedStartDate = form.watch('startDate')
  const selectedEndDate = form.watch('endDate')
  const selectedStatus = form.watch('status')
  const currentSegments = (form.watch('segments') as SegmentDraft[] | undefined) ?? []
  const hasSelectedRentalPeriod = Boolean(selectedStartDate && selectedEndDate)
  const draftSegmentValid = Boolean(segment.startDate && segment.endDate && segment.pricePerUnit > 0)
  const effectiveSegments = currentSegments.length > 0 ? currentSegments : draftSegmentValid ? [segment] : []

  useEffect(() => {
    if (editingRental || editableCars.length === 0) return
    if (editableCars.some((car) => car.id === selectedCarId)) return
    form.setValue('carId', (creatableCars[0] ?? editableCars[0]).id, { shouldValidate: true })
  }, [creatableCars, editableCars, editingRental, form, selectedCarId])

  useEffect(() => {
    setSegment((current) => ({
      ...current,
      startDate: selectedStartDate ?? '',
      endDate: selectedEndDate ?? '',
    }))
  }, [selectedEndDate, selectedStartDate])

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

    return unavailablePeriods.some((rental) => rangesOverlap(selectedStartDate, selectedEndDate, rental.startDate, rental.endDate))
  }, [selectedCarId, selectedEndDate, selectedStartDate, selectedStatus, unavailablePeriods])

  useEffect(() => {
    if (hasConflict) {
      form.setError('startDate', { message: 'Masina este deja inchiriata in perioada selectata.' })
      form.setError('endDate', { message: 'Alege o perioada libera.' })
      return
    }

    form.clearErrors(['startDate', 'endDate'])
  }, [form, hasConflict])

  const total = calculateRentalTotal(
    effectiveSegments.map((item, index) => ({
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
    setSegment(createDefaultSegment())
    form.reset(createDefaultRentalValues(nextCarId))
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
    setSegment(createDefaultSegment(rental.startDate, rental.endDate))
    setOpen(true)
  }

  const addSegment = () => {
    if (!segment.startDate || !segment.endDate) {
      toast.error('Completeaza perioada segmentului.')
      return
    }

    if (segment.endDate < segment.startDate) {
      toast.error('Data de sfarsit a segmentului nu poate fi inaintea celei de inceput.')
      return
    }

    if (!selectedStartDate || !selectedEndDate) {
      toast.error('Completeaza mai intai perioada inchirierii.')
      return
    }

    if (segment.startDate < selectedStartDate || segment.endDate > selectedEndDate) {
      toast.error('Segmentul trebuie sa fie inclus in perioada inchirierii.')
      return
    }

    if (segment.pricePerUnit <= 0) {
      toast.error('Pretul segmentului trebuie sa fie mai mare decat zero.')
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
      toast.error('Acest segment de pret este deja adaugat.')
      return
    }

    const overlappingSegment = currentSegments.some((item) => rangesOverlap(item.startDate, item.endDate, segment.startDate, segment.endDate))

    if (overlappingSegment) {
      toast.error('Segmentele de pret nu se pot suprapune.')
      return
    }

    const nextSegments = [...form.getValues('segments'), segment]
    form.setValue('segments', nextSegments, { shouldValidate: true })
    form.clearErrors('segments')
    setSegment(createDefaultSegment(selectedStartDate, selectedEndDate))
  }

  const onSubmit = form.handleSubmit(async (values) => {
    if (hasConflict) {
      toast.error('Nu poti salva inchirierea deoarece perioada selectata se suprapune cu una existenta.')
      return
    }

    const segments = values.segments.length > 0 ? values.segments : draftSegmentValid ? [segment] : []

    if (segments.length === 0) {
      form.setError('segments', { message: 'Va rugam sa completati acest camp.' })
      toast.error('Adauga cel putin un segment de pret.')
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
      toast.error(error instanceof Error ? error.message : 'Nu am putut salva inchirierea.')
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
    setSegment(createDefaultSegment())
    form.reset(createDefaultRentalValues(fallbackCarId))
    setOpen(true)

    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('action')
    nextParams.delete('carId')
    setSearchParams(nextParams, { replace: true })
  }, [creatableCars, editableCars, form, searchParams, setSearchParams])

  return (
    <div className="space-y-6">
      <PageHeader title="Inchirieri" action={creatableCars.length > 0 ? <Button onClick={openCreate}>Adauga inchiriere</Button> : undefined} />

      {sortedRentals.length === 0 ? (
        <EmptyState title="Nu exista inchirieri" description="Adauga prima inchiriere pentru a urmari veniturile si perioadele active." />
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
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {car?.brand} {car?.model} • {car?.licensePlate}
                    </p>
                    <FleetOwnerBadge label={car ? getSharedFleetLabel(profile, incomingInvites, car.ownerId) : undefined} />
                  </div>
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
                        Editeaza
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={async () => {
                          if (!window.confirm('Sigur vrei sa stergi aceasta inchiriere?')) return
                          try {
                            await deleteRental(rental.id)
                            toast.success('Sters cu succes')
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : 'Nu am putut sterge inchirierea.')
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        Sterge
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
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.25rem)] max-w-[calc(100vw-1.25rem)] overflow-x-hidden overflow-y-auto p-4 sm:max-w-4xl sm:p-6">
          <DialogHeader>
            <DialogTitle>{editingRental ? 'Editeaza inchirierea' : 'Inchiriere noua'}</DialogTitle>
            <DialogDescription>Selecteaza o masina, apoi alege perioada si segmentele de pret.</DialogDescription>
          </DialogHeader>

          <form className="space-y-5" onSubmit={onSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Masina" required error={form.formState.errors.carId?.message}>
                <select className={fieldClass(Boolean(form.formState.errors.carId))} {...form.register('carId')}>
                  {visibleCars.map((car) => {
                    const sharedFleetLabel = getSharedFleetLabel(profile, incomingInvites, car.ownerId)

                    return (
                      <option
                        key={car.id}
                        value={car.id}
                        disabled={!canEditCar(profile, incomingInvites, car) || (editingRental?.carId !== car.id && (car.status === 'maintenance' || car.status === 'archived'))}
                      >
                        {car.brand} {car.model} - {car.licensePlate}
                        {sharedFleetLabel ? ` - ${sharedFleetLabel}` : ''}
                        {!canEditCar(profile, incomingInvites, car)
                          ? ' (doar vizualizare)'
                          : car.status === 'maintenance'
                            ? ' (in service)'
                            : car.status === 'archived'
                              ? ' (arhivata)'
                              : ''}
                      </option>
                    )
                  })}
                </select>
              </Field>

              <Field label="Status" required>
                <select className={fieldClass(false)} {...form.register('status')}>
                  <option value="active">Activa</option>
                  <option value="completed">Finalizata</option>
                  <option value="cancelled">Anulata</option>
                </select>
              </Field>

              <Field label="Prenume" required error={form.formState.errors.renterName?.message}>
                <Input className={fieldClass(Boolean(form.formState.errors.renterName))} {...form.register('renterName')} />
              </Field>

              <Field label="Nume" required error={form.formState.errors.renterSurname?.message}>
                <Input className={fieldClass(Boolean(form.formState.errors.renterSurname))} {...form.register('renterSurname')} />
              </Field>

              <Field label="CNP" required error={form.formState.errors.renterCnp?.message}>
                <Input className={fieldClass(Boolean(form.formState.errors.renterCnp))} inputMode="numeric" maxLength={13} {...form.register('renterCnp')} />
              </Field>

              <Field label="Avans" required error={form.formState.errors.advancePayment?.message}>
                <Input className={fieldClass(Boolean(form.formState.errors.advancePayment))} type="number" {...form.register('advancePayment')} />
              </Field>

              <Field label="Data inceput" required error={form.formState.errors.startDate?.message}>
                <Input className={fieldClass(Boolean(form.formState.errors.startDate))} type="date" {...form.register('startDate')} />
              </Field>

              <Field label="Data sfarsit" required error={form.formState.errors.endDate?.message}>
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
              <p className="font-semibold">Perioade indisponibile pentru masina selectata</p>
              {unavailablePeriods.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Nu exista alte inchirieri active sau finalizate pentru aceasta masina.</p>
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

            <Field label="Notite">
              <Textarea {...form.register('notes')} />
            </Field>

            <div className="min-w-0 overflow-hidden rounded-3xl border p-4">
              <p className="font-semibold">Segmente tarif</p>
              <p className="mb-4 mt-1 text-sm text-muted-foreground">
                Datele segmentului pornesc automat din perioada inchirierii. Daca nu adaugi niciun segment, primul completat aici va fi salvat automat.
              </p>
              {!hasSelectedRentalPeriod ? (
                <div className="mb-4 rounded-2xl bg-muted p-3 text-sm text-muted-foreground">
                  Seteaza mai sus data de inceput si data de sfarsit pentru inchiriere, iar segmentul le va prelua automat aici.
                </div>
              ) : null}
              <div className="grid min-w-0 items-end gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,220px)_minmax(0,1fr)_minmax(0,1fr)]">
                <Field label="Pret" required>
                  <Input
                    className="min-w-0 max-w-full"
                    type="number"
                    value={segment.pricePerUnit}
                    onChange={(event) => setSegment((current) => ({ ...current, pricePerUnit: Number(event.target.value) }))}
                  />
                </Field>
                <Field label="Unitate" required>
                  <select
                    value={segment.priceUnit}
                    onChange={(event) => setSegment((current) => ({ ...current, priceUnit: event.target.value as PriceUnit }))}
                    className={fieldClass(false)}
                  >
                    <option value="day">Pe zi</option>
                    <option value="week">Pe saptamana</option>
                    <option value="month">Pe luna</option>
                  </select>
                </Field>
                {hasSelectedRentalPeriod ? (
                  <>
                    <Field label="De la" required>
                      <Input
                        className="min-w-0 max-w-full"
                        type="date"
                        value={segment.startDate}
                        onChange={(event) => setSegment((current) => ({ ...current, startDate: event.target.value }))}
                      />
                    </Field>
                    <Field label="Pana la" required>
                      <Input
                        className="min-w-0 max-w-full"
                        type="date"
                        value={segment.endDate}
                        onChange={(event) => setSegment((current) => ({ ...current, endDate: event.target.value }))}
                      />
                    </Field>
                  </>
                ) : null}
              </div>
              <Button className="mt-3" type="button" variant="outline" onClick={addSegment} disabled={!hasSelectedRentalPeriod}>
                Adauga segment
              </Button>

              <div className="mt-4 space-y-2">
                {currentSegments.map((item, index) => (
                  <div key={`${item.startDate}-${index}`} className="flex flex-col gap-3 rounded-2xl border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0 break-words">
                      {formatDate(item.startDate)} - {formatDate(item.endDate)} • {formatCurrency(item.pricePerUnit)} / {getPriceUnitLabel(item.priceUnit)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="self-start sm:self-auto"
                      onClick={() => form.setValue('segments', currentSegments.filter((_, itemIndex) => itemIndex !== index), { shouldValidate: true })}
                    >
                      Sterge
                    </Button>
                  </div>
                ))}
              </div>
              {form.formState.errors.segments?.message ? <p className="mt-2 text-sm text-destructive">{form.formState.errors.segments.message}</p> : null}
            </div>

            <div className="rounded-3xl bg-secondary p-4">
              <p className="font-semibold">Total calculat: {formatCurrency(total)}</p>
              <p className="text-sm text-muted-foreground">Rest de incasat: {formatCurrency(total - Number(form.watch('advancePayment') || 0))}</p>
              {hasConflict ? <p className="mt-2 text-sm font-medium text-destructive">Perioada aleasa se suprapune cu o inchiriere existenta.</p> : null}
            </div>

            <Button className="w-full" type="submit" disabled={hasConflict || form.formState.isSubmitting}>
              {form.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {form.formState.isSubmitting ? 'Se salveaza...' : editingRental ? 'Salveaza modificarile' : 'Salveaza inchirierea'}
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
    <div className="space-y-2 min-w-0">
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
