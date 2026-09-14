import { SignJWT, jwtVerify } from 'jose'

function secret(): Uint8Array {
  const raw = process.env.JWT_SECRET || 'dev-only-change-me'
  return new TextEncoder().encode(raw)
}

export async function signAccessToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret())
}

export async function verifyAccessToken(token: string): Promise<{ userId: string; email: string }> {
  const { payload } = await jwtVerify(token, secret())
  if (!payload.sub || typeof payload.email !== 'string') {
    throw new Error('Invalid token')
  }
  return { userId: payload.sub, email: payload.email }
}
