import { create } from 'zustand'

import { dataService } from '@/lib/data-service'
import type { Car, CarDocument, CarPhoto, DocumentType, FleetAccess, Maintenance, NotificationItem, Profile, Rental } from '@/types/models'

function createEmptyState(isLoading: boolean) {
  return {
    activeUserId: null,
    profile: null,
    cars: [] as Car[],
    carPhotos: [] as CarPhoto[],
    documents: [] as CarDocument[],
    rentals: [] as Rental[],
    maintenance: [] as Maintenance[],
    notifications: [] as NotificationItem[],
    invites: [] as FleetAccess[],
    incomingInvites: [] as FleetAccess[],
    isLoading,
  }
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
  saveRental: (input: Omit<Rental, 'id' | 'createdAt' | 'updatedAt' | 'photos'> & { id?: string }) => Promise<void>
  deleteRental: (id: string) => Promise<void>
  saveMaintenance: (
    input: Omit<Maintenance, 'id' | 'createdAt' | 'documents'> & {
      id?: string
      documentFiles?: File[]
      markCarAsMaintenance?: boolean
    },
  ) => Promise<void>
  deleteMaintenance: (id: string) => Promise<void>
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
    options: { showLoading: boolean },
  ) => {
    if (!user) {
      set(createEmptyState(false))
      return
    }

    const requestId = ++bootstrapRequestId
    const currentState = useAppStore.getState()

    if (options.showLoading) {
      if (currentState.activeUserId !== user.id) {
        set({ ...createEmptyState(true), activeUserId: user.id })
      } else {
        set((state) => ({ ...state, isLoading: true }))
      }
    }

    try {
      const state = await dataService.bootstrap(user)
      set((current) =>
        current.activeUserId === user.id && requestId === bootstrapRequestId
          ? { ...state, activeUserId: user.id, isLoading: false }
          : current,
      )
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
      await refreshUserData(user, { showLoading: true })
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
      void refreshUserData(current, { showLoading: false })
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
      void refreshUserData(current, { showLoading: false })
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
      void refreshUserData(current, { showLoading: false })
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
      void refreshUserData(current, { showLoading: false })
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
              maintenance: upsertById(state.maintenance, savedMaintenance),
            },
      )
      void refreshUserData(current, { showLoading: false })
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
      void refreshUserData(current, { showLoading: false })
    },

    async markNotificationAsRead(id) {
      const current = useAppStore.getState().profile
      if (!current) return
      await dataService.markNotificationAsRead(current, id)
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
      void refreshUserData(current, { showLoading: false })
    },

    async acceptInvite(inviteId, ownerId) {
      const current = useAppStore.getState().profile
      if (!current) return
      await dataService.acceptInvite(current, inviteId, ownerId)
      void refreshUserData(current, { showLoading: false })
    },

    async removeInvite(inviteId, ownerId) {
      const current = useAppStore.getState().profile
      if (!current) return
      await dataService.removeInvite(current, inviteId, ownerId)
      void refreshUserData(current, { showLoading: false })
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
      void refreshUserData(current, { showLoading: false })
    },
  }
})
