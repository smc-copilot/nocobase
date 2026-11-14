import type { Auth } from '@nocobase/app-plugin-authentication/server';
import type { SecretsService } from '@nocobase/app-server/secrets';
import type { DatabaseManager } from '@nocobase/db';

import {
  DOCUMENT_TYPE,
  FORM_REFS,
  HANDLER_WHITELIST,
  OAUTH_CODE_TTL_SECONDS,
  PROTOCOL,
  SERVICE_NAME,
  TICKET_TTL_SECONDS,
  EMBED_TTL_SECONDS,
  type BusinessUiAdapterConfig,
} from '../config.js';
import {
  hashRequest,
  hashServiceSecret,
  hashState,
  hashTicket,
  randomId,
  randomTicketPlaintext,
  secretsEqual,
} from '../crypto.js';

/** Purpose bound into sealed OAuth authorization codes (FIX-05). */
const OAUTH_CODE_SEAL_PURPOSE =
  '@nocobase/app-plugin-business-ui-adapter/oauth-code';

/** Legacy SHA-256 digests cannot be opened; consume must refuse them and require re-auth. */
function looksLikeLegacyCodeDigest(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}
import { serializeReceipt, type DualNamedReceipt } from '../dto.js';
import { ProtocolError } from '../errors.js';
import {
  denyWithoutPermissionRef,
  type BusinessAccessChecker,
  type BusinessAction,
} from '../business-access.js';
import { parseGenericRequestFields } from '../handlers/generic-request.js';

type ConnectionRow = {
  id: string;
  connectionId: string;
  octopIssuer: string;
  allowedOrigins: unknown;
  serviceSecretHash: string;
  enabled: boolean;
};

type FormRow = {
  id: string;
  formRef: string;
  schemaVersion: string;
  mode: string;
  handlerKey: string;
  permissionRef: string | null;
  documentType: string;
  enabled: boolean;
};

type BindingRow = {
  id: string;
  connectionId: string;
  octopSubject: string;
  localUserId: string;
  externalIdentityId: string;
  status: string;
  revision: number;
};

function asRevisionText(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'string') {
    return value;
  }
  return '';
}

function errorReason(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('reason' in error)) {
    return undefined;
  }
  const reason = Reflect.get(error, 'reason');
  return typeof reason === 'string' ? reason : undefined;
}

function toBindingRow(row: object): BindingRow {
  const record = row as Record<string, unknown>;
  return {
    id: String(record.id),
    connectionId: String(record.connectionId),
    octopSubject: String(record.octopSubject),
    localUserId: String(record.localUserId),
    externalIdentityId: String(record.externalIdentityId),
    status: String(record.status),
    revision: Number(record.revision ?? 1),
  };
}

export interface ProtocolServices {
  handshake(
    connectionId: string,
    authorization: string | undefined,
    body: {
      protocol?: string;
      destructive?: boolean;
      instance_issuer?: string;
    },
  ): Promise<Record<string, unknown>>;
  oauthCallback(
    connectionId: string,
    query: { code?: string; state?: string },
  ): Promise<{ ok: true }>;
  oauthConsume(
    connectionId: string,
    authorization: string | undefined,
    body: { state?: string },
  ): Promise<Record<string, unknown>>;
  issueTicket(
    connectionId: string,
    userId: string,
    body: {
      form_ref?: string;
      formRef?: string;
      schema_version?: string;
      schemaVersion?: string;
      interaction_id?: string;
      interactionId?: string;
      record_id?: string;
      recordId?: string;
      subject_sub?: string;
      subjectSub?: string;
      /** Nested subject as Octop sends it (preferred over flat subject_sub). */
      subject?: { issuer?: string; sub?: string };
      nonce?: string;
      action?: string;
      connection_id?: string;
      connectionId?: string;
    },
  ): Promise<Record<string, unknown>>;
  redeemTicket(
    connectionId: string,
    body: { ticket?: string; nonce?: string },
    request: Request,
  ): Promise<{
    html: string;
    setCookies: string[];
    /** Approved Octop origins for CSP frame-ancestors. */
    frameAncestors: readonly string[];
  }>;
  saveDocument(
    connectionId: string,
    userId: string,
    sessionRef: string,
    body: Record<string, unknown>,
  ): Promise<DualNamedReceipt>;
  submitDocument(
    connectionId: string,
    userId: string,
    sessionRef: string,
    body: Record<string, unknown>,
  ): Promise<DualNamedReceipt>;
  getInteraction(
    connectionId: string,
    userId: string,
    interactionId: string,
  ): Promise<Record<string, unknown>>;
  queryOperation(
    connectionId: string,
    userId: string,
    operationId: string,
  ): Promise<Record<string, unknown>>;
  retryOperation(
    connectionId: string,
    userId: string,
    operationId: string,
  ): Promise<Record<string, unknown>>;
  upsertConnection(input: {
    connectionId: string;
    octopIssuer: string;
    allowedOrigins: string[];
    serviceSecret: string;
    enabled?: boolean;
  }): Promise<ConnectionRow>;
  upsertForm(input: {
    formRef: string;
    schemaVersion: string;
    mode: 'edit' | 'detail';
    handlerKey: string;
    documentType?: string;
    permissionRef?: string | null;
    enabled?: boolean;
  }): Promise<FormRow>;
  listForms(): Promise<readonly FormRow[]>;
  reconcileUnknownOperations(): Promise<number>;
}

function now(): Date {
  return new Date();
}

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

