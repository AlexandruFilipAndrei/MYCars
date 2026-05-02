import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Pencil, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useSearchParams } from 'react-router-dom'
import { z } from 'zod'

import { FileDropzone } from '@/components/file-dropzone'
import { FleetOwnerBadge, EmptyState, PageHeader, SearchInput } from '@/components/shared'
import { useFleetFilter } from '@/components/fleet-filter'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { canEditCar, getSharedFleetLabel } from '@/lib/fleet-access'
import { formatCurrency, formatDate } from '@/lib/format'
import { maintenanceSchema } from '@/lib/validators'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'

type MaintenanceValues = z.input<typeof maintenanceSchema>
type MaintenanceSubmitValues = z.output<typeof maintenanceSchema>
type MaintenanceTypeFilter = 'all' | MaintenanceSubmitValues['type']
type MaintenanceAvailabilityFilter = 'all' | 'blocks' | 'non_blocks'

function createDefaultMaintenanceValues(carId = ''): MaintenanceValues {
  return {
    carId,
    type: 'repair',
    description: '',
    cost: 0,
    datePerformed: '',
    serviceEndDate: '',
    kmAtService: undefined,
    notes: '',
    blocksAvailability: false,
  }
}

function normalizeSearch(value: string) {
  return value.toLowerCase().trim()
}

