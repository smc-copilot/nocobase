import type { IdentityDirectory } from '../directory.js';
import { IdentityAuditLog } from '../services/audit.js';
import { IdentityProviderService } from '../services/identity-providers.js';
import { IdentityProvisioningService } from '../services/identity-provisioning.js';
import { IdentitySyncService } from '../services/identity-sync.js';
import { PermissionMappingService } from '../services/permission-mapping.js';
import { SubjectBindingService } from '../services/subject-bindings.js';
import type { IdentityRuntime } from './model.js';

/** The identity administration services, composed once per application. */
export interface IdentityServices {
  readonly audit: IdentityAuditLog;
  readonly providers: IdentityProviderService;
  readonly mapping: PermissionMappingService;
  readonly provisioning: IdentityProvisioningService;
  readonly sync: IdentitySyncService;
  readonly bindings: SubjectBindingService;
}

export function createIdentityServices(
  runtime: IdentityRuntime,
  directory: () => IdentityDirectory | undefined,
): IdentityServices {
  const audit = new IdentityAuditLog(runtime);
  const providers = new IdentityProviderService(runtime, audit);
  const mapping = new PermissionMappingService(runtime, audit);
  return {
    audit,
    providers,
    mapping,
    provisioning: new IdentityProvisioningService(
      runtime,
      providers,
      mapping,
      audit,
    ),
    sync: new IdentitySyncService(
      runtime,
      providers,
      mapping,
      audit,
      directory,
    ),
    bindings: new SubjectBindingService(runtime, audit),
  };
}
