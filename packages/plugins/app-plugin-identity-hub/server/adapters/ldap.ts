import { hubError } from '../errors.js';
import { claimMappingFrom, extractIdentity } from './claim-mapping.js';
import {
  capabilities,
  firstString,
  healthResult,
  ldapStableId,
  notConfigured,
} from './support.js';
import type {
  AdapterDependencies,
  AuthenticationInput,
  DirectoryUser,
  IdentityDirectoryConnector,
  IdentityProviderAdapter,
  IdentityResolveInput,
  LdapClient,
  LdapDirectoryEntry,
  ProviderBinding,
  ProviderCapabilities,
  ProviderHealth,
  VerifiedIdentity,
} from './types.js';

export class LdapAdapter implements IdentityProviderAdapter {
  public readonly providerType = 'ldap' as const;

  public constructor(
    private readonly provider: ProviderBinding,
    private readonly deps: AdapterDependencies = {},
  ) {}

  public capabilities(): ProviderCapabilities {
    return capabilities({
      authenticate: true,
      resolveIdentity: true,
      directoryRead: true,
    });
  }

  public async healthCheck(): Promise<ProviderHealth> {
    const result = await this.client().health();
    return healthResult(
      result.ok,
      this.deps.now ?? (() => new Date()),
      result.detail,
    );
  }

  public async authenticate(
    input: AuthenticationInput,
  ): Promise<VerifiedIdentity> {
    const dn = input.dn?.trim();
    const password = input.password;
    if (!dn || !password) {
      throw hubError(
        'INVALID_ARGUMENT',
        'IDENTITY_HUB_LDAP_BIND_REQUIRED',
        'LDAP authentication needs a bind DN and password.',
      );
    }
    const client = this.client();
    if (!client.bind) {
      throw notConfigured('LDAP bind');
    }
    const entry = await client.bind({ dn, password });
    if (!entry) {
      throw hubError(
        'UNAUTHENTICATED',
        'IDENTITY_HUB_LDAP_BIND_FAILED',
        'LDAP bind was rejected.',
      );
    }
    return this.identityFromEntry(entry);
  }

  public resolveIdentity(
    input: IdentityResolveInput,
  ): Promise<VerifiedIdentity> {
    const attributes = input.attributes ?? {};
    const dn = firstString(attributes.dn, input.externalUsername);
    return Promise.resolve(
      this.identityFromEntry({
        dn: dn ?? '',
        objectGUID: firstString(attributes.objectGUID, attributes.objectGuid),
        entryUUID: firstString(attributes.entryUUID, attributes.entryUuid),
        attributes,
      }),
    );
  }

  public directory(): IdentityDirectoryConnector | undefined {
    if (!this.deps.ldap) return undefined;
    const client = this.deps.ldap;
    return {
      listUsers: async (page) => {
        const result = await client.searchUsers(page);
        return {
          items: result.items.map((entry) => this.toDirectoryUser(entry)),
          nextCursor: result.nextCursor ?? null,
        };
      },
    };
  }

  private client(): LdapClient {
    if (!this.deps.ldap) throw notConfigured('LDAP client');
    return this.deps.ldap;
  }

  private toDirectoryUser(entry: LdapDirectoryEntry): DirectoryUser {
    const attributes: Record<string, unknown> = {
      ...(entry.attributes ?? {}),
      dn: entry.dn,
      ...(entry.objectGUID ? { objectGUID: entry.objectGUID } : {}),
      ...(entry.entryUUID ? { entryUUID: entry.entryUUID } : {}),
    };
    const stable = ldapStableId(attributes, entry.dn) ?? '';
    const displayName = firstString(attributes.displayName, attributes.cn);
    const email = firstString(attributes.mail, attributes.email);
    const employeeNo = firstString(
      attributes.employeeNumber,
      attributes.employeeNo,
    );
    return {
      externalId: stable,
      identityKey: stable,
      externalUsername: entry.dn,
      ...(displayName ? { displayName } : {}),
      ...(email ? { email } : {}),
      ...(employeeNo ? { employeeNo } : {}),
      dn: entry.dn,
      attributes,
    };
  }

  private identityFromEntry(entry: LdapDirectoryEntry): VerifiedIdentity {
    const user = this.toDirectoryUser(entry);
    if (!user.identityKey) {
      throw hubError(
        'FAILED_PRECONDITION',
        'IDENTITY_HUB_LDAP_STABLE_ID_REQUIRED',
        'LDAP identity requires objectGUID or entryUUID, not a distinguished name.',
      );
    }
    const issuer = this.provider.issuer ?? this.provider.providerId;
    return {
      providerId: this.provider.providerId,
      providerType: 'ldap',
      issuer,
      subject: user.identityKey,
      externalId: user.identityKey,
      externalUsername: user.externalUsername,
      identityKey: user.identityKey,
      claims: extractIdentity(
        issuer,
        user.identityKey,
        user.attributes,
        claimMappingFrom(this.provider.claimMapping),
      ),
    };
  }
}
