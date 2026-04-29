import { create } from 'zustand'

import { dataService } from '@/lib/data-service'
import type {
  Car,
  CarDocument,
  CarPhoto,
  DocumentType,
  FleetAccess,
  FleetReportRecord,
  FleetReportSnapshot,
  Maintenance,
  MaintenanceDocument,
  NotificationItem,
  Profile,
  Rental,
} from '@/types/models'

type PersistedAppData = {
  profile: Profile | null
  cars: Car[]
  carPhotos: CarPhoto[]
  documents: CarDocument[]
  rentals: Rental[]
  maintenance: Maintenance[]
  fleetReports: FleetReportRecord[]
  notifications: NotificationItem[]
  invites: FleetAccess[]
  incomingInvites: FleetAccess[]
}

const appCacheVersion = 3
const appCacheMaxAgeMs = 1000 * 60 * 60 * 4

function createEmptyState(isLoading: boolean) {
  return {
    activeUserId: null,
    profile: null,
    cars: [] as Car[],
    carPhotos: [] as CarPhoto[],
    documents: [] as CarDocument[],
    rentals: [] as Rental[],
    maintenance: [] as Maintenance[],
    fleetReports: [] as FleetReportRecord[],
    notifications: [] as NotificationItem[],
    invites: [] as FleetAccess[],
    incomingInvites: [] as FleetAccess[],
    isLoading,
  }
}

function getAppCacheKey(userId: string) {
  return `mycars-app-cache-${userId}`
}

function clearPersistedAppData(userId: string) {
  try {
    localStorage.removeItem(getAppCacheKey(userId))
  } catch {
    // Ignore cache cleanup failures.
  }
}

function sanitizeRentalForPersistence(rental: Rental): Rental {
  return {
    ...rental,
    renterCnp: '',
    renterIdPhotoUrl: undefined,
  }
}

function pickPersistedAppData(source: PersistedAppData): PersistedAppData {
  return {
    profile: source.profile,
    cars: source.cars,
    carPhotos: source.carPhotos,
    documents: source.documents,
    rentals: source.rentals.map(sanitizeRentalForPersistence),
    maintenance: source.maintenance,
    fleetReports: source.fleetReports,
    notifications: source.notifications,
    invites: source.invites,
    incomingInvites: source.incomingInvites,
  }
}

function readPersistedAppData(userId: string) {
  try {
    const rawValue = localStorage.getItem(getAppCacheKey(userId))

    if (!rawValue) {
      return null
    }

    const parsed = JSON.parse(rawValue) as { version?: number; savedAt?: string; state?: PersistedAppData } | null

    if (!parsed || parsed.version !== appCacheVersion || !parsed.state) {
      clearPersistedAppData(userId)
      return null
    }

    const savedAt = parsed.savedAt ? new Date(parsed.savedAt).getTime() : Number.NaN

    if (!Number.isFinite(savedAt) || Date.now() - savedAt > appCacheMaxAgeMs) {
      clearPersistedAppData(userId)
      return null
    }

    return pickPersistedAppData(parsed.state)
  } catch {
    clearPersistedAppData(userId)
    return null
  }
}

function writePersistedAppData(userId: string, state: PersistedAppData) {
  try {
    localStorage.setItem(
      getAppCacheKey(userId),
      JSON.stringify({
        version: appCacheVersion,
        savedAt: new Date().toISOString(),
        state: pickPersistedAppData(state),
      }),
    )
  } catch {
    // Ignore cache write errors and keep the app usable.
  }
}

function mergeMaintenanceDocuments(maintenance: Maintenance[], maintenanceDocuments: MaintenanceDocument[]) {
  const documentsByMaintenanceId = maintenanceDocuments.reduce<Map<string, MaintenanceDocument[]>>((map, document) => {
    const currentDocuments = map.get(document.maintenanceId)

    if (currentDocuments) {
      currentDocuments.push(document)
    } else {
      map.set(document.maintenanceId, [document])
    }

    return map
  }, new Map())

  return maintenance.map((item) => ({
    ...item,
    documents: documentsByMaintenanceId.get(item.id) ?? item.documents ?? [],
  }))
}

function upsertById<T extends { id: string }>(items: T[], nextItem: T) {
  const existingIndex = items.findIndex((item) => item.id === nextItem.id)

  if (existingIndex === -1) {
    return [nextItem, ...items]
  }

  return items.map((item) => (item.id === nextItem.id ? nextItem : item))
}

