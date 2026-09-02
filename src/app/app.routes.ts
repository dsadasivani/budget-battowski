import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard',
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./pages/dashboard-page').then((component) => component.DashboardPage),
  },
  {
    path: 'expenses',
    loadComponent: () =>
      import('./pages/expenses-page').then((component) => component.ExpensesPage),
  },
  {
    path: 'sms-transactions',
    loadComponent: () =>
      import('./pages/sms-transactions-page').then((component) => component.SmsTransactionsPage),
  },
  {
    path: 'income',
    loadComponent: () => import('./pages/income-page').then((component) => component.IncomePage),
  },
  {
    path: 'planning',
    loadComponent: () =>
      import('./pages/planning-page').then((component) => component.PlanningPage),
  },
  {
    path: 'investments',
    loadComponent: () =>
      import('./pages/investments-overview-page').then(
        (component) => component.InvestmentsOverviewPage,
      ),
  },
  {
    path: 'investments/:investmentId',
    loadComponent: () =>
      import('./pages/investment-account-detail-page').then(
        (component) => component.InvestmentAccountDetailPage,
      ),
  },
  {
    path: 'loans',
    loadComponent: () => import('./pages/loans-page').then((component) => component.LoansPage),
  },
  {
    path: 'loans/:loanId',
    loadComponent: () =>
      import('./pages/loan-detail-page').then((component) => component.LoanDetailPage),
  },
  {
    path: 'categories',
    loadComponent: () =>
      import('./pages/categories-page').then((component) => component.CategoriesPage),
  },
  {
    path: 'payment-modes',
    loadComponent: () =>
      import('./pages/payment-modes-page').then((component) => component.PaymentModesPage),
  },
  {
    path: 'import-export',
    loadComponent: () =>
      import('./pages/import-export-page').then((component) => component.ImportExportPage),
  },
  {
    path: 'workspace',
    loadComponent: () =>
      import('./pages/workspace-page').then((component) => component.WorkspacePage),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./pages/settings-page').then((component) => component.SettingsPage),
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
