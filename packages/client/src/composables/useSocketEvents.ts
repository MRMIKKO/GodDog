/**
 * 全局 socket 事件绑定 —— 将服务端推送同步到 Pinia stores
 * 在 App 挂载后调用一次。
 */

import { getSocket } from '@/api/socket'
import { emitAck } from '@/api/socket'
import { useRoomStore } from '@/stores/room'
import { useGameStore } from '@/stores/game'
import { useAuthStore } from '@/stores/auth'
import { useSound } from '@/composables/useSound'
import type { PlayerView, RoomStatePayload, DongWonPayload, RoundEndPayload } from '@goddog/shared'

let cleanupHandlers: null | (() => void) = null

export function bindSocketEvents(): void {
  const socket = getSocket()
  if (!socket) return

  // 支持重复调用（如刷新后重连）：先解绑旧监听，避免重复触发。
  cleanupHandlers?.()
  cleanupHandlers = null

  const roomStore = useRoomStore()
  const gameStore = useGameStore()
  const authStore = useAuthStore()
  const { play } = useSound()

  const onRoomState = (state: RoomStatePayload) => {
    roomStore.setRoomState(state)
  }

  const onGameView = (view: PlayerView) => {
    gameStore.setView(view)
  }

  const onDice = (data: { rolls: Record<number, number>; firstSeat: number }) => {
    gameStore.setDice(data)
  }

  const onDongWon = (data: DongWonPayload) => {
    gameStore.setDongWon(data)
    play('winDong')
  }

  const onRoundEnd = (data: RoundEndPayload) => {
    gameStore.setRoundEnd(data)
    // 同步本人欢乐豆
    const mySeat = gameStore.view?.mySeat
    if (mySeat !== undefined && data.deltas[mySeat] !== undefined) {
      const cur = authStore.user?.beans ?? 0
      authStore.updateBeans(cur + data.deltas[mySeat])
    }
    if (data.daoKam) play('daoKam')
    else if (data.tingji) play('tingji')
    else play('gameWin')
  }

  const onGameError = (data: { message: string }) => {
    console.error('[game:error]', data.message)
  }

  const onConnect = async () => {
    const roomCode = roomStore.roomState?.roomCode
    if (!roomCode) return

    const joinRes = await emitAck('room:join', { roomCode })
    if (!joinRes.ok) return

    const syncRes = await emitAck<PlayerView>('game:sync')
    if (syncRes.ok && syncRes.data) {
      gameStore.setView(syncRes.data)
    }
  }

  socket.on('connect', onConnect)
  socket.on('room:state', onRoomState)
  socket.on('game:view', onGameView)
  socket.on('game:dice_result', onDice)
  socket.on('game:dong_won', onDongWon)
  socket.on('game:round_end', onRoundEnd)
  socket.on('game:error', onGameError)

  cleanupHandlers = () => {
    socket.off('connect', onConnect)
    socket.off('room:state', onRoomState)
    socket.off('game:view', onGameView)
    socket.off('game:dice_result', onDice)
    socket.off('game:dong_won', onDongWon)
    socket.off('game:round_end', onRoundEnd)
    socket.off('game:error', onGameError)
  }
}
