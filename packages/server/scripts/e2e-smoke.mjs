/**
 * 端到端 4 人对局冒烟测试 —— 连接真实服务端，跑通一整局
 * 用法：服务端运行于 :3000 时，node packages/server/scripts/e2e-smoke.mjs
 */

import { io } from 'socket.io-client'

const BASE = 'http://localhost:3000'

async function guestLogin(nickname) {
  const res = await fetch(`${BASE}/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname }),
  })
  return res.json()
}

async function createRoom(token) {
  const res = await fetch(`${BASE}/rooms`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.json()
}

function connect(token) {
  return io(BASE, { auth: { token }, transports: ['websocket'] })
}

const emitAck = (sock, event, payload) =>
  new Promise((resolve) => {
    if (payload === undefined) sock.emit(event, resolve)
    else sock.emit(event, payload, resolve)
  })

async function main() {
  const names = ['豆友A', '豆友B', '豆友C', '豆友D']
  const users = []
  for (const n of names) users.push(await guestLogin(n))

  const room = await createRoom(users[0].accessToken)
  const roomCode = room.roomCode
  console.log('房间码:', roomCode)

  const socks = users.map((u) => connect(u.accessToken))
  // 等待连接
  await Promise.all(
    socks.map((s) => new Promise((r) => s.on('connect', r))),
  )
  console.log('4 人已连接')

  // 视图缓存：每个 socket 最新 game:view
  const views = [null, null, null, null]
  let roundEnded = null
  socks.forEach((s, i) => {
    s.on('game:view', (v) => (views[i] = v))
    s.on('game:round_end', (r) => (roundEnded = r))
    s.on('game:error', (e) => console.error(`socket${i} error:`, e.message))
  })

  // 加入房间
  for (const s of socks) {
    const r = await emitAck(s, 'room:join', { roomCode })
    if (!r.ok) throw new Error('join 失败: ' + r.error)
  }
  console.log('4 人已加入房间')

  // 全部准备 → 自动开局
  for (const s of socks) await emitAck(s, 'room:ready', { ready: true })
  await new Promise((r) => setTimeout(r, 500))

  if (!views[0]) throw new Error('开局后未收到 game:view')
  console.log('开局成功，庄家座位:', views[0].bankerSeat, '先手:', views[0].turnSeat)

  // 自动出牌循环：当前先手出最小单张，其余垫最小单张
  let guard = 0
  while (!roundEnded && guard++ < 200) {
    // 找到当前轮到的座位
    const turnSeat = views.find((v) => v)?.turnSeat
    if (turnSeat === undefined) break
    const view = views[turnSeat]
    if (!view) break
    const hand = view.myHand
    if (hand.length === 0) {
      await new Promise((r) => setTimeout(r, 50))
      continue
    }

    const required = view.requiredCount
    let cardIds
    let action
    if (required === 0) {
      // 先手出 1 张（任意单张合法）
      cardIds = [hand[0].id]
      action = 'play'
    } else {
      // 跟牌：垫掉前 required 张
      if (hand.length < required) {
        await new Promise((r) => setTimeout(r, 50))
        continue
      }
      cardIds = hand.slice(0, required).map((c) => c.id)
      action = 'pass'
    }

    const res = await emitAck(socks[turnSeat], 'game:play', { cardIds, action })
    if (!res.ok) {
      // 先手单张若非法（不会发生），换一张
      console.error(`座位${turnSeat}出牌失败:`, res.error)
      break
    }
    await new Promise((r) => setTimeout(r, 30))
  }

  if (roundEnded) {
    console.log('对局结束 ✅')
    console.log('胜方座位:', roundEnded.winnerSeat)
    console.log('栋数分布:', roundEnded.dongs)
    console.log('欢乐豆变动:', roundEnded.deltas)
    console.log('Kam 池:', roundEnded.kamPool, '倒Kam:', roundEnded.daoKam, '仃鸡:', roundEnded.tingji)
  } else {
    console.error('对局未在限定步数内结束 ❌')
  }

  socks.forEach((s) => s.close())
  process.exit(roundEnded ? 0 : 1)
}

main().catch((e) => {
  console.error('E2E 失败:', e)
  process.exit(1)
})
