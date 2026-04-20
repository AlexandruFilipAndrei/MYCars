import { useEffect, useMemo, useState } from 'react'
import { FileImage, FileText, Loader2, Trash2 } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'

import { EmptyState, PageHeader } from '@/components/shared'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { canEditCar } from '@/lib/fleet-access'
import {
  calculateRentalTotal,
  compareDocumentsByExpiry,
  formatCurrency,
  formatDate,
  getDocumentUrgencyLabel,
  getPriceUnitLabel,
  getStatusBadgeVariant,
  getStatusLabel,
} from '@/lib/format'
import { useAppStore } from '@/store/app-store'
import type { Car, CarDocument, CarPhoto, Maintenance, Rental } from '@/types/models'

export function CarDetailsPage() {
  const { id } = useParams()
  const {
    cars,
    carPhotos,
    documents,
    rentals,
    maintenance,
    profile,
    incomingInvites,
    deleteCarDocument,
    deleteCarPhoto,
    deleteRental,
    deleteMaintenance,
    updateCarNotes,
  } = useAppStore()
  const [activeTab, setActiveTab] = useState('info')
  const [noteDraft, setNoteDraft] = useState('')
  const [isSavingNote, setIsSavingNote] = useState(false)

  const car = cars.find((item) => item.id === id)
  const carDocuments = useMemo(
    () =>
      documents
        .filter((item) => item.carId === id)
        .sort((first, second) => compareDocumentsByExpiry(first.expiryDate, second.expiryDate)),
    [documents, id],
  )
  const carMaintenance = useMemo(
    () =>
      maintenance
        .filter((item) => item.carId === id)
        .sort((first, second) => {
          if (first.datePerformed === second.datePerformed) {
            return second.createdAt.localeCompare(first.createdAt)
          }

          return second.datePerformed.localeCompare(first.datePerformed)
        }),
    [id, maintenance],
  )
  const carRentals = useMemo(
    () =>
      rentals
        .filter((item) => item.carId === id)
        .sort((first, second) => {
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
    [id, rentals],
  )
  const photos = useMemo(
    () =>
      carPhotos
        .filter((item) => item.carId === id)
        .sort((first, second) => second.createdAt.localeCompare(first.createdAt)),
    [carPhotos, id],
  )

  useEffect(() => {
    setNoteDraft(car?.notes ?? '')
  }, [car?.id, car?.notes])

  if (!car) {
    return <EmptyState title="Mașina nu există" description="ID-ul accesat nu corespunde unei mașini din flotă." />
  }

  const canEdit = canEditCar(profile, incomingInvites, car)
  const infoItems = buildInfoItems(car)

  const handleSaveNotes = async () => {
    try {
      setIsSavingNote(true)
      await updateCarNotes(car.id, noteDraft)
      toast.success('Nota mașinii a fost salvată.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nu am putut salva nota mașinii.')
    } finally {
      setIsSavingNote(false)
    }
  }

  const handleDeleteDocument = async (document: CarDocument) => {
    if (!window.confirm(`Sigur vrei să ștergi documentul ${document.customName ?? document.type}?`)) {
      return
    }

    try {
      await deleteCarDocument(document.id)
      toast.success('Documentul a fost șters.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nu am putut șterge documentul.')
    }
  }

  const handleDeleteRental = async (rental: Rental) => {
    if (!window.confirm(`Sigur vrei să ștergi închirierea pentru ${rental.renterName} ${rental.renterSurname}?`)) {
      return
    }

    try {
      await deleteRental(rental.id)
      toast.success('Închirierea a fost ștearsă.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nu am putut șterge închirierea.')
    }
  }

  const handleDeleteMaintenance = async (item: Maintenance) => {
    if (!window.confirm(`Sigur vrei să ștergi reparația "${item.description}"?`)) {
      return
    }

    try {
      await deleteMaintenance(item.id)
      toast.success('Reparația a fost ștearsă.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nu am putut șterge reparația.')
    }
  }

  const handleDeletePhoto = async (photo: CarPhoto) => {
    if (!window.confirm('Sigur vrei să ștergi această poză?')) {
      return
    }

    try {
      await deleteCarPhoto(photo.id)
      toast.success('Poza a fost ștearsă.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nu am putut șterge poza.')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${car.brand} ${car.model}`}
        description={`Fișa completă pentru ${car.licensePlate}.`}
        action={
          canEdit ? (
            <Link to={`/masini/${car.id}/editeaza`}>
              <Button>Editează</Button>
            </Link>
          ) : undefined
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="text-sm text-muted-foreground">Număr înmatriculare</p>
            <p className="font-display text-3xl font-bold">{car.licensePlate}</p>
          </div>
          <Badge variant={getStatusBadgeVariant(car.status)}>{getStatusLabel(car.status)}</Badge>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="documente">Documente</TabsTrigger>
          <TabsTrigger value="inchirieri">Închirieri</TabsTrigger>
          <TabsTrigger value="reparatii">Reparații</TabsTrigger>
          <TabsTrigger value="poze">Poze</TabsTrigger>
          <TabsTrigger value="note">Note</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card>
            <CardHeader>
              <CardTitle>Informații complete</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
              {infoItems.map((item) => (
                <InfoBox key={item.label} label={item.label} value={item.value} />
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documente">
          <Card>
            <SectionHeader
              title="Documente"
              action={
                canEdit ? (
                  <Link to={`/masini/${car.id}/editeaza#documente-masina`}>
                    <Button variant="outline">Adaugă document</Button>
                  </Link>
                ) : undefined
              }
            />
            <CardContent className="space-y-3">
              {carDocuments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nu există documente asociate încă.</p>
              ) : (
                carDocuments.map((document) => (
                  <div key={document.id} className="rounded-2xl border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{document.customName ?? document.type}</p>
                        <p className="text-sm text-muted-foreground">
                          {document.expiryDate ? `Expiră: ${formatDate(document.expiryDate)}` : 'Fără dată de expirare setată'}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={document.expiryDate ? 'warning' : 'muted'}>{getDocumentUrgencyLabel(document.expiryDate)}</Badge>
                        {canEdit ? (
                          <Button type="button" variant="destructive" size="sm" onClick={() => void handleDeleteDocument(document)}>
                            <Trash2 className="h-4 w-4" />
                            Șterge
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {document.fileUrl ? (
                      <a
                        href={document.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-2 text-sm text-primary underline"
                      >
                        <FileText className="h-4 w-4" />
                        Deschide documentul
                      </a>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">Nu există fișier încărcat pentru acest document.</p>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inchirieri">
          <Card>
            <SectionHeader
              title="Închirieri"
              action={
                canEdit ? (
                  <Link to={`/inchirieri?action=create&carId=${car.id}`}>
                    <Button variant="outline">Adaugă închiriere</Button>
                  </Link>
                ) : undefined
              }
            />
            <CardContent className="space-y-3">
              {carRentals.length === 0 ? <p className="text-sm text-muted-foreground">Nu există închirieri pentru această mașină.</p> : null}
              {carRentals.map((rental) => {
                const rentalTotal = calculateRentalTotal(rental.segments)

                return (
                  <div key={rental.id} className="rounded-2xl border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">
                          {rental.renterName} {rental.renterSurname}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(rental.startDate)} - {formatDate(rental.endDate)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={getRentalBadgeVariant(rental.status)}>{getRentalStatusLabel(rental.status)}</Badge>
                        {canEdit ? (
                          <Button type="button" variant="destructive" size="sm" onClick={() => void handleDeleteRental(rental)}>
                            <Trash2 className="h-4 w-4" />
                            Șterge
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-3 rounded-2xl bg-muted p-4">
                      <p className="font-semibold">Total: {formatCurrency(rentalTotal)}</p>
                      <p className="text-sm text-muted-foreground">Avans: {formatCurrency(rental.advancePayment)}</p>
                      <p className="text-sm text-muted-foreground">Rest: {formatCurrency(rentalTotal - rental.advancePayment)}</p>
                    </div>

                    {rental.segments.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {[...rental.segments].sort((first, second) => first.startDate.localeCompare(second.startDate)).map((segment) => (
                          <div key={segment.id} className="rounded-2xl border p-3 text-sm">
                            {formatDate(segment.startDate)} - {formatDate(segment.endDate)} • {formatCurrency(segment.pricePerUnit)} /{' '}
                            {getPriceUnitLabel(segment.priceUnit)}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {rental.notes ? <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-muted p-3 text-sm">{rental.notes}</p> : null}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reparatii">
          <Card>
            <SectionHeader
              title="Reparații"
              action={
                canEdit ? (
                  <Link to={`/reparatii?action=create&carId=${car.id}`}>
                    <Button variant="outline">Adaugă reparație</Button>
                  </Link>
                ) : undefined
              }
            />
            <CardContent className="space-y-3">
              {carMaintenance.length === 0 ? <p className="text-sm text-muted-foreground">Nu există intervenții tehnice.</p> : null}
              {carMaintenance.map((item) => (
                <div key={item.id} className="rounded-2xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{item.description}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(item.datePerformed)} • {formatCurrency(item.cost)}
                      </p>
                    </div>
                    {canEdit ? (
                      <Button type="button" variant="destructive" size="sm" onClick={() => void handleDeleteMaintenance(item)}>
                        <Trash2 className="h-4 w-4" />
                        Șterge
                      </Button>
                    ) : null}
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <InfoBox label="Tip" value={getMaintenanceTypeLabel(item.type)} compact />
                    <InfoBox label="Cost" value={formatCurrency(item.cost)} compact />
                    <InfoBox label="Kilometraj" value={item.kmAtService ? `${item.kmAtService.toLocaleString('ro-RO')} km` : 'Nu este setat'} compact />
                  </div>

                  {item.expectedCompletionDate ? (
                    <p className="mt-3 text-sm text-muted-foreground">Disponibilă estimat la: {formatDate(item.expectedCompletionDate)}</p>
                  ) : null}

                  {item.notes ? <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-muted p-3 text-sm">{item.notes}</p> : null}

                  {item.documents.length > 0 ? (
                    <div className="mt-3 space-y-2 rounded-2xl bg-muted p-3">
                      <p className="text-sm font-medium">Atașamente încărcate</p>
                      {[...item.documents].sort((first, second) => second.createdAt.localeCompare(first.createdAt)).map((document) => {
                        const fileLabel = document.fileName ?? getFileNameFromUrl(document.fileUrl)
                        const imageAttachment = isImageAttachment(fileLabel)

                        return (
                          <a
                            key={document.id}
                            href={document.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 text-sm text-primary underline"
                          >
                            {imageAttachment ? <FileImage className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                            <span>{fileLabel}</span>
                            <span className="text-muted-foreground">({imageAttachment ? 'Poză' : 'Document'})</span>
                          </a>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">Nu există documente sau poze atașate pentru această reparație.</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="poze">
          <Card>
            <SectionHeader
              title="Poze"
              action={
                canEdit ? (
                  <Link to={`/masini/${car.id}/editeaza#poze-masina`}>
                    <Button variant="outline">Adaugă poză</Button>
                  </Link>
                ) : undefined
              }
            />
            <CardContent className="p-6">
              {photos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nu există poze încă pentru această mașină.</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {photos.map((photo) => (
                    <div key={photo.id} className="rounded-2xl border bg-muted p-3">
                      <a href={photo.fileUrl} target="_blank" rel="noreferrer" className="block">
                        <img src={photo.fileUrl} alt={photo.description ?? car.licensePlate} className="h-72 w-full rounded-2xl object-contain" />
                      </a>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{photo.description ?? 'Poză mașină'}</p>
                        {canEdit ? (
                          <Button type="button" variant="destructive" size="sm" onClick={() => void handleDeletePhoto(photo)}>
                            <Trash2 className="h-4 w-4" />
                            Șterge
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="note">
          <Card>
            <SectionHeader title="Note" />
            <CardContent className="space-y-4 p-6">
              {canEdit ? (
                <>
                  <Textarea
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                    placeholder="Adaugă aici observații despre mașină, stare, istoric sau alte detalii utile."
                  />
                  <div className="flex flex-wrap gap-3">
                    <Button type="button" onClick={() => void handleSaveNotes()} disabled={isSavingNote}>
                      {isSavingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {isSavingNote ? 'Se salvează...' : 'Salvează nota'}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setNoteDraft(car.notes ?? '')} disabled={isSavingNote}>
                      Resetează
                    </Button>
                  </div>
                </>
              ) : (
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{car.notes || 'Nu există note adăugate pentru această mașină.'}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <CardTitle>{title}</CardTitle>
      {action ? <div className="w-full sm:w-auto [&>*]:w-full sm:[&>*]:w-auto">{action}</div> : null}
    </CardHeader>
  )
}

function InfoBox({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className="rounded-2xl bg-muted p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 ${compact ? 'text-sm' : 'font-semibold'}`}>{value}</p>
    </div>
  )
}

function buildInfoItems(car: Car) {
  const items = [
    { label: 'Număr înmatriculare', value: car.licensePlate },
    { label: 'Marcă', value: car.brand },
    { label: 'Model', value: car.model },
    { label: 'An', value: car.year ? String(car.year) : 'Nu este setat' },
    { label: 'Culoare', value: car.color || 'Nu este setat' },
    { label: 'Putere', value: `${car.engineHp} CP` },
    { label: 'Putere kW', value: `${car.engineKw} kW` },
    { label: 'Cilindree', value: `${car.engineDisplacement} cmc` },
    { label: 'Transmisie', value: car.transmission === 'manual' ? 'Manuală' : 'Automată' },
    { label: 'Serie șasiu', value: car.chassisNumber },
    { label: 'Status', value: getStatusLabel(car.status) },
    {
      label: 'Preț achiziție',
      value: car.purchasePrice !== undefined ? formatCurrency(car.purchasePrice, car.purchaseCurrency) : 'Nu este setat',
    },
    { label: 'Monedă', value: car.purchaseCurrency },
    { label: 'Disponibilă estimat la', value: car.serviceReturnDate ? formatDate(car.serviceReturnDate) : 'Nu este setat' },
    { label: 'Kilometraj curent', value: `${car.currentKm.toLocaleString('ro-RO')} km` },
    { label: 'Creat la', value: formatDate(car.createdAt) },
    { label: 'Actualizat la', value: formatDate(car.updatedAt) },
  ]

  if (car.archivedAt) {
    items.push({ label: 'Arhivată la', value: formatDate(car.archivedAt) })
  }

  return items
}

function getFileNameFromUrl(fileUrl: string) {
  return fileUrl.split('?')[0].split('/').pop() ?? 'Fișier'
}

function isImageAttachment(value: string) {
  return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(value)
}

function getRentalPriority(status: Rental['status']) {
  return {
    active: 0,
    completed: 1,
    cancelled: 2,
  }[status]
}

function getRentalStatusLabel(status: Rental['status']) {
  return {
    active: 'Activă',
    completed: 'Finalizată',
    cancelled: 'Anulată',
  }[status]
}

function getRentalBadgeVariant(status: Rental['status']): NonNullable<BadgeProps['variant']> {
  switch (status) {
    case 'active':
      return 'info'
    case 'completed':
      return 'success'
    case 'cancelled':
      return 'muted'
  }
}

function getMaintenanceTypeLabel(type: Maintenance['type']) {
  return {
    repair: 'Reparație',
    investment: 'Investiție',
    service: 'Service',
    other: 'Altele',
  }[type]
}
