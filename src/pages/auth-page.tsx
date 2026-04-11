import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CarFront, KeyRound, Mail, UserCircle2 } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authSchema } from '@/lib/validators'
import { useAuthStore } from '@/store/auth-store'

type AuthValues = z.input<typeof authSchema>
type AuthSubmitValues = z.output<typeof authSchema>

export function AuthPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [authFeedback, setAuthFeedback] = useState<string | null>(null)
  const { signIn, signUp, loginDemo, isLoading, user } = useAuthStore()

  const form = useForm<AuthValues, unknown, AuthSubmitValues>({
    resolver: zodResolver(authSchema),
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
    },
  })

  useEffect(() => {
    if (user) {
      navigate('/', { replace: true })
    }
  }, [navigate, user])

  useEffect(() => {
    if (mode === 'login') {
      form.setValue('fullName', undefined)
      form.clearErrors('fullName')
    }
  }, [form, mode])

  const onSubmit = form.handleSubmit(async (values) => {
    setAuthFeedback(null)

    try {
      if (mode === 'register' && !values.fullName?.trim()) {
        form.setError('fullName', { message: 'Numele complet este obligatoriu la crearea contului.' })
        return
      }

      if (mode === 'login') {
        await signIn(values.email, values.password)
        navigate('/', { replace: true })
        toast.success('Autentificare reușită.')
        return
      }

      await signUp(values.fullName ?? '', values.email, values.password)
      const message =
        'Cererea de creare cont a fost trimisă. Dacă nu intri direct în aplicație, verifică emailul și confirmă adresa din mesajul primit.'
      setAuthFeedback(message)
      toast.success(message)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'A apărut o eroare la autentificare.'
      setAuthFeedback(message)
      toast.error(message)
    }
  })

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f6f3ed_0%,#ffffff_100%)] p-4">
      <Toaster position="top-right" toastOptions={{ className: '!rounded-2xl !bg-card !text-foreground !border !border-border' }} />

      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-5xl items-center justify-center">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-slate-950 text-white shadow-soft">
              <CarFront className="h-7 w-7" />
            </div>
            <p className="mt-4 font-display text-4xl font-bold tracking-tight text-slate-950">MYCars</p>
            <p className="text-sm uppercase tracking-[0.28em] text-slate-500">Manage Your Cars</p>
            <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-slate-600">
              Administrează mașinile, documentele, închirierile și reparațiile într-un spațiu simplu și clar.
            </p>
          </div>

          <Card className="border-white/40 bg-white/95 shadow-soft">
            <CardHeader>
              <CardTitle>{mode === 'login' ? 'Intră în cont' : 'Creează un cont nou'}</CardTitle>
              <CardDescription>
                {mode === 'login'
                  ? 'Conectează-te pentru a continua.'
                  : 'Completează datele de mai jos pentru a începe.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {authFeedback ? <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm leading-6">{authFeedback}</div> : null}

              <form className="space-y-4" onSubmit={onSubmit}>
                {mode === 'register' ? (
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Nume complet</Label>
                    <div className="relative">
                      <UserCircle2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="fullName" className="pl-10" placeholder="Popescu Ion" {...form.register('fullName')} />
                    </div>
                    <FieldError message={form.formState.errors.fullName?.message} />
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      className="pl-10"
                      placeholder="nume@exemplu.ro"
                      {...form.register('email')}
                    />
                  </div>
                  <FieldError message={form.formState.errors.email?.message} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Parolă</Label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      className="pl-10"
                      placeholder="Minimum 6 caractere"
                      {...form.register('password')}
                    />
                  </div>
                  <FieldError message={form.formState.errors.password?.message} />
                </div>

                <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? 'Se procesează...' : mode === 'login' ? 'Intră în cont' : 'Creează cont'}
                </Button>
              </form>

              {isLoading && !form.formState.isSubmitting ? (
                <div className="rounded-2xl border border-border bg-muted/60 p-3 text-sm text-muted-foreground">
                  Se verifică sesiunea de autentificare...
                </div>
              ) : null}

              <Button
                variant="secondary"
                type="button"
                className="w-full"
                onClick={() => {
                  setAuthFeedback(null)
                  loginDemo()
                  navigate('/', { replace: true })
                  toast.success('Ai intrat în modul demo.')
                }}
              >
                Explorează modul demo
              </Button>

              <div className="text-center text-sm text-muted-foreground">
                {mode === 'login' ? 'Nu ai cont?' : 'Ai deja cont?'}{' '}
                <button
                  className="font-semibold text-primary"
                  onClick={() => {
                    setAuthFeedback(null)
                    setMode(mode === 'login' ? 'register' : 'login')
                  }}
                  type="button"
                >
                  {mode === 'login' ? 'Înregistrează-te' : 'Conectează-te'}
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-sm text-destructive">{message}</p> : null
}
