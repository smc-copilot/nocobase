export type NamedCookieRead =
  | { readonly kind: 'missing' }
  | { readonly kind: 'ambiguous' }
  | { readonly kind: 'ok'; readonly value: string };

/**
 * Reads a single named cookie from a Cookie request header.
 * Multiple distinct values for the same name are ambiguous (PRD §7).
 */
export function readNamedCookie(
  cookieHeader: string | null | undefined,
  name: string,
): NamedCookieRead {
  if (!cookieHeader || !name) return { kind: 'missing' };
  const values: string[] = [];
  for (const part of cookieHeader.split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    if (key !== name) continue;
    values.push(part.slice(index + 1).trim());
  }
  if (values.length === 0) return { kind: 'missing' };
  const unique = [...new Set(values)];
  if (unique.length !== 1 || !unique[0]) return { kind: 'ambiguous' };
  return { kind: 'ok', value: unique[0] };
}
