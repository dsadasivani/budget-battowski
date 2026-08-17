import { ErrorHandler, Injectable, InjectionToken, inject } from '@angular/core';
import { NavigationError, Router } from '@angular/router';

import {
  ConcurrentModificationError,
  MonthlyReviewSourceConflictError,
  PersistenceError,
} from '../domain/errors';
import { appEnvironment } from '../../environments/environment';

export type OperationalErrorCategory =
  | 'authentication'
  | 'firestore'
  | 'firestore-permission'
  | 'monthly-review-source-conflict'
  | 'route-loading'
  | 'unhandled'
  | 'version-conflict'
  | 'write-coordinator';

export type OperationalSeverity = 'warning' | 'error' | 'fatal';

export interface OperationalContext {
  workspaceId?: string;
  collection?: string;
  operation?: string;
  group?: string;
  chunk?: number;
  route?: string;
}

export interface OperationalEvent {
  schemaVersion: 1;
  type: 'operational-error';
  timestamp: string;
  environment: string;
  releaseCommit: string;
  releaseRunId?: string;
  sessionId: string;
  correlationId: string;
  category: OperationalErrorCategory;
  severity: OperationalSeverity;
  code?: string;
  summary: string;
  context?: OperationalContext;
}

interface ReleaseMetadata {
  schemaVersion: 1;
  environment: string;
  commit: string;
  runId?: string;
}

interface CaptureOptions {
  category?: OperationalErrorCategory;
  severity?: OperationalSeverity;
  context?: OperationalContext;
}

type OperationalTelemetrySink = (event: OperationalEvent) => void;

const SAFE_TOKEN = /^[A-Za-z0-9._/-]{1,128}$/;
const SAFE_COMMIT = /^[a-fA-F0-9]{7,64}$/;
const SAFE_RUN_ID = /^\d{1,32}$/;

const CATEGORY_SUMMARIES: Record<OperationalErrorCategory, string> = {
  authentication: 'Authentication operation failed.',
  firestore: 'Firestore operation failed.',
  'firestore-permission': 'Firestore permission was denied.',
  'monthly-review-source-conflict': 'Monthly review source changed concurrently.',
  'route-loading': 'Application route failed to load.',
  unhandled: 'Unhandled application error.',
  'version-conflict': 'A record version conflict was detected.',
  'write-coordinator': 'Coordinated persistence operation failed.',
};

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function safeToken(value: unknown): string | undefined {
  return typeof value === 'string' && SAFE_TOKEN.test(value) ? value : undefined;
}

function errorCode(error: unknown): string | undefined {
  const code = safeToken(recordOf(error)?.['code']);
  if (
    code === 'permission-denied' ||
    code === 'persistence-error' ||
    code === 'concurrent-modification' ||
    code === 'monthly-review-source-conflict' ||
    code?.startsWith('auth/') ||
    code?.startsWith('firestore/')
  ) {
    return code.slice(0, 64);
  }
  return undefined;
}

