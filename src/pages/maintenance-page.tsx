import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Pencil, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { z } from 'zod'

import { FileDropzone } from '@/components/file-dropzone'
import { EmptyState, PageHeader } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { canEditCar } from '@/lib/fleet-access'
import { formatCurrency, formatDate } from '@/lib/format'
import { maintenanceSchema } from '@/lib/validators'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'

type MaintenanceValues = z.input<typeof maintenanceSchema>
type MaintenanceSubmitValues = z.output<typeof maintenanceSchema>

export function MaintenancePage() {
  const { cars, rentals, maintenance, profile, incomingInvites, saveMaintenance, deleteMaintenance } = useAppStore()
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [documentFiles, setDocumentFiles] = useState<File[]>([])

  const editableCars = useMemo(
    () => cars.filter((car) => canEditCar(profile, incomingInvites, car)),
    [cars, incomingInvites, profile],
  )
  const sortedMaintenance = useMemo(
    () =>
      [...maintenance].sort((first, second) => {
        if (first.datePerformed !== second.datePerformed) {
          return second.datePerformed.localeCompare(first.datePerformed)
        }

        return second.createdAt.localeCompare(first.createdAt)
      }),
    [maintenance],
  )

  const form = useForm<MaintenanceValues, unknown, MaintenanceSubmitValues>({
    resolver: zodResolver(maintenanceSchema),
    defaultValues: {
      carId: editableCars[0]?.id ?? cars[0]?.id ?? '',
      type: 'service',
      description: '',
      cost: 0,
      datePerformed: new Date().toISOString().slice(0, 10),
      kmAtService: undefined,
      notes: '',
      markCarAsMaintenance: false,
    },
  })
  const selectedCarId = form.watch('carId')
  const selectedCar = useMemo(() => cars.find((car) => car.id === selectedCarId), [cars, selectedCarId])
  const selectedCarHasActiveRental = useMemo(
    () => rentals.some((rental) => rental.carId === selectedCarId && rental.status === 'active'),
    [rentals, selectedCarId],
  )

  useEffect(() => {
    if ((selectedCar?.status === 'archived' || selectedCarHasActiveRental) && form.getValues('markCarAsMaintenance')) {
      form.setValue('markCarAsMaintenance', false)
    }
  }, [form, selectedCar?.status, selectedCarHasActiveRental])

  const resetForm = () => {
    setEditingId(null)
    setDocumentFiles([])
    form.reset({
      carId: editableCars[0]?.id ?? cars[0]?.id ?? '',
      type: 'service',
      description: '',
      cost: 0,
      datePerformed: new Date().toISOString().slice(0, 10),
      kmAtService: undefined,
      notes: '',
      markCarAsMaintenance: false,
    })
  }

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await saveMaintenance({ ...values, id: editingId ?? undefined, documentFiles })
      toast.success(editingId ? 'Modificat cu succes' : 'Salvat cu succes')
      resetForm()
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nu am putut salva intervenția.')
    }
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reparații"
        action={
          editableCars.length > 0 ? (
            <Button
              onClick={() => {
                resetForm()
                setOpen(true)
              }}
            >
              Adaugă intervenție
            </Button>
          ) : undefined
        }
      />

      {maintenance.length === 0 ? (
        <EmptyState title="Nu există reparații" description="Adaugă prima intervenție pentru a începe urmărirea costurilor." />
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
                    </div>
                    <p className="shrink-0 font-semibold text-primary">{formatCurrency(item.cost)}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">Data: {formatDate(item.datePerformed)}</p>
                  <p className="text-sm text-muted-foreground">Tip: {item.type}</p>
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
                    <div className="flex gap-2">
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
                            kmAtService: item.kmAtService,
                            notes: item.notes ?? '',
                            markCarAsMaintenance: false,
                          })
                          setDocumentFiles([])
                          setOpen(true)
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        Editează
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={async () => {
                          if (!window.confirm('Sigur vrei să ștergi această intervenție?')) return
                          try {
                            await deleteMaintenance(item.id)
                            toast.success('Șters cu succes')
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : 'Nu am putut șterge intervenția.')
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
          if (!next) resetForm()
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editează intervenția' : 'Adaugă intervenție'}</DialogTitle>
            <DialogDescription>Introdu costul, informațiile relevante și fișierele justificative.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={onSubmit}>
            <Field label="Mașină" required error={form.formState.errors.carId?.message}>
              <select className={fieldClass(Boolean(form.formState.errors.carId))} {...form.register('carId')}>
                {cars.map((car) => (
                  <option key={car.id} value={car.id} disabled={!canEditCar(profile, incomingInvites, car)}>
                    {car.brand} {car.model} - {car.licensePlate}
                    {!canEditCar(profile, incomingInvites, car) ? ' (doar vizualizare)' : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tip" required error={form.formState.errors.type?.message}>
              <select className={fieldClass(Boolean(form.formState.errors.type))} {...form.register('type')}>
                <option value="repair">Reparație</option>
                <option value="investment">Investiție</option>
                <option value="service">Service</option>
                <option value="other">Altele</option>
              </select>
            </Field>
            <Field label="Titlu" required error={form.formState.errors.description?.message}>
              <Input
                className={fieldClass(Boolean(form.formState.errors.description))}
                {...form.register('description')}
                placeholder="Ex: Schimb ambreiaj, Revizie completa"
              />
            </Field>
            <Field label="Cost" required error={form.formState.errors.cost?.message}>
              <Input className={fieldClass(Boolean(form.formState.errors.cost))} type="number" {...form.register('cost')} />
            </Field>
            <Field label="Data intervenției" required error={form.formState.errors.datePerformed?.message}>
              <Input className={fieldClass(Boolean(form.formState.errors.datePerformed))} type="date" {...form.register('datePerformed')} />
            </Field>
            <Field label="Kilometraj">
              <Input type="number" {...form.register('kmAtService')} />
            </Field>
            <Field label="Detalii suplimentare">
              <Textarea {...form.register('notes')} />
            </Field>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                disabled={selectedCar?.status === 'archived' || selectedCarHasActiveRental}
                {...form.register('markCarAsMaintenance')}
              />
              Marchează mașina ca în service
            </label>
            {selectedCar?.status === 'archived' ? (
              <p className="text-sm text-muted-foreground">O mașină arhivată nu poate fi trecută în service.</p>
            ) : null}
            {selectedCarHasActiveRental ? (
              <p className="text-sm text-muted-foreground">Mașina nu poate fi trecută în service cât timp are o închiriere activă.</p>
            ) : null}
            <FileDropzone
              label="Încarcă facturi, poze sau PDF-uri"
              files={documentFiles}
              accept="image/*,.pdf"
              hint="Poți încărca imagini și PDF-uri."
              onChange={setDocumentFiles}
            />
            <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {form.formState.isSubmitting ? 'Se salvează...' : 'Salvează'}
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
