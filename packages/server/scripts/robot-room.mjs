/**
 * 本地调试机器人：加入指定房间并自动准备/自动出牌。
 *
 * 用法：
 *   1) 先启动服务端（:3000）和前端（:5173）
 *   2) 你在前端创建房间，拿到 6 位房间码
 *   3) 运行：node packages/server/scripts/robot-room.mjs <ROOM_CODE>
 *
 * 可选环境变量：
 *   BASE_URL=http://127.0.0.1:3000
 *   BOT_COUNT=3
 */

import { io } from 'socket.io-client'
import { detectCombo, canBeat } from '@goddog/shared'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000'
const ROOM_CODE =
  (process.argv
    .slice(2)
    .find((arg) => arg && arg !== '--' && !arg.startsWith('-'))
    ?.trim()
    .toUpperCase() ?? '')
const BOT_COUNT = Math.max(1, Math.min(3, Number(process.env.BOT_COUNT ?? 3)))

if (!ROOM_CODE || ROOM_CODE.length !== 6) {
  console.error('用法: node packages/server/scripts/robot-room.mjs <6位房间码>')
  process.exit(1)
}

async function guestLogin(nickname) {
  const res = await fetch(`${BASE}/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`guestLogin失败(${res.status}): ${text}`)
  }
  return res.json()
}

const emitAck = (sock, event, payload) =>
  new Promise((resolve) => {
    if (payload === undefined) sock.emit(event, resolve)
    else sock.emit(event, payload, resolve)
  })

function connect(token) {
  return io(BASE, {
    auth: { token },
    path: '/socket.io',
    transports: ['websocket'],
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 800,
  })
}

function pickFirstWinningSet(hand, required, leaderCombo) {
  const n = hand.length
  const picked = []

  const dfs = (start) => {
    if (picked.length === required) {
      const combo = detectCombo(picked)
      if (combo && canBeat(combo, leaderCombo)) {
        return picked.map((c) => c.id)
      }
      return null
    }

    for (let i = start; i < n; i++) {
      picked.push(hand[i])
      const got = dfs(i + 1)
      picked.pop()
      if (got) return got
    }
    return null
  }

  return dfs(0)
}

/**
 * 简化机器人策略：
 * - 先手：打最前面的 1 张（单张合法）
 * - 跟牌：优先尝试压过当前最大牌；做不到再垫牌
 */
function pickAction(view) {
  const hand = view.myHand ?? []
  if (hand.length === 0) return null

  const required = view.requiredCount ?? 0
  if (required === 0) {
    return { action: 'play', cardIds: [hand[0].id] }
  }

  if (hand.length >= required) {
    const leader = view.currentTrick?.find((t) => t.isLeader && t.action === 'play')
    if (leader?.cards?.length) {
      const leaderCombo = detectCombo(leader.cards)
      if (leaderCombo) {
        const candidate = pickFirstWinningSet(hand, required, leaderCombo)
        if (candidate) {
          return { action: 'play', cardIds: candidate }
        }
      }
    }

    return {
      action: 'pass',
      cardIds: hand.slice(0, required).map((c) => c.id),
    }
  }

  // 理论上很少进入：兜底用全部手牌，避免机器人卡死。
  return { action: 'pass', cardIds: hand.map((c) => c.id) }
}

async function main() {
  console.log(`[Robot] BASE=${BASE}, ROOM=${ROOM_CODE}, BOT_COUNT=${BOT_COUNT}`)

  const bots = []
  for (let i = 0; i < BOT_COUNT; i++) {
    const nickname = `机器人${i + 1}`
    const user = await guestLogin(nickname)
    const sock = connect(user.accessToken)
    bots.push({ nickname, user, sock, view: null, acting: false, pending: false })
  }

  await Promise.all(
    bots.map(
      (b) =>
        new Promise((resolve, reject) => {
          const onConnect = () => {
            b.sock.off('connect_error', onError)
            resolve()
          }
          const onError = (e) => {
            b.sock.off('connect', onConnect)
            reject(e)
          }
          b.sock.once('connect', onConnect)
          b.sock.once('connect_error', onError)
          b.sock.connect()
        }),
    ),
  )
  console.log(`[Robot] ${bots.length} 个机器人连接成功`)

  for (const b of bots) {
    const joinRes = await emitAck(b.sock, 'room:join', { roomCode: ROOM_CODE })
    if (!joinRes?.ok) {
      throw new Error(`${b.nickname} 加入失败: ${joinRes?.error ?? '未知错误'}`)
    }
  }
  console.log('[Robot] 机器人已加入房间')

  for (const b of bots) {
    const readyRes = await emitAck(b.sock, 'room:ready', { ready: true })
    if (!readyRes?.ok) {
      throw new Error(`${b.nickname} 准备失败: ${readyRes?.error ?? '未知错误'}`)
    }
  }
  console.log('[Robot] 机器人全部已准备，等待开局')

  const tryAct = async (bot) => {
    const view = bot.view
    if (!view || view.phase !== 'playing') return
    if (view.turnSeat !== view.mySeat) return
    if (bot.acting) {
      bot.pending = true
      return
    }

    const pick = pickAction(view)
    if (!pick) return

    bot.acting = true
    try {
      const res = await emitAck(bot.sock, 'game:play', pick)
      if (!res?.ok) {
        // 日志提示即可，后续视图刷新后会再尝试。
        console.warn(`[Robot] ${bot.nickname} 出牌失败: ${res?.error ?? '未知错误'}`)
      }
    } finally {
      bot.acting = false
      if (bot.pending) {
        bot.pending = false
        void tryAct(bot)
      }
    }
  }

  for (const bot of bots) {
    bot.sock.on('game:view', (v) => {
      bot.view = v
      void tryAct(bot)
    })
    bot.sock.on('game:round_end', (data) => {
      console.log(
        `[Robot] 本局结束 winnerSeat=${data.winnerSeat}, daoKam=${data.daoKam}, tingji=${data.tingji}`,
      )
      // 自动准备下一局，便于连续调试
      void emitAck(bot.sock, 'room:ready', { ready: true })
    })
    bot.sock.on('disconnect', (reason) => {
      console.warn(`[Robot] ${bot.nickname} 断开: ${reason}`)
    })
    bot.sock.on('game:error', (e) => {
      console.warn(`[Robot] ${bot.nickname} game:error: ${e?.message ?? '未知错误'}`)
    })
  }

  console.log('[Robot] 机器人进入自动托管。按 Ctrl+C 退出。')
}

main().catch((e) => {
  console.error('[Robot] 启动失败:', e)
  process.exit(1)
})
