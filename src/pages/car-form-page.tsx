import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { FileText, Loader2, Plus, Trash2 } from 'lucide-react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { z } from 'zod'

import { FileDropzone } from '@/components/file-dropzone'
import { PageHeader } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { canEditCar, getEditableFleetOptions } from '@/lib/fleet-access'
import { cn } from '@/lib/utils'
import { carSchema } from '@/lib/validators'
import { useAppStore } from '@/store/app-store'
import type { DocumentType } from '@/types/models'

type CarValues = z.input<typeof carSchema>
type CarSubmitValues = z.output<typeof carSchema>
type AdditionalDocumentType = Exclude<DocumentType, 'ITP' | 'RCA'>

type AdditionalDocumentDraft = {
  id?: string
  type: AdditionalDocumentType
  customName: string
  expiryDate: string
  existingFileUrl?: string
  files: File[]
}

const additionalDocumentTypeOptions: Array<{ value: AdditionalDocumentType; label: string }> = [
  { value: 'CASCO', label: 'CASCO' },
  { value: 'ROVINIETA', label: 'Rovinietă' },
  { value: 'TALON', label: 'Talon' },
  { value: 'CI_VEHICUL', label: 'Carte identitate vehicul' },
  { value: 'OTHER', label: 'Altele' },
]