function syncMandatoryDocuments(documents: CarDocument[], carId: string, itpExpiryDate: string, rcaExpiryDate: string) {
  const now = new Date().toISOString()
  const currentItp = documents.find((item) => item.carId === carId && item.type === 'ITP')
  const currentRca = documents.find((item) => item.carId === carId && item.type === 'RCA')
  const preservedDocuments = documents.filter((item) => !(item.carId === carId && (item.type === 'ITP' || item.type === 'RCA')))

  return [
    {
      id: currentItp?.id ?? crypto.randomUUID(),
      carId,
      type: 'ITP',
      customName: 'ITP',
      expiryDate: itpExpiryDate,
      issueDate: currentItp?.issueDate,
      fileUrl: currentItp?.fileUrl,
      notes: currentItp?.notes,
      isMandatory: true,
      createdAt: currentItp?.createdAt ?? now,
    } satisfies CarDocument,
    {
      id: currentRca?.id ?? crypto.randomUUID(),
      carId,
      type: 'RCA',
      customName: 'RCA',
      expiryDate: rcaExpiryDate,
      issueDate: currentRca?.issueDate,
      fileUrl: currentRca?.fileUrl,
      notes: currentRca?.notes,
      isMandatory: true,
      createdAt: currentRca?.createdAt ?? now,
    } satisfies CarDocument,
    ...preservedDocuments,
  ]
}

interface AppState {
  activeUserId: string | null
  profile: Profile | null
  cars: Car[]
  carPhotos: CarPhoto[]
  documents: CarDocument[]
  rentals: Rental[]
  maintenance: Maintenance[]
  fleetReports: FleetReportRecord[]
  notifications: NotificationItem[]
  invites: FleetAccess[]
  incomingInvites: FleetAccess[]
  isLoading: boolean
  reset: (isLoading?: boolean) => void
  bootstrap: (user: { id: string; email: string; fullName: string } | null) => Promise<void>
  saveCar: (
    input: Omit<Car, 'id' | 'engineKw' | 'createdAt' | 'updatedAt'> & {
      id?: string
      itpExpiryDate: string
      rcaExpiryDate: string
      photoFiles?: File[]
      documentInputs?: Array<{
        id?: string
        type: DocumentType
        customName?: string
        expiryDate?: string
        file?: File | null
      }>
    },
  ) => Promise<void>
  deleteCar: (id: string) => Promise<void>
  updateCarNotes: (id: string, notes: string) => Promise<void>
  deleteCarDocument: (id: string) => Promise<void>
  deleteCarPhoto: (id: string) => Promise<void>
  saveRental: (input: Omit<Rental, 'id' | 'createdAt' | 'updatedAt' | 'photos'> & { id?: string }) => Promise<void>
  deleteRental: (id: string) => Promise<void>
  saveMaintenance: (
    input: Omit<Maintenance, 'id' | 'createdAt' | 'documents'> & {
      id?: string
      documentFiles?: File[]
    },
  ) => Promise<void>
  deleteMaintenance: (id: string) => Promise<void>
  saveFleetReport: (
    input: Omit<FleetReportRecord, 'id' | 'createdBy' | 'createdAt'> & {
      id?: string
      report: FleetReportSnapshot
    },
  ) => Promise<FleetReportRecord>
  deleteFleetReport: (id: string) => Promise<void>
  markNotificationAsRead: (id: string) => Promise<void>
  saveInvite: (input: Omit<FleetAccess, 'id' | 'createdAt' | 'ownerId' | 'acceptedAt'>) => Promise<void>
  acceptInvite: (inviteId: string, ownerId: string) => Promise<void>
  removeInvite: (inviteId: string, ownerId: string) => Promise<void>
  saveProfile: (profile: Profile) => Promise<void>
}

let bootstrapRequestId = 0

