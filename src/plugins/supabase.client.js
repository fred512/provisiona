import { createClient } from '@supabase/supabase-js'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const url = config.public.supabaseUrl
  const key = config.public.supabasePublishableKey
  const configured = Boolean(url && key)
  const client = configured
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null

  return {
    provide: {
      supabase: client,
      isSupabaseConfigured: configured,
    },
  }
})
