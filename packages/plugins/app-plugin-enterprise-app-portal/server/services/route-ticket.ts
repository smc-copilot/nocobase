import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

import { importPKCS8, importSPKI, jwtVerify, SignJWT } from 'jose';

import {
  DEFAULT_ROUTE_AUDIENCE,
  DEFAULT_ROUTE_ISSUER,
  DEFAULT_ROUTE_TICKET_TTL_SECONDS,
  MAX_ROUTE_TICKET_TTL_SECONDS,
  MIN_ROUTE_TICKET_TTL_SECONDS,
  PORTAL_ROUTE_REDEEM_TOKEN_ENV,
  PORTAL_ROUTE_SIGNING_KEY_ENV,
  type EnterpriseAppPortalConfig,
} from '../config.js';
import { portalError } from '../errors.js';
import type { AccessAuditLog } from './access-audit.js';
import type { ApplicationLaunchService } from './application-launch.js';
import type { AccessIdentity } from './casdoor-application-access.js';
import type { CasdoorSubjectResolver } from './casdoor-subject-resolver.js';
import { RouteTicketStore } from './route-ticket-store.js';

type JoseKey = Awaited<ReturnType<typeof importPKCS8>>;

export interface IssueRouteTicketInput {
  readonly appCode: string;
  readonly mode: 'auto' | 'selected';
}

export interface IssuedRouteTicket {
  readonly ticket: string;
  readonly appCode: string;
  readonly expiresIn: number;
  readonly requestId: string;
  readonly submission: {
    readonly method: 'POST';
    readonly url: string;
  };
}

export interface RedeemedRouteTicket {
  readonly appCode: string;
  readonly publicUrl: string;
  readonly casdoorSubject: string;
  readonly ticketId: string;
  readonly consumed: true;
}

interface TicketClaims {
  readonly iss: string;
  readonly aud: string;
  readonly sub: string;
  readonly app_code: string;
  readonly iat: number;
  readonly nbf: number;
  readonly exp: number;
  readonly jti: string;
  readonly request_id: string;
  readonly v: 1;
}

export class RouteTicketService {
  private privateKey: JoseKey | undefined;
  private publicKey: JoseKey | undefined;

