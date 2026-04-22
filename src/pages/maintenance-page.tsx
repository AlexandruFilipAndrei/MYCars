import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Pencil, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useSearchParams } from 'react-router-dom'
import { z } from 'zod'

import { FileDropzone } from '@/components/file-dropzone'
import { FleetOwnerBadge, EmptyState, PageHeader } from '@/components/shared'
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

function createDefaultMaintenanceValues(carId = ''): MaintenanceValues {
  return {
    carId,
    type: 'repair',
    description: '',
    cost: 0,
    datePerformed: '',
    expectedCompletionDate: '',
    kmAtService: undefined,
    notes: '',
    markCarAsMaintenance: false,
  }
}

export function MaintenancePage() {
  const { cars, rentals, maintenance, profile, incomingInvites, saveMaintenance, deleteMaintenance } = useAppStore()
  const { matchesOwner } = useFleetFilter()
  const [searchParams, setSearchParams] = useSearchParams()
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [documentFiles, setDocumentFiles] = useState<File[]>([])

  const visibleCars = useMemo(() => cars.filter((car) => matchesOwner(car.ownerId)), [cars, matchesOwner])
  const visibleMaintenance = useMemo(
    () => maintenance.filter((item) => matchesOwner(cars.find((car) => car.id === item.carId)?.ownerId ?? '')),
    [cars, maintenance, matchesOwner],
  )
  const editableCars = useMemo(
    () => visibleCars.filter((car) => canEditCar(profile, incomingInvites, car)),
    [incomingInvites, profile, visibleCars],
  )
  const sortedMaintenance = useMemo(
    () =>
      [...visibleMaintenance].sort((first, second) => {
        if (first.datePerformed !== second.datePerformed) {
          return second.datePerformed.localeCompare(first.datePerformed)
        }

        return second.createdAt.localeCompare(first.createdAt)
      }),
    [visibleMaintenance],
  )

  const form = useForm<MaintenanceValues, unknown, MaintenanceSubmitValues>({
    resolver: zodResolver(maintenanceSchema),
    defaultValues: createDefaultMaintenanceValues(editableCars[0]?.id ?? visibleCars[0]?.id ?? ''),
  })

  const selectedCarId = form.watch('carId')
  const markCarAsMaintenance = form.watch('markCarAsMaintenance')
  const selectedCar = useMemo(() => cars.find((car) => car.id === selectedCarId), [cars, selectedCarId])
  const selectedCarHasActiveRental = useMemo(
    () => rentals.some((rental) => rental.carId === selectedCarId && rental.status === 'active'),
    [rentals, selectedCarId],
  )
  const showExpectedCompletionField = Boolean(editingId || markCarAsMaintenance || selectedCar?.status === 'maintenance')

  useEffect(() => {
    if ((selectedCar?.status === 'archived' || selectedCarHasActiveRental) && form.getValues('markCarAsMaintenance')) {
      form.setValue('markCarAsMaintenance', false)
    }
  }, [form, selectedCar?.status, selectedCarHasActiveRental])

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

      {sortedMaintenance.length === 0 ? (
        <EmptyState title="Nu exista reparatii" description="Adauga prima interventie pentru a incepe urmarirea costurilor." />
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
                  {item.expectedCompletionDate ? <p className="text-sm text-muted-foreground">Disponibila estimat la: {formatDate(item.expectedCompletionDate)}</p> : null}
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
                            expectedCompletionDate: item.expectedCompletionDate ?? '',
                            kmAtService: item.kmAtService,
                            notes: item.notes ?? '',
                            markCarAsMaintenance: false,
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

            {showExpectedCompletionField ? (
              <Field label="Disponibila estimat la" error={form.formState.errors.expectedCompletionDate?.message}>
                <Input className={fieldClass(Boolean(form.formState.errors.expectedCompletionDate))} type="date" {...form.register('expectedCompletionDate')} />
              </Field>
            ) : null}

            <Field label="Kilometraj">
              <Input type="number" {...form.register('kmAtService')} />
            </Field>

            <Field label="Detalii suplimentare">
              <Textarea {...form.register('notes')} />
            </Field>

            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" disabled={selectedCar?.status === 'archived' || selectedCarHasActiveRental} {...form.register('markCarAsMaintenance')} />
              Marcheaza masina ca fiind in service
            </label>

            {selectedCar?.status === 'archived' ? <p className="text-sm text-muted-foreground">O masina arhivata nu poate fi trecuta in service.</p> : null}

            {selectedCarHasActiveRental ? <p className="text-sm text-muted-foreground">Masina nu poate fi trecuta in service cat timp are o inchiriere activa.</p> : null}

            {showExpectedCompletionField ? <p className="text-sm text-muted-foreground">Completeaza doar daca stii aproximativ cand iese masina din service.</p> : null}

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
