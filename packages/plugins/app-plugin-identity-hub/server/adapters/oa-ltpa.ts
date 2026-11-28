import { hubError } from '../errors.js';
import { claimMappingFrom, extractIdentity } from './claim-mapping.js';
import { capabilities, healthResult, notConfigured } from './support.js';
import type {
  AdapterDependencies,
  IdentityProviderAdapter,
  IdentityResolveInput,
  OaLtpaVerifier,
  ProviderBinding,
  ProviderCapabilities,
  ProviderHealth,
  VerifiedIdentity,
} from './types.js';

/**
 * Resolves a person only after `OaLtpaVerifier` accepts the token.
 * A raw employee number from a header is not an identity.
 */
export class OaLtpaAdapter implements IdentityProviderAdapter {
  public readonly providerType = 'oa-ltpa' as const;

  public constructor(
    private readonly provider: ProviderBinding,
    private readonly deps: AdapterDependencies = {},
  ) {}

  public capabilities(): ProviderCapabilities {
    return capabilities({ resolveIdentity: true });
  }

  public healthCheck(): Promise<ProviderHealth> {
    if (!this.deps.oa) throw notConfigured('OA LTPA verifier');
    return Promise.resolve(
      healthResult(true, this.deps.now ?? (() => new Date()), 'oa-ltpa'),
    );
  }

  public async resolveIdentity(
    input: IdentityResolveInput,
  ): Promise<VerifiedIdentity> {
    const verified = await this.verifier().verify({
      ltpaToken: input.ltpaToken,
    });
    const employeeNo = verified?.employeeNo.trim();
    if (!employeeNo) {
      throw hubError(
        'UNAUTHENTICATED',
        'IDENTITY_HUB_OA_UNVERIFIED',
        'OA LTPA did not verify an employee number.',
      );
    }
    const issuer = this.provider.issuer ?? this.provider.providerId;
    const attributes = {
      employeeNo,
      providerId: this.provider.providerId,
    };
    return {
      providerId: this.provider.providerId,
      providerType: 'oa-ltpa',
      issuer,
      subject: employeeNo,
      externalId: employeeNo,
      identityKey: `${this.provider.providerId}|${employeeNo}`,
      claims: extractIdentity(
        issuer,
        employeeNo,
        attributes,
        claimMappingFrom(this.provider.claimMapping),
      ),
    };
  }

  private verifier(): OaLtpaVerifier {
    if (!this.deps.oa) throw notConfigured('OA LTPA verifier');
    return this.deps.oa;
  }
}
