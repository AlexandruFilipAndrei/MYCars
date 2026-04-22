import type { Car, FleetAccess, FleetPermissionLevel, Profile } from '@/types/models'

export interface FleetOption {
  ownerId: string
  label: string
  shortLabel: string
  role: Exclude<FleetPermissionLevel, 'none'>
  isOwnFleet: boolean
}

export function getPermissionForOwner(
  profile: Profile | null,
  incomingInvites: FleetAccess[],
  ownerId: string,
): FleetPermissionLevel {
  if (!profile) return 'none'
  if (ownerId === profile.id) return 'owner'

  const invite = incomingInvites.find(
    (item) =>
      item.ownerId === ownerId &&
      item.acceptedAt &&
      (!item.acceptedUserId || item.acceptedUserId === profile.id),
  )

  if (!invite) return 'none'
  return invite.role
}

export function canEditOwner(profile: Profile | null, incomingInvites: FleetAccess[], ownerId: string) {
  const permission = getPermissionForOwner(profile, incomingInvites, ownerId)
  return permission === 'owner' || permission === 'editor'
}

export function canViewOwner(profile: Profile | null, incomingInvites: FleetAccess[], ownerId: string) {
  return getPermissionForOwner(profile, incomingInvites, ownerId) !== 'none'
}

export function canEditCar(profile: Profile | null, incomingInvites: FleetAccess[], car: Car) {
  return canEditOwner(profile, incomingInvites, car.ownerId)
}

function getFleetName(profile: Profile | null, incomingInvites: FleetAccess[], ownerId: string) {
  if (!profile) return 'Flota partajata'
  if (ownerId === profile.id) return profile.fullName || 'Flota ta'

  const invite = incomingInvites.find(
    (item) =>
      item.ownerId === ownerId &&
      item.acceptedAt &&
      (!item.acceptedUserId || item.acceptedUserId === profile.id),
  )

  return invite?.ownerName || invite?.ownerEmail || invite?.invitedEmail || 'Flota partajata'
}

export function getAccessibleFleetOptions(profile: Profile | null, incomingInvites: FleetAccess[]): FleetOption[] {
  if (!profile) return []

  const options: FleetOption[] = [
    {
      ownerId: profile.id,
      label: `${profile.fullName} (flota ta)`,
      shortLabel: 'Flota ta',
      role: 'owner',
      isOwnFleet: true,
    },
    ...incomingInvites
      .filter((invite) => invite.acceptedAt && invite.ownerId !== profile.id)
      .map((invite) => ({
        ownerId: invite.ownerId,
        label: `${getFleetName(profile, incomingInvites, invite.ownerId)} (${invite.role === 'viewer' ? 'viewer' : 'editor'})`,
        shortLabel: getFleetName(profile, incomingInvites, invite.ownerId),
        role: invite.role,
        isOwnFleet: false,
      })),
  ]

  return options.filter((option, index, array) => array.findIndex((item) => item.ownerId === option.ownerId) === index)
}

export function getEditableFleetOptions(profile: Profile | null, incomingInvites: FleetAccess[]) {
  return getAccessibleFleetOptions(profile, incomingInvites).filter((option) => option.role === 'owner' || option.role === 'editor')
}

export function getFleetOwnerName(profile: Profile | null, incomingInvites: FleetAccess[], ownerId: string) {
  return getFleetName(profile, incomingInvites, ownerId)
}

export function getSharedFleetLabel(profile: Profile | null, incomingInvites: FleetAccess[], ownerId: string) {
  if (!profile || ownerId === profile.id) {
    return undefined
  }

  return `Flota lui ${getFleetName(profile, incomingInvites, ownerId)}`
}
