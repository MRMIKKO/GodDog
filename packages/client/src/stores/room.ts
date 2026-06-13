/**
 * 房间状态 —— 房间码、座位、准备状态
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { RoomStatePayload } from '@goddog/shared'
import { emitAck } from '@/api/socket'

export const useRoomStore = defineStore('room', () => {
  const roomState = ref<RoomStatePayload | null>(null)
  const joining = ref(false)

  function setRoomState(state: RoomStatePayload): void {
    roomState.value = state
  }

  async function join(roomCode: string): Promise<{ ok: boolean; error?: string }> {
    joining.value = true
    try {
      return await emitAck('room:join', { roomCode })
    } finally {
      joining.value = false
    }
  }

  async function leave(): Promise<void> {
    await emitAck('room:leave')
    roomState.value = null
  }

  async function setReady(ready: boolean): Promise<{ ok: boolean; error?: string }> {
    return emitAck('room:ready', { ready })
  }

  return { roomState, joining, setRoomState, join, leave, setReady }
})
