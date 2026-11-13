import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** 128-bit ticket plaintext as URL-safe base64. */
export function randomTicketPlaintext(): string {
  return randomBytes(16).toString('base64url');
}

export function randomId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
}

export function secretsEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function hashServiceSecret(secret: string): string {
  return sha256Hex(`bui-service-secret:${secret}`);
}

export function hashTicket(ticket: string): string {
  return sha256Hex(`bui-ticket:${ticket}`);
}

export function hashState(state: string): string {
  return sha256Hex(`bui-oauth-state:${state}`);
}

export function hashRequest(payload: unknown): string {
  return sha256Hex(JSON.stringify(payload));
}
