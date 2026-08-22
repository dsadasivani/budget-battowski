import { describe, expect, it } from 'vitest';

import type { BudgetWorkspaceExport } from './budget-export.service';
import {
  buildWorkspaceExport,
  parseWorkspaceExport,
  workspaceExportFilename,
} from './budget-export.service';
import type { Workspace } from './budget.models';

describe('workspace export helpers', () => {
  const workspace: Workspace = {
    id: 'workspace-family',
    name: 'Family & Home',
    ownerUid: 'owner-uid',
    memberUids: ['owner-uid'],
    members: [
      {
        uid: 'owner-uid',
        email: 'owner@example.com',
        displayName: 'Owner',
        role: 'owner',
        createdDate: '2026-01-01T00:00:00.000Z',
      },
    ],
    createdDate: '2026-01-01T00:00:00.000Z',
    updatedDate: '2026-08-15T00:00:00.000Z',
  };

  it('exports every persisted workspace collection and preserves audit history', () => {
    const collections: BudgetWorkspaceExport['collections'] = {
      paymentAccounts: [],
      paymentModes: [
        {
          id: 'payment-mode-cash',
          type: 'cash',
          name: 'Cash',
          workspaceGlobal: true,
        },
      ],
      categories: [],
      incomes: [
        {
          id: 'income-salary',
          source: 'Salary',
          amount: 100000,
          cadence: 'monthly',
          notes: '',
          memberEmail: 'owner@example.com',
          auditTrail: [
            {
              id: 'audit-income-created',
              operation: 'created',
              recordedDate: '2026-01-01T00:00:00.000Z',
              source: 'Salary',
              amount: 100000,
              cadence: 'monthly',
              memberEmail: 'owner@example.com',
            },
          ],
        },
      ],
      templates: [],
      expenses: [],
      investments: [],
      loans: [],
      loanAccounts: [],
      loanEvents: [],
      loanReconciliations: [],
      loanDocuments: [],
    };

    const result = buildWorkspaceExport(workspace, collections, '2026-08-15T10:30:00.000Z');

    expect(result.schemaVersion).toBe(2);
    expect(Object.keys(result.collections).sort()).toEqual(
      [
        'categories',
        'expenses',
        'incomes',
        'investments',
        'loans',
        'loanAccounts',
        'loanEvents',
        'loanReconciliations',
        'loanDocuments',
        'paymentAccounts',
        'paymentModes',
        'templates',
      ].sort(),
    );
    expect(result.collections.incomes[0].auditTrail).toHaveLength(1);
    expect(result.collections.incomes[0].memberEmail).toBe('owner@example.com');
    expect(result.collections.paymentModes[0].workspaceGlobal).toBe(true);
  });

  it('returns a detached snapshot and a filesystem-safe filename', () => {
    const result = buildWorkspaceExport(
      workspace,
      {
        paymentAccounts: [],
        paymentModes: [],
        categories: [],
        incomes: [],
        templates: [],
        expenses: [],
        investments: [],
        loans: [],
        loanAccounts: [],
        loanEvents: [],
        loanReconciliations: [],
        loanDocuments: [],
      },
      '2026-08-15T10:30:00.000Z',
    );

    result.workspace.name = 'Changed after export';

    expect(workspace.name).toBe('Family & Home');
    expect(workspaceExportFilename(workspace, result.exportedAt)).toBe(
      'budget-battowski-family-home-2026-08-15.json',
    );
  });

  it('round-trips Loan V2 collections and safely reads schema 1 snapshots', () => {
    const legacy = parseWorkspaceExport({
      schemaVersion: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      workspace,
      collections: {
        paymentAccounts: [],
        paymentModes: [],
        categories: [],
        incomes: [],
        templates: [],
        expenses: [],
        investments: [],
        loans: [],
      },
    });
    expect(legacy.collections.loanAccounts).toEqual([]);
    expect(legacy.collections.loanEvents).toEqual([]);
    expect(() => parseWorkspaceExport({ schemaVersion: 99 })).toThrow(/Unsupported/);
  });
});
