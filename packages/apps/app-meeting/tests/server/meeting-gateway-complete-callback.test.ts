import { describe, expect, it } from 'vitest';
import { GatewayCompleteBody } from '../../server/routes/schemas.js';

describe('GatewayCompleteBody callback payload', () => {
  it('accepts state-only completion bodies', () => {
    expect(GatewayCompleteBody.parse({ state: 'flow-1' })).toEqual({
      state: 'flow-1',
    });
  });

  it('accepts a complete continue_to callback payload', () => {
    const body = GatewayCompleteBody.parse({
      state: 'flow-1',
      accessToken: 'mt_token_value',
      tokenType: 'Bearer',
      expiresIn: 899,
      connectionId: '02bd3c85-ae8d-4a05-b24b-4cffecdb6c7b',
      memberId: '6c1e5490-b111-423d-baa9-f8ab840d4e07',
      status: 'ACTIVE',
    });
    expect(body.accessToken).toBe('mt_token_value');
    expect(body.status).toBe('ACTIVE');
  });

  it('rejects a partial callback payload', () => {
    expect(() =>
      GatewayCompleteBody.parse({
        state: 'flow-1',
        accessToken: 'mt_token_value',
      }),
    ).toThrow();
  });
});
