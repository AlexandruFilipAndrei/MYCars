import type { Car, FleetAccess, FleetPermissionLevel, Profile } from '@/types/models'

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

export function getEditableFleetOptions(profile: Profile | null, incomingInvites: FleetAccess[]) {
  if (!profile) return []

  const options = [
    {
      ownerId: profile.id,
      label: `${profile.fullName} (flota ta)`,
    },
    ...incomingInvites
      .filter((invite) => invite.acceptedAt && invite.role === 'editor' && invite.ownerId !== profile.id)
      .map((invite) => ({
        ownerId: invite.ownerId,
        label: invite.ownerName ? `${invite.ownerName} (flotă partajată)` : `Flotă partajată ${invite.invitedEmail}`,
      })),
  ]

  return options.filter((option, index, array) => array.findIndex((item) => item.ownerId === option.ownerId) === index)
}
