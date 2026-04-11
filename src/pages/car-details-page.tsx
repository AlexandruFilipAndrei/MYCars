import { useMemo, useState } from 'react'
import { FileImage, FileText } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { EmptyState, PageHeader } from '@/components/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { canEditCar } from '@/lib/fleet-access'
import { compareDocumentsByExpiry, formatCurrency, formatDate, getDocumentUrgencyLabel, getStatusBadgeVariant, getStatusLabel } from '@/lib/format'
import { useAppStore } from '@/store/app-store'

export function CarDetailsPage() {
  const { id } = useParams()
  const { cars, carPhotos, documents, rentals, maintenance, profile, incomingInvites } = useAppStore()
  const [activeTab, setActiveTab] = useState('info')
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

  if (!car) {
    return <EmptyState title="Mașina nu există" description="ID-ul accesat nu corespunde unei mașini din flotă." />
  }

  const canEdit = canEditCar(profile, incomingInvites, car)

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
            <CardContent className="grid gap-4 p-6 md:grid-cols-3">
              <InfoBox label="An" value={String(car.year ?? '-')} />
              <InfoBox label="Putere" value={`${car.engineHp} CP / ${car.engineKw} kW`} />
              <InfoBox label="Cilindree" value={`${car.engineDisplacement} cmc`} />
              <InfoBox label="Transmisie" value={car.transmission === 'manual' ? 'Manuală' : 'Automată'} />
              <InfoBox label="Status" value={getStatusLabel(car.status)} />
              <InfoBox
                label="Preț achiziție"
                value={car.purchasePrice !== undefined ? formatCurrency(car.purchasePrice, car.purchaseCurrency) : '-'}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documente">
          <Card>
            <CardHeader>
              <CardTitle>Documente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {carDocuments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nu există documente asociate încă.</p>
              ) : (
                carDocuments.map((document) => (
                  <div key={document.id} className="rounded-2xl border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">{document.customName ?? document.type}</p>
                        <p className="text-sm text-muted-foreground">
                          {document.expiryDate ? `Expiră: ${formatDate(document.expiryDate)}` : 'Fără dată de expirare setată'}
                        </p>
                      </div>
                      <Badge variant={document.expiryDate ? 'warning' : 'muted'}>{getDocumentUrgencyLabel(document.expiryDate)}</Badge>
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
            <CardHeader>
              <CardTitle>Închirieri</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {carRentals.length === 0 ? <p className="text-sm text-muted-foreground">Nu există închirieri pentru această mașină.</p> : null}
              {carRentals.map((rental) => (
                <div key={rental.id} className="rounded-2xl border p-4">
                  <p className="font-semibold">
                    {rental.renterName} {rental.renterSurname}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(rental.startDate)} - {formatDate(rental.endDate)}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reparatii">
          <Card>
            <CardHeader>
              <CardTitle>Reparații</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {carMaintenance.length === 0 ? <p className="text-sm text-muted-foreground">Nu există intervenții tehnice.</p> : null}
              {carMaintenance.map((item) => (
                <div key={item.id} className="rounded-2xl border p-4">
                  <p className="font-semibold">{item.description}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(item.datePerformed)} • {formatCurrency(item.cost)}
                  </p>
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
                            <span className="text-muted-foreground">({imageAttachment ? 'Poza' : 'Document'})</span>
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
            <CardContent className="p-6">
              {photos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nu există poze încă pentru această mașină.</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-3">
                  {photos.map((photo) => (
                    <a key={photo.id} href={photo.fileUrl} target="_blank" rel="noreferrer" className="rounded-2xl border bg-muted p-3 transition hover:border-primary/40">
                      <img src={photo.fileUrl} alt={photo.description ?? car.licensePlate} className="h-72 w-full rounded-2xl object-contain" />
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="note">
          <Card>
            <CardContent className="p-6">
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{car.notes || 'Nu există note adăugate pentru această mașină.'}</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-muted p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  )
}

function getFileNameFromUrl(fileUrl: string) {
  return fileUrl.split('?')[0].split('/').pop() ?? 'Fișier'
}

function isImageAttachment(value: string) {
  return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(value)
}

function getRentalPriority(status: 'active' | 'completed' | 'cancelled') {
  return {
    active: 0,
    completed: 1,
    cancelled: 2,
  }[status]
}
