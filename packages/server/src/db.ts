/**
 * Prisma 客户端单例
 */

import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient()

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect()
}
