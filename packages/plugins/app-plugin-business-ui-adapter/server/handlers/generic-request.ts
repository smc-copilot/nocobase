import { ProtocolError } from '../errors.js';

export interface GenericRequestFields {
  title: string;
  description: string;
  quantity: number;
}

const WRITABLE = new Set(['title', 'description', 'quantity']);

export function parseGenericRequestFields(
  input: Record<string, unknown>,
): GenericRequestFields {
  const unknown = Object.keys(input).filter((key) => !WRITABLE.has(key));
  if (unknown.length > 0) {
    throw new ProtocolError(
      'INVALID_ARGUMENT',
      400,
      `Unknown or read-only fields: ${unknown.join(', ')}`,
    );
  }

  const title = input.title;
  const description = input.description ?? '';
  const quantity = input.quantity;

  if (
    typeof title !== 'string' ||
    title.trim().length === 0 ||
    title.length > 512
  ) {
    throw new ProtocolError(
      'INVALID_ARGUMENT',
      400,
      'title must be a non-empty string up to 512 characters',
    );
  }
  if (typeof description !== 'string' || description.length > 4000) {
    throw new ProtocolError(
      'INVALID_ARGUMENT',
      400,
      'description must be a string up to 4000 characters',
    );
  }
  if (
    typeof quantity !== 'number' ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 1_000_000
  ) {
    throw new ProtocolError(
      'INVALID_ARGUMENT',
      400,
      'quantity must be an integer between 1 and 1000000',
    );
  }

  return { title: title.trim(), description, quantity };
}
