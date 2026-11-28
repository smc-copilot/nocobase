import { hubError } from '../errors.js';
import { claimMappingFrom, extractIdentity } from './claim-mapping.js';
import { capabilities, healthResult } from './support.js';
import type {
  AdapterDependencies,
  IdentityProviderAdapter,
  IdentityResolveInput,
  ProviderBinding,
  ProviderCapabilities,
  ProviderHealth,
  VerifiedIdentity,
} from './types.js';

export class ManualAdapter implements IdentityProviderAdapter {
  public readonly providerType = 'manual' as const;

  public constructor(
    private readonly provider: ProviderBinding,
    private readonly deps: AdapterDependencies = {},
  ) {}

  public capabilities(): ProviderCapabilities {
    return capabilities({ resolveIdentity: true });
  }

  public healthCheck(): Promise<ProviderHealth> {
    return Promise.resolve(
      healthResult(true, this.deps.now ?? (() => new Date()), 'manual'),
    );
  }

  public resolveIdentity(
    input: IdentityResolveInput,
  ): Promise<VerifiedIdentity> {
    const manualAccountId = input.manualAccountId?.trim();
    if (!manualAccountId) {
      throw hubError(
        'INVALID_ARGUMENT',
        'IDENTITY_HUB_MANUAL_ACCOUNT_REQUIRED',
        'A manual identity needs a manual account id.',
      );
    }
    const attributes = {
      ...(input.attributes ?? {}),
      manualAccountId,
    };
    return Promise.resolve({
      providerId: this.provider.providerId,
      providerType: 'manual',
      ...(this.provider.issuer ? { issuer: this.provider.issuer } : {}),
      subject: manualAccountId,
      externalId: manualAccountId,
      ...(input.externalUsername
        ? { externalUsername: input.externalUsername }
        : {}),
      identityKey: manualAccountId,
      claims: extractIdentity(
        this.provider.issuer ?? this.provider.providerId,
        manualAccountId,
        attributes,
        claimMappingFrom(this.provider.claimMapping),
      ),
    });
  }
}
