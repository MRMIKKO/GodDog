/**
 * 认证状态 —— 游客登录、token 管理、用户信息
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, setAccessToken, type PublicUser } from '@/api'

const GUEST_ID_KEY = 'goddog_guest_id'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<PublicUser | null>(null)
  const token = ref<string | null>(null)
  const loading = ref(false)

  function persistGuestId(guestId: string): void {
    localStorage.setItem(GUEST_ID_KEY, guestId)
  }

  function getStoredGuestId(): string | null {
    return localStorage.getItem(GUEST_ID_KEY)
  }

  /** 游客登录（携带本地 guestId 实现身份延续） */
  async function loginAsGuest(nickname?: string): Promise<void> {
    loading.value = true
    try {
      const guestId = getStoredGuestId() ?? undefined
      const res = await api.guestLogin(guestId, nickname)
      token.value = res.accessToken
      user.value = res.user
      setAccessToken(res.accessToken)
      persistGuestId(res.guestId)
    } finally {
      loading.value = false
    }
  }

  /** 尝试用 refresh cookie 静默续期 */
  async function tryRefresh(): Promise<boolean> {
    try {
      const res = await api.refresh()
      token.value = res.accessToken
      user.value = res.user
      setAccessToken(res.accessToken)
      return true
    } catch {
      return false
    }
  }

  /** 已绑定账号登录 */
  async function loginWithPassword(username: string, password: string): Promise<void> {
    const res = await api.login(username, password)
    token.value = res.accessToken
    user.value = res.user
    setAccessToken(res.accessToken)
    persistGuestId(res.guestId)
  }

  /** 绑定正式账号 */
  async function bindAccount(username: string, password: string): Promise<void> {
    const res = await api.bind(username, password)
    user.value = res.user
  }

  function updateBeans(beans: number): void {
    if (user.value) user.value.beans = beans
  }

  return {
    user,
    token,
    loading,
    loginAsGuest,
    tryRefresh,
    loginWithPassword,
    bindAccount,
    updateBeans,
  }
})
