import { defineRouter } from '#q-app/wrappers'
import { createMemoryHistory, createRouter, createWebHistory } from 'vue-router'

export default defineRouter(() => createRouter({
  history: import.meta.env.SSR ? createMemoryHistory() : createWebHistory(),
  routes: [],
}))
