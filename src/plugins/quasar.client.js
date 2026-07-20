import { Dialog, LocalStorage, Notify, Quasar } from 'quasar'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(Quasar, {
    plugins: { Dialog, LocalStorage, Notify },
    config: {
      brand: { primary: '#d8ff55', secondary: '#f1bd8a', dark: '#17251f' },
    },
  })
})
