import { useMemo } from 'react'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import toast from 'react-hot-toast'

import { PageHeader } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { inviteSchema, profileSchema } from '@/lib/validators'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'

type ProfileValues = {
  fullName: string
}

type InviteValues = {
  invitedEmail: string
  role: 'viewer' | 'editor'
}

export function SettingsPage() {
  const { profile, invites, incomingInvites, saveInvite, saveProfile, acceptInvite, removeInvite } = useAppStore()
  const sortedIncomingInvites = useMemo(
    () =>
      [...incomingInvites].sort((first, second) => {
        if (Boolean(first.acceptedAt) !== Boolean(second.acceptedAt)) {
          return first.acceptedAt ? 1 : -1
        }

        return second.createdAt.localeCompare(first.createdAt)
      }),
    [incomingInvites],
  )
  const sortedInvites = useMemo(
    () =>
      [...invites].sort((first, second) => {
        if (Boolean(first.acceptedAt) !== Boolean(second.acceptedAt)) {
          return first.acceptedAt ? 1 : -1
        }

        return second.createdAt.localeCompare(first.createdAt)
      }),
    [invites],
  )

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: {
      fullName: profile?.fullName ?? '',
    },
  })

  const inviteForm = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      invitedEmail: '',
      role: 'viewer',
    },
  })

  const onProfileSubmit = profileForm.handleSubmit(async (values) => {
    if (!profile) return

    try {
      await saveProfile({ ...profile, fullName: values.fullName })
      toast.success('Modificat cu succes')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nu am putut salva profilul.')
    }
  })

  const onInviteSubmit = inviteForm.handleSubmit(async (values) => {
    try {
      await saveInvite(values)
      toast.success('Salvat cu succes')
      toast('Dacă utilizatorul nu are încă un cont, va primi invitația după înregistrare.')
      inviteForm.reset()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nu am putut trimite invitația.'
      inviteForm.setError('invitedEmail', { message })
      toast.error(message)
    }
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Setări" />

      <div className="grid gap-4 xl:grid-cols-[1fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Profil</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onProfileSubmit}>
              <Field label="Nume complet" error={profileForm.formState.errors.fullName?.message}>
                <Input className={inputClass(Boolean(profileForm.formState.errors.fullName))} {...profileForm.register('fullName')} />
              </Field>
              <Field label="Email">
                <Input className={inputClass(false)} value={profile?.email ?? ''} readOnly disabled />
              </Field>
              <Button type="submit">Salvează profilul</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invită utilizator</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onInviteSubmit}>
              <Field label="Email" error={inviteForm.formState.errors.invitedEmail?.message}>
                <Input className={inputClass(Boolean(inviteForm.formState.errors.invitedEmail))} {...inviteForm.register('invitedEmail')} />
              </Field>
              <Field label="Rol" error={inviteForm.formState.errors.role?.message}>
                <select className={inputClass(Boolean(inviteForm.formState.errors.role))} {...inviteForm.register('role')}>
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                </select>
              </Field>
              <p className="text-sm text-muted-foreground">
                Dacă utilizatorul nu are încă un cont, invitația rămâne în așteptare și va putea fi acceptată după înregistrare.
              </p>
              <Button type="submit">Trimite invitația</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invitații primite</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {incomingInvites.length === 0 ? <p className="text-sm text-muted-foreground">Nu ai invitații primite.</p> : null}
          {sortedIncomingInvites.map((invite) => (
            <div key={`${invite.ownerId}-${invite.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
              <div>
                <p className="font-semibold">{invite.ownerName ?? 'Cont MYCars'}</p>
                <p className="text-sm text-muted-foreground">Invitație primită pentru contul tău</p>
                <p className="text-sm text-muted-foreground">Rol: {invite.role === 'viewer' ? 'Viewer' : 'Editor'}</p>
              </div>
              <div className="flex gap-2">
                {!invite.acceptedAt ? (
                  <Button
                    type="button"
                    onClick={async () => {
                      try {
                        await acceptInvite(invite.id, invite.ownerId)
                        toast.success('Salvat cu succes')
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : 'Nu am putut accepta invitația.')
                      }
                    }}
                  >
                    Acceptă
                  </Button>
                ) : (
                  <span className="self-center text-sm text-emerald-600">Acceptată</span>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await removeInvite(invite.id, invite.ownerId)
                      toast.success('Șters cu succes')
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : 'Nu am putut elimina accesul.')
                    }
                  }}
                >
                  {invite.acceptedAt ? 'Elimina' : 'Respinge'}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Acces utilizatori la flota ta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {invites.length === 0 ? <p className="text-sm text-muted-foreground">Nu ai oferit acces nimănui încă.</p> : null}
          {sortedInvites.map((invite) => (
            <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
              <div>
                <p className="font-semibold">{invite.invitedEmail}</p>
                <p className="text-sm text-muted-foreground">Rol: {invite.role === 'viewer' ? 'Viewer' : 'Editor'}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">{invite.acceptedAt ? 'Acceptată' : 'În așteptare'}</span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await removeInvite(invite.id, profile?.id ?? invite.ownerId)
                      toast.success('Șters cu succes')
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : 'Nu am putut șterge permisiunea.')
                    }
                  }}
                >
                  Șterge
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function inputClass(hasError: boolean) {
  return cn(
    'h-11 w-full rounded-2xl border bg-card px-4 text-sm',
    hasError ? 'border-destructive focus-visible:ring-destructive' : '',
  )
}

function Field({
  label,
  children,
  error,
}: {
  label: string
  children: React.ReactNode
  error?: string
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
