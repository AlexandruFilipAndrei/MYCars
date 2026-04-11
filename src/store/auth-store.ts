import { create } from 'zustand'
import type { AuthError, Subscription, User } from '@supabase/supabase-js'

import { dataService } from '@/lib/data-service'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/app-store'

type AuthUser = { id: string; email: string; fullName: string }

interface AuthState {
  user: AuthUser | null
  isLoading: boolean
  isDemo: boolean
  initialize: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (fullName: string, email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  loginDemo: () => void
}

let authSubscription: Subscription | null = null

function mapAuthUser(user: User | null, fallbackEmail?: string, fallbackFullName?: string): AuthUser | null {
  if (!user) return null

  return {
    id: user.id,
    email: user.email ?? fallbackEmail ?? '',
    fullName: (user.user_metadata.full_name as string | undefined) ?? fallbackFullName ?? 'Utilizator MYCars',
  }
}

function isSameUser(left: AuthUser | null, right: AuthUser | null) {
  if (left === right) return true
  if (!left || !right) return false
  return left.id === right.id && left.email === right.email && left.fullName === right.fullName
}

function translateAuthError(error: unknown) {
  const fallbackMessage = 'A apărut o eroare la autentificare.'

  if (!(error instanceof Error)) {
    return new Error(fallbackMessage)
  }

  const authError = error as AuthError
  const normalizedMessage = error.message.toLowerCase()

  if (normalizedMessage.includes('invalid login credentials')) {
    return new Error('Contul nu există sau parola introdusă este greșită.')
  }

  if (normalizedMessage.includes('email not confirmed')) {
    return new Error('Confirmă adresa de email din mesajul primit și încearcă din nou.')
  }

  if (normalizedMessage.includes('user already registered')) {
    return new Error('Există deja un cont creat cu această adresă de email.')
  }

  if (normalizedMessage.includes('signup is disabled')) {
    return new Error('Crearea de conturi noi este dezactivată momentan.')
  }

  if (normalizedMessage.includes('password')) {
    return new Error('Parola trebuie să aibă minimum 6 caractere.')
  }

  if (authError.message) {
    return new Error(authError.message)
  }

  return new Error(fallbackMessage)
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isDemo: false,

  async initialize() {
    try {
      if (!isSupabaseConfigured) {
        set({ isLoading: false })
        return
      }

      authSubscription?.unsubscribe()
      authSubscription = null

      const { data } = await supabase.auth.getSession()
      const currentUser = mapAuthUser(data.session?.user ?? null)

      set((state) => {
        if (isSameUser(state.user, currentUser) && state.isLoading === false && state.isDemo === false) {
          return state
        }

        return {
          user: currentUser,
          isLoading: false,
          isDemo: false,
        }
      })

      if (!currentUser) {
        useAppStore.getState().reset(false)
      }

      const listener = supabase.auth.onAuthStateChange((_event, session) => {
        const nextUser = mapAuthUser(session?.user ?? null)

        if (!nextUser) {
          useAppStore.getState().reset(false)
        }

        set((state) => {
          if (isSameUser(state.user, nextUser) && state.isLoading === false && state.isDemo === false) {
            return state
          }

          return {
            user: nextUser,
            isLoading: false,
            isDemo: false,
          }
        })
      })

      authSubscription = listener.data.subscription
    } catch {
      useAppStore.getState().reset(false)
      set({ user: null, isLoading: false, isDemo: false })
    }
  },

  async signIn(email, password) {
    set({ isLoading: true })
    try {
      const normalizedEmail = email.trim().toLowerCase()
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      })

      if (error) {
        throw translateAuthError(error)
      }

      const nextUser = mapAuthUser(data.user ?? null, normalizedEmail)
      if (!nextUser) {
        throw new Error('Autentificarea nu a returnat un utilizator valid.')
      }

      set({
        user: nextUser,
        isLoading: false,
        isDemo: false,
      })
    } catch (error) {
      set({ isLoading: false })
      throw translateAuthError(error)
    }
  },

  async signUp(fullName, email, password) {
    set({ isLoading: true })
    try {
      const normalizedEmail = email.trim().toLowerCase()
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: { full_name: fullName },
        },
      })

      if (error) {
        throw translateAuthError(error)
      }

      set({
        user: mapAuthUser(data.session?.user ?? null, normalizedEmail, fullName),
        isLoading: false,
        isDemo: false,
      })
    } catch (error) {
      set({ isLoading: false })
      throw translateAuthError(error)
    }
  },

  async signOut() {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut()
    }
    useAppStore.getState().reset(false)
    set({ user: null, isLoading: false, isDemo: false })
  },

  loginDemo() {
    dataService.resetDemoState({
      id: 'demo-user',
      email: 'demo@mycars.ro',
      fullName: 'Popescu Ion',
    })
    useAppStore.getState().reset(true)
    set({
      user: {
        id: 'demo-user',
        email: 'demo@mycars.ro',
        fullName: 'Popescu Ion',
      },
      isLoading: false,
      isDemo: true,
    })
  },
}))
