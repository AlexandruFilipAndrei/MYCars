import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

import { EmptyState, PageHeader, SearchInput } from '@/components/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { canEditCar } from '@/lib/fleet-access'
import { getStatusBadgeVariant, getStatusLabel } from '@/lib/format'
import { useAppStore } from '@/store/app-store'
import type { CarStatus } from '@/types/models'

export function CarsPage() {
  const { cars, profile, incomingInvites, deleteCar } = useAppStore()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | CarStatus>('all')

  const filteredCars = useMemo(() => {
    return cars.filter((car) => {
      const matchesQuery = [car.brand, car.model, car.licensePlate, car.color].join(' ').toLowerCase().includes(query.toLowerCase())
      const matchesStatus = status === 'all' ? true : car.status === status
      return matchesQuery && matchesStatus
    })
  }, [cars, query, status])

  const handleDelete = async (id: string) => {
    if (!window.confirm('Sigur vrei să ștergi această mașină?')) return

    try {
      await deleteCar(id)
      toast.success('Șters cu succes')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nu am putut șterge mașina.')
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
            <option value="rented">Închiriată</option>
            <option value="maintenance">Service</option>
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

            return (
              <Card key={car.id}>
                <CardContent className="space-y-4 p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link to={`/masini/${car.id}`} className="font-display text-2xl font-bold hover:text-primary">
                        {car.brand} {car.model}
                      </Link>
                      <p className="text-sm text-muted-foreground">{car.licensePlate}</p>
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
                        <Button variant="destructive" onClick={() => void handleDelete(car.id)}>
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
