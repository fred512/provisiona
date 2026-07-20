import pluginVue from 'eslint-plugin-vue'

export default [
  { ignores: ['.nuxt/**', '.output/**', 'dist/**', 'node_modules/**', '.quasar/**', 'src-pwa/**', 'public/**', 'supabase/**'] },
  ...pluginVue.configs['flat/essential'],
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        crypto: 'readonly',
        console: 'readonly',
        useNuxtApp: 'readonly',
        useRuntimeConfig: 'readonly',
        defineNuxtPlugin: 'readonly',
        defineNuxtConfig: 'readonly',
      },
    },
  },
]
