import {
  DEFAULT_HEALTH_CACHE_TTL_MS,
  DEFAULT_HEALTH_CONCURRENCY,
  DEFAULT_HEALTH_TIMEOUT_MS,
} from '../config.js';
import type { PortalApplicationRecord } from './application-catalog.js';

export type HealthStatus = 'healthy' | 'unhealthy' | 'unknown';

export interface HealthSnapshot {
  readonly appCode: string;
  readonly status: HealthStatus;
  readonly checkedAt: Date;
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

interface CacheEntry {
  readonly status: HealthStatus;
  readonly expiresAt: number;
  readonly checkedAt: Date;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

export class HealthProbeService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly options: () => {
      readonly timeoutMs?: number;
      readonly concurrency?: number;
      readonly cacheTtlMs?: number;
    },
    private readonly fetchImpl: Fetcher = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public clearCache(): void {
    this.cache.clear();
  }

  public async probe(record: PortalApplicationRecord): Promise<HealthSnapshot> {
    const ttl = this.options().cacheTtlMs ?? DEFAULT_HEALTH_CACHE_TTL_MS;
    const cached = this.cache.get(record.appCode);
    const now = this.now().getTime();
    if (cached && cached.expiresAt > now) {
      return {
        appCode: record.appCode,
        status: cached.status,
        checkedAt: cached.checkedAt,
      };
    }
    const url = record.healthUrl ?? record.baseUrl;
    const timeoutMs = this.options().timeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS;
    const checkedAt = this.now();
    let status: HealthStatus;
    try {
      const response = await this.fetchImpl(url, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
      status =
        response.status >= 200 && response.status < 400
          ? 'healthy'
          : 'unhealthy';
    } catch {
      status = 'unhealthy';
    }
    this.cache.set(record.appCode, {
      status,
      checkedAt,
      expiresAt: now + ttl,
    });
    return { appCode: record.appCode, status, checkedAt };
  }

  public async probeMany(
    records: readonly PortalApplicationRecord[],
  ): Promise<readonly HealthSnapshot[]> {
    const concurrency =
      this.options().concurrency ?? DEFAULT_HEALTH_CONCURRENCY;
    const results: HealthSnapshot[] = [];
    for (const group of chunk(records, concurrency)) {
      results.push(
        ...(await Promise.all(group.map((record) => this.probe(record)))),
      );
    }
    return results;
  }
}
