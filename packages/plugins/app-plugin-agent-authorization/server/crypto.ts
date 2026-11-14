import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function randomId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
}

export function randomSecret(): string {
  return randomBytes(32).toString('base64url');
}

export function secretsEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function hashClientSecret(secret: string): string {
  return sha256Hex(`agent-client-secret:${secret}`);
}

export function hashToken(token: string): string {
  return sha256Hex(`agent-token:${token}`);
}

export function hashAuthCode(code: string): string {
  return sha256Hex(`agent-auth-code:${code}`);
}

/** RFC 7636 S256: BASE64URL(SHA256(verifier)). */
export function pkceS256Challenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'utf8').digest('base64url');
}