  constructor(
    private readonly config: () => EnterpriseAppPortalConfig,
    private readonly env: () => Readonly<Record<string, string | undefined>>,
    private readonly subjects: CasdoorSubjectResolver,
    private readonly launch: ApplicationLaunchService,
    private readonly store: RouteTicketStore,
    private readonly audit: AccessAuditLog,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public routingEnabled(): boolean {
    return this.config().routing?.enabled === true;
  }

  public assertRoutingEnabled(): void {
    if (!this.routingEnabled()) {
      throw portalError(
        'FAILED_PRECONDITION',
        'ROUTE_DEPENDENCY_UNAVAILABLE',
        'Portal route tickets are disabled.',
      );
    }
  }

  public assertRedeemCredential(authorizationHeader: string | undefined): void {
    const expected =
      this.env()[
        this.config().routing?.redeemServiceCredentialEnv ??
          PORTAL_ROUTE_REDEEM_TOKEN_ENV
      ]?.trim();
    if (!expected) {
      throw portalError(
        'UNAVAILABLE',
        'ROUTE_DEPENDENCY_UNAVAILABLE',
        'Route ticket redeem credentials are not configured.',
      );
    }
    const presented = parseBearer(authorizationHeader);
    if (!presented || !credentialsMatch(presented, expected)) {
      throw portalError(
        'UNAUTHENTICATED',
        'AUTH_REQUIRED',
        'A valid route redeem service credential is required.',
      );
    }
  }

  public async issue(
    session: AccessIdentity,
    input: IssueRouteTicketInput,
  ): Promise<IssuedRouteTicket> {
    this.assertRoutingEnabled();
    const routing = this.config().routing ?? {};
    const requireBinding = routing.requireBinding !== false;
    const bound = await this.subjects.requireForUser(session.userId);
    const identity: AccessIdentity = {
      ...session,
      casdoorUserId: bound.casdoorUserId,
    };
    const candidates = await this.launch.listRoutingCandidates(identity, {
      requireBinding,
    });
    if (candidates.applications.length === 0) {
      throw portalError(
        'PERMISSION_DENIED',
        'APP_ACCESS_DENIED',
        'No authorized Octop applications are available for routing.',
      );
    }
    const appCode = input.appCode.trim();
    if (input.mode === 'auto') {
      if (
        !candidates.suggestedAppCode ||
        candidates.suggestedAppCode !== appCode
      ) {
        throw portalError(
          'FAILED_PRECONDITION',
          'ROUTE_SELECTION_REQUIRED',
          'Automatic routing requires the current suggested application.',
        );
      }
    } else if (
      !candidates.applications.some((entry) => entry.appCode === appCode)
    ) {
      throw portalError(
        'PERMISSION_DENIED',
        'APP_ACCESS_DENIED',
        'The selected application is not authorized for this user.',
      );
    }

    const launched = await this.launch.launch(identity, appCode);
    const ttl = clampTtl(routing.ticketTtlSeconds);
    const issuedAt = this.now();
    const expiresAt = new Date(issuedAt.getTime() + ttl * 1000);
    const jti = randomUUID();
    const requestId = randomUUID();
    const issuer = routing.issuer?.trim() || DEFAULT_ROUTE_ISSUER;
    const audience = routing.audience?.trim() || DEFAULT_ROUTE_AUDIENCE;
    const kid = routing.signingKeyId?.trim() || 'portal-2026-01';
    const claims: TicketClaims = {
      iss: issuer,
      aud: audience,
      sub: bound.casdoorUserId,
      app_code: appCode,
      iat: Math.floor(issuedAt.getTime() / 1000),
      nbf: Math.floor(issuedAt.getTime() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
      jti,
      request_id: requestId,
      v: 1,
    };
    const ticket = await new SignJWT({ ...claims })
      .setProtectedHeader({ alg: 'EdDSA', kid, typ: 'JWT' })
      .sign(await this.loadPrivateKey());
    await this.store.insert({
      jti,
      localUserId: session.userId,
      casdoorSubject: bound.casdoorUserId,
      appCode,
      requestId,
      issuedAt,
      expiresAt,
    });
    const submissionUrl = requireRouterEntryUrl(routing.publicRouterEntryUrl);
    await this.audit.record({
      actorUserId: session.userId,
      appCode,
      action: 'routeTicket.issue',
      result: 'success',
      metadata: {
        requestId,
        jtiHash: createHash('sha256').update(jti, 'utf8').digest('hex'),
        mode: input.mode,
        publicUrlHost: safeHost(launched.url),
      },
    });
    return {
      ticket,
      appCode,
      expiresIn: ttl,
      requestId,
      submission: { method: 'POST', url: submissionUrl },
    };
  }

  public async redeem(input: {
    readonly ticket: string;
    readonly requestId?: string;
  }): Promise<RedeemedRouteTicket> {
    this.assertRoutingEnabled();
    const routing = this.config().routing ?? {};
    const requireBinding = routing.requireBinding !== false;
    const recheck = routing.recheckEnforceOnRedeem !== false;
    const issuer = routing.issuer?.trim() || DEFAULT_ROUTE_ISSUER;
    const audience = routing.audience?.trim() || DEFAULT_ROUTE_AUDIENCE;
    let payload: TicketClaims;
    try {
      const verified = await jwtVerify(
        input.ticket,
        await this.loadPublicKey(),
        {
          issuer,
          audience,
          algorithms: ['EdDSA'],
        },
      );
      payload = verified.payload as unknown as TicketClaims;
    } catch {
      throw portalError(
        'PERMISSION_DENIED',
        'APP_ACCESS_DENIED',
        'The route ticket signature or claims are invalid.',
      );
    }
    if (
      payload.v !== 1 ||
      typeof payload.jti !== 'string' ||
      typeof payload.sub !== 'string' ||
      typeof payload.app_code !== 'string'
    ) {
      throw portalError(
        'INVALID_ARGUMENT',
        'APP_ACCESS_DENIED',
        'The route ticket payload is incomplete.',
      );
    }
    const now = this.now();
    const consumed = await this.store.tryConsume({ jti: payload.jti, now });
    const identity: AccessIdentity = {
      userId: consumed.localUserId,
      casdoorUserId: payload.sub,
    };
    try {
      const launched = await this.launch.launch(identity, payload.app_code, {
        bypassCache: recheck,
        requireBinding,
      });
      await this.audit.record({
        actorUserId: consumed.localUserId,
        appCode: payload.app_code,
        action: 'routeTicket.redeem',
        result: 'success',
        metadata: {
          requestId: input.requestId ?? payload.request_id,
          ticketId: consumed.id,
          publicUrlHost: safeHost(launched.url),
        },
      });
      return {
        appCode: payload.app_code,
        publicUrl: launched.url,
        casdoorSubject: payload.sub,
        ticketId: consumed.id,
        consumed: true,
      };
    } catch (error) {
      await this.store.markResult(consumed.id, 'denied');
      await this.audit.record({
        actorUserId: consumed.localUserId,
        appCode: payload.app_code,
        action: 'routeTicket.redeem',
        result: 'denied',
        reason:
          error instanceof Error && 'reason' in error
            ? String((error as { reason: string }).reason)
            : 'APP_ACCESS_DENIED',
        metadata: {
          requestId: input.requestId ?? payload.request_id,
          ticketId: consumed.id,
        },
      });
      throw error;
    }
  }

  private async loadPrivateKey(): Promise<JoseKey> {
    if (this.privateKey) return this.privateKey;
    const envName =
      this.config().routing?.signingKeyEnv ?? PORTAL_ROUTE_SIGNING_KEY_ENV;
    const raw = this.env()[envName]?.trim();
    if (!raw) {
      throw portalError(
        'UNAVAILABLE',
        'ROUTE_DEPENDENCY_UNAVAILABLE',
        'Route ticket signing key is not configured.',
      );
    }
    const pem = raw.includes('BEGIN')
      ? raw.replace(/\\n/gu, '\n')
      : Buffer.from(raw, 'base64').toString('utf8');
    this.privateKey = await importPKCS8(pem, 'EdDSA');
    return this.privateKey;
  }

  private async loadPublicKey(): Promise<JoseKey> {
    if (this.publicKey) return this.publicKey;
    const envName =
      this.config().routing?.signingKeyEnv ?? PORTAL_ROUTE_SIGNING_KEY_ENV;
    const raw = this.env()[envName]?.trim();
    if (!raw) {
      throw portalError(
        'UNAVAILABLE',
        'ROUTE_DEPENDENCY_UNAVAILABLE',
        'Route ticket signing key is not configured.',
      );
    }
    const pem = raw.includes('BEGIN')
      ? raw.replace(/\\n/gu, '\n')
      : Buffer.from(raw, 'base64').toString('utf8');
    const spki = createPublicKey(createPrivateKey(pem)).export({
      type: 'spki',
      format: 'pem',
    });
    this.publicKey = await importSPKI(String(spki), 'EdDSA');
    return this.publicKey;
  }
}

function credentialsMatch(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function clampTtl(value: number | undefined): number {
  const ttl = value ?? DEFAULT_ROUTE_TICKET_TTL_SECONDS;
  return Math.min(
    MAX_ROUTE_TICKET_TTL_SECONDS,
    Math.max(MIN_ROUTE_TICKET_TTL_SECONDS, Math.trunc(ttl)),
  );
}

function requireRouterEntryUrl(value: string | undefined): string {
  const text = value?.trim();
  if (!text) {
    throw portalError(
      'FAILED_PRECONDITION',
      'ROUTE_DEPENDENCY_UNAVAILABLE',
      'publicRouterEntryUrl is not configured.',
    );
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw portalError(
      'FAILED_PRECONDITION',
      'ROUTE_DEPENDENCY_UNAVAILABLE',
      'publicRouterEntryUrl is not a valid absolute URL.',
    );
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw portalError(
      'FAILED_PRECONDITION',
      'ROUTE_DEPENDENCY_UNAVAILABLE',
      'publicRouterEntryUrl must use http or https.',
    );
  }
  return url.toString();
}

function parseBearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/iu.exec(header.trim());
  return match?.[1]?.trim() || undefined;
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}
