import type {
  BudgetCategory,
  ExpenseEntry,
  ExpenseTemplate,
  IncomeSource,
  InvestmentEntry,
  Loan,
  PaymentAccount,
  PaymentMode,
  Workspace,
} from './budget.models';

export interface BudgetWorkspaceExport {
  schemaVersion: 1;
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
    loans: Loan[];
  };
}

export function buildWorkspaceExport(
  workspace: Workspace,
  collections: BudgetWorkspaceExport['collections'],
  exportedAt = new Date().toISOString(),
): BudgetWorkspaceExport {
  return {
    schemaVersion: 1,
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
