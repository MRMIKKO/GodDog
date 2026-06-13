/**
 * 环境配置 —— 集中读取并校验环境变量
 */

function required(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback
  if (v === undefined) {
    throw new Error(`缺少必需的环境变量：${key}`)
  }
  return v
}

function num(key: string, fallback: number): number {
  const v = process.env[key]
  if (v === undefined) return fallback
  const n = Number(v)
  if (Number.isNaN(n)) throw new Error(`环境变量 ${key} 不是合法数字`)
  return n
}

const isProd = process.env.NODE_ENV === 'production'

export const config = {
  isProd,
  port: num('PORT', 3000),
  host: process.env.HOST ?? '0.0.0.0',

  jwt: {
    accessSecret: new TextEncoder().encode(
      required('JWT_ACCESS_SECRET', isProd ? undefined : 'dev-access-secret-change-me'),
    ),
    refreshSecret: new TextEncoder().encode(
      required('JWT_REFRESH_SECRET', isProd ? undefined : 'dev-refresh-secret-change-me'),
    ),
    accessTtl: process.env.ACCESS_TOKEN_TTL ?? '15m',
    refreshTtlDays: num('REFRESH_TOKEN_TTL_DAYS', 7),
  },

  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  adminApiKey: required('ADMIN_API_KEY', isProd ? undefined : 'dev-admin-key-change-me'),

  signupBeans: num('SIGNUP_BEANS', 1000),
} as const