export function createProtocolServices(deps: {
  database: () => DatabaseManager;
  auth: () => Auth;
  config: () => BusinessUiAdapterConfig;
  /** Application secrets for sealing OAuth codes; required when consuming codes. */
  secrets?: () => SecretsService | undefined;
  /**
   * Business document authorization. Defaults to deny-all so a local identity /
   * active binding alone never grants document actions (FIX-08 / NEXT-01).
   */
  authorizeBusiness?: BusinessAccessChecker;
  /**
   * NEXT-05 / N22: fail closed when a directory-authoritative identity has a
   * stale or missing attribute snapshot. Called on issue/save/submit/retry.
   */
  assertIdentityFresh?: (userId: string) => Promise<void>;
}): ProtocolServices {
  const db = () => deps.database().connection().query;
  const authorizeBusiness = deps.authorizeBusiness ?? denyWithoutPermissionRef;

  async function assertIdentityFresh(userId: string): Promise<void> {
    if (!deps.assertIdentityFresh) return;
    try {
      await deps.assertIdentityFresh(userId);
    } catch (error) {
      if (errorReason(error) === 'DIRECTORY_SNAPSHOT_STALE') {
        throw new ProtocolError(
          'PERMISSION_DENIED',
          403,
          'Directory attribute snapshot is stale; sync identity before continuing',
        );
      }
      throw error;
    }
  }

  async function assertBusinessAccess(
    userId: string,
    permissionRef: string | null | undefined,
    action: BusinessAction,
    recordId?: string | null,
  ): Promise<void> {
    const allowed = await authorizeBusiness({
      userId,
      permissionRef,
      action,
      recordId,
    });
    if (!allowed) {
      throw new ProtocolError(
        'PERMISSION_DENIED',
        403,
        'Business permission denied for this form action',
      );
    }
  }

  /**
   * Recover form.permissionRef + interaction.recordId for query/retry/getInteraction.
   * Interactions do not store formRef; tickets and embed contexts do.
   */
  async function permissionScopeForInteraction(interactionId: string): Promise<{
    readonly permissionRef: string | null;
    readonly recordId: string | null;
    readonly formRef: string;
    readonly schemaVersion: string;
  }> {
    const interaction = await db()
      .selectFrom('businessUiInteractions')
      .select(['recordId'])
      .where('interactionId', '=', interactionId)
      .executeTakeFirst();
    if (!interaction) {
      throw new ProtocolError(
        'OPERATION_NOT_FOUND',
        404,
        'Interaction not found',
      );
    }
    const embed = await db()
      .selectFrom('businessUiEmbedContexts')
      .select(['formRef', 'schemaVersion'])
      .where('interactionId', '=', interactionId)
      .orderBy('createdAt', 'desc')
      .executeTakeFirst();
    const ticket = embed
      ? undefined
      : await db()
          .selectFrom('businessUiTickets')
          .select(['formRef', 'schemaVersion', 'context'])
          .where('interactionId', '=', interactionId)
          .orderBy('createdAt', 'desc')
          .executeTakeFirst();
    const formRef = (embed?.formRef ?? ticket?.formRef) as string | undefined;
    const schemaVersion = (embed?.schemaVersion ?? ticket?.schemaVersion) as
      string | undefined;
    if (!formRef || !schemaVersion) {
      throw new ProtocolError(
        'OPERATION_NOT_FOUND',
        404,
        'No form scope for interaction',
      );
    }
    const form = await db()
      .selectFrom('businessUiForms')
      .select(['permissionRef'])
      .where('formRef', '=', formRef)
      .where('schemaVersion', '=', schemaVersion)
      .executeTakeFirst();
    const ticketPermission =
      ticket &&
      ((ticket.context as { permissionRef?: string | null } | null)
        ?.permissionRef ??
        null);
    return {
      permissionRef:
        (form?.permissionRef as string | null | undefined) ??
        ticketPermission ??
        null,
      recordId: (interaction.recordId as string | null) ?? null,
      formRef,
      schemaVersion,
    };
  }

  async function ensureSubmitSlot(
    interactionId: string,
    connectionId: string,
    userId: string,
  ): Promise<string> {
    const interaction = await db()
      .selectFrom('businessUiInteractions')
      .select(['submitSlotOperationId', 'latestSubmitOperationId'])
      .where('interactionId', '=', interactionId)
      .executeTakeFirst();
    const existing =
      (interaction?.submitSlotOperationId as string | null | undefined) ||
      (interaction?.latestSubmitOperationId as string | null | undefined);
    if (existing) return existing;

    const operationId = randomId('op');
    const createdAt = now();
    await db()
      .insertInto('businessUiOperations')
      .values({
        id: randomId('operation'),
        operationId,
        interactionId,
        connectionId,
        localUserId: userId,
        idempotencyKey: `slot:${interactionId}`,
        requestDigest: hashRequest({ slot: interactionId }),
        kind: 'submit',
        status: 'PENDING',
        resultType: null,
        result: null,
        safeRetry: false,
        attemptCount: 0,
        sideEffectConfirmed: null,
        createdAt,
        updatedAt: createdAt,
      })
      .execute();
    await db()
      .updateTable('businessUiInteractions')
      .set({
        submitSlotOperationId: operationId,
        latestSubmitOperationId: operationId,
        updatedAt: createdAt,
      })
      .where('interactionId', '=', interactionId)
      .where('submitSlotOperationId', 'is', null)
      .execute();
    const confirmed = await db()
      .selectFrom('businessUiInteractions')
      .select('submitSlotOperationId')
      .where('interactionId', '=', interactionId)
      .executeTakeFirst();
    const confirmedSlot = confirmed?.submitSlotOperationId;
    return typeof confirmedSlot === 'string' && confirmedSlot
      ? confirmedSlot
      : operationId;
  }

  function requireSecrets(): SecretsService {
    const secrets = deps.secrets?.();
    if (!secrets?.ready) {
      throw new ProtocolError(
        'SECRETS_NOT_CONFIGURED',
        503,
        'secrets.keys is required to store and return OAuth authorization codes',
      );
    }
    return secrets;
  }

  function sealOAuthCode(
    code: string,
    connectionId: string,
    stateDigest: string,
  ): string {
    return requireSecrets().seal(code, {
      purpose: OAUTH_CODE_SEAL_PURPOSE,
      aad: [connectionId, stateDigest],
    });
  }

  function openOAuthCode(
    sealed: string,
    connectionId: string,
    stateDigest: string,
  ): string {
    if (looksLikeLegacyCodeDigest(sealed)) {
      throw new ProtocolError(
        'TICKET_EXPIRED',
        403,
        'Stored OAuth code uses a legacy digest that cannot be recovered; re-authorize',
      );
    }
    try {
      return requireSecrets().open(sealed, {
        purpose: OAUTH_CODE_SEAL_PURPOSE,
        aad: [connectionId, stateDigest],
      });
    } catch {
      throw new ProtocolError(
        'TICKET_EXPIRED',
        403,
        'Stored OAuth code cannot be decrypted; re-authorize',
      );
    }
  }

  async function requireConnection(
    connectionId: string,
  ): Promise<ConnectionRow> {
    const row = await db()
      .selectFrom('businessUiConnections')
      .selectAll()
      .where('connectionId', '=', connectionId)
      .executeTakeFirst();
    if (!row) {
      throw new ProtocolError(
        'CONNECTION_NOT_FOUND',
        404,
        'Connection not found',
      );
    }
    if (!row.enabled) {
      throw new ProtocolError(
        'CONNECTION_DISABLED',
        403,
        'Connection is disabled',
      );
    }
    return row as ConnectionRow;
  }

  function assertServiceCredential(
    connection: ConnectionRow,
    authorization: string | undefined,
  ): void {
    if (!authorization?.startsWith('Bearer ')) {
      throw new ProtocolError(
        'INVALID_SERVICE_CREDENTIAL',
        401,
        'Service credential required',
      );
    }
    const secret = authorization.slice('Bearer '.length).trim();
    const digest = hashServiceSecret(secret);
    if (!secretsEqual(digest, connection.serviceSecretHash)) {
      throw new ProtocolError(
        'INVALID_SERVICE_CREDENTIAL',
        401,
        'Service credential invalid',
      );
    }
  }

  async function requireForm(
    formRef: string,
    schemaVersion: string,
  ): Promise<FormRow> {
    const row = await db()
      .selectFrom('businessUiForms')
      .selectAll()
      .where('formRef', '=', formRef)
      .where('schemaVersion', '=', schemaVersion)
      .executeTakeFirst();
    if (!row || !row.enabled) {
      throw new ProtocolError(
        'FORM_NOT_REGISTERED',
        404,
        'Form is not registered',
      );
    }
    const form = row as FormRow;
    if (!HANDLER_WHITELIST.has(form.handlerKey)) {
      throw new ProtocolError(
        'FORM_NOT_REGISTERED',
        404,
        'Form handler is not allowed',
      );
    }
    return form;
  }

  async function requireBinding(
    connectionId: string,
    localUserId: string,
    subjectSub?: string,
  ): Promise<BindingRow> {
    let query = db()
      .selectFrom('businessUiSubjectBindings')
      .selectAll()
      .where('connectionId', '=', connectionId)
      .where('localUserId', '=', localUserId)
      .where('status', '=', 'active');
    if (subjectSub) {
      query = query.where('octopSubject', '=', subjectSub);
    }
    const row = await query.executeTakeFirst();
    if (!row) {
      throw new ProtocolError(
        'SUBJECT_BINDING_REQUIRED',
        403,
        'Subject binding required',
      );
    }
    if (subjectSub && row.octopSubject !== subjectSub) {
      throw new ProtocolError(
        'SUBJECT_MISMATCH',
        403,
        'Subject does not match binding',
      );
    }
    return toBindingRow(row);
  }

  /**
   * Load embed and re-verify connection enabled, binding revision, and current
   * business permission on every protected action (NEXT-03).
   */
  async function loadEmbed(
    connectionId: string,
    userId: string,
    sessionRef: string,
    action: BusinessAction = 'save',
  ) {
    await requireConnection(connectionId);
    const embed = await db()
      .selectFrom('businessUiEmbedContexts')
      .selectAll()
      .where('authSessionRef', '=', sessionRef)
      .where('connectionId', '=', connectionId)
      .executeTakeFirst();
    if (!embed) {
      throw new ProtocolError(
        'EMBED_CONTEXT_REQUIRED',
        403,
        'Embed context required',
      );
    }
    if (embed.localUserId !== userId) {
      throw new ProtocolError(
        'SUBJECT_MISMATCH',
        403,
        'Embed context belongs to another user',
      );
    }
    if (new Date(embed.expiresAt as Date) < now()) {
      throw new ProtocolError('AUTH_REQUIRED', 401, 'Embed context expired');
    }
    if (!embed.nonce || embed.bindingRevision == null) {
      throw new ProtocolError(
        'EMBED_CONTEXT_REQUIRED',
        403,
        'Embed context is missing revision constraints; re-open the form',
      );
    }

    const bindingId =
      typeof embed.subjectBindingId === 'string'
        ? embed.subjectBindingId
        : null;
    let binding: BindingRow | undefined;
    if (bindingId) {
      const row = await db()
        .selectFrom('businessUiSubjectBindings')
        .selectAll()
        .where('id', '=', bindingId)
        .executeTakeFirst();
      binding = row ? toBindingRow(row) : undefined;
    } else {
      const interaction = await db()
        .selectFrom('businessUiInteractions')
        .select(['subjectBindingId'])
        .where('interactionId', '=', String(embed.interactionId))
        .executeTakeFirst();
      if (typeof interaction?.subjectBindingId === 'string') {
        const row = await db()
          .selectFrom('businessUiSubjectBindings')
          .selectAll()
          .where('id', '=', interaction.subjectBindingId)
          .executeTakeFirst();
        binding = row ? toBindingRow(row) : undefined;
      }
    }
    if (!binding || binding.status !== 'active') {
      throw new ProtocolError(
        'SUBJECT_BINDING_REQUIRED',
        403,
        'Subject binding was revoked; re-open the form',
      );
    }
    if (
      asRevisionText(binding.revision) !== asRevisionText(embed.bindingRevision)
    ) {
      throw new ProtocolError(
        'SUBJECT_BINDING_REQUIRED',
        403,
        'Subject binding revision changed; re-open the form',
      );
    }

    const form = await requireForm(
      String(embed.formRef),
      String(embed.schemaVersion),
    );
    const formConfigVersion = formConfigVersionOf(form);
    if (
      embed.formConfigVersion &&
      embed.formConfigVersion !== formConfigVersion
    ) {
      throw new ProtocolError(
        'FORM_NOT_REGISTERED',
        403,
        'Form configuration changed; re-open the form',
      );
    }
    await assertBusinessAccess(
      userId,
      form.permissionRef,
      action,
      (
        await db()
          .selectFrom('businessUiInteractions')
          .select('recordId')
          .where('interactionId', '=', embed.interactionId as string)
          .executeTakeFirst()
      )?.recordId as string | null,
    );
    return embed;
  }

  function formConfigVersionOf(form: FormRow): string {
    return `${form.formRef}@${form.schemaVersion}@${form.permissionRef ?? ''}@${form.enabled ? '1' : '0'}`;
  }

  /** Ensure the interaction's subject binding is still active (query/retry paths). */
  async function assertInteractionBindingActive(
    interactionId: string,
  ): Promise<void> {
    const interaction = await db()
      .selectFrom('businessUiInteractions')
      .select(['subjectBindingId'])
      .where('interactionId', '=', interactionId)
      .executeTakeFirst();
    if (!interaction?.subjectBindingId) {
      throw new ProtocolError(
        'SUBJECT_BINDING_REQUIRED',
        403,
        'Subject binding required',
      );
    }
    const binding = await db()
      .selectFrom('businessUiSubjectBindings')
      .select(['status'])
      .where('id', '=', interaction.subjectBindingId as string)
      .executeTakeFirst();
    if (!binding || binding.status !== 'active') {
      throw new ProtocolError(
        'SUBJECT_BINDING_REQUIRED',
        403,
        'Subject binding was revoked',
      );
    }
  }

  function receiptFromPayload(payload: DualNamedReceipt): DualNamedReceipt {
    return payload;
  }

  return {
    async handshake(connectionId, authorization, body) {
      const connection = await requireConnection(connectionId);
      assertServiceCredential(connection, authorization);
      if (body.protocol && body.protocol !== PROTOCOL) {
        throw new ProtocolError(
          'INVALID_ARGUMENT',
          400,
          `Unsupported protocol ${body.protocol}`,
        );
      }
      if (body.destructive === true) {
        throw new ProtocolError(
          'INVALID_ARGUMENT',
          400,
          'Destructive handshake is not supported',
        );
      }
      if (
        body.instance_issuer &&
        body.instance_issuer !== connection.octopIssuer
      ) {
        throw new ProtocolError(
          'INVALID_ARGUMENT',
          400,
          'instance_issuer does not match connection',
        );
      }
      const config = deps.config();
      // Path fields stay at the top level — Octop's evaluate_handshake reads them there (FIX-04).
      return {
        protocol: PROTOCOL,
        ok: true,
        kind: 'business-ui-adapter',
        service: {
          name: SERVICE_NAME,
          environment: config.environment ?? 'test',
        },
        auth: { identity: 'connection', mode: 'bearer' },
        features: {
          form_registry: true,
          tickets: true,
          receipts: true,
          interactions: true,
          user_auth_methods: ['oauth2'],
          oauth_pkce_s256: true,
          oauth_authorization_code: true,
          receipt_schema_v11: true,
          query_status: true,
          safe_retry: true,
        },
        ticket_path: '/v1/tickets',
        redeem_path: '/v1/tickets/redeem',
        interaction_path: '/v1/interactions/{id}',
        operation_path: '/v1/operations/{id}',
        resolve_path: '/v1/forms/resolve',
        save_path: '/v1/documents/save',
        submit_path: '/v1/documents/submit',
      };
    },

    async oauthCallback(connectionId, query) {
      await requireConnection(connectionId);
      const code = query.code?.trim();
      const state = query.state?.trim();
      if (!code || !state) {
        throw new ProtocolError(
          'INVALID_ARGUMENT',
          400,
          'code and state are required',
        );
      }
      const stateDigest = hashState(state);
      const existing = await db()
        .selectFrom('businessUiOAuthCodes')
        .select('id')
        .where('stateDigest', '=', stateDigest)
        .executeTakeFirst();
      if (existing) {
        return { ok: true };
      }
      const createdAt = now();
      await db()
        .insertInto('businessUiOAuthCodes')
        .values({
          id: randomId('oauth'),
          stateDigest,
          connectionId,
          encryptedCode: sealOAuthCode(code, connectionId, stateDigest),
          expiresAt: addSeconds(createdAt, OAUTH_CODE_TTL_SECONDS),
          consumedAt: null,
          createdAt,
        })
        .execute();
      return { ok: true };
    },

    async oauthConsume(connectionId, authorization, body) {
      const connection = await requireConnection(connectionId);
      assertServiceCredential(connection, authorization);
      const state = body.state?.trim();
      if (!state) {
        throw new ProtocolError('INVALID_ARGUMENT', 400, 'state is required');
      }
      const stateDigest = hashState(state);
      const row = await db()
        .selectFrom('businessUiOAuthCodes')
        .selectAll()
        .where('stateDigest', '=', stateDigest)
        .where('connectionId', '=', connectionId)
        .executeTakeFirst();
      if (!row) {
        return { pending: true, status: 'pending' };
      }
      if (row.consumedAt) {
        throw new ProtocolError(
          'TICKET_REPLAYED',
          403,
          'OAuth code already consumed',
        );
      }
      if (new Date(row.expiresAt as Date) < now()) {
        throw new ProtocolError('TICKET_EXPIRED', 403, 'OAuth code expired');
      }
      const plaintext = openOAuthCode(
        String(row.encryptedCode),
        connectionId,
        stateDigest,
      );
      const updated = await db()
        .updateTable('businessUiOAuthCodes')
        .set({ consumedAt: now() })
        .where('id', '=', row.id)
        .where('consumedAt', 'is', null)
        .execute();
      if (!updated || (updated.updatedCount ?? 0) === 0) {
        throw new ProtocolError(
          'TICKET_REPLAYED',
          403,
          'OAuth code already consumed',
        );
      }
      // FIX-05: return the original authorization code to the authenticated plugin.
      return {
        pending: false,
        status: 'ready',
        code: plaintext,
        connection_id: connectionId,
      };
    },

    async issueTicket(connectionId, userId, body) {
      await assertIdentityFresh(userId);
      const connection = await requireConnection(connectionId);
      const formRef = body.formRef ?? body.form_ref;
      const schemaVersion = body.schemaVersion ?? body.schema_version ?? '1';
      if (!formRef) {
        throw new ProtocolError('INVALID_ARGUMENT', 400, 'formRef is required');
      }
      const form = await requireForm(formRef, schemaVersion);
      // Prefer nested subject (Octop); flat subject_sub remains for older callers.
      // Never infer the subject from "the user's first binding" (FIX-07).
      const nestedSubject = body.subject;
      const subjectSub =
        nestedSubject?.sub?.trim() ||
        body.subjectSub?.trim() ||
        body.subject_sub?.trim();
      const subjectIssuer = nestedSubject?.issuer?.trim();
      if (subjectIssuer && subjectIssuer !== connection.octopIssuer) {
        throw new ProtocolError(
          'SUBJECT_MISMATCH',
          403,
          'subject.issuer does not match the connection issuer',
        );
      }
      if (!subjectSub) {
        throw new ProtocolError(
          'INVALID_ARGUMENT',
          400,
          'subject.sub (or subject_sub) is required',
        );
      }
      const binding = await requireBinding(connectionId, userId, subjectSub);
      await assertBusinessAccess(
        userId,
        form.permissionRef,
        form.mode === 'detail' ? 'view' : 'issue',
        body.recordId ?? body.record_id ?? null,
      );
      const interactionId =
        body.interactionId ?? body.interaction_id ?? randomId('int');
      const recordId = body.recordId ?? body.record_id ?? null;
      const nonce = body.nonce?.trim();
      if (!nonce) {
        throw new ProtocolError(
          'INVALID_ARGUMENT',
          400,
          'nonce is required when issuing a ticket',
        );
      }
      const action =
        typeof body.action === 'string' && body.action.trim()
          ? body.action.trim()
          : form.mode === 'detail'
            ? 'view'
            : 'edit';
      const createdAt = now();

      const interaction = await db()
        .selectFrom('businessUiInteractions')
        .selectAll()
        .where('interactionId', '=', interactionId)
        .executeTakeFirst();
      if (!interaction) {
        await db()
          .insertInto('businessUiInteractions')
          .values({
            id: randomId('interaction'),
            interactionId,
            connectionId,
            subjectBindingId: binding.id,
            localUserId: userId,
            recordId,
            latestReceiptId: null,
            latestSubmitOperationId: null,
            submitSlotOperationId: null,
            createdAt,
            updatedAt: createdAt,
          })
          .execute();
      } else if (interaction.localUserId !== userId) {
        throw new ProtocolError(
          'SUBJECT_MISMATCH',
          403,
          'Interaction belongs to another subject',
        );
      }

      const submitSlotOperationId = await ensureSubmitSlot(
        interactionId,
        connectionId,
        userId,
      );

      const ticket = randomTicketPlaintext();
      const ticketDigest = hashTicket(ticket);
      await db()
        .insertInto('businessUiTickets')
        .values({
          id: randomId('ticket'),
          ticketDigest,
          connectionId,
          subjectBindingId: binding.id,
          localUserId: userId,
          interactionId,
          formRef: form.formRef,
          schemaVersion: form.schemaVersion,
          nonce,
          action,
          bindingRevision: String(binding.revision ?? 1),
          context: {
            recordId,
            documentType: form.documentType,
            mode: form.mode,
            permissionRef: form.permissionRef,
            subjectBindingId: binding.id,
            formConfigVersion: formConfigVersionOf(form),
          },
          expiresAt: addSeconds(createdAt, TICKET_TTL_SECONDS),
          consumedAt: null,
          createdAt,
        })
        .execute();

      const config = deps.config();
      const base =
        config.publicBaseUrl?.replace(/\/$/, '') ??
        `http://localhost/business-ui/connections/${connectionId}`;
      return {
        ticket,
        expires_in: TICKET_TTL_SECONDS,
        form_ref: form.formRef,
        formRef: form.formRef,
        interaction_id: interactionId,
        interactionId,
        operation_id: submitSlotOperationId,
        operationId: submitSlotOperationId,
        redeem_url: `${base}/v1/tickets/redeem`,
      };
    },

    async redeemTicket(connectionId, body, request) {
      const connection = await requireConnection(connectionId);
      const ticket = body.ticket?.trim();
      const nonce = body.nonce?.trim();
      if (!ticket || !nonce) {
        throw new ProtocolError(
          'INVALID_ARGUMENT',
          400,
          'ticket and nonce are required',
        );
      }
      const ticketDigest = hashTicket(ticket);
      const row = await db()
        .selectFrom('businessUiTickets')
        .selectAll()
        .where('ticketDigest', '=', ticketDigest)
        .where('connectionId', '=', connectionId)
        .executeTakeFirst();
      if (!row) {
        throw new ProtocolError('TICKET_EXPIRED', 403, 'Ticket not found');
      }
      const ticketRow = row as {
        id: string;
        localUserId: string;
        interactionId: string;
        formRef: string;
        schemaVersion: string;
        nonce: string | null;
        action: string | null;
        bindingRevision: string | null;
        subjectBindingId: string;
        context: unknown;
        expiresAt: Date;
        consumedAt: Date | null;
      };
      if (ticketRow.consumedAt) {
        throw new ProtocolError(
          'TICKET_REPLAYED',
          403,
          'Ticket already redeemed',
        );
      }
      if (new Date(ticketRow.expiresAt) < now()) {
        throw new ProtocolError('TICKET_EXPIRED', 403, 'Ticket expired');
      }
      if (ticketRow.nonce && ticketRow.nonce !== nonce) {
        throw new ProtocolError(
          'INVALID_ARGUMENT',
          400,
          'nonce does not match the issued ticket',
        );
      }
      // Binding must still be active at the revision captured on the ticket (NEXT-03).
      // Legacy tickets that stored binding.id are rejected (non-numeric revision).
      if (
        !ticketRow.bindingRevision ||
        !/^\d+$/.test(ticketRow.bindingRevision)
      ) {
        throw new ProtocolError(
          'TICKET_REPLAYED',
          403,
          'Ticket lacks a valid binding revision; re-issue the ticket',
        );
      }
      const binding = await db()
        .selectFrom('businessUiSubjectBindings')
        .selectAll()
        .where('id', '=', ticketRow.subjectBindingId)
        .executeTakeFirst();
      if (
        !binding ||
        binding.status !== 'active' ||
        asRevisionText(binding.revision ?? 1) !== ticketRow.bindingRevision
      ) {
        throw new ProtocolError(
          'SUBJECT_BINDING_REQUIRED',
          403,
          'Subject binding was revoked or revised; re-issue the ticket',
        );
      }

      const existing = await deps.auth().getSession(request.headers, {
        disableRefresh: true,
      });
      if (existing && existing.user.id !== ticketRow.localUserId) {
        throw new ProtocolError(
          'SESSION_CONFLICT',
          403,
          'Existing session belongs to another user',
        );
      }

      const updated = await db()
        .updateTable('businessUiTickets')
        .set({ consumedAt: now() })
        .where('id', '=', ticketRow.id)
        .where('consumedAt', 'is', null)
        .execute();
      if (!updated || (updated.updatedCount ?? 0) === 0) {
        throw new ProtocolError(
          'TICKET_REPLAYED',
          403,
          'Ticket already redeemed',
        );
      }

      const signIn = await deps
        .auth()
        .signInUser(ticketRow.localUserId, request);
      if (!signIn.ok) {
        throw new ProtocolError(
          'AUTH_REQUIRED',
          401,
          `Failed to create session (${signIn.status})`,
        );
      }
      const setCookies = signIn.headers.getSetCookie?.() ?? [];
      const session = await deps.auth().getSession(
        new Headers({
          cookie: setCookies.map((c) => c.split(';')[0]).join('; '),
        }),
        { disableRefresh: true },
      );
      if (!session?.session?.id) {
        throw new ProtocolError(
          'AUTH_REQUIRED',
          401,
          'Failed to resolve a real session reference after sign-in',
        );
      }
      const authSessionRef = session.session.id;
      const context = (ticketRow.context ?? {}) as {
        recordId?: string | null;
        documentType?: string;
        mode?: string;
        permissionRef?: string | null;
        subjectBindingId?: string;
        formConfigVersion?: string;
      };
      const mode = context.mode === 'detail' ? 'detail' : 'edit';
      await assertBusinessAccess(
        ticketRow.localUserId,
        context.permissionRef,
        mode === 'detail' ? 'view' : 'issue',
        context.recordId,
      );
      const actionBounds =
        mode === 'detail'
          ? (['view_document', 'close'] as const)
          : (['save', 'submit', 'view_document', 'close'] as const);
      const createdAt = now();
      await db()
        .insertInto('businessUiEmbedContexts')
        .values({
          id: randomId('embed'),
          authSessionRef,
          connectionId,
          interactionId: ticketRow.interactionId,
          localUserId: ticketRow.localUserId,
          formRef: ticketRow.formRef,
          schemaVersion: ticketRow.schemaVersion,
          subjectBindingId:
            context.subjectBindingId ?? ticketRow.subjectBindingId,
          bindingRevision: ticketRow.bindingRevision,
          formConfigVersion: context.formConfigVersion ?? null,
          mode,
          nonce,
          actionBounds: [...actionBounds],
          expiresAt: addSeconds(createdAt, EMBED_TTL_SECONDS),
          createdAt,
        })
        .execute();

      let detailFields:
        { title: string; description: string; quantity: number } | undefined;
      if (mode === 'detail' && context.recordId) {
        const formal = await db()
          .selectFrom('integrationTestDocuments')
          .selectAll()
          .where('formalRecordId', '=', context.recordId)
          .executeTakeFirst();
        if (!formal || formal.ownerId !== ticketRow.localUserId) {
          throw new ProtocolError(
            'PERMISSION_DENIED',
            403,
            'Detail record is not available',
          );
        }
        detailFields = {
          title: typeof formal.title === 'string' ? formal.title : '',
          description:
            typeof formal.description === 'string' ? formal.description : '',
          quantity: Number(formal.quantity),
        };
      }

      const allowedOrigins = Array.isArray(connection.allowedOrigins)
        ? (connection.allowedOrigins as string[])
        : [];
      const targetOrigin = allowedOrigins[0] ?? '';
      const html = renderEmbedHtml({
        connectionId,
        interactionId: ticketRow.interactionId,
        formRef: ticketRow.formRef,
        schemaVersion: ticketRow.schemaVersion,
        documentType: context.documentType ?? DOCUMENT_TYPE,
        recordId: context.recordId ?? '',
        nonce,
        mode,
        targetOrigin,
        detailFields,
        publicBaseUrl: deps.config().publicBaseUrl,
      });
      return { html, setCookies, frameAncestors: allowedOrigins };
    },

    async saveDocument(connectionId, userId, sessionRef, body) {
      await assertIdentityFresh(userId);
      const embed = await loadEmbed(connectionId, userId, sessionRef, 'save');
      const bounds = (embed.actionBounds as string[] | null) ?? [];
      if (embed.mode === 'detail' || !bounds.includes('save')) {
        throw new ProtocolError(
          'PERMISSION_DENIED',
          403,
          'Save is not allowed in this embed context',
        );
      }
      // loadEmbed already re-checks connection, binding revision, form config,
      // and business access with the interaction's current recordId (not '*').
      const fields = parseGenericRequestFields({
        title: body.title,
        description: body.description,
        quantity: body.quantity,
      });
      const expectedVersion =
        typeof body.record_version === 'number'
          ? body.record_version
          : typeof body.recordVersion === 'number'
            ? body.recordVersion
            : 0;

      let document = await db()
        .selectFrom('integrationTestDocuments')
        .selectAll()
        .where('interactionId', '=', embed.interactionId)
        .executeTakeFirst();

      const updatedAt = now();
      if (!document) {
        const draftId = randomId('draft');
        await db()
          .insertInto('integrationTestDocuments')
          .values({
            id: randomId('doc'),
            draftId,
            formalRecordId: null,
            ownerId: userId,
            connectionId,
            interactionId: embed.interactionId,
            title: fields.title,
            description: fields.description,
            quantity: fields.quantity,
            status: 'draft',
            version: 1,
            batchId: null,
            createdAt: updatedAt,
            updatedAt,
          })
          .execute();
        document = await db()
          .selectFrom('integrationTestDocuments')
          .selectAll()
          .where('draftId', '=', draftId)
          .executeTakeFirstOrThrow();
      } else {
        if (document.ownerId !== userId) {
          throw new ProtocolError(
            'SUBJECT_MISMATCH',
            403,
            'Document belongs to another subject',
          );
        }
        if (document.status === 'submitted') {
          // Identified subsequent-action refusal on an existing formal record.
          return serializeReceipt({
            status: 'rejected',
            documentType: DOCUMENT_TYPE,
            recordId: (document.formalRecordId as string | null) ?? null,
            formRef: String(embed.formRef),
            schemaVersion: String(embed.schemaVersion),
            recordVersion: Number(document.version),
            allowedActions: ['view_document', 'close'],
            interactionId: String(embed.interactionId),
            result: {
              type: 'BUSINESS_REJECTED',
              status: 'BUSINESS_REJECTED',
              code: 'ALREADY_SUBMITTED',
              message: 'Submitted documents cannot be saved as drafts',
              disclosable: true,
              safe_retry: false,
              idempotent: true,
              side_effect: false,
            },
          });
        }
        if (document.version !== expectedVersion) {
          throw new ProtocolError(
            'VERSION_CONFLICT',
            409,
            'Document version conflict',
          );
        }
        const result = await db()
          .updateTable('integrationTestDocuments')
          .set({
            title: fields.title,
            description: fields.description,
            quantity: fields.quantity,
            version: document.version + 1,
            updatedAt,
          })
          .where('id', '=', document.id)
          .where('version', '=', expectedVersion)
          .execute();
        if (!result || (result.updatedCount ?? 0) === 0) {
          throw new ProtocolError(
            'VERSION_CONFLICT',
            409,
            'Document version conflict',
          );
        }
        document = await db()
          .selectFrom('integrationTestDocuments')
          .selectAll()
          .where('id', '=', document.id)
          .executeTakeFirstOrThrow();
      }

      if (!document) {
        throw new ProtocolError(
          'INVALID_ARGUMENT',
          400,
          'Document was not persisted',
        );
      }
      const savedDocument = document;
      const operationId = await ensureSubmitSlot(
        String(embed.interactionId),
        connectionId,
        userId,
      );

      await db()
        .updateTable('businessUiInteractions')
        .set({
          // Drafts do not own a formal record id; keep null until submit.
          recordId:
            typeof savedDocument.formalRecordId === 'string'
              ? savedDocument.formalRecordId
              : null,
          updatedAt,
        })
        .where('interactionId', '=', embed.interactionId)
        .execute();

      // Draft must not claim SUCCESS submit semantics (FIX-09 / FIX-10).
      return serializeReceipt({
        status: 'draft',
        documentType: DOCUMENT_TYPE,
        recordId: null,
        formRef: String(embed.formRef),
        schemaVersion: String(embed.schemaVersion),
        recordVersion: Number(savedDocument.version),
        allowedActions: ['save', 'submit', 'view_document', 'close'],
        interactionId: String(embed.interactionId),
        operationId,
        summary: {
          title: savedDocument.title,
          quantity: savedDocument.quantity,
        },
      });
    },

    async submitDocument(connectionId, userId, sessionRef, body) {
      await assertIdentityFresh(userId);
      const embed = await loadEmbed(connectionId, userId, sessionRef, 'submit');
      const bounds = (embed.actionBounds as string[] | null) ?? [];
      if (embed.mode === 'detail' || !bounds.includes('submit')) {
        throw new ProtocolError(
          'PERMISSION_DENIED',
          403,
          'Submit is not allowed in this embed context',
        );
      }
      // loadEmbed already re-checks connection, binding revision, form config,
      // and business access with the interaction's current recordId (not '*').
      const idempotencyKey =
        (typeof body.idempotency_key === 'string' &&
          body.idempotency_key.trim()) ||
        (typeof body.idempotencyKey === 'string' &&
          body.idempotencyKey.trim()) ||
        '';
      if (!idempotencyKey) {
        throw new ProtocolError(
          'INVALID_ARGUMENT',
          400,
          'idempotency_key is required for submit',
        );
      }
      const requestDigest = hashRequest({
        title: body.title,
        description: body.description,
        quantity: body.quantity,
        record_version: body.record_version ?? body.recordVersion,
      });

      const operationId = await ensureSubmitSlot(
        String(embed.interactionId),
        connectionId,
        userId,
      );
      const slotOp = await db()
        .selectFrom('businessUiOperations')
        .selectAll()
        .where('operationId', '=', operationId)
        .executeTakeFirstOrThrow();

      // Bind the client idempotency key to the stable slot on first real submit.
      const slotKey = String(slotOp.idempotencyKey);
      if (slotKey.startsWith('slot:')) {
        await db()
          .updateTable('businessUiOperations')
          .set({
            idempotencyKey,
            requestDigest,
            updatedAt: now(),
          })
          .where('operationId', '=', operationId)
          .where('idempotencyKey', '=', slotKey)
          .execute();
      } else if (slotKey !== idempotencyKey) {
        // Same interaction must keep one submit identity; mismatched keys conflict.
        const other = await db()
          .selectFrom('businessUiOperations')
          .selectAll()
          .where('interactionId', '=', embed.interactionId)
          .where('idempotencyKey', '=', idempotencyKey)
          .executeTakeFirst();
        if (!other) {
          throw new ProtocolError(
            'VERSION_CONFLICT',
            409,
            'Idempotency key does not match the interaction submit slot',
          );
        }
      }

      const existingOp = await db()
        .selectFrom('businessUiOperations')
        .selectAll()
        .where('operationId', '=', operationId)
        .executeTakeFirstOrThrow();
      if (
        !String(existingOp.idempotencyKey).startsWith('slot:') &&
        existingOp.idempotencyKey === idempotencyKey &&
        existingOp.requestDigest &&
        existingOp.requestDigest !== requestDigest &&
        existingOp.status !== 'PENDING' &&
        existingOp.status !== 'FAILED'
      ) {
        throw new ProtocolError(
          'VERSION_CONFLICT',
          409,
          'Idempotency key reused with different payload',
        );
      }
      if (
        existingOp.idempotencyKey === idempotencyKey &&
        existingOp.requestDigest === requestDigest
      ) {
        if (existingOp.status === 'SUCCEEDED') {
          const receipt = await db()
            .selectFrom('businessUiReceipts')
            .selectAll()
            .where('operationId', '=', existingOp.operationId)
            .executeTakeFirst();
          if (receipt) {
            return receiptFromPayload(receipt.payload as DualNamedReceipt);
          }
        }
        if (existingOp.status === 'UNKNOWN') {
          return serializeReceipt({
            status: 'unknown',
            documentType: DOCUMENT_TYPE,
            recordId: null,
            formRef: embed.formRef as string,
            schemaVersion: embed.schemaVersion as string,
            recordVersion: 0,
            allowedActions: ['close'],
            interactionId: embed.interactionId as string,
            operationId: existingOp.operationId as string,
            result: {
              type: 'TECHNICAL_ERROR',
              status: 'UNKNOWN',
              code: 'UNKNOWN',
              message: 'Operation result is not yet known',
              disclosable: true,
              safe_retry: false,
              idempotent: true,
              side_effect: null,
            },
          });
        }
      }

      const fields = parseGenericRequestFields({
        title: body.title,
        description: body.description,
        quantity: body.quantity,
      });
      const expectedVersion =
        typeof body.record_version === 'number'
          ? body.record_version
          : typeof body.recordVersion === 'number'
            ? body.recordVersion
            : undefined;

      const createdAt = now();
      await db()
        .updateTable('businessUiOperations')
        .set({
          idempotencyKey,
          requestDigest,
          status: 'UNKNOWN',
          resultType: 'UNKNOWN',
          result: null,
          safeRetry: false,
          sideEffectConfirmed: null,
          attemptCount: Number(existingOp.attemptCount ?? 0),
          updatedAt: createdAt,
        })
        .where('operationId', '=', operationId)
        .execute();

      await db()
        .updateTable('businessUiInteractions')
        .set({
          latestSubmitOperationId: operationId,
          submitSlotOperationId: operationId,
          updatedAt: createdAt,
        })
        .where('interactionId', '=', embed.interactionId)
        .execute();

      // Fault: leave UNKNOWN before any document write (not a lost-response proof).
      if (deps.config().faultInjection?.unknownOnSubmit) {
        return serializeReceipt({
          status: 'unknown',
          documentType: DOCUMENT_TYPE,
          recordId: null,
          formRef: embed.formRef as string,
          schemaVersion: embed.schemaVersion as string,
          recordVersion: 0,
          allowedActions: ['close'],
          interactionId: embed.interactionId as string,
          operationId,
          result: {
            type: 'TECHNICAL_ERROR',
            status: 'UNKNOWN',
            code: 'UNKNOWN',
            message: 'Fault injection left the operation UNKNOWN',
            disclosable: true,
            safe_retry: false,
            idempotent: true,
            side_effect: null,
          },
        });
      }

      // Fault: confirmed failure with no side effect — eligible for safe_retry.
      if (deps.config().faultInjection?.failBeforeWrite) {
        const failedResult = {
          type: 'TECHNICAL_ERROR',
          status: 'FAILED',
          code: 'WRITE_PRECHECK_FAILED',
          message: 'Fault injection failed before document write',
          disclosable: true,
          safe_retry: true,
          idempotent: true,
          side_effect: false as boolean | null,
          request: {
            title: fields.title,
            description: fields.description,
            quantity: fields.quantity,
            record_version: expectedVersion ?? 0,
          },
        };
        const failedPayload = serializeReceipt({
          status: 'failed',
          documentType: DOCUMENT_TYPE,
          recordId: null,
          formRef: embed.formRef as string,
          schemaVersion: embed.schemaVersion as string,
          recordVersion: expectedVersion ?? 0,
          allowedActions: ['close'],
          interactionId: embed.interactionId as string,
          operationId,
          result: failedResult,
        });
        await db()
          .updateTable('businessUiOperations')
          .set({
            status: 'FAILED',
            resultType: 'FAILED',
            result: failedResult,
            safeRetry: true,
            sideEffectConfirmed: false,
            updatedAt: now(),
          })
          .where('operationId', '=', operationId)
          .execute();
        return failedPayload;
      }

      const document = await db()
        .selectFrom('integrationTestDocuments')
        .selectAll()
        .where('interactionId', '=', embed.interactionId)
        .executeTakeFirst();

      if (document?.status === 'submitted' && document.formalRecordId) {
        const rejected = serializeReceipt({
          status: 'rejected',
          documentType: DOCUMENT_TYPE,
          recordId: document.formalRecordId as string,
          formRef: embed.formRef as string,
          schemaVersion: embed.schemaVersion as string,
          recordVersion: Number(document.version),
          allowedActions: ['view_document', 'close'],
          interactionId: embed.interactionId as string,
          operationId,
          result: {
            type: 'BUSINESS_REJECTED',
            status: 'BUSINESS_REJECTED',
            code: 'ALREADY_SUBMITTED',
            message: 'Document was already submitted',
            disclosable: true,
            safe_retry: false,
            idempotent: true,
            side_effect: false,
          },
        });
        await db()
          .updateTable('businessUiOperations')
          .set({
            status: 'BUSINESS_REJECTED',
            resultType: 'BUSINESS_REJECTED',
            result: rejected.result,
            safeRetry: false,
            sideEffectConfirmed: false,
            updatedAt: now(),
          })
          .where('operationId', '=', operationId)
          .execute();
        return rejected;
      }

      await deps.database().transaction(async (connection) => {
        const q = connection.query;
        let formalRecordId: string;
        let version: number;
        let title: string;
        let quantity: number;

        if (!document) {
          formalRecordId = `REQ-${Date.now()}-0001`;
          version = 1;
          title = fields.title;
          quantity = fields.quantity;
          await q
            .insertInto('integrationTestDocuments')
            .values({
              id: randomId('doc'),
              draftId: randomId('draft'),
              formalRecordId,
              ownerId: userId,
              connectionId,
              interactionId: embed.interactionId,
              title: fields.title,
              description: fields.description,
              quantity: fields.quantity,
              status: 'submitted',
              version,
              batchId: null,
              createdAt: now(),
              updatedAt: now(),
            })
            .execute();
        } else {
          if (
            expectedVersion !== undefined &&
            document.version !== expectedVersion
          ) {
            throw new ProtocolError(
              'VERSION_CONFLICT',
              409,
              'Document version conflict',
            );
          }
          formalRecordId =
            (document.formalRecordId as string) ??
            `REQ-${Date.now()}-${String(document.version).padStart(4, '0')}`;
          version = (document.version as number) + 1;
          title = fields.title;
          quantity = fields.quantity;
          const updated = await q
            .updateTable('integrationTestDocuments')
            .set({
              formalRecordId,
              title: fields.title,
              description: fields.description,
              quantity: fields.quantity,
              status: 'submitted',
              version,
              updatedAt: now(),
            })
            .where('id', '=', document.id)
            .where('version', '=', document.version)
            .execute();
          if (!updated || (updated.updatedCount ?? 0) === 0) {
            throw new ProtocolError(
              'VERSION_CONFLICT',
              409,
              'Document version conflict',
            );
          }
        }

        const latestReceipt = await q
          .selectFrom('businessUiReceipts')
          .select('sequence')
          .where('interactionId', '=', embed.interactionId)
          .orderBy('sequence', 'desc')
          .executeTakeFirst();
        const sequence = Number(latestReceipt?.sequence ?? 0) + 1;
        const payload = serializeReceipt({
          status: 'submitted',
          approvalStatus: 'not_required',
          documentType: DOCUMENT_TYPE,
          recordId: formalRecordId,
          formRef: FORM_REFS.detail,
          schemaVersion: embed.schemaVersion as string,
          recordVersion: version,
          allowedActions: ['view_document', 'close'],
          interactionId: embed.interactionId as string,
          operationId,
          receiptSequence: sequence,
          summary: { title, quantity },
          navigation: { form_ref: FORM_REFS.detail },
          result: {
            type: 'SUCCESS',
            status: 'SUCCESS',
            code: 'SUBMITTED',
            message: 'Generic test document submitted',
            disclosable: true,
            safe_retry: false,
            idempotent: true,
            side_effect: true,
          },
        });
        const receiptId = randomId('receipt');
        await q
          .insertInto('businessUiReceipts')
          .values({
            id: receiptId,
            operationId,
            interactionId: embed.interactionId,
            recordVersion: version,
            sequence,
            payload,
            createdAt: now(),
          })
          .execute();
        await q
          .updateTable('businessUiOperations')
          .set({
            status: 'SUCCEEDED',
            resultType: 'SUCCESS',
            result: payload.result,
            safeRetry: false,
            sideEffectConfirmed: true,
            updatedAt: now(),
          })
          .where('operationId', '=', operationId)
          .execute();
        await q
          .updateTable('businessUiInteractions')
          .set({
            recordId: formalRecordId,
            latestReceiptId: receiptId,
            latestSubmitOperationId: operationId,
            submitSlotOperationId: operationId,
            updatedAt: now(),
          })
          .where('interactionId', '=', embed.interactionId)
          .execute();
      });

      const receipt = await db()
        .selectFrom('businessUiReceipts')
        .selectAll()
        .where('operationId', '=', operationId)
        .executeTakeFirstOrThrow();

      // N18: COMMIT succeeded and receipt exists; drop the client response and
      // detach the receipt from the interaction so reconcile must restore SUCCESS.
      if (deps.config().faultInjection?.loseSubmitResponse) {
        await db()
          .updateTable('businessUiOperations')
          .set({
            status: 'UNKNOWN',
            resultType: 'UNKNOWN',
            sideEffectConfirmed: null,
            updatedAt: now(),
          })
          .where('operationId', '=', operationId)
          .execute();
        await db()
          .updateTable('businessUiInteractions')
          .set({
            latestReceiptId: null,
            updatedAt: now(),
          })
          .where('interactionId', '=', embed.interactionId)
          .execute();
        return serializeReceipt({
          status: 'unknown',
          documentType: DOCUMENT_TYPE,
          recordId: null,
          formRef: embed.formRef as string,
          schemaVersion: embed.schemaVersion as string,
          recordVersion: 0,
          allowedActions: ['close'],
          interactionId: embed.interactionId as string,
          operationId,
          result: {
            type: 'TECHNICAL_ERROR',
            status: 'UNKNOWN',
            code: 'RESPONSE_LOST',
            message:
              'Submit committed but the response was lost; query or reconcile',
            disclosable: true,
            safe_retry: false,
            idempotent: true,
            side_effect: null,
          },
        });
      }

      return receiptFromPayload(receipt.payload as DualNamedReceipt);
    },

    async getInteraction(connectionId, userId, interactionId) {
      await requireConnection(connectionId);
      const interaction = await db()
        .selectFrom('businessUiInteractions')
        .selectAll()
        .where('interactionId', '=', interactionId)
        .where('connectionId', '=', connectionId)
        .executeTakeFirst();
      if (!interaction || interaction.localUserId !== userId) {
        throw new ProtocolError(
          'OPERATION_NOT_FOUND',
          404,
          'Interaction not found',
        );
      }
      await assertInteractionBindingActive(interactionId);
      const scope = await permissionScopeForInteraction(interactionId);
      await assertBusinessAccess(
        userId,
        scope.permissionRef,
        'query',
        scope.recordId,
      );
      const operationId =
        (interaction.submitSlotOperationId as string | null) ||
        (interaction.latestSubmitOperationId as string | null) ||
        null;
      let receiptPayload: DualNamedReceipt | undefined;
      if (interaction.latestReceiptId) {
        const receipt = await db()
          .selectFrom('businessUiReceipts')
          .selectAll()
          .where('id', '=', interaction.latestReceiptId)
          .executeTakeFirst();
        receiptPayload = receipt?.payload as DualNamedReceipt | undefined;
      }
      // FIX-09 / FIX-10: flatten; always expose the stable submit operation_id.
      if (receiptPayload) {
        return {
          success: true,
          ...receiptPayload,
          interaction_id: interactionId,
          interactionId,
          operation_id: operationId ?? receiptPayload.operation_id,
          operationId: operationId ?? receiptPayload.operationId,
        };
      }

      // NEXT-04: when no receipt is attached, project from the operation — never
      // fall back to draft for FAILED / UNKNOWN / BUSINESS_REJECTED / SUCCESS.
      if (operationId) {
        const operation = await db()
          .selectFrom('businessUiOperations')
          .selectAll()
          .where('operationId', '=', operationId)
          .executeTakeFirst();
        if (operation) {
          const status = String(operation.status);
          // A SUCCESS receipt detached after loseSubmitResponse must not surface
          // as submitted until reconcile re-links it (N18). Prefer the operation
          // status when it is still UNKNOWN.
          if (status !== 'UNKNOWN') {
            const byOpReceipt = await db()
              .selectFrom('businessUiReceipts')
              .selectAll()
              .where('operationId', '=', operationId)
              .executeTakeFirst();
            if (byOpReceipt) {
              return {
                success: true,
                ...(byOpReceipt.payload as DualNamedReceipt),
                interaction_id: interactionId,
                interactionId,
                operation_id: operationId,
                operationId,
              };
            }
          }
          if (
            status === 'FAILED' ||
            status === 'UNKNOWN' ||
            status === 'BUSINESS_REJECTED' ||
            status === 'SUCCEEDED'
          ) {
            const result =
              (operation.result as Record<string, unknown> | null) ??
              (status === 'UNKNOWN'
                ? {
                    type: 'TECHNICAL_ERROR',
                    status: 'UNKNOWN',
                    code: 'UNKNOWN',
                    message: 'Operation result is not yet known',
                    disclosable: true,
                    safe_retry: false,
                    idempotent: true,
                    side_effect: null,
                  }
                : null);
            const allowed =
              status === 'FAILED' && operation.safeRetry
                ? (['close'] as const)
                : status === 'UNKNOWN'
                  ? (['close'] as const)
                  : status === 'SUCCEEDED'
                    ? (['view_document', 'close'] as const)
                    : (['close'] as const);
            return {
              success: status === 'SUCCEEDED',
              status: status.toLowerCase(),
              interaction_id: interactionId,
              interactionId,
              record_id:
                typeof interaction.recordId === 'string'
                  ? interaction.recordId
                  : null,
              recordId:
                typeof interaction.recordId === 'string'
                  ? interaction.recordId
                  : null,
              operation_id: operationId,
              operationId,
              document_type: DOCUMENT_TYPE,
              documentType: DOCUMENT_TYPE,
              form_ref: scope.formRef,
              formRef: scope.formRef,
              schema_version: scope.schemaVersion,
              schemaVersion: scope.schemaVersion,
              record_version: 0,
              recordVersion: 0,
              allowed_actions: [...allowed],
              allowedActions: [...allowed],
              result_type: operation.resultType,
              resultType: operation.resultType,
              safe_retry: operation.safeRetry,
              safeRetry: operation.safeRetry,
              result,
            };
          }
        }
      }

      // True draft: no terminal operation. Use the draft document version when present.
      const draft = await db()
        .selectFrom('integrationTestDocuments')
        .select(['version', 'formalRecordId', 'status'])
        .where('interactionId', '=', interactionId)
        .executeTakeFirst();
      const draftVersion =
        draft && draft.status !== 'submitted'
          ? Number(draft.version)
          : draft
            ? Number(draft.version)
            : 0;
      const formalId =
        draft?.status === 'submitted'
          ? ((draft.formalRecordId as string | null) ?? null)
          : null;
      return {
        success: true,
        status: 'draft',
        interaction_id: interactionId,
        interactionId,
        record_id: formalId,
        recordId: formalId,
        operation_id: operationId,
        operationId,
        document_type: DOCUMENT_TYPE,
        documentType: DOCUMENT_TYPE,
        form_ref: scope.formRef,
        formRef: scope.formRef,
        schema_version: scope.schemaVersion,
        schemaVersion: scope.schemaVersion,
        record_version: draftVersion,
        recordVersion: draftVersion,
        allowed_actions: formalId
          ? ['view_document', 'close']
          : ['save', 'submit', 'view_document', 'close'],
        allowedActions: formalId
          ? ['view_document', 'close']
          : ['save', 'submit', 'view_document', 'close'],
      };
    },

    async queryOperation(connectionId, userId, operationId) {
      await requireConnection(connectionId);
      const operation = await db()
        .selectFrom('businessUiOperations')
        .selectAll()
        .where('operationId', '=', operationId)
        .where('connectionId', '=', connectionId)
        .executeTakeFirst();
      if (!operation || operation.localUserId !== userId) {
        throw new ProtocolError(
          'OPERATION_NOT_FOUND',
          404,
          'Operation not found',
        );
      }
      await assertInteractionBindingActive(operation.interactionId as string);
      const scope = await permissionScopeForInteraction(
        operation.interactionId as string,
      );
      await assertBusinessAccess(
        userId,
        scope.permissionRef,
        'query',
        scope.recordId,
      );
      const receipt = await db()
        .selectFrom('businessUiReceipts')
        .selectAll()
        .where('operationId', '=', operationId)
        .executeTakeFirst();
      const receiptPayload = receipt
        ? (receipt.payload as DualNamedReceipt)
        : undefined;
      // N16/N18: while the operation is UNKNOWN, do not surface a detached SUCCESS
      // receipt as the authoritative query result — keep UNKNOWN until reconcile.
      if (receiptPayload && operation.status !== 'UNKNOWN') {
        return {
          success: true,
          query_only: true,
          ...receiptPayload,
          operation_id: operationId,
          operationId,
          safe_retry: operation.safeRetry,
          safeRetry: operation.safeRetry,
        };
      }
      return {
        success: false,
        query_only: true,
        operation_id: operationId,
        operationId,
        status: operation.status,
        result_type: operation.resultType,
        resultType: operation.resultType,
        safe_retry: operation.safeRetry,
        safeRetry: operation.safeRetry,
        record_id: null,
        recordId: null,
        allowed_actions: operation.status === 'UNKNOWN' ? ['close'] : undefined,
        allowedActions: operation.status === 'UNKNOWN' ? ['close'] : undefined,
        result:
          operation.status === 'UNKNOWN' || operation.resultType === 'UNKNOWN'
            ? {
                type: 'TECHNICAL_ERROR',
                status: 'UNKNOWN',
                code: 'UNKNOWN',
                message: 'Operation result is not yet known',
                disclosable: true,
                safe_retry: false,
                idempotent: true,
                side_effect: null,
              }
            : operation.result,
      };
    },

    async retryOperation(connectionId, userId, operationId) {
      await requireConnection(connectionId);
      const operation = await db()
        .selectFrom('businessUiOperations')
        .selectAll()
        .where('operationId', '=', operationId)
        .where('connectionId', '=', connectionId)
        .executeTakeFirst();
      if (!operation || operation.localUserId !== userId) {
        throw new ProtocolError(
          'OPERATION_NOT_FOUND',
          404,
          'Operation not found',
        );
      }
      await assertIdentityFresh(userId);
      await assertInteractionBindingActive(operation.interactionId as string);
      const scope = await permissionScopeForInteraction(
        operation.interactionId as string,
      );
      await assertBusinessAccess(
        userId,
        scope.permissionRef,
        'retry',
        scope.recordId,
      );
      if (
        operation.status === 'UNKNOWN' ||
        operation.resultType === 'UNKNOWN'
      ) {
        throw new ProtocolError(
          'RETRY_NOT_SAFE',
          403,
          'UNKNOWN operations cannot be retried',
        );
      }
      if (
        operation.status !== 'FAILED' ||
        !operation.safeRetry ||
        operation.sideEffectConfirmed === true
      ) {
        throw new ProtocolError(
          'RETRY_NOT_SAFE',
          403,
          'Retry is not safe for this operation',
        );
      }

      const prior = (operation.result ?? {}) as {
        request?: {
          title?: string;
          description?: string;
          quantity?: number;
          record_version?: number;
        };
      };
      const request = prior.request;
      if (
        !request ||
        typeof request.title !== 'string' ||
        typeof request.quantity !== 'number'
      ) {
        throw new ProtocolError(
          'RETRY_NOT_SAFE',
          403,
          'Original request payload is not available for safe retry',
        );
      }

      const attemptCount = Number(operation.attemptCount ?? 0) + 1;
      await db()
        .updateTable('businessUiOperations')
        .set({
          attemptCount,
          status: 'PENDING',
          resultType: null,
          updatedAt: now(),
        })
        .where('operationId', '=', operationId)
        .execute();

      const embed = await db()
        .selectFrom('businessUiEmbedContexts')
        .selectAll()
        .where('connectionId', '=', connectionId)
        .where('localUserId', '=', userId)
        .where('interactionId', '=', operation.interactionId)
        .orderBy('createdAt', 'desc')
        .executeTakeFirst();
      if (!embed) {
        throw new ProtocolError(
          'EMBED_CONTEXT_REQUIRED',
          403,
          'Embed context required to retry',
        );
      }

      return this.submitDocument(
        connectionId,
        userId,
        String(embed.authSessionRef),
        {
          title: request.title,
          description: request.description ?? '',
          quantity: request.quantity,
          record_version: request.record_version ?? 0,
          idempotency_key: String(operation.idempotencyKey),
        },
      );
    },

    async upsertConnection(input) {
      const createdAt = now();
      const existing = await db()
        .selectFrom('businessUiConnections')
        .selectAll()
        .where('connectionId', '=', input.connectionId)
        .executeTakeFirst();
      const values = {
        connectionId: input.connectionId,
        octopIssuer: input.octopIssuer,
        allowedOrigins: input.allowedOrigins,
        serviceSecretHash: hashServiceSecret(input.serviceSecret),
        enabled: input.enabled ?? true,
        updatedAt: createdAt,
      };
      if (existing) {
        await db()
          .updateTable('businessUiConnections')
          .set(values)
          .where('id', '=', existing.id)
          .execute();
        return { ...(existing as ConnectionRow), ...values };
      }
      const id = randomId('conn');
      await db()
        .insertInto('businessUiConnections')
        .values({ id, ...values, createdAt })
        .execute();
      return { id, ...values, createdAt } as ConnectionRow;
    },

    async upsertForm(input) {
      if (!HANDLER_WHITELIST.has(input.handlerKey)) {
        throw new ProtocolError(
          'FORM_NOT_REGISTERED',
          400,
          'Handler key is not in the whitelist',
        );
      }
      if (input.formRef.includes('://') || input.formRef.startsWith('/')) {
        throw new ProtocolError(
          'FORM_NOT_REGISTERED',
          400,
          'formRef must not be a URL',
        );
      }
      const createdAt = now();
      const existing = await db()
        .selectFrom('businessUiForms')
        .selectAll()
        .where('formRef', '=', input.formRef)
        .where('schemaVersion', '=', input.schemaVersion)
        .executeTakeFirst();
      const values = {
        formRef: input.formRef,
        schemaVersion: input.schemaVersion,
        mode: input.mode,
        handlerKey: input.handlerKey,
        permissionRef: input.permissionRef ?? null,
        documentType: input.documentType ?? DOCUMENT_TYPE,
        enabled: input.enabled ?? true,
        updatedAt: createdAt,
      };
      if (existing) {
        await db()
          .updateTable('businessUiForms')
          .set(values)
          .where('id', '=', existing.id)
          .execute();
        return { ...(existing as FormRow), ...values };
      }
      const id = randomId('form');
      await db()
        .insertInto('businessUiForms')
        .values({ id, ...values, createdAt })
        .execute();
      return { id, ...values, createdAt } as FormRow;
    },

    async listForms() {
      const rows = await db()
        .selectFrom('businessUiForms')
        .selectAll()
        .orderBy('formRef', 'asc')
        .orderBy('schemaVersion', 'asc')
        .execute();
      return rows as FormRow[];
    },

    async reconcileUnknownOperations() {
      const unknowns = await db()
        .selectFrom('businessUiOperations')
        .selectAll()
        .where('status', '=', 'UNKNOWN')
        .execute();
      let fixed = 0;
      for (const operation of unknowns) {
        const receipt = await db()
          .selectFrom('businessUiReceipts')
          .selectAll()
          .where('operationId', '=', operation.operationId)
          .executeTakeFirst();
        if (!receipt) {
          // No receipt and no other proof of completion — keep UNKNOWN.
          continue;
        }
        const payload = receipt.payload as DualNamedReceipt;
        const result = payload.result as
          { status?: string; type?: string } | undefined;
        const resultStatus = result?.status ?? result?.type;
        // N19: only SUCCESS receipt result types prove success; BUSINESS_REJECTED
        // / FAILED never become SUCCESS; unknown shapes leave UNKNOWN.
        if (resultStatus === 'SUCCESS') {
          await db()
            .updateTable('businessUiOperations')
            .set({
              status: 'SUCCEEDED',
              resultType: 'SUCCESS',
              result: payload.result ?? null,
              sideEffectConfirmed: true,
              updatedAt: now(),
            })
            .where('operationId', '=', operation.operationId)
            .where('status', '=', 'UNKNOWN')
            .execute();
          await db()
            .updateTable('businessUiInteractions')
            .set({
              latestReceiptId: receipt.id,
              latestSubmitOperationId: operation.operationId,
              submitSlotOperationId: operation.operationId,
              updatedAt: now(),
            })
            .where('interactionId', '=', operation.interactionId)
            .execute();
          fixed += 1;
        } else if (resultStatus === 'FAILED') {
          // Mark FAILED only when non-execution is proven (receipt says FAILED).
          await db()
            .updateTable('businessUiOperations')
            .set({
              status: 'FAILED',
              resultType: 'FAILED',
              result: payload.result ?? null,
              sideEffectConfirmed: false,
              updatedAt: now(),
            })
            .where('operationId', '=', operation.operationId)
            .where('status', '=', 'UNKNOWN')
            .execute();
          fixed += 1;
        } else if (resultStatus === 'BUSINESS_REJECTED') {
          await db()
            .updateTable('businessUiOperations')
            .set({
              status: 'BUSINESS_REJECTED',
              resultType: 'BUSINESS_REJECTED',
              result: payload.result ?? null,
              sideEffectConfirmed: false,
              updatedAt: now(),
            })
            .where('operationId', '=', operation.operationId)
            .where('status', '=', 'UNKNOWN')
            .execute();
          fixed += 1;
        }
        // Other receipt shapes do not prove SUCCESS or non-execution — leave UNKNOWN.
      }
      return fixed;
    },
  };
}

