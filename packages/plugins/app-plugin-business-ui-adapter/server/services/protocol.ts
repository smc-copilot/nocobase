import type { Auth } from '@nocobase/app-plugin-authentication/server';
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
  sha256Hex,
} from '../crypto.js';
import { serializeReceipt, type DualNamedReceipt } from '../dto.js';
import { ProtocolError } from '../errors.js';
import {
  businessRejectIfNeeded,
  parseGenericRequestFields,
} from '../handlers/generic-request.js';

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
};

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
    },
  ): Promise<Record<string, unknown>>;
  redeemTicket(
    connectionId: string,
    body: { ticket?: string; nonce?: string },
    request: Request,
  ): Promise<{ html: string; setCookies: string[] }>;
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
}): ProtocolServices {
  const db = () => deps.database().connection().query;

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
    return row as BindingRow;
  }

  async function loadEmbed(
    connectionId: string,
    userId: string,
    sessionRef: string,
  ) {
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
    return embed;
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
          documents: true,
          interactions: true,
          operations: true,
          oauth_code_handoff: true,
        },
        paths: {
          ticket_path: '/v1/tickets',
          redeem_path: '/v1/tickets/redeem',
          interaction_path: '/v1/interactions/{id}',
          operation_path: '/v1/operations/{id}',
          save_path: '/v1/documents/save',
          submit_path: '/v1/documents/submit',
          resolve_path: '/v1/forms/resolve',
        },
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
          encryptedCode: sha256Hex(`bui-oauth-code:${code}`),
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
      return {
        pending: false,
        status: 'ready',
        code_digest: row.encryptedCode,
        connection_id: connectionId,
      };
    },

    async issueTicket(connectionId, userId, body) {
      await requireConnection(connectionId);
      const formRef = body.formRef ?? body.form_ref;
      const schemaVersion = body.schemaVersion ?? body.schema_version ?? '1';
      const subjectSub = body.subjectSub ?? body.subject_sub;
      if (!formRef) {
        throw new ProtocolError('INVALID_ARGUMENT', 400, 'formRef is required');
      }
      const form = await requireForm(formRef, schemaVersion);
      const binding = await requireBinding(connectionId, userId, subjectSub);
      const interactionId =
        body.interactionId ?? body.interaction_id ?? randomId('int');
      const recordId = body.recordId ?? body.record_id ?? null;
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
          context: {
            recordId,
            documentType: form.documentType,
            mode: form.mode,
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
        redeem_url: `${base}/v1/tickets/redeem`,
      };
    },

    async redeemTicket(connectionId, body, request) {
      await requireConnection(connectionId);
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
      const authSessionRef = session?.session?.id ?? randomId('session');
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
          actionBounds: ['save', 'submit', 'view_document', 'close'],
          expiresAt: addSeconds(createdAt, EMBED_TTL_SECONDS),
          createdAt,
        })
        .execute();

      const context = (ticketRow.context ?? {}) as {
        recordId?: string | null;
        documentType?: string;
      };
      const html = renderEmbedHtml({
        connectionId,
        interactionId: ticketRow.interactionId,
        formRef: ticketRow.formRef,
        schemaVersion: ticketRow.schemaVersion,
        documentType: context.documentType ?? DOCUMENT_TYPE,
        recordId: context.recordId ?? '',
        nonce,
      });
      return { html, setCookies };
    },

    async saveDocument(connectionId, userId, sessionRef, body) {
      const embed = await loadEmbed(connectionId, userId, sessionRef);
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
        if (document.version !== expectedVersion) {
          throw new ProtocolError(
            'VERSION_CONFLICT',
            409,
            'Document version conflict',
          );
        }
        if (document.status === 'submitted') {
          throw new ProtocolError(
            'INVALID_ARGUMENT',
            400,
            'Submitted documents cannot be saved as drafts',
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

      await db()
        .updateTable('businessUiInteractions')
        .set({
          recordId: savedDocument.formalRecordId ?? savedDocument.draftId,
          updatedAt,
        })
        .where('interactionId', '=', embed.interactionId)
        .execute();

      return serializeReceipt({
        status: 'draft',
        documentType: DOCUMENT_TYPE,
        recordId:
          (savedDocument.formalRecordId as string | null) ??
          (savedDocument.draftId as string),
        formRef: String(embed.formRef),
        schemaVersion: String(embed.schemaVersion),
        recordVersion: Number(savedDocument.version),
        allowedActions: ['save', 'submit', 'view_document', 'close'],
        interactionId: String(embed.interactionId),
        summary: {
          title: savedDocument.title,
          quantity: savedDocument.quantity,
        },
        result: {
          type: 'SUCCESS',
          status: 'SUCCESS',
          code: 'SAVED',
          message: 'Draft saved',
          disclosable: true,
          safe_retry: true,
          idempotent: true,
          side_effect: true,
        },
      });
    },

    async submitDocument(connectionId, userId, sessionRef, body) {
      const embed = await loadEmbed(connectionId, userId, sessionRef);
      const idempotencyKey =
        (typeof body.idempotency_key === 'string' && body.idempotency_key) ||
        (typeof body.idempotencyKey === 'string' && body.idempotencyKey) ||
        randomId('idem');
      const requestDigest = hashRequest({
        title: body.title,
        description: body.description,
        quantity: body.quantity,
        record_version: body.record_version ?? body.recordVersion,
      });

      const existingOp = await db()
        .selectFrom('businessUiOperations')
        .selectAll()
        .where('interactionId', '=', embed.interactionId)
        .where('idempotencyKey', '=', idempotencyKey)
        .executeTakeFirst();
      if (existingOp) {
        if (existingOp.requestDigest !== requestDigest) {
          throw new ProtocolError(
            'VERSION_CONFLICT',
            409,
            'Idempotency key reused with different payload',
          );
        }
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
            recordId: 'UNKNOWN',
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
              side_effect: true,
            },
          });
        }
      }

      const fields = parseGenericRequestFields({
        title: body.title,
        description: body.description,
        quantity: body.quantity,
      });
      const reject = businessRejectIfNeeded(fields);
      const expectedVersion =
        typeof body.record_version === 'number'
          ? body.record_version
          : typeof body.recordVersion === 'number'
            ? body.recordVersion
            : undefined;

      const operationId = randomId('op');
      const createdAt = now();

      // Persist operation before side effects (?11.4).
      await db()
        .insertInto('businessUiOperations')
        .values({
          id: randomId('operation'),
          operationId,
          interactionId: embed.interactionId,
          connectionId,
          localUserId: userId,
          idempotencyKey,
          requestDigest,
          kind: 'submit',
          status: 'UNKNOWN',
          resultType: 'UNKNOWN',
          result: null,
          safeRetry: false,
          createdAt,
          updatedAt: createdAt,
        })
        .execute();

      await db()
        .updateTable('businessUiInteractions')
        .set({
          latestSubmitOperationId: operationId,
          updatedAt: createdAt,
        })
        .where('interactionId', '=', embed.interactionId)
        .execute();

      if (deps.config().faultInjection?.unknownOnSubmit) {
        return serializeReceipt({
          status: 'unknown',
          documentType: DOCUMENT_TYPE,
          recordId: 'UNKNOWN',
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
            side_effect: true,
          },
        });
      }

      if (reject) {
        await db()
          .updateTable('businessUiOperations')
          .set({
            status: 'BUSINESS_REJECTED',
            resultType: 'BUSINESS_REJECTED',
            result: { code: 'BUSINESS_REJECTED', message: reject.message },
            updatedAt: now(),
          })
          .where('operationId', '=', operationId)
          .execute();
        return serializeReceipt({
          status: 'rejected',
          documentType: DOCUMENT_TYPE,
          recordId: 'REJECTED',
          formRef: embed.formRef as string,
          schemaVersion: embed.schemaVersion as string,
          recordVersion: expectedVersion ?? 0,
          allowedActions: ['close'],
          interactionId: embed.interactionId as string,
          operationId,
          result: {
            type: 'BUSINESS_REJECTED',
            status: 'BUSINESS_REJECTED',
            code: 'BUSINESS_REJECTED',
            message: reject.message,
            disclosable: true,
            safe_retry: false,
            idempotent: true,
            side_effect: false,
          },
        });
      }

      const document = await db()
        .selectFrom('integrationTestDocuments')
        .selectAll()
        .where('interactionId', '=', embed.interactionId)
        .executeTakeFirst();

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
      let receiptPayload: DualNamedReceipt | undefined;
      if (interaction.latestReceiptId) {
        const receipt = await db()
          .selectFrom('businessUiReceipts')
          .selectAll()
          .where('id', '=', interaction.latestReceiptId)
          .executeTakeFirst();
        receiptPayload = receipt?.payload as DualNamedReceipt | undefined;
      }
      return {
        interaction_id: interactionId,
        interactionId,
        record_id: interaction.recordId,
        recordId: interaction.recordId,
        latest_submit_operation_id: interaction.latestSubmitOperationId,
        latestSubmitOperationId: interaction.latestSubmitOperationId,
        receipt: receiptPayload ?? null,
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
      const receipt = await db()
        .selectFrom('businessUiReceipts')
        .selectAll()
        .where('operationId', '=', operationId)
        .executeTakeFirst();
      return {
        query_only: true,
        operation_id: operationId,
        operationId,
        status: operation.status,
        result_type: operation.resultType,
        resultType: operation.resultType,
        safe_retry: operation.safeRetry,
        safeRetry: operation.safeRetry,
        receipt: receipt ? receipt.payload : null,
      };
    },

    async retryOperation(connectionId, userId, operationId) {
      const operation = await this.queryOperation(
        connectionId,
        userId,
        operationId,
      );
      if (
        operation.status === 'UNKNOWN' ||
        operation.result_type === 'UNKNOWN'
      ) {
        throw new ProtocolError(
          'RETRY_NOT_SAFE',
          403,
          'UNKNOWN operations cannot be retried',
        );
      }
      if (!operation.safe_retry || operation.status !== 'FAILED') {
        throw new ProtocolError(
          'RETRY_NOT_SAFE',
          403,
          'Retry is not safe for this operation',
        );
      }
      throw new ProtocolError(
        'RETRY_NOT_SAFE',
        403,
        'No safe FAILED operations are eligible in this build',
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
        if (!receipt) continue;
        await db()
          .updateTable('businessUiOperations')
          .set({
            status: 'SUCCEEDED',
            resultType: 'SUCCESS',
            result: (receipt.payload as DualNamedReceipt).result ?? null,
            updatedAt: now(),
          })
          .where('operationId', '=', operation.operationId)
          .where('status', '=', 'UNKNOWN')
          .execute();
        fixed += 1;
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
}): string {
  const base = `/business-ui/connections/${encodeURIComponent(input.connectionId)}/v1`;
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
  <h1>Generic request</h1>
  <p class="meta">form ${escapeHtml(input.formRef)} ? interaction ${escapeHtml(input.interactionId)}</p>
  <form id="doc">
    <input type="hidden" name="nonce" value="${escapeHtml(input.nonce)}">
    <label>Title <input name="title" required maxlength="512"></label>
    <label>Description <textarea name="description" rows="4" maxlength="4000"></textarea></label>
    <label>Quantity <input name="quantity" type="number" min="1" max="1000000" value="1" required></label>
    <div class="actions">
      <button type="button" id="save">Save</button>
      <button type="submit" id="submit">Submit</button>
    </div>
  </form>
  <pre id="out" class="meta"></pre>
  <script>
    const base = ${JSON.stringify(base)};
    const form = document.getElementById('doc');
    const out = document.getElementById('out');
    let recordVersion = 0;
    async function post(path, body) {
      const response = await fetch(base + path, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await response.json();
      out.textContent = JSON.stringify(json, null, 2);
      if (json.record_version != null) recordVersion = json.record_version;
      return json;
    }
    function payload() {
      const data = new FormData(form);
      return {
        title: data.get('title'),
        description: data.get('description'),
        quantity: Number(data.get('quantity')),
        record_version: recordVersion,
        idempotency_key: 'embed-' + ${JSON.stringify(input.interactionId)},
      };
    }
    document.getElementById('save').onclick = () => post('/documents/save', payload());
    form.onsubmit = (event) => {
      event.preventDefault();
      post('/documents/submit', payload());
    };
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
