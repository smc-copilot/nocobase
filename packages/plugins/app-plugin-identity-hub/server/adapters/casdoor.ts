import { hubError } from '../errors.js';
import { claimMappingFrom, extractIdentity } from './claim-mapping.js';
import {
  capabilities,
  firstString,
  healthResult,
  notConfigured,
  oidcIdentityKey,
} from './support.js';
import type {
  AdapterDependencies,
  CasdoorDirectoryClient,
  DirectoryPage,
  DirectoryUser,
  IdentityDirectoryConnector,
  IdentityProviderAdapter,
  IdentityResolveInput,
  ProviderBinding,
  ProviderCapabilities,
  ProviderHealth,
  VerifiedIdentity,
} from './types.js';

/**
 * Hub-local Casdoor adapter. It does not import `@nocobase/app-plugin-casdoor-identity`.
 * Unregistering this type, or disabling the provider row, leaves other providers usable.
 */
export class CasdoorAdapter implements IdentityProviderAdapter {
  public readonly providerType = 'casdoor' as const;

  public constructor(
    private readonly provider: ProviderBinding,
    private readonly deps: AdapterDependencies = {},
  ) {}

  public capabilities(): ProviderCapabilities {
    return capabilities({ resolveIdentity: true, directoryRead: true });
  }

  public async healthCheck(): Promise<ProviderHealth> {
    const client = this.client();
    if (!client.health) {
      return healthResult(true, this.now, 'casdoor client configured');
    }
    const result = await client.health();
    return healthResult(result.ok, this.now, result.detail);
  }

  public resolveIdentity(
    input: IdentityResolveInput,
  ): Promise<VerifiedIdentity> {
    const attributes = input.attributes ?? {};
    const issuer = input.issuer?.trim() || this.provider.issuer?.trim();
    const subject =
      input.subject?.trim() || firstString(attributes.sub, attributes.id);
    if (!issuer || !subject) {
      throw hubError(
        'INVALID_ARGUMENT',
        'IDENTITY_HUB_CASDOOR_SUBJECT_REQUIRED',
        'Casdoor identity resolution needs an issuer and subject from verified claims.',
      );
    }
    return Promise.resolve(this.toIdentity(issuer, subject, attributes));
  }

  public directory(): IdentityDirectoryConnector | undefined {
    const client = this.deps.casdoor;
    if (!client) return undefined;
    return {
      listUsers: (page) => this.listUsers(client, page),
    };
  }

  private get now(): () => Date {
    return this.deps.now ?? (() => new Date());
  }

  private client(): CasdoorDirectoryClient {
    if (!this.deps.casdoor) throw notConfigured('Casdoor directory client');
    return this.deps.casdoor;
  }

  private async listUsers(
    client: CasdoorDirectoryClient,
    page: Parameters<CasdoorDirectoryClient['listUsers']>[0],
  ): Promise<DirectoryPage<DirectoryUser>> {
    const issuer = this.provider.issuer?.trim();
    if (!issuer) {
      throw hubError(
        'FAILED_PRECONDITION',
        'IDENTITY_HUB_CASDOOR_ISSUER_REQUIRED',
        'The Casdoor provider needs an issuer.',
      );
    }
    const result = await client.listUsers(page);
    return {
      items: result.items.map((user) => {
        const identity = this.toIdentity(issuer, user.subject, {
          ...(user.attributes ?? {}),
          ...(user.name ? { displayName: user.name, name: user.name } : {}),
          ...(user.email ? { email: user.email } : {}),
          ...(user.owner ? { owner: user.owner } : {}),
          ...(user.employeeNo ? { employeeNo: user.employeeNo } : {}),
          sub: user.subject,
        });
        return {
          externalId: user.subject,
          identityKey: identity.identityKey,
          ...(user.name ? { displayName: user.name } : {}),
          ...(user.email ? { email: user.email } : {}),
          ...(user.employeeNo ? { employeeNo: user.employeeNo } : {}),
          externalUsername: user.name,
          attributes: identity.claims.attributes,
        };
      }),
      nextCursor: result.nextCursor ?? null,
    };
  }

  private toIdentity(
    issuer: string,
    subject: string,
    attributes: Readonly<Record<string, unknown>>,
  ): VerifiedIdentity {
    return {
      providerId: this.provider.providerId,
      providerType: 'casdoor',
      issuer,
      subject,
      externalId: subject,
      identityKey: oidcIdentityKey(issuer, subject),
      claims: extractIdentity(
        issuer,
        subject,
        attributes,
        claimMappingFrom(this.provider.claimMapping),
      ),
    };
  }
}
