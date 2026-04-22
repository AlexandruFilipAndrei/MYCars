import { useMemo } from 'react'

import { FleetOwnerBadge, EmptyState } from '@/components/shared'
import { useFleetFilter } from '@/components/fleet-filter'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getSharedFleetLabel } from '@/lib/fleet-access'
import { formatDate, getNotificationLabel, getNotificationVariant } from '@/lib/format'
import { useAppStore } from '@/store/app-store'

export function NotificationsPage() {
  const { notifications, cars, profile, incomingInvites, markNotificationAsRead } = useAppStore()
  const { matchesOwner } = useFleetFilter()
  const carsById = useMemo(() => new Map(cars.map((car) => [car.id, car])), [cars])
  const filteredNotifications = useMemo(
    () => notifications.filter((item) => !item.carId || matchesOwner(carsById.get(item.carId)?.ownerId ?? '')),
    [carsById, matchesOwner, notifications],
  )
  const sortedNotifications = useMemo(
    () =>
      [...filteredNotifications].sort((first, second) => {
        if (first.isRead !== second.isRead) {
          return first.isRead ? 1 : -1
        }

        const firstPriority = getNotificationPriority(first.type)
        const secondPriority = getNotificationPriority(second.type)

        if (firstPriority !== secondPriority) {
          return firstPriority - secondPriority
        }

        return second.createdAt.localeCompare(first.createdAt)
      }),
    [filteredNotifications],
  )

  if (sortedNotifications.length === 0) {
    return <EmptyState title="Nu exista notificari" description="Totul este in regula momentan. Alertele importante vor aparea aici." />
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {sortedNotifications.map((item) => {
          const car = item.carId ? carsById.get(item.carId) : undefined

          return (
            <Card key={item.id} className={!item.isRead ? 'border-primary/40' : undefined}>
              <CardContent className="flex flex-col gap-4 p-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="font-display text-xl font-bold">{item.title}</p>
                    <Badge variant={getNotificationVariant(item.type)}>{getNotificationLabel(item.type)}</Badge>
                  </div>
                  {car ? (
                    <div className="mt-2 space-y-2">
                      <p className="text-sm text-muted-foreground">
                        {car.brand} {car.model} • {car.licensePlate}
                      </p>
                      <FleetOwnerBadge label={getSharedFleetLabel(profile, incomingInvites, car.ownerId)} />
                    </div>
                  ) : null}
                  <p className="mt-2 text-sm text-muted-foreground">{item.message}</p>
                  <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">{formatDate(item.createdAt.slice(0, 10))}</p>
                </div>
                {!item.isRead ? (
                  <Button variant="outline" onClick={() => void markNotificationAsRead(item.id)}>
                    Marcheaza ca citita
                  </Button>
                ) : (
                  <Badge variant="muted">Citita</Badge>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function getNotificationPriority(type: 'expired' | 'expiry_7' | 'expiry_14' | 'expiry_30') {
  return {
    expired: 0,
    expiry_7: 1,
    expiry_14: 2,
    expiry_30: 3,
  }[type]
}