export function sanitizeRoute(url: string): string {
  const path = url.split(/[?#]/, 1)[0];
  return path.startsWith('/') && SAFE_TOKEN.test(path) ? path : '/unknown';
}

export function classifyOperationalError(error: unknown): OperationalErrorCategory {
  if (error instanceof MonthlyReviewSourceConflictError) {
    return 'monthly-review-source-conflict';
  }
  if (error instanceof ConcurrentModificationError) {
    return 'version-conflict';
  }
  if (error instanceof PersistenceError) {
    return 'write-coordinator';
  }

  const code = errorCode(error)?.replace(/^firestore\//, '');
  if (code === 'permission-denied') {
    return 'firestore-permission';
  }
  if (code?.startsWith('auth/')) {
    return 'authentication';
  }
  return 'unhandled';
}

export function sanitizeOperationalContext(
  context: OperationalContext | undefined,
): OperationalContext | undefined {
  if (!context) {
    return undefined;
  }

  const sanitized: OperationalContext = {
    workspaceId: safeToken(context.workspaceId),
    collection: safeToken(context.collection),
    operation: safeToken(context.operation),
    group: safeToken(context.group),
    chunk:
      Number.isSafeInteger(context.chunk) && (context.chunk ?? -1) >= 0 ? context.chunk : undefined,
    route: context.route ? sanitizeRoute(context.route) : undefined,
  };

  return Object.values(sanitized).some((value) => value !== undefined) ? sanitized : undefined;
}

function contextFromError(error: unknown): OperationalContext | undefined {
  if (!(error instanceof PersistenceError) && !(error instanceof ConcurrentModificationError)) {
    return undefined;
  }
  const errorRecord = recordOf(error);
  const contextRecord = recordOf(errorRecord?.['context']);
  if (!contextRecord) {
    return undefined;
  }

  return sanitizeOperationalContext({
    workspaceId: safeToken(contextRecord['workspaceId']),
    collection: safeToken(contextRecord['collection']),
    operation: safeToken(contextRecord['operation']),
    group: safeToken(contextRecord['group']),
    chunk: typeof contextRecord['chunk'] === 'number' ? contextRecord['chunk'] : undefined,
  });
}

function mergeContext(
  errorContext: OperationalContext | undefined,
  suppliedContext: OperationalContext | undefined,
): OperationalContext | undefined {
  return sanitizeOperationalContext({ ...errorContext, ...suppliedContext });
}

export const OPERATIONAL_TELEMETRY_SINK = new InjectionToken<OperationalTelemetrySink>(
  'OPERATIONAL_TELEMETRY_SINK',
  {
    providedIn: 'root',
    factory: () => (event) => console.error('[operational-event]', JSON.stringify(event)),
  },
);

@Injectable({ providedIn: 'root' })
export class OperationalTelemetryService {
  private readonly sink = inject(OPERATIONAL_TELEMETRY_SINK);
  private readonly sessionId = randomId();
  private releaseCommit = 'unknown';
  private releaseRunId: string | undefined;
  private initialized = false;

  initialize(): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;
    void this.loadReleaseMetadata();
  }

  capture(error: unknown, options: CaptureOptions = {}): string {
    const inferredCategory = classifyOperationalError(error);
    const category =
      options.category === 'firestore'
        ? inferredCategory === 'unhandled'
          ? 'firestore'
          : inferredCategory
        : (options.category ?? inferredCategory);
    const correlationId = randomId();
    const code = errorCode(error);
    const context = mergeContext(contextFromError(error), options.context);
    const event: OperationalEvent = {
      schemaVersion: 1,
      type: 'operational-error',
      timestamp: new Date().toISOString(),
      environment: appEnvironment.name,
      releaseCommit: this.releaseCommit,
      releaseRunId: this.releaseRunId,
      sessionId: this.sessionId,
      correlationId,
      category,
      severity: options.severity ?? 'error',
      code,
      summary: CATEGORY_SUMMARIES[category],
      context,
    };

    this.sink(event);
    return correlationId;
  }

  private async loadReleaseMetadata(): Promise<void> {
    try {
      const response = await fetch('/release.json', { cache: 'no-store' });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
        return;
      }
      const metadata = (await response.json()) as Partial<ReleaseMetadata>;
      if (
        metadata.schemaVersion !== 1 ||
        metadata.environment !== appEnvironment.name.toLowerCase() ||
        typeof metadata.commit !== 'string' ||
        !SAFE_COMMIT.test(metadata.commit)
      ) {
        return;
      }
      this.releaseCommit = metadata.commit;
      this.releaseRunId =
        typeof metadata.runId === 'string' && SAFE_RUN_ID.test(metadata.runId)
          ? metadata.runId
          : undefined;
    } catch {
      // Local development and pre-observability deployments may not expose release metadata.
    }
  }
}

@Injectable()
export class OperationalErrorHandler implements ErrorHandler {
  private readonly telemetry = inject(OperationalTelemetryService);

  handleError(error: unknown): void {
    this.telemetry.capture(error, { category: 'unhandled', severity: 'fatal' });
  }
}

@Injectable({ providedIn: 'root' })
export class OperationalRouterMonitor {
  private readonly router = inject(Router);
  private readonly telemetry = inject(OperationalTelemetryService);
  private started = false;

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationError) {
        this.telemetry.capture(event.error, {
          category: 'route-loading',
          context: { route: event.url },
        });
      }
    });
  }
}

export function reportBootstrapFailure(error: unknown): void {
  const event: OperationalEvent = {
    schemaVersion: 1,
    type: 'operational-error',
    timestamp: new Date().toISOString(),
    environment: appEnvironment.name,
    releaseCommit: 'unknown',
    sessionId: randomId(),
    correlationId: randomId(),
    category: 'unhandled',
    severity: 'fatal',
    code: errorCode(error),
    summary: 'Application bootstrap failed.',
  };
  console.error('[operational-event]', JSON.stringify(event));
}
