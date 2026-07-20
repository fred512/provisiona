export default defineNuxtConfig({
  compatibilityDate: '2026-07-19',
  ssr: false,
  srcDir: 'src/',
  devtools: { enabled: true },
  modules: ['@vite-pwa/nuxt'],
  css: [
    'quasar/dist/quasar.css',
    '@quasar/extras/material-icons/material-icons.css',
    '~/css/app.scss',
  ],
  runtimeConfig: {
    public: {
      supabaseUrl: '',
      supabasePublishableKey: '',
    },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'pt-BR' },
      title: 'Provisiona — contas em dia',
      meta: [
        { name: 'description', content: 'Boletos, provisões e alertas em um só lugar.' },
        { name: 'theme-color', content: '#17251f' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      ],
      link: [
        { rel: 'apple-touch-icon', href: '/icons/icon-192x192.png' },
      ],
    },
  },
  pwa: {
    registerType: 'autoUpdate',
    injectRegister: 'auto',
    manifest: {
      name: 'Provisiona — Contas em dia',
      short_name: 'Provisiona',
      description: 'Boletos, provisões e alertas em um só lugar.',
      display: 'standalone',
      orientation: 'portrait-primary',
      background_color: '#101a15',
      theme_color: '#17251f',
      lang: 'pt-BR',
      categories: ['finance', 'productivity'],
      icons: [
        { src: 'icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    },
    workbox: {
      navigateFallback: '/',
      globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
    },
    devOptions: { enabled: false },
  },
})
