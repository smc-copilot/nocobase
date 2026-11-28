import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { AdmissionPolicyService } from './admission.js';
import type { OutboxPublisher } from './outbox.js';
import type { AppRegistryService, MembershipService } from './services/apps.js';
import type { IdentityAuditLog } from './services/audit.js';
import type { ConflictQueue } from './services/conflicts.js';
import type { IdentityLinkService } from './services/identities.js';
import type { OrganizationService } from './services/organizations.js';
import type { PersonService } from './services/persons.js';
import type { ProviderRegistry } from './services/providers.js';

const namespace = '@nocobase/app-plugin-identity-hub';

export const personServiceToken: ServiceToken<PersonService> =
  createServiceToken<PersonService>(`${namespace}/person`);

export const identityLinkServiceToken: ServiceToken<IdentityLinkService> =
  createServiceToken<IdentityLinkService>(`${namespace}/identity-link`);

export const providerRegistryToken: ServiceToken<ProviderRegistry> =
  createServiceToken<ProviderRegistry>(`${namespace}/providers`);

export const organizationServiceToken: ServiceToken<OrganizationService> =
  createServiceToken<OrganizationService>(`${namespace}/organization`);

export const appRegistryServiceToken: ServiceToken<AppRegistryService> =
  createServiceToken<AppRegistryService>(`${namespace}/apps`);

export const membershipServiceToken: ServiceToken<MembershipService> =
  createServiceToken<MembershipService>(`${namespace}/membership`);

export const identityAuditLogToken: ServiceToken<IdentityAuditLog> =
  createServiceToken<IdentityAuditLog>(`${namespace}/audit`);

export const conflictQueueToken: ServiceToken<ConflictQueue> =
  createServiceToken<ConflictQueue>(`${namespace}/conflicts`);

export const admissionPolicyToken: ServiceToken<AdmissionPolicyService> =
  createServiceToken<AdmissionPolicyService>(`${namespace}/admission`);

export const outboxPublisherToken: ServiceToken<OutboxPublisher> =
  createServiceToken<OutboxPublisher>(`${namespace}/outbox`);
