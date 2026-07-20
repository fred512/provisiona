import { configure } from 'quasar/wrappers'

export default configure(() => ({
  boot: ['supabase'],
  css: ['app.scss'],
  extras: ['material-icons'],
  build: {
    target: { browser: ['es2022', 'firefox115', 'chrome115', 'safari14'], node: 'node20' },
    vueRouterMode: 'history',
  },
  devServer: { open: false, port: 9100 },
  framework: {
    config: { brand: { primary: '#d8ff55', secondary: '#f1bd8a', dark: '#17251f' } },
    plugins: ['Notify', 'Dialog', 'LocalStorage'],
  },
  animations: ['fadeIn', 'fadeOut', 'slideInUp'],
  pwa: {
    workboxMode: 'GenerateSW',
    injectPwaMetaTags: true,
    swFilename: 'sw.js',
    manifestFilename: 'manifest.webmanifest',
    useCredentialsForManifestTag: false,
    manifest: {
      name: 'Provisiona — Contas em dia',
      short_name: 'Provisiona',
      description: 'Boletos, provisões e alertas em um só lugar.',
      display: 'standalone',
      orientation: 'portrait-primary',
      background_color: '#f4f1e8',
      theme_color: '#17251f',
      lang: 'pt-BR',
      categories: ['finance', 'productivity'],
      icons: [
        { src: 'icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
        { src: 'icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' }
      ]
    }
  }
}))
