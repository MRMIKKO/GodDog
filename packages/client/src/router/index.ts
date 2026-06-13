/**
 * 路由配置
 * / 游客入口 → /lobby 大厅 → /game/:roomCode 牌桌 → /bind 账号绑定
 */

import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { connectSocket } from '@/api/socket'
import { bindSocketEvents } from '@/composables/useSocketEvents'

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'entry', component: () => import('@/views/EntryView.vue') },
  {
    path: '/lobby',
    name: 'lobby',
    component: () => import('@/views/LobbyView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/game/:roomCode',
    name: 'game',
    component: () => import('@/views/GameView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/bind',
    name: 'bind',
    component: () => import('@/views/BindView.vue'),
    meta: { requiresAuth: true },
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true
  const auth = useAuthStore()
  if (auth.token) {
    connectSocket(auth.token)
    bindSocketEvents()
    return true
  }
  // 尝试静默续期
  const ok = await auth.tryRefresh()
  if (ok && auth.token) {
    connectSocket(auth.token)
    bindSocketEvents()
    return true
  }
  return { name: 'entry' }
})