export const useAppStore = create<AppState>((set) => {
  const refreshUserData = async (
    user: { id: string; email: string; fullName: string } | null,
    options: { showLoading: boolean; loadDeferredAssets?: boolean },
  ) => {
    if (!user) {
      set(createEmptyState(false))
      return
    }

    const requestId = ++bootstrapRequestId
    const currentState = useAppStore.getState()
    const cachedState = readPersistedAppData(user.id)
    const shouldLoadDeferredAssets = options.loadDeferredAssets ?? true
    const isCurrentRequest = () => {
      const state = useAppStore.getState()
      return state.activeUserId === user.id && requestId === bootstrapRequestId
    }

    if (options.showLoading) {
      if (cachedState) {
        set({ ...cachedState, activeUserId: user.id, isLoading: false })
      } else if (currentState.activeUserId !== user.id) {
        set({ ...createEmptyState(true), activeUserId: user.id })
      } else {
        set((state) => ({ ...state, isLoading: true }))
      }
    }

    try {
      const state = await dataService.bootstrap(user)

      if (!isCurrentRequest()) {
        return
      }

      const currentWithAssets = useAppStore.getState()
      const mergedState = {
        ...state,
        carPhotos: currentWithAssets.carPhotos,
        maintenance: state.maintenance.map((item) => ({
          ...item,
          documents: currentWithAssets.maintenance.find((currentItem) => currentItem.id === item.id)?.documents ?? [],
        })),
      }

      writePersistedAppData(user.id, mergedState)
      set((current) =>
        current.activeUserId === user.id && requestId === bootstrapRequestId
          ? { ...mergedState, activeUserId: user.id, isLoading: false }
          : current,
      )

      if (!shouldLoadDeferredAssets) {
        return
      }

      void dataService
        .loadDeferredAssets(user)
        .then((deferredAssets) => {
          set((current) => {
            if (current.activeUserId !== user.id || requestId !== bootstrapRequestId) {
              return current
            }

            const nextState = {
              ...current,
              carPhotos: deferredAssets.carPhotos,
              maintenance: mergeMaintenanceDocuments(current.maintenance, deferredAssets.maintenanceDocuments),
            }

            writePersistedAppData(user.id, {
              profile: nextState.profile,
              cars: nextState.cars,
              carPhotos: nextState.carPhotos,
              documents: nextState.documents,
              rentals: nextState.rentals,
              maintenance: nextState.maintenance,
              fleetReports: nextState.fleetReports,
              notifications: nextState.notifications,
              invites: nextState.invites,
              incomingInvites: nextState.incomingInvites,
            })

            return nextState
          })
        })
        .catch(() => {
          // Ignore deferred asset failures so the main app remains usable.
        })
    } catch {
      if (!options.showLoading) {
        return
      }

      set((current) =>
        current.activeUserId === user.id && requestId === bootstrapRequestId ? { ...current, isLoading: false } : current,
      )
    }
  }

  return {
    ...createEmptyState(true),

    reset(isLoading = false) {
      bootstrapRequestId += 1
      set(createEmptyState(isLoading))
    },

    async bootstrap(user) {
      await refreshUserData(user, { showLoading: true, loadDeferredAssets: true })
    },

    async saveCar(input) {
      const { profile: current } = useAppStore.getState()
      if (!current) return
      const savedCar = await dataService.saveCar(current, input)
      set((state) =>
        state.activeUserId !== current.id
          ? state
          : {
              ...state,
              cars: upsertById(state.cars, savedCar),
              documents: syncMandatoryDocuments(state.documents, savedCar.id, input.itpExpiryDate, input.rcaExpiryDate),
            },
      )
      void refreshUserData(current, { showLoading: false, loadDeferredAssets: Boolean(input.photoFiles?.length) })
    },

    async deleteCar(id) {
      const { profile: current } = useAppStore.getState()
      if (!current) return
      await dataService.deleteCar(current, id)
      set((state) =>
        state.activeUserId !== current.id
          ? state
          : {
              ...state,
              cars: state.cars.filter((item) => item.id !== id),
              carPhotos: state.carPhotos.filter((item) => item.carId !== id),
              documents: state.documents.filter((item) => item.carId !== id),
              rentals: state.rentals.filter((item) => item.carId !== id),
              maintenance: state.maintenance.filter((item) => item.carId !== id),
              notifications: state.notifications.filter((item) => item.carId !== id),
            },
      )
      void refreshUserData(current, { showLoading: false, loadDeferredAssets: false })
    },

    async updateCarNotes(id, notes) {
      const { profile: current } = useAppStore.getState()
      if (!current) return
      const savedCar = await dataService.updateCarNotes(current, id, notes)
      set((state) =>
        state.activeUserId !== current.id
          ? state
          : {
              ...state,
              cars: upsertById(state.cars, savedCar),
            },
      )
      void refreshUserData(current, { showLoading: false, loadDeferredAssets: false })
    },

    async deleteCarDocument(id) {
      const { profile: current } = useAppStore.getState()
      if (!current) return
      await dataService.deleteCarDocument(current, id)
      set((state) =>
        state.activeUserId !== current.id
          ? state
          : {
              ...state,
              documents: state.documents.filter((item) => item.id !== id),
              notifications: state.notifications.filter((item) => item.documentId !== id),
            },
      )
      void refreshUserData(current, { showLoading: false, loadDeferredAssets: false })
    },

    async deleteCarPhoto(id) {
      const { profile: current } = useAppStore.getState()
      if (!current) return
      await dataService.deleteCarPhoto(current, id)
      set((state) =>
        state.activeUserId !== current.id
          ? state
          : {
              ...state,
              carPhotos: state.carPhotos.filter((item) => item.id !== id),
            },
      )
      void refreshUserData(current, { showLoading: false, loadDeferredAssets: false })
    },

    async saveRental(input) {
      const { profile: current } = useAppStore.getState()
      if (!current) return
      const savedRental = await dataService.saveRental(current, input)
      set((state) =>
        state.activeUserId !== current.id
          ? state
          : {
              ...state,
              rentals: upsertById(state.rentals, savedRental),
            },
      )
      void refreshUserData(current, { showLoading: false, loadDeferredAssets: false })
    },

    async deleteRental(id) {
      const { profile: current } = useAppStore.getState()
      if (!current) return
      await dataService.deleteRental(current, id)
      set((state) =>
        state.activeUserId !== current.id
          ? state
          : {
              ...state,
              rentals: state.rentals.filter((item) => item.id !== id),
            },
      )
      void refreshUserData(current, { showLoading: false, loadDeferredAssets: false })
    },

    async saveMaintenance(input) {
      const { profile: current } = useAppStore.getState()
      if (!current) return
      const savedMaintenance = await dataService.saveMaintenance(current, input)
      set((state) =>
        state.activeUserId !== current.id
          ? state
          : {
              ...state,
              maintenance: upsertById(state.maintenance, {
                ...savedMaintenance,
                documents:
                  savedMaintenance.documents.length > 0
                    ? savedMaintenance.documents
                    : state.maintenance.find((item) => item.id === savedMaintenance.id)?.documents ?? [],
              }),
            },
      )
      void refreshUserData(current, { showLoading: false, loadDeferredAssets: Boolean(input.documentFiles?.length) })
    },

    async deleteMaintenance(id) {
      const { profile: current } = useAppStore.getState()
      if (!current) return
      await dataService.deleteMaintenance(current, id)
      set((state) =>
        state.activeUserId !== current.id
          ? state
          : {
              ...state,
              maintenance: state.maintenance.filter((item) => item.id !== id),
            },
      )
      void refreshUserData(current, { showLoading: false, loadDeferredAssets: false })
    },

    async saveFleetReport(input) {
      const { profile: current } = useAppStore.getState()
      if (!current) {
        throw new Error('Utilizatorul nu este autentificat.')
      }

      const savedReport = await dataService.saveFleetReport(current, input)
      set((state) =>
        state.activeUserId !== current.id
          ? state
          : {
              ...state,
              fleetReports: upsertById(state.fleetReports, savedReport),
            },
      )
      return savedReport
    },

    async deleteFleetReport(id) {
      const { profile: current } = useAppStore.getState()
      if (!current) return

      await dataService.deleteFleetReport(current, id)
      set((state) =>
        state.activeUserId !== current.id
          ? state
          : {
              ...state,
              fleetReports: state.fleetReports.filter((item) => item.id !== id),
            },
      )
    },

    async markNotificationAsRead(id) {
      const state = useAppStore.getState()
      const current = state.profile
      const notification = state.notifications.find((item) => item.id === id)
      if (!current || !notification) return
      await dataService.markNotificationAsRead(current, notification)
      set((state) =>
        state.activeUserId !== current.id
          ? state
          : {
              ...state,
              notifications: state.notifications.map((item) => (item.id === id ? { ...item, isRead: true } : item)),
            },
      )
    },

    async saveInvite(input) {
      const current = useAppStore.getState().profile
      if (!current) return
      await dataService.saveInvite(current, input)
      void refreshUserData(current, { showLoading: false, loadDeferredAssets: false })
    },

    async acceptInvite(inviteId, ownerId) {
      const current = useAppStore.getState().profile
      if (!current) return
      await dataService.acceptInvite(current, inviteId, ownerId)
      void refreshUserData(current, { showLoading: false, loadDeferredAssets: false })
    },

    async removeInvite(inviteId, ownerId) {
      const current = useAppStore.getState().profile
      if (!current) return
      await dataService.removeInvite(current, inviteId, ownerId)
      void refreshUserData(current, { showLoading: false, loadDeferredAssets: false })
    },

    async saveProfile(profile) {
      const current = useAppStore.getState().profile
      if (!current) return
      await dataService.saveProfile(current, profile)
      set((state) =>
        state.activeUserId !== current.id
          ? state
          : {
              ...state,
              profile,
            },
      )
      void refreshUserData(current, { showLoading: false, loadDeferredAssets: false })
    },
  }
})

useAppStore.subscribe((state) => {
  if (!state.activeUserId || !state.profile) {
    return
  }

  writePersistedAppData(
    state.activeUserId,
    pickPersistedAppData({
      profile: state.profile,
      cars: state.cars,
      carPhotos: state.carPhotos,
      documents: state.documents,
      rentals: state.rentals,
      maintenance: state.maintenance,
      fleetReports: state.fleetReports,
      notifications: state.notifications,
      invites: state.invites,
      incomingInvites: state.incomingInvites,
    }),
  )
})
