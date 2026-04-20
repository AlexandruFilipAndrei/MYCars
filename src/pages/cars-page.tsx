import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

import { EmptyState, PageHeader, SearchInput } from '@/components/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { canEditCar } from '@/lib/fleet-access'
import { formatDate, getStatusBadgeVariant, getStatusLabel } from '@/lib/format'
import { useAppStore } from '@/store/app-store'
import type { Car, CarStatus, Maintenance } from '@/types/models'

const statusOrder: Record<CarStatus, number> = {
  available: 0,
  maintenance: 1,
  rented: 2,
  archived: 3,
}

export function CarsPage() {
  const { cars, maintenance, profile, incomingInvites, deleteCar } = useAppStore()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | CarStatus>('all')
  const [carToDelete, setCarToDelete] = useState<Car | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const latestMaintenanceByCarId = useMemo(() => {
    const sortedMaintenance = [...maintenance].sort((first, second) => {
      if (first.datePerformed !== second.datePerformed) {
        return second.datePerformed.localeCompare(first.datePerformed)
      }

      return second.createdAt.localeCompare(first.createdAt)
    })

    return sortedMaintenance.reduce<Map<string, Maintenance>>((map, item) => {
      if (!map.has(item.carId)) {
        map.set(item.carId, item)
      }

      return map
    }, new Map())
  }, [maintenance])

  const filteredCars = useMemo(() => {
    return [...cars]
      .filter((car) => {
        const matchesQuery = [car.brand, car.model, car.licensePlate, car.color]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase())
        const matchesStatus = status === 'all' ? true : car.status === status
        return matchesQuery && matchesStatus
      })
      .sort((first, second) => {
        const firstStatusOrder = statusOrder[first.status]
        const secondStatusOrder = statusOrder[second.status]

        if (firstStatusOrder !== secondStatusOrder) {
          return firstStatusOrder - secondStatusOrder
        }

        if (first.status === 'maintenance' && second.status === 'maintenance') {
          const firstExpectedDate = first.serviceReturnDate ?? latestMaintenanceByCarId.get(first.id)?.expectedCompletionDate
          const secondExpectedDate = second.serviceReturnDate ?? latestMaintenanceByCarId.get(second.id)?.expectedCompletionDate

          if (firstExpectedDate && secondExpectedDate && firstExpectedDate !== secondExpectedDate) {
            return firstExpectedDate.localeCompare(secondExpectedDate)
          }

          if (firstExpectedDate && !secondExpectedDate) return -1
          if (!firstExpectedDate && secondExpectedDate) return 1
        }

        return first.licensePlate.localeCompare(second.licensePlate, 'ro-RO')
      })
  }, [cars, latestMaintenanceByCarId, query, status])

  const handleDelete = async () => {
    if (!carToDelete) {
      return
    }

    try {
      setIsDeleting(true)
      await deleteCar(carToDelete.id)
      toast.success('Mașina a fost ștearsă.')
      setCarToDelete(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nu am putut șterge mașina.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mașini"
        action={
          <Link to="/masini/nou">
            <Button>
              <Plus className="h-4 w-4" />
              Adaugă mașină
            </Button>
          </Link>
        }
      />

      <Card>
        <CardContent className="grid gap-4 p-6 md:grid-cols-[1fr,220px]">
          <SearchInput value={query} onChange={setQuery} placeholder="Caută după marcă, model sau număr..." />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as 'all' | CarStatus)}
            className="h-11 rounded-2xl border bg-card px-4 text-sm"
          >
            <option value="all">Toate statusurile</option>
            <option value="available">Disponibilă</option>
            <option value="maintenance">Service</option>
            <option value="rented">Închiriată</option>
            <option value="archived">Arhivată</option>
          </select>
        </CardContent>
      </Card>

      {filteredCars.length === 0 ? (
        <EmptyState title="Nu am găsit mașini" description="Încearcă alt filtru sau adaugă prima mașină în flotă." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredCars.map((car) => {
            const canEdit = canEditCar(profile, incomingInvites, car)
            const currentMaintenance = latestMaintenanceByCarId.get(car.id)
            const serviceAvailabilityDate = car.serviceReturnDate ?? currentMaintenance?.expectedCompletionDate

            return (
              <Card key={car.id}>
                <CardContent className="space-y-4 p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link to={`/masini/${car.id}`} className="font-display text-2xl font-bold hover:text-primary">
                        {car.brand} {car.model}
                      </Link>
                      <p className="text-sm text-muted-foreground">{car.licensePlate}</p>
                      {car.status === 'maintenance' && serviceAvailabilityDate ? (
                        <p className="mt-1 text-sm font-medium text-amber-700 dark:text-amber-300">
                          Disponibilă estimat la: {formatDate(serviceAvailabilityDate)}
                        </p>
                      ) : null}
                    </div>
                    <Badge variant={getStatusBadgeVariant(car.status)}>{getStatusLabel(car.status)}</Badge>
                  </div>

                  <div className="grid gap-3 text-sm md:grid-cols-4">
                    <Metric label="An" value={String(car.year ?? '-')} />
                    <Metric label="Putere" value={`${car.engineHp} CP`} />
                    <Metric label="Cilindree" value={`${car.engineDisplacement} cmc`} />
                    <Metric label="KM" value={car.currentKm.toLocaleString('ro-RO')} />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Link to={`/masini/${car.id}`}>
                      <Button variant="secondary">Detalii</Button>
                    </Link>
                    {canEdit ? (
                      <>
                        <Link to={`/masini/${car.id}/editeaza`}>
                          <Button variant="outline">
                            <Pencil className="h-4 w-4" />
                            Editează
                          </Button>
                        </Link>
                        <Button variant="destructive" onClick={() => setCarToDelete(car)}>
                          <Trash2 className="h-4 w-4" />
                          Șterge
                        </Button>
                      </>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={Boolean(carToDelete)} onOpenChange={(next) => (!next && !isDeleting ? setCarToDelete(null) : null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirmă ștergerea mașinii</DialogTitle>
            <DialogDescription>
              {carToDelete
                ? `Vei șterge definitiv ${carToDelete.brand} ${carToDelete.model} (${carToDelete.licensePlate}) din flotă.`
                : 'Confirmă ștergerea mașinii selectate.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-foreground">
              Această acțiune este permanentă și va șterge și documentele, pozele, închirierile și reparațiile asociate mașinii.
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setCarToDelete(null)} disabled={isDeleting}>
                Anulează
              </Button>
              <Button type="button" variant="destructive" onClick={() => void handleDelete()} disabled={isDeleting}>
                {isDeleting ? 'Se șterge...' : 'Confirmă ștergerea'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-muted p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  )
}
