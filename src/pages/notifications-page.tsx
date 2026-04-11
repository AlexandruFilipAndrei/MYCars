import { useMemo } from 'react'

import { EmptyState } from '@/components/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatDate, getNotificationLabel, getNotificationVariant } from '@/lib/format'
import { useAppStore } from '@/store/app-store'

export function NotificationsPage() {
  const { notifications, markNotificationAsRead } = useAppStore()
  const sortedNotifications = useMemo(
    () =>
      [...notifications].sort((first, second) => {
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
    [notifications],
  )

  if (notifications.length === 0) {
    return <EmptyState title="Nu există notificări" description="Totul este în regulă momentan. Alertele importante vor apărea aici." />
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {sortedNotifications.map((item) => (
          <Card key={item.id} className={!item.isRead ? 'border-primary/40' : undefined}>
            <CardContent className="flex flex-col gap-4 p-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <p className="font-display text-xl font-bold">{item.title}</p>
                  <Badge variant={getNotificationVariant(item.type)}>{getNotificationLabel(item.type)}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{item.message}</p>
                <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">{formatDate(item.createdAt.slice(0, 10))}</p>
              </div>
              {!item.isRead ? (
                <Button variant="outline" onClick={() => void markNotificationAsRead(item.id)}>
                  Marchează ca citită
                </Button>
              ) : (
                <Badge variant="muted">Citită</Badge>
              )}
            </CardContent>
          </Card>
        ))}
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
