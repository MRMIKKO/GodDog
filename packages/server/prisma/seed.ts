/**
 * 数据库种子 —— 创建一个管理员用户，便于后台充值操作
 * 运行：pnpm --filter @goddog/server db:seed
 */

import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'

const prisma = new PrismaClient()

async function main() {
  const adminGuestId = 'admin-' + randomUUID()
  const existing = await prisma.user.findFirst({ where: { isAdmin: true } })
  if (existing) {
    console.log('管理员已存在：', existing.nickname, existing.id)
    return
  }
  const admin = await prisma.user.create({
    data: {
      guestId: adminGuestId,
      nickname: '管理员',
      beans: 0,
      isAdmin: true,
    },
  })
  console.log('已创建管理员用户：', admin.id)
  console.log('提示：后台充值也可直接用 X-Admin-Key 头调用 /admin/recharge')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
