import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { PersistenceError } from '../domain/errors';
import {
  classifyOperationalError,
  OPERATIONAL_TELEMETRY_SINK,
  type OperationalEvent,
  OperationalTelemetryService,
  sanitizeOperationalContext,
  sanitizeRoute,
} from './operational-telemetry';

describe('operational telemetry', () => {
  let events: OperationalEvent[];

  beforeEach(() => {
    events = [];
    TestBed.configureTestingModule({
      providers: [
        OperationalTelemetryService,
        {
          provide: OPERATIONAL_TELEMETRY_SINK,
          useValue: (event: OperationalEvent) => events.push(event),
        },
      ],
    });
  });

  it('classifies Firebase permissions and authentication without logging raw messages', () => {
    expect(classifyOperationalError({ code: 'permission-denied' })).toBe('firestore-permission');
    expect(classifyOperationalError({ code: 'auth/network-request-failed' })).toBe(
      'authentication',
    );
  });

  it('removes query data and unsafe context tokens', () => {
    expect(sanitizeRoute('/expenses?member=user@example.test#details')).toBe('/expenses');
    expect(
      sanitizeOperationalContext({
        workspaceId: 'workspace-safe',
        operation: 'save<script>',
        route: '/planning?amount=5000',
      }),
    ).toEqual({
      workspaceId: 'workspace-safe',
      operation: undefined,
      collection: undefined,
      group: undefined,
      chunk: undefined,
      route: '/planning',
    });
  });

  it('emits correlation fields but never raw domain data or record identifiers', () => {
    const error = new PersistenceError(
      'Failed to persist rent of 5000 for private@example.test in record expense-secret.',
      {
        workspaceId: 'workspace-safe',
        collection: 'expenses',
        operation: 'update',
        group: 'monthly-review',
        chunk: 2,
        recordId: 'expense-secret',
      },
    );

    TestBed.inject(OperationalTelemetryService).capture(error);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      schemaVersion: 1,
      category: 'write-coordinator',
      context: {
        workspaceId: 'workspace-safe',
        collection: 'expenses',
        operation: 'update',
        group: 'monthly-review',
        chunk: 2,
      },
    });
    expect(events[0].sessionId).toBeTruthy();
    expect(events[0].correlationId).toBeTruthy();
    const serialized = JSON.stringify(events[0]);
    expect(serialized).not.toContain('private@example.test');
    expect(serialized).not.toContain('5000');
    expect(serialized).not.toContain('expense-secret');
  });
});
