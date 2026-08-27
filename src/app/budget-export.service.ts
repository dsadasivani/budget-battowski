import type {
  BudgetCategory,
  ExpenseEntry,
  ExpenseTemplate,
  IncomeSource,
  InvestmentEntry,
  PaymentAccount,
  PaymentMode,
  Workspace,
} from './budget.models';
import type {
  LoanAccount,
  LoanDocumentMetadata,
  LoanEvent,
  LoanReconciliation,
} from './domain/loans/loan.models';

export interface BudgetWorkspaceExport {
  schemaVersion: 2;
  exportedAt: string;
  workspace: Workspace;
  collections: {
    paymentAccounts: PaymentAccount[];
    paymentModes: PaymentMode[];
    categories: BudgetCategory[];
    incomes: IncomeSource[];
    templates: ExpenseTemplate[];
    expenses: ExpenseEntry[];
    investments: InvestmentEntry[];
    loanAccounts: LoanAccount[];
    loanEvents: LoanEvent[];
    loanReconciliations: LoanReconciliation[];
    loanDocuments: LoanDocumentMetadata[];
  };
}

export function buildWorkspaceExport(
  workspace: Workspace,
  collections: BudgetWorkspaceExport['collections'],
  exportedAt = new Date().toISOString(),
): BudgetWorkspaceExport {
  return {
    schemaVersion: 2,
    exportedAt,
    workspace: structuredClone(workspace),
    collections: structuredClone(collections),
  };
}

export function workspaceExportFilename(workspace: Workspace, exportedAt: string): string {
  const safeName =
    workspace.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'workspace';
  return `budget-battowski-${safeName}-${exportedAt.slice(0, 10)}.json`;
}

export function parseWorkspaceExport(value: unknown): BudgetWorkspaceExport {
  if (!value || typeof value !== 'object') {
    throw new Error('Workspace snapshot must be a JSON object.');
  }
  const candidate = value as Record<string, unknown>;
  if (candidate['schemaVersion'] !== 1 && candidate['schemaVersion'] !== 2) {
    throw new Error('Unsupported workspace snapshot version.');
  }
  if (!candidate['workspace'] || typeof candidate['workspace'] !== 'object') {
    throw new Error('Workspace snapshot is missing workspace metadata.');
  }
  const collections = candidate['collections'];
  if (!collections || typeof collections !== 'object') {
    throw new Error('Workspace snapshot is missing collections.');
  }
  const source = collections as Record<string, unknown>;
  const required = [
    'paymentAccounts',
    'paymentModes',
    'categories',
    'incomes',
    'templates',
    'expenses',
    'investments',
  ] as const;
  if (required.some((name) => !Array.isArray(source[name]))) {
    throw new Error('Workspace snapshot contains an invalid collection.');
  }
  return {
    schemaVersion: 2,
    exportedAt:
      typeof candidate['exportedAt'] === 'string'
        ? candidate['exportedAt']
        : new Date().toISOString(),
    workspace: structuredClone(candidate['workspace'] as Workspace),
    collections: {
      paymentAccounts: structuredClone(source['paymentAccounts'] as PaymentAccount[]),
      paymentModes: structuredClone(source['paymentModes'] as PaymentMode[]),
      categories: structuredClone(source['categories'] as BudgetCategory[]),
      incomes: structuredClone(source['incomes'] as IncomeSource[]),
      templates: structuredClone(source['templates'] as ExpenseTemplate[]),
      expenses: structuredClone(source['expenses'] as ExpenseEntry[]),
      investments: structuredClone(source['investments'] as InvestmentEntry[]),
      loanAccounts: structuredClone((source['loanAccounts'] ?? []) as LoanAccount[]),
      loanEvents: structuredClone((source['loanEvents'] ?? []) as LoanEvent[]),
      loanReconciliations: structuredClone(
        (source['loanReconciliations'] ?? []) as LoanReconciliation[],
      ),
      loanDocuments: structuredClone((source['loanDocuments'] ?? []) as LoanDocumentMetadata[]),
    },
  };
}
