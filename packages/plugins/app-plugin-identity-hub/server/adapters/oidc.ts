import { ApiError } from '@nocobase/app-server/router';
import {
  createLocalJWKSet,
  decodeProtectedHeader,
  errors,
  jwtVerify,
  type JSONWebKeySet,
  type JWTVerifyGetKey,
} from 'jose';

import { hubError } from '../errors.js';
import { claimMappingFrom, extractIdentity } from './claim-mapping.js';
import {
  assertMatchingState,
  capabilities,
  healthResult,
  notConfigured,
  oidcIdentityKey,
  readConfigString,
} from './support.js';
import type {
  AdapterDependencies,
  AuthenticationInput,
  IdentityProviderAdapter,
  IdentityResolveInput,
  OidcClient,
  OidcVerifyChecks,
  ProviderBinding,
  ProviderCapabilities,
  ProviderHealth,
  VerifiedIdentity,
  VerifiedIdToken,
} from './types.js';

export interface VerifyIdTokenOptions extends OidcVerifyChecks {
  readonly getKey: JWTVerifyGetKey;
}

/**
 * Verifies an OIDC ID token. `getKey` is injected so tests can pass a known key.
 * `alg=none` and unsigned tokens are rejected before the signature check.
 */
export async function verifyIdToken(
  token: string,
  options: VerifyIdTokenOptions,
): Promise<VerifiedIdToken> {
  let header: { alg?: string };
  try {
    header = decodeProtectedHeader(token);
  } catch {
    throw oidcError(
      'IDENTITY_HUB_OIDC_TOKEN_MALFORMED',
      'The ID token could not be read.',
    );
  }
  if (!header.alg || header.alg.toLowerCase() === 'none') {
    throw oidcError(
      'IDENTITY_HUB_OIDC_TOKEN_UNSIGNED',
      'Unsigned ID tokens are rejected.',
    );
  }
  try {
    const { payload } = await jwtVerify(token, options.getKey, {
      issuer: options.issuer,
      audience: options.audience,
    });
    if (typeof payload.sub !== 'string' || payload.sub.trim() === '') {
      throw oidcError(
        'IDENTITY_HUB_OIDC_SUBJECT_REQUIRED',
        'The ID token needs a subject.',
      );
    }
    if (options.nonce !== undefined && payload.nonce !== options.nonce) {
      throw oidcError(
        'IDENTITY_HUB_OIDC_NONCE_MISMATCH',
        'The ID token nonce does not match.',
      );
    }
    const iss = typeof payload.iss === 'string' ? payload.iss : options.issuer;
    return {
      iss,
      sub: payload.sub,
      claims: payload,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof errors.JWTClaimValidationFailed) {
      if (error.claim === 'iss') {
        throw oidcError(
          'IDENTITY_HUB_OIDC_ISSUER_MISMATCH',
          'The ID token issuer does not match the provider.',
        );
      }
      if (error.claim === 'aud') {
        throw oidcError(
          'IDENTITY_HUB_OIDC_AUDIENCE_MISMATCH',
          'The ID token audience does not match the provider.',
        );
      }
      if (error.claim === 'exp' || error.claim === 'nbf') {
        throw oidcError(
          'IDENTITY_HUB_OIDC_TOKEN_EXPIRED',
          'The ID token is not currently valid.',
        );
      }
    }
    throw oidcError(
      'IDENTITY_HUB_OIDC_TOKEN_REJECTED',
      'The ID token was rejected.',
    );
  }
}

export class OidcAdapter implements IdentityProviderAdapter {
  public readonly providerType = 'oidc' as const;

  public constructor(
    private readonly provider: ProviderBinding,
    private readonly deps: AdapterDependencies = {},
  ) {}

  public capabilities(): ProviderCapabilities {
    return capabilities({
      authenticate: true,
      resolveIdentity: true,
      userInfo: true,
    });
  }

  public async healthCheck(): Promise<ProviderHealth> {
    const client = this.deps.oidc;
    if (!client) throw notConfigured('OIDC client');
    if (client.fetchDiscovery) {
      await client.fetchDiscovery();
      return healthResult(true, this.now, 'discovery');
    }
    await client.fetchJwks();
    return healthResult(true, this.now, 'jwks');
  }

  public async authenticate(
    input: AuthenticationInput,
  ): Promise<VerifiedIdentity> {
    assertMatchingState(input);
    if (!input.code) {
      throw hubError(
        'INVALID_ARGUMENT',
        'IDENTITY_HUB_OIDC_CODE_REQUIRED',
        'OIDC authentication needs an authorization code.',
      );
    }
    const exchanged = await this.client().exchangeCode({
      code: input.code,
      codeVerifier: input.codeVerifier,
      redirectUri: input.redirectUri,
    });
    return this.identityFromToken(exchanged.idToken, input.nonce);
  }

  public async resolveIdentity(
    input: IdentityResolveInput,
  ): Promise<VerifiedIdentity> {
    if (!input.idToken) {
      throw hubError(
        'INVALID_ARGUMENT',
        'IDENTITY_HUB_OIDC_TOKEN_REQUIRED',
        'OIDC identity resolution needs an ID token.',
      );
    }
    return this.identityFromToken(input.idToken, input.nonce);
  }

  private get now(): () => Date {
    return this.deps.now ?? (() => new Date());
  }

  private client(): OidcClient {
    if (!this.deps.oidc) throw notConfigured('OIDC client');
    return this.deps.oidc;
  }

  private expectedIssuer(): string {
    const issuer = this.provider.issuer?.trim();
    if (!issuer) {
      throw hubError(
        'FAILED_PRECONDITION',
        'IDENTITY_HUB_OIDC_ISSUER_REQUIRED',
        'The OIDC provider needs an issuer.',
      );
    }
    return issuer;
  }

  private expectedAudience(): string {
    const audience =
      readConfigString(this.provider.endpoints, 'audience') ??
      readConfigString(this.provider.endpoints, 'clientId');
    if (!audience) {
      throw hubError(
        'FAILED_PRECONDITION',
        'IDENTITY_HUB_OIDC_AUDIENCE_REQUIRED',
        'The OIDC provider needs an audience.',
      );
    }
    return audience;
  }

  private async identityFromToken(
    token: string,
    nonce?: string,
  ): Promise<VerifiedIdentity> {
    const checks = {
      issuer: this.expectedIssuer(),
      audience: this.expectedAudience(),
      ...(nonce !== undefined ? { nonce } : {}),
    };
    const verified = this.deps.oidcVerifier
      ? await this.deps.oidcVerifier.verifyIdToken(token, checks)
      : await verifyIdToken(token, {
          ...checks,
          getKey: await this.jwksKey(),
        });
    return this.toIdentity(verified);
  }

  private async jwksKey(): Promise<JWTVerifyGetKey> {
    const jwks = await this.client().fetchJwks();
    return createLocalJWKSet({ keys: [...jwks.keys] } as JSONWebKeySet);
  }

  private toIdentity(verified: VerifiedIdToken): VerifiedIdentity {
    const claims = extractIdentity(
      verified.iss,
      verified.sub,
      verified.claims,
      claimMappingFrom(this.provider.claimMapping),
    );
    return {
      providerId: this.provider.providerId,
      providerType: 'oidc',
      issuer: verified.iss,
      subject: verified.sub,
      externalId: verified.sub,
      identityKey: oidcIdentityKey(verified.iss, verified.sub),
      claims,
    };
  }
}

function oidcError(reason: string, message: string): ApiError {
  return hubError('UNAUTHENTICATED', reason, message);
}