export function MaintenancePage() {
  const { cars, rentals, maintenance, profile, incomingInvites, saveMaintenance, deleteMaintenance } = useAppStore()
  const { matchesOwner } = useFleetFilter()
  const [searchParams, setSearchParams] = useSearchParams()
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [documentFiles, setDocumentFiles] = useState<File[]>([])
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<MaintenanceTypeFilter>('all')
  const [availabilityFilter, setAvailabilityFilter] = useState<MaintenanceAvailabilityFilter>('all')

  const carsById = useMemo(() => new Map(cars.map((car) => [car.id, car])), [cars])
  const visibleCars = useMemo(() => cars.filter((car) => matchesOwner(car.ownerId)), [cars, matchesOwner])
  const visibleMaintenance = useMemo(
    () => maintenance.filter((item) => matchesOwner(carsById.get(item.carId)?.ownerId ?? '')),
    [carsById, maintenance, matchesOwner],
  )
  const editableCars = useMemo(
    () => visibleCars.filter((car) => canEditCar(profile, incomingInvites, car)),
    [incomingInvites, profile, visibleCars],
  )
  const filteredMaintenance = useMemo(() => {
    const normalizedQuery = normalizeSearch(query)

    return visibleMaintenance.filter((item) => {
      const car = carsById.get(item.carId)
      const matchesQuery =
        normalizedQuery.length === 0 ||
        [
          item.description,
          item.notes ?? '',
          item.datePerformed,
          item.serviceEndDate,
          item.cost,
          item.kmAtService ?? '',
          getMaintenanceTypeLabel(item.type),
          car?.brand ?? '',
          car?.model ?? '',
          car?.licensePlate ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery)
      const matchesType = typeFilter === 'all' || item.type === typeFilter
      const matchesAvailability =
        availabilityFilter === 'all' ||
        (availabilityFilter === 'blocks' && item.blocksAvailability) ||
        (availabilityFilter === 'non_blocks' && !item.blocksAvailability)

      return matchesQuery && matchesType && matchesAvailability
    })
  }, [availabilityFilter, carsById, query, typeFilter, visibleMaintenance])
  const sortedMaintenance = useMemo(
    () =>
      [...filteredMaintenance].sort((first, second) => {
        if (first.datePerformed !== second.datePerformed) {
          return second.datePerformed.localeCompare(first.datePerformed)
        }

        return second.createdAt.localeCompare(first.createdAt)
      }),
    [filteredMaintenance],
  )
  const hasActiveFilters = Boolean(query.trim()) || typeFilter !== 'all' || availabilityFilter !== 'all'

  const form = useForm<MaintenanceValues, unknown, MaintenanceSubmitValues>({
    resolver: zodResolver(maintenanceSchema),
    defaultValues: createDefaultMaintenanceValues(editableCars[0]?.id ?? visibleCars[0]?.id ?? ''),
  })

  const selectedCarId = form.watch('carId')
  const selectedServiceStartDate = form.watch('datePerformed')
  const selectedCar = useMemo(() => cars.find((car) => car.id === selectedCarId), [cars, selectedCarId])
  const selectedCarHasActiveRental = useMemo(
    () => rentals.some((rental) => rental.carId === selectedCarId && rental.status === 'active'),
    [rentals, selectedCarId],
  )

  useEffect(() => {
    if (selectedServiceStartDate && !form.getValues('serviceEndDate')) {
      form.setValue('serviceEndDate', selectedServiceStartDate, { shouldValidate: true })
    }
  }, [form, selectedServiceStartDate])

  const resetForm = (preferredCarId?: string) => {
    const nextCarId =
      (preferredCarId && editableCars.some((car) => car.id === preferredCarId) ? preferredCarId : undefined) ??
      editableCars[0]?.id ??
      visibleCars[0]?.id ??
      ''

    setEditingId(null)
    setDocumentFiles([])
    form.reset(createDefaultMaintenanceValues(nextCarId))
  }

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await saveMaintenance({ ...values, id: editingId ?? undefined, documentFiles })
      toast.success(editingId ? 'Modificat cu succes' : 'Salvat cu succes')
      resetForm()
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nu am putut salva interventia.')
    }
  })

  useEffect(() => {
    if (searchParams.get('action') !== 'create') {
      return
    }

    const requestedCarId = searchParams.get('carId') ?? undefined
    const preferredCarId = editableCars.some((car) => car.id === requestedCarId) ? requestedCarId : undefined
    const fallbackCarId = preferredCarId ?? editableCars[0]?.id ?? visibleCars[0]?.id

    if (!fallbackCarId) {
      return
    }

    setEditingId(null)
    setDocumentFiles([])
    form.reset(createDefaultMaintenanceValues(fallbackCarId))
    setOpen(true)

    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('action')
    nextParams.delete('carId')
    setSearchParams(nextParams, { replace: true })
  }, [editableCars, form, searchParams, setSearchParams, visibleCars])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reparatii"
        action={
          editableCars.length > 0 ? (
            <Button
              onClick={() => {
                resetForm()
                setOpen(true)
              }}
            >
              Adauga interventie
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardContent className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,180px)_minmax(0,210px)_auto]">
          <SearchInput value={query} onChange={setQuery} placeholder="Cauta dupa masina, titlu, note..." />
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as MaintenanceTypeFilter)}
            className="h-11 rounded-2xl border bg-card px-4 text-sm"
          >
            <option value="all">Toate tipurile</option>
            <option value="repair">Reparatii</option>
            <option value="investment">Investitii</option>
            <option value="other">Altele</option>
          </select>
          <select
            value={availabilityFilter}
            onChange={(event) => setAvailabilityFilter(event.target.value as MaintenanceAvailabilityFilter)}
            className="h-11 rounded-2xl border bg-card px-4 text-sm"
          >
            <option value="all">Toate interventiile</option>
            <option value="blocks">Scoate masina din circuit</option>
            <option value="non_blocks">Nu blocheaza masina</option>
          </select>
          {hasActiveFilters ? (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => {
                setQuery('')
                setTypeFilter('all')
                setAvailabilityFilter('all')
              }}
            >
              Reseteaza
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {sortedMaintenance.length === 0 ? (
        <EmptyState
          title={visibleMaintenance.length === 0 ? 'Nu exista reparatii' : 'Nu am gasit reparatii'}
          description={
            visibleMaintenance.length === 0
              ? 'Adauga prima interventie pentru a incepe urmarirea costurilor.'
              : 'Incearca sa modifici filtrele sau cautarea.'
          }
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {sortedMaintenance.map((item) => {
            const car = cars.find((carItem) => carItem.id === item.carId)
            const canEdit = car ? canEditCar(profile, incomingInvites, car) : false

            return (
              <Card key={item.id}>
                <CardContent className="space-y-3 p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-display text-xl font-bold">{item.description}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {car?.brand} {car?.model} • {car?.licensePlate}
                      </p>
                      <FleetOwnerBadge label={car ? getSharedFleetLabel(profile, incomingInvites, car.ownerId) : undefined} className="mt-2" />
                    </div>
                    <p className="shrink-0 font-semibold text-primary">{formatCurrency(item.cost)}</p>
                  </div>

                  <p className="text-sm text-muted-foreground">Data: {formatDate(item.datePerformed)}</p>
                  <p className="text-sm text-muted-foreground">Iese din service: {formatDate(item.serviceEndDate)}</p>
                  {item.blocksAvailability ? <p className="text-sm text-amber-700 dark:text-amber-300">Scoate masina din circuit pe durata interventiei.</p> : null}
                  <p className="text-sm text-muted-foreground">Tip: {getMaintenanceTypeLabel(item.type)}</p>

                  {item.notes ? <p className="break-words rounded-2xl bg-muted p-3 text-sm">{item.notes}</p> : null}

                  {item.documents.length > 0 ? (
                    <div className="space-y-2 rounded-2xl border p-3">
                      {[...item.documents].sort((first, second) => second.createdAt.localeCompare(first.createdAt)).map((document) => (
                        <a key={document.id} href={document.fileUrl} target="_blank" rel="noreferrer" className="block text-sm text-primary underline">
                          {document.fileName ?? 'Document'}
                        </a>
                      ))}
                    </div>
                  ) : null}

                  {canEdit ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditingId(item.id)
                          form.reset({
                            carId: item.carId,
                            type: item.type,
                            description: item.description,
                            cost: item.cost,
                            datePerformed: item.datePerformed,
                            serviceEndDate: item.serviceEndDate,
                            kmAtService: item.kmAtService,
                            notes: item.notes ?? '',
                            blocksAvailability: item.blocksAvailability,
                          })
                          setDocumentFiles([])
                          setOpen(true)
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        Editeaza
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={async () => {
                          if (!window.confirm('Sigur vrei sa stergi aceasta interventie?')) return
                          try {
                            await deleteMaintenance(item.id)
                            toast.success('Sters cu succes')
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : 'Nu am putut sterge interventia.')
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
          if (!next) resetForm()
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editeaza interventia' : 'Adauga interventie'}</DialogTitle>
            <DialogDescription>Introdu costul, informatiile relevante si fisierele justificative.</DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={onSubmit}>
            <Field label="Masina" required error={form.formState.errors.carId?.message}>
              <select className={fieldClass(Boolean(form.formState.errors.carId))} {...form.register('carId')}>
                {visibleCars.map((car) => {
                  const sharedFleetLabel = getSharedFleetLabel(profile, incomingInvites, car.ownerId)

                  return (
                    <option key={car.id} value={car.id} disabled={!canEditCar(profile, incomingInvites, car)}>
                      {car.brand} {car.model} - {car.licensePlate}
                      {sharedFleetLabel ? ` - ${sharedFleetLabel}` : ''}
                      {!canEditCar(profile, incomingInvites, car) ? ' (doar vizualizare)' : ''}
                    </option>
                  )
                })}
              </select>
            </Field>

            <Field label="Tip" required error={form.formState.errors.type?.message}>
              <select className={fieldClass(Boolean(form.formState.errors.type))} {...form.register('type')}>
                <option value="repair">Reparatie</option>
                <option value="investment">Investitie</option>
                <option value="other">Altele</option>
              </select>
            </Field>

            <Field label="Titlu" required error={form.formState.errors.description?.message}>
              <Input className={fieldClass(Boolean(form.formState.errors.description))} {...form.register('description')} placeholder="Ex: Schimb ambreiaj, revizie completa" />
            </Field>

            <Field label="Cost" required error={form.formState.errors.cost?.message}>
              <Input className={fieldClass(Boolean(form.formState.errors.cost))} type="number" {...form.register('cost')} />
            </Field>

            <Field label="Data interventiei" required error={form.formState.errors.datePerformed?.message}>
              <Input className={fieldClass(Boolean(form.formState.errors.datePerformed))} type="date" {...form.register('datePerformed')} />
            </Field>

            <Field label="Data iesire service" required error={form.formState.errors.serviceEndDate?.message}>
              <Input className={fieldClass(Boolean(form.formState.errors.serviceEndDate))} type="date" {...form.register('serviceEndDate')} />
            </Field>

            <Field label="Kilometraj">
              <Input type="number" {...form.register('kmAtService')} />
            </Field>

            <Field label="Detalii suplimentare">
              <Textarea {...form.register('notes')} />
            </Field>

            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" disabled={selectedCar?.status === 'archived'} {...form.register('blocksAvailability')} />
              Scoate masina din circuit in aceasta perioada
            </label>

            {selectedCar?.status === 'archived' ? <p className="text-sm text-muted-foreground">O masina arhivata nu poate fi scoasa din circuit printr-o interventie noua.</p> : null}

            {selectedCarHasActiveRental ? <p className="text-sm text-muted-foreground">Daca intervalul de service se suprapune cu o inchiriere, salvarea va fi blocata.</p> : null}

            <p className="text-sm text-muted-foreground">Data de iesire se completeaza automat cu ziua interventiei si o poti ajusta daca masina sta mai mult in service.</p>

            <FileDropzone
              label="Incarca facturi, poze sau PDF-uri"
              files={documentFiles}
              accept="image/*,.pdf"
              hint="Poti incarca imagini si PDF-uri."
              onChange={setDocumentFiles}
            />

            <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {form.formState.isSubmitting ? 'Se salveaza...' : 'Salveaza'}
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

function getMaintenanceTypeLabel(type: MaintenanceSubmitValues['type']) {
  return {
    repair: 'Reparatie',
    investment: 'Investitie',
    other: 'Altele',
  }[type]
}
