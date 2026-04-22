import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Filter } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getAccessibleFleetOptions, getFleetOwnerName as resolveFleetOwnerName, getSharedFleetLabel as resolveSharedFleetLabel } from '@/lib/fleet-access'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'

type FleetFilterContextValue = {
  fleetOptions: ReturnType<typeof getAccessibleFleetOptions>
  selectedOwnerIds: string[]
  isOwnerSelected: (ownerId: string) => boolean
  matchesOwner: (ownerId: string) => boolean
  selectAll: () => void
  toggleOwnerId: (ownerId: string) => void
  getFleetOwnerName: (ownerId: string) => string
  getSharedFleetLabel: (ownerId: string) => string | undefined
}

const FleetFilterContext = createContext<FleetFilterContextValue | null>(null)
const storageKeyPrefix = 'mycars-fleet-filter'

function getStorageKey(userId: string) {
  return `${storageKeyPrefix}-${userId}`
}

function readStoredOwnerIds(userId: string) {
  try {
    const rawValue = localStorage.getItem(getStorageKey(userId))
    if (!rawValue) {
      return []
    }

    const parsed = JSON.parse(rawValue)
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

function writeStoredOwnerIds(userId: string, ownerIds: string[]) {
  localStorage.setItem(getStorageKey(userId), JSON.stringify(ownerIds))
}

export function FleetFilterProvider({ children }: { children: React.ReactNode }) {
  const { profile, incomingInvites } = useAppStore()
  const fleetOptions = useMemo(() => getAccessibleFleetOptions(profile, incomingInvites), [incomingInvites, profile])
  const allOwnerIds = useMemo(() => fleetOptions.map((option) => option.ownerId), [fleetOptions])
  const [selectedOwnerIds, setSelectedOwnerIds] = useState<string[]>([])

  useEffect(() => {
    if (!profile) {
      setSelectedOwnerIds([])
      return
    }

    const storedOwnerIds = readStoredOwnerIds(profile.id).filter((ownerId) => allOwnerIds.includes(ownerId))
    setSelectedOwnerIds(storedOwnerIds.length > 0 ? storedOwnerIds : allOwnerIds)
  }, [allOwnerIds, profile])

  useEffect(() => {
    if (!profile || selectedOwnerIds.length === 0) {
      return
    }

    writeStoredOwnerIds(profile.id, selectedOwnerIds)
  }, [profile, selectedOwnerIds])

  const activeOwnerIds = selectedOwnerIds.length > 0 ? selectedOwnerIds : allOwnerIds

  const value = useMemo<FleetFilterContextValue>(
    () => ({
      fleetOptions,
      selectedOwnerIds: activeOwnerIds,
      isOwnerSelected: (ownerId) => activeOwnerIds.includes(ownerId),
      matchesOwner: (ownerId) => activeOwnerIds.length === 0 || activeOwnerIds.includes(ownerId),
      selectAll: () => setSelectedOwnerIds(allOwnerIds),
      toggleOwnerId: (ownerId) =>
        setSelectedOwnerIds((current) => {
          const baseSelection = current.length > 0 ? current : allOwnerIds

          if (baseSelection.includes(ownerId)) {
            const nextSelection = baseSelection.filter((currentOwnerId) => currentOwnerId !== ownerId)
            return nextSelection.length > 0 ? nextSelection : baseSelection
          }

          return allOwnerIds.filter((currentOwnerId) => currentOwnerId === ownerId || baseSelection.includes(currentOwnerId))
        }),
      getFleetOwnerName: (ownerId) => resolveFleetOwnerName(profile, incomingInvites, ownerId),
      getSharedFleetLabel: (ownerId) => resolveSharedFleetLabel(profile, incomingInvites, ownerId),
    }),
    [activeOwnerIds, allOwnerIds, fleetOptions, incomingInvites, profile],
  )

  return <FleetFilterContext.Provider value={value}>{children}</FleetFilterContext.Provider>
}

export function useFleetFilter() {
  const context = useContext(FleetFilterContext)

  if (!context) {
    throw new Error('useFleetFilter must be used inside FleetFilterProvider.')
  }

  return context
}

export function FleetFilterBar() {
  const { fleetOptions, selectedOwnerIds, isOwnerSelected, selectAll, toggleOwnerId } = useFleetFilter()

  if (fleetOptions.length <= 1) {
    return null
  }

  const allSelected = selectedOwnerIds.length === fleetOptions.length

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-secondary">
                <Filter className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold">Filtru flote</p>
                <p className="text-sm text-muted-foreground">Poti combina flota ta cu oricate flote partajate vrei.</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={allSelected ? 'default' : 'muted'}>
              {allSelected ? 'Afisezi toate flotele' : `${selectedOwnerIds.length} din ${fleetOptions.length} flote`}
            </Badge>
            <Button type="button" variant={allSelected ? 'default' : 'outline'} size="sm" onClick={selectAll}>
              Toate flotele
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {fleetOptions.map((option) => {
            const selected = isOwnerSelected(option.ownerId)

            return (
              <Button
                key={option.ownerId}
                type="button"
                variant={selected ? 'default' : 'outline'}
                size="sm"
                className={cn('h-auto min-h-10 max-w-full justify-start whitespace-normal px-4 py-2 text-left', !selected && 'text-foreground')}
                onClick={() => toggleOwnerId(option.ownerId)}
              >
                <span className="min-w-0 truncate">{option.shortLabel}</span>
                {!option.isOwnFleet ? <span className="ml-2 text-xs opacity-70">{option.role}</span> : null}
              </Button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