export function CarFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { cars, documents, rentals, profile, incomingInvites, saveCar, isLoading } = useAppStore()
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [itpFiles, setItpFiles] = useState<File[]>([])
  const [rcaFiles, setRcaFiles] = useState<File[]>([])
  const [additionalDocuments, setAdditionalDocuments] = useState<AdditionalDocumentDraft[]>([])
  const [documentError, setDocumentError] = useState<string | null>(null)

  const currentCar = useMemo(() => cars.find((car) => car.id === id), [cars, id])
  const currentCarHasActiveRental = useMemo(
    () => Boolean(currentCar && rentals.some((rental) => rental.carId === currentCar.id && rental.status === 'active')),
    [currentCar, rentals],
  )
  const editableFleets = useMemo(() => getEditableFleetOptions(profile, incomingInvites), [incomingInvites, profile])
  const currentItp = useMemo(
    () => documents.find((document) => document.carId === currentCar?.id && document.type === 'ITP'),
    [currentCar?.id, documents],
  )
  const currentRca = useMemo(
    () => documents.find((document) => document.carId === currentCar?.id && document.type === 'RCA'),
    [currentCar?.id, documents],
  )
  const defaultAdditionalDocuments = useMemo(
    () =>
      documents
        .filter((document) => document.carId === currentCar?.id && document.type !== 'ITP' && document.type !== 'RCA')
        .map((document) => ({
          id: document.id,
          type: document.type as AdditionalDocumentType,
          customName: document.type === 'OTHER' ? document.customName ?? '' : '',
          expiryDate: document.expiryDate ?? '',
          existingFileUrl: document.fileUrl,
          files: [],
        })),
    [currentCar?.id, documents],
  )

  const canEditCurrentCar = currentCar ? canEditCar(profile, incomingInvites, currentCar) : true
  const defaultValues = useMemo(
    () => ({
      ownerId: currentCar?.ownerId ?? editableFleets[0]?.ownerId ?? profile?.id ?? '',
      licensePlate: currentCar?.licensePlate ?? '',
      brand: currentCar?.brand ?? '',
      model: currentCar?.model ?? '',
      year: currentCar?.year,
      color: currentCar?.color ?? '',
      engineHp: currentCar?.engineHp ?? 100,
      engineDisplacement: currentCar?.engineDisplacement ?? 1600,
      transmission: currentCar?.transmission ?? 'manual',
      chassisNumber: currentCar?.chassisNumber ?? '',
      status: currentCar?.status ?? 'available',
      purchasePrice: currentCar?.purchasePrice,
      purchaseCurrency: currentCar?.purchaseCurrency ?? 'RON',
      currentKm: currentCar?.currentKm ?? 0,
      notes: currentCar?.notes ?? '',
      itpExpiryDate: currentItp?.expiryDate ?? '',
      rcaExpiryDate: currentRca?.expiryDate ?? '',
    }),
    [currentCar, currentItp?.expiryDate, currentRca?.expiryDate, editableFleets, profile?.id],
  )

  const form = useForm<CarValues, unknown, CarSubmitValues>({
    resolver: zodResolver(carSchema),
    defaultValues,
  })

  useEffect(() => {
    form.reset(defaultValues)
    setPhotoFiles([])
    setItpFiles([])
    setRcaFiles([])
    setAdditionalDocuments(defaultAdditionalDocuments)
    setDocumentError(null)
  }, [defaultAdditionalDocuments, defaultValues, form])

  if (isLoading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-lg font-semibold">Se încarcă datele mașinii...</div>
  }

  if (id && !currentCar) {
    return <Navigate to="/masini" replace />
  }

  if (!canEditCurrentCar) {
    return <Navigate to="/masini" replace />
  }

  const onSubmit = form.handleSubmit(async (values) => {
    const duplicateTypes = additionalDocuments
      .filter((document) => document.type !== 'OTHER')
      .map((document) => document.type)
      .filter((type, index, types) => types.indexOf(type) !== index)

    if (duplicateTypes.length > 0) {
      const message = `Documentul ${getDocumentTypeLabel(duplicateTypes[0])} este adăugat de mai multe ori.`
      setDocumentError(message)
      toast.error(message)
      return
    }

    const invalidOtherDocument = additionalDocuments.find(
      (document) =>
        document.type === 'OTHER' &&
        (document.id || document.expiryDate || document.files[0] || document.customName.trim()) &&
        !document.customName.trim(),
    )

    if (invalidOtherDocument) {
      const message = 'Completează numele pentru documentul de tip Altele.'
      setDocumentError(message)
      toast.error(message)
      return
    }

    setDocumentError(null)

    try {
      const { category, ...restValues } = values
      await saveCar({
        id: currentCar?.id,
        ownerId: values.ownerId ?? currentCar?.ownerId ?? profile?.id ?? 'demo-user',
        category: currentCar?.category ?? category,
        archivedAt: values.status === 'archived' ? new Date().toISOString() : undefined,
        ...restValues,
        photoFiles,
        documentInputs: [
          {
            id: currentItp?.id,
            type: 'ITP',
            customName: 'ITP',
            expiryDate: values.itpExpiryDate,
            file: itpFiles[0] ?? null,
          },
          {
            id: currentRca?.id,
            type: 'RCA',
            customName: 'RCA',
            expiryDate: values.rcaExpiryDate,
            file: rcaFiles[0] ?? null,
          },
          ...additionalDocuments
            .filter((document) => Boolean(document.id || document.expiryDate || document.files[0] || document.customName.trim()))
            .map((document) => ({
              id: document.id,
              type: document.type,
              customName: document.type === 'OTHER' ? document.customName.trim() : undefined,
              expiryDate: document.expiryDate || undefined,
              file: document.files[0] ?? null,
            })),
        ],
      })
      toast.success(currentCar ? 'Modificat cu succes' : 'Salvat cu succes')
      navigate('/masini')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nu am putut salva mașina.')
    }
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title={currentCar ? 'Editează mașina' : 'Adaugă mașină nouă'}
        description="Completează datele relevante pentru a avea o fișă clară și completă a vehiculului."
      />

      <Card>
        <CardContent className="p-6">
          <form className="grid gap-5 md:grid-cols-2" onSubmit={onSubmit}>
            {!currentCar && editableFleets.length >= 1 ? (
              <Field label="Flotă" required error={form.formState.errors.ownerId?.message}>
                <select className={selectClass(Boolean(form.formState.errors.ownerId))} {...form.register('ownerId')}>
                  {editableFleets.map((fleet) => (
                    <option key={fleet.ownerId} value={fleet.ownerId}>
                      {fleet.label}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            <Field label="Număr înmatriculare" required error={form.formState.errors.licensePlate?.message}>
              <Input className={inputClass(Boolean(form.formState.errors.licensePlate))} {...form.register('licensePlate')} />
            </Field>
            <Field label="Marca" required error={form.formState.errors.brand?.message}>
              <Input className={inputClass(Boolean(form.formState.errors.brand))} {...form.register('brand')} />
            </Field>
            <Field label="Model" required error={form.formState.errors.model?.message}>
              <Input className={inputClass(Boolean(form.formState.errors.model))} {...form.register('model')} />
            </Field>
            <Field label="An" error={form.formState.errors.year?.message}>
              <Input className={inputClass(Boolean(form.formState.errors.year))} type="number" {...form.register('year')} />
            </Field>
            <Field label="Culoare">
              <Input {...form.register('color')} />
            </Field>
            <Field label="Putere motor (CP)" required error={form.formState.errors.engineHp?.message}>
              <Input className={inputClass(Boolean(form.formState.errors.engineHp))} type="number" {...form.register('engineHp')} />
            </Field>
            <Field label="Cilindree (cmc)" required error={form.formState.errors.engineDisplacement?.message}>
              <Input
                className={inputClass(Boolean(form.formState.errors.engineDisplacement))}
                type="number"
                {...form.register('engineDisplacement')}
              />
            </Field>
            <Field label="Serie șasiu" required error={form.formState.errors.chassisNumber?.message}>
              <Input
                className={inputClass(Boolean(form.formState.errors.chassisNumber))}
                maxLength={17}
                autoCapitalize="characters"
                {...form.register('chassisNumber')}
              />
            </Field>
            <Field label="Transmisie" required error={form.formState.errors.transmission?.message}>
              <select className={selectClass(Boolean(form.formState.errors.transmission))} {...form.register('transmission')}>
                <option value="manual">Manuală</option>
                <option value="automatic">Automată</option>
              </select>
            </Field>
            <Field label="Status" required>
              <select className={selectClass(false)} {...form.register('status')}>
                <option value="available" disabled={currentCarHasActiveRental}>
                  Disponibila
                </option>
                <option value="rented" disabled={!currentCarHasActiveRental}>
                  Inchiriata
                </option>
                <option value="maintenance">Service</option>
                <option value="archived">Arhivata</option>
              </select>
            </Field>
            {currentCar ? (
              <div className="md:col-span-2">
                <p className="text-sm text-muted-foreground">
                  {currentCarHasActiveRental
                    ? 'Masina are o inchiriere activa, deci statusul trebuie sa ramana Inchiriata.'
                    : 'Statusul Inchiriata este disponibil doar cand exista o inchiriere activa pentru masina.'}
                </p>
              </div>
            ) : null}
            <Field label="Preț achiziție" error={form.formState.errors.purchasePrice?.message}>
              <Input className={inputClass(Boolean(form.formState.errors.purchasePrice))} type="number" {...form.register('purchasePrice')} />
            </Field>
            <Field label="Moneda preț achiziție">
              <select className={selectClass(false)} {...form.register('purchaseCurrency')}>
                <option value="RON">RON</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
              </select>
            </Field>
            <Field label="Kilometraj curent" required error={form.formState.errors.currentKm?.message}>
              <Input className={inputClass(Boolean(form.formState.errors.currentKm))} type="number" {...form.register('currentKm')} />
            </Field>

            <div className="md:col-span-2">
              <Field label="Poze mașină">
                <FileDropzone
                  label="Încarcă poze pentru mașină"
                  files={photoFiles}
                  accept="image/*"
                  hint="Poți selecta mai multe imagini."
                  onChange={setPhotoFiles}
                />
              </Field>
            </div>

            <div className="space-y-4 rounded-3xl border p-5 md:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">Documente mașină</p>
                  <p className="text-sm text-muted-foreground">
                    Adaugă documentele importante ale mașinii. Le vei vedea apoi în pagina de detalii.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setAdditionalDocuments((currentDocuments) => [
                      ...currentDocuments,
                      {
                        type: 'CASCO',
                        customName: '',
                        expiryDate: '',
                        files: [],
                      },
                    ])
                  }
                >
                  <Plus className="h-4 w-4" />
                  Adaugă document
                </Button>
              </div>

              <DocumentUploadCard
                title="ITP"
                required
                expiryDate={form.watch('itpExpiryDate')}
                onExpiryDateChange={(value) =>
                  form.setValue('itpExpiryDate', value, {
                    shouldDirty: true,
                    shouldTouch: true,
                    shouldValidate: true,
                  })
                }
                error={form.formState.errors.itpExpiryDate?.message}
                files={itpFiles}
                onFilesChange={setItpFiles}
                existingFileUrl={currentItp?.fileUrl}
              />

              <DocumentUploadCard
                title="RCA"
                required
                expiryDate={form.watch('rcaExpiryDate')}
                onExpiryDateChange={(value) =>
                  form.setValue('rcaExpiryDate', value, {
                    shouldDirty: true,
                    shouldTouch: true,
                    shouldValidate: true,
                  })
                }
                error={form.formState.errors.rcaExpiryDate?.message}
                files={rcaFiles}
                onFilesChange={setRcaFiles}
                existingFileUrl={currentRca?.fileUrl}
              />

              {additionalDocuments.map((document, index) => (
                <div key={document.id ?? `additional-document-${index}`} className="space-y-4 rounded-2xl border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">Document suplimentar</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setAdditionalDocuments((currentDocuments) => currentDocuments.filter((_, itemIndex) => itemIndex !== index))}
                    >
                      <Trash2 className="h-4 w-4" />
                      Elimină
                    </Button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Tip document" required>
                      <select
                        className={selectClass(false)}
                        value={document.type}
                        onChange={(event) =>
                          setAdditionalDocuments((currentDocuments) =>
                            currentDocuments.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    type: event.target.value as AdditionalDocumentType,
                                    customName: event.target.value === 'OTHER' ? item.customName : '',
                                  }
                                : item,
                            ),
                          )
                        }
                      >
                        {additionalDocumentTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Expiră la">
                      <Input
                        type="date"
                        value={document.expiryDate}
                        onChange={(event) =>
                          setAdditionalDocuments((currentDocuments) =>
                            currentDocuments.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, expiryDate: event.target.value } : item,
                            ),
                          )
                        }
                      />
                    </Field>

                    {document.type === 'OTHER' ? (
                      <div className="md:col-span-2">
                        <Field label="Nume document" required>
                          <Input
                            value={document.customName}
                            onChange={(event) =>
                              setAdditionalDocuments((currentDocuments) =>
                                currentDocuments.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, customName: event.target.value } : item,
                                ),
                              )
                            }
                            placeholder="Ex: Contract leasing, procură, verificare tehnică"
                          />
                        </Field>
                      </div>
                    ) : null}
                  </div>

                  {document.existingFileUrl ? <ExistingFileLink fileUrl={document.existingFileUrl} /> : null}

                  <FileDropzone
                    label="Încarcă poza sau documentul"
                    files={document.files}
                    multiple={false}
                    accept="image/*,.pdf"
                    hint="Poți încărca o imagine sau un PDF. Dacă alegi alt fișier, îl va înlocui pe cel nou selectat."
                    onChange={(files) =>
                      setAdditionalDocuments((currentDocuments) =>
                        currentDocuments.map((item, itemIndex) => (itemIndex === index ? { ...item, files } : item)),
                      )
                    }
                  />
                </div>
              ))}

              {documentError ? <p className="text-sm text-destructive">{documentError}</p> : null}
            </div>

            <div className="md:col-span-2">
              <Field label="Notițe">
                <Textarea className={inputClass(false)} {...form.register('notes')} />
              </Field>
            </div>

            <div className="flex flex-wrap gap-3 md:col-span-2">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {form.formState.isSubmitting ? 'Se salvează...' : currentCar ? 'Salvează modificările' : 'Adaugă mașina'}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate('/masini')} disabled={form.formState.isSubmitting}>
                Anulează
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function inputClass(hasError: boolean) {
  return cn(hasError ? 'border-destructive focus-visible:ring-destructive' : '')
}

