import { AdmissionPolicyService } from '../admission.js';
import type { HubRuntime } from '../runtime.js';
import { AppRegistryService, MembershipService } from './apps.js';
import { IdentityAuditLog } from './audit.js';
import { ConflictQueue } from './conflicts.js';
import { IdentityLinkService } from './identities.js';
import { OrganizationService } from './organizations.js';
import { PersonService } from './persons.js';
import { ProviderRegistry } from './providers.js';

export interface IdentityHubServices {
  readonly runtime: HubRuntime;
  readonly audit: IdentityAuditLog;
  readonly conflicts: ConflictQueue;
  readonly persons: PersonService;
  readonly identities: IdentityLinkService;
  readonly providers: ProviderRegistry;
  readonly organizations: OrganizationService;
  readonly apps: AppRegistryService;
  readonly memberships: MembershipService;
  readonly admission: AdmissionPolicyService;
}

export function createIdentityHubServices(
  runtime: HubRuntime,
): IdentityHubServices {
  const audit = new IdentityAuditLog(runtime);
  const conflicts = new ConflictQueue(runtime, audit);
  const persons = new PersonService(runtime, audit, conflicts);
  const providers = new ProviderRegistry(runtime, audit);
  const organizations = new OrganizationService(runtime, audit);
  const apps = new AppRegistryService(runtime, audit);
  const memberships = new MembershipService(runtime, audit, persons, apps);
  const identities = new IdentityLinkService(runtime, audit, persons);
  const admission = new AdmissionPolicyService();
  return {
    runtime,
    audit,
    conflicts,
    persons,
    identities,
    providers,
    organizations,
    apps,
    memberships,
    admission,
  };
}