function renderEmbedHtml(input: {
  connectionId: string;
  interactionId: string;
  formRef: string;
  schemaVersion: string;
  documentType: string;
  recordId: string;
  nonce: string;
  mode: 'edit' | 'detail';
  targetOrigin: string;
  detailFields?: { title: string; description: string; quantity: number };
  publicBaseUrl?: string;
}): string {
  const configuredBase = input.publicBaseUrl?.replace(/\/$/, '');
  const base = configuredBase
    ? `${configuredBase}/v1`
    : `/business-ui/connections/${encodeURIComponent(input.connectionId)}/v1`;
  const readonly = input.mode === 'detail';
  const titleValue = escapeHtml(input.detailFields?.title ?? '');
  const descriptionValue = escapeHtml(input.detailFields?.description ?? '');
  const quantityValue = input.detailFields?.quantity ?? 1;
  const actions = readonly
    ? ''
    : `<div class="actions">
      <button type="button" id="save">Save</button>
      <button type="submit" id="submit">Submit</button>
    </div>`;
  const fieldAttrs = readonly ? 'readonly disabled' : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Generic request</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; max-width: 40rem; }
    label { display: block; margin-top: 0.75rem; }
    input, textarea { width: 100%; box-sizing: border-box; }
    .actions { margin-top: 1.25rem; display: flex; gap: 0.75rem; }
    .meta { color: #555; font-size: 0.875rem; }
  </style>
</head>
<body>
  <h1>Generic request${readonly ? ' (detail)' : ''}</h1>
  <p class="meta">form ${escapeHtml(input.formRef)} · interaction ${escapeHtml(input.interactionId)}</p>
  <form id="doc">
    <input type="hidden" name="nonce" value="${escapeHtml(input.nonce)}">
    <label>Title <input name="title" required maxlength="512" value="${titleValue}" ${fieldAttrs}></label>
    <label>Description <textarea name="description" rows="4" maxlength="4000" ${fieldAttrs}>${descriptionValue}</textarea></label>
    <label>Quantity <input name="quantity" type="number" min="1" max="1000000" value="${quantityValue}" required ${fieldAttrs}></label>
    ${actions}
  </form>
  <pre id="out" class="meta"></pre>
  <script>
    const base = ${JSON.stringify(base)};
    const targetOrigin = ${JSON.stringify(input.targetOrigin)};
    const interactionId = ${JSON.stringify(input.interactionId)};
    const nonce = ${JSON.stringify(input.nonce)};
    const readonly = ${readonly ? 'true' : 'false'};
    const form = document.getElementById('doc');
    const out = document.getElementById('out');
    let recordVersion = 0;
    function hint(phase) {
      if (!targetOrigin || !window.parent || window.parent === window) return;
      window.parent.postMessage(
        { type: 'business-ui/hint', interactionId: interactionId, nonce: nonce, phase: phase },
        targetOrigin
      );
    }
    async function post(path, body) {
      hint('start');
      try {
        const response = await fetch(base + path, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = await response.json();
        out.textContent = JSON.stringify(json, null, 2);
        if (json.record_version != null) recordVersion = json.record_version;
        hint(response.ok ? 'complete' : 'error');
        return json;
      } catch (error) {
        hint('error');
        throw error;
      }
    }
    function payload() {
      const data = new FormData(form);
      return {
        title: data.get('title'),
        description: data.get('description'),
        quantity: Number(data.get('quantity')),
        record_version: recordVersion,
        idempotency_key: 'embed-' + interactionId,
      };
    }
    if (!readonly) {
      document.getElementById('save').onclick = () => post('/documents/save', payload());
      form.onsubmit = (event) => {
        event.preventDefault();
        post('/documents/submit', payload());
      };
    } else {
      form.onsubmit = (event) => event.preventDefault();
    }
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