function selectClass(hasError: boolean) {
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

function DocumentUploadCard({
  title,
  required = false,
  expiryDate,
  onExpiryDateChange,
  error,
  files,
  onFilesChange,
  existingFileUrl,
}: {
  title: string
  required?: boolean
  expiryDate: string
  onExpiryDateChange: (value: string) => void
  error?: string
  files: File[]
  onFilesChange: (files: File[]) => void
  existingFileUrl?: string
}) {
  return (
    <div className="space-y-4 rounded-2xl border p-4">
      <p className="font-medium">{title}</p>
      <Field label="Expiră la" required={required} error={error}>
        <Input type="date" className={inputClass(Boolean(error))} value={expiryDate} onChange={(event) => onExpiryDateChange(event.target.value)} />
      </Field>
      {existingFileUrl ? <ExistingFileLink fileUrl={existingFileUrl} /> : null}
      <FileDropzone
        label={`Încarcă poza sau documentul pentru ${title}`}
        files={files}
        multiple={false}
        accept="image/*,.pdf"
        hint="Poți încărca o imagine sau un PDF."
        onChange={onFilesChange}
      />
    </div>
  )
}

function ExistingFileLink({ fileUrl }: { fileUrl: string }) {
  return (
    <a href={fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-primary underline">
      <FileText className="h-4 w-4" />
      Fișier existent: {getFileNameFromUrl(fileUrl)}
    </a>
  )
}

function getFileNameFromUrl(fileUrl: string) {
  return fileUrl.split('?')[0].split('/').pop() ?? 'fișier'
}

function getDocumentTypeLabel(type: AdditionalDocumentType) {
  return {
    CASCO: 'CASCO',
    ROVINIETA: 'Rovinietă',
    TALON: 'Talon',
    CI_VEHICUL: 'Carte identitate vehicul',
    OTHER: 'Altele',
  }[type]
}
