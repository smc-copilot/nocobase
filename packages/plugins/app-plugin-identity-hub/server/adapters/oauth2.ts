import { hubError } from '../errors.js';
import {
  claimMappingFrom,
  extractIdentity,
  readClaim,
} from './claim-mapping.js';
import {
  assertMatchingState,
  capabilities,
  healthResult,
  notConfigured,
  readConfigString,
} from './support.js';
import type {
  AdapterDependencies,
  AuthenticationInput,
  IdentityProviderAdapter,
  OAuth2UserInfoClient,
  ProviderBinding,
  ProviderCapabilities,
  ProviderHealth,
  VerifiedIdentity,
} from './types.js';

export class OAuth2Adapter implements IdentityProviderAdapter {
  public readonly providerType = 'oauth2' as const;

  public constructor(
    private readonly provider: ProviderBinding,
    private readonly deps: AdapterDependencies = {},
  ) {}

  public capabilities(): ProviderCapabilities {
    return capabilities({ authenticate: true, userInfo: true });
  }

  public async healthCheck(): Promise<ProviderHealth> {
    const client = this.client();
    if (!client.health) throw notConfigured('OAuth2 userInfo health check');
    const result = await client.health();
    return healthResult(
      result.ok,
      this.deps.now ?? (() => new Date()),
      result.detail,
    );
  }

  public async authenticate(
    input: AuthenticationInput,
  ): Promise<VerifiedIdentity> {
    assertMatchingState(input);
    if (!input.code || !input.codeVerifier) {
      throw hubError(
        'INVALID_ARGUMENT',
        'IDENTITY_HUB_PKCE_REQUIRED',
        'OAuth2 authentication needs an authorization code and a PKCE verifier.',
      );
    }
    const stableIdField = this.stableIdField();
    if (!stableIdField)
      return this.refuse('The stable subject field is not configured.');
    const exchanged = await this.client().exchangeCode({
      code: input.code,
      codeVerifier: input.codeVerifier,
      redirectUri: input.redirectUri,
    });
    const profile = await this.client().fetchUserInfo(exchanged.accessToken);
    const subject = readClaim(profile, stableIdField);
    if (typeof subject !== 'string' || subject.trim() === '') {
      return this.refuse(
        'OAuth2 userInfo did not include the configured stable subject.',
      );
    }
    const stable = subject.trim();
    const issuer = this.provider.issuer ?? this.provider.providerId;
    return {
      providerId: this.provider.providerId,
      providerType: 'oauth2',
      issuer,
      subject: stable,
      externalId: stable,
      identityKey: stable,
      claims: extractIdentity(
        issuer,
        stable,
        profile,
        claimMappingFrom(this.provider.claimMapping),
      ),
    };
  }

  private client(): OAuth2UserInfoClient {
    if (!this.deps.oauth2) throw notConfigured('OAuth2 userInfo client');
    return this.deps.oauth2;
  }

  private stableIdField(): string | undefined {
    return (
      readConfigString(this.provider.endpoints, 'stableIdField') ??
      readConfigString(this.provider.syncPolicy, 'stableIdField') ??
      readConfigString(this.provider.claimMapping, 'stableId')
    );
  }

  private refuse(message: string): never {
    throw hubError('FAILED_PRECONDITION', 'STABLE_SUBJECT_REQUIRED', message, {
      decision: 'REFUSE_AUTO_PROVISION',
    });
  }
}
