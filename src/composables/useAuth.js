import { ref } from 'vue'

const user = ref(null)
let started = false
let sessionHandled = false

export function useAuth() {
  const { $supabase: supabase, $isSupabaseConfigured: isSupabaseConfigured } = useNuxtApp()

  function init(onSession) {
    if (started || !isSupabaseConfigured) return
    started = true
    supabase.auth.onAuthStateChange((event, session) => {
      user.value = session?.user || null
      if (session?.user && !sessionHandled) {
        sessionHandled = true
        onSession(session.user)
      }
      if (event === 'SIGNED_OUT') sessionHandled = false
    })
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) throw error
  }

  async function signInWithEmail(email) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) throw error
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  return { user, init, signInWithGoogle, signInWithEmail, signOut }
}
