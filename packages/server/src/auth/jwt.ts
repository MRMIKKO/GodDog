/**
 * JWT 令牌签发与校验 —— 使用 jose（ESM 友好）
 * access token 短期（15min），refresh token 长期（7天）。
 */

import { SignJWT, jwtVerify } from 'jose'
import { config } from '../config.js'

export interface AccessPayload {
  sub: string // userId
  guestId: string
  isAdmin: boolean
}

export interface RefreshPayload {
  sub: string // userId
  /** 令牌族 id，用于刷新轮换 */
  jti: string
}

export async function signAccessToken(payload: AccessPayload): Promise<string> {
  return new SignJWT({ guestId: payload.guestId, isAdmin: payload.isAdmin })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(config.jwt.accessTtl)
    .sign(config.jwt.accessSecret)
}

export async function signRefreshToken(payload: RefreshPayload): Promise<string> {
  return new SignJWT({ jti: payload.jti })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${config.jwt.refreshTtlDays}d`)
    .sign(config.jwt.refreshSecret)
}

export async function verifyAccessToken(token: string): Promise<AccessPayload> {
  const { payload } = await jwtVerify(token, config.jwt.accessSecret)
  return {
    sub: payload.sub as string,
    guestId: payload.guestId as string,
    isAdmin: Boolean(payload.isAdmin),
  }
}

export async function verifyRefreshToken(token: string): Promise<RefreshPayload> {
  const { payload } = await jwtVerify(token, config.jwt.refreshSecret)
  return { sub: payload.sub as string, jti: payload.jti as string }
}
