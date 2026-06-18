import { readFileSync } from 'node:fs';
import path from 'node:path';

export const QA_WORKSPACE_ID = 'qa-regression-workspace';
export const QA_WORKSPACE_NAME = 'QA Regression Workspace';
export const QA_BASE_MONTH = '2026-06';
export const QA_ACCOUNTS = {
  owner: 'qa.owner@budget.test',
  editor: 'qa.editor@budget.test',
  member: 'qa.member@budget.test',
};
export const QA_COLLECTIONS = [
  'paymentAccounts',
  'paymentModes',
  'categories',
  'incomes',
  'templates',
  'expenses',
  'investments',
  'loans',
];

export function readQaFirebaseConfig(cwd = process.cwd()) {
  const environmentPath = path.join(cwd, 'src', 'environments', 'environment.qa.ts');
  const source = readFileSync(environmentPath, 'utf8');
  const block = source.match(/firebaseConfig\s*=\s*\{([\s\S]*?)\};/)?.[1];

  if (!block) {
    throw new Error(`Unable to read firebaseConfig from ${environmentPath}`);
  }

  return Object.fromEntries(
    [...block.matchAll(/^\s*([a-zA-Z0-9_]+):\s*'([^']*)'/gm)].map((match) => [
      match[1],
      match[2],
    ]),
  );
}

export function buildQaSeedData() {
  const now = '2026-06-17T09:00:00.000Z';
  const archived = '2026-05-20T09:00:00.000Z';
  const owner = QA_ACCOUNTS.owner;
  const editor = QA_ACCOUNTS.editor;
  const member = QA_ACCOUNTS.member;

  const workspace = {
    id: QA_WORKSPACE_ID,
    name: QA_WORKSPACE_NAME,
    ownerEmail: owner,
    memberEmails: [owner, editor, member],
    members: [
      { email: owner, displayName: 'QA Owner', role: 'owner', createdDate: now },
      { email: editor, displayName: 'QA Editor', role: 'editor', createdDate: now },
      { email: member, displayName: 'QA Member', role: 'editor', createdDate: now },
    ],
    createdDate: now,
    updatedDate: now,
  };

  const categories = [
    { id: 'cat-salary', name: 'Salary', monthlyBudget: 0, color: '#0f766e', type: 'Income' },
    { id: 'cat-bonus', name: 'Bonus', monthlyBudget: 0, color: '#1d4ed8', type: 'Income' },
    { id: 'cat-rent', name: 'Rent', monthlyBudget: 36000, color: '#7c3aed', type: 'Expenses' },
    {
      id: 'cat-groceries',
      name: 'Groceries',
      monthlyBudget: 18000,
      color: '#16a34a',
      type: 'Expenses',
    },
    {
      id: 'cat-utilities',
      name: 'Utilities',
      monthlyBudget: 9500,
      color: '#0f766e',
      type: 'Expenses',
    },
    { id: 'cat-travel', name: 'Travel', monthlyBudget: 12000, color: '#d97706', type: 'Expenses' },
    { id: 'cat-health', name: 'Health', monthlyBudget: 6000, color: '#be123c', type: 'Expenses' },
    {
      id: 'cat-investments',
      name: 'Investments',
      monthlyBudget: 30000,
      color: '#1d4ed8',
      type: 'Investments',
    },
    {
      id: 'category-loan-emi',
      name: 'Loan EMI',
      monthlyBudget: 0,
      color: '#4b5563',
      type: 'Expenses',
    },
  ];

  const paymentAccounts = [
    { id: 'acct-hdfc', name: 'HDFC Everyday QA', bankName: 'HDFC', lastFour: '4321', createdDate: now },
    { id: 'acct-sbi', name: 'SBI EMI QA', bankName: 'SBI', lastFour: '2468', createdDate: now },
    { id: 'acct-axis', name: 'Axis Backup QA', bankName: 'Axis', lastFour: '1357', createdDate: now },
    {
      id: 'acct-archived',
      name: 'Old ICICI QA',
      bankName: 'ICICI',
      lastFour: '9090',
      createdDate: now,
      archivedDate: archived,
    },
  ];

  const paymentModes = [
    { id: 'payment-mode-cash', type: 'cash', name: 'Cash', createdDate: now },
    {
      id: 'pm-upi-gpay',
      type: 'upi',
      provider: 'Google Pay',
      name: 'Google Pay QA',
      paymentAccountId: 'acct-hdfc',
      createdDate: now,
    },
    {
      id: 'pm-wallet-paytm',
      type: 'wallet',
      provider: 'Paytm',
      name: 'Paytm Wallet QA',
      createdDate: now,
    },
    {
      id: 'pm-card-visa',
      type: 'credit-card',
      name: 'Visa Credit QA',
      cardType: 'visa',
      lastFour: '9002',
      paymentAccountId: 'acct-hdfc',
      createdDate: now,
    },
    {
      id: 'pm-card-rupay',
      type: 'debit-card',
      name: 'RuPay Debit QA',
      cardType: 'rupay',
      lastFour: '7711',
      paymentAccountId: 'acct-sbi',
      createdDate: now,
    },
    {
      id: 'pm-netbanking-sbi',
      type: 'internet-banking',
      name: 'SBI NetBanking QA',
      bankName: 'SBI',
      paymentAccountId: 'acct-sbi',
      createdDate: now,
    },
    {
      id: 'pm-archive-target',
      type: 'wallet',
      provider: 'BHIM',
      name: 'Archive Target QA',
      createdDate: now,
    },
    {
      id: 'pm-archived-upi',
      type: 'upi',
      provider: 'PhonePe',
      name: 'Old PhonePe QA',
      paymentAccountId: 'acct-archived',
      createdDate: now,
      archivedDate: archived,
    },
  ];

  const incomes = [
    {
      id: 'income-salary-owner',
      source: 'Owner Salary',
      amount: 125000,
      cadence: 'monthly',
      categoryId: 'cat-salary',
      notes: 'QA monthly salary',
      startDate: '2026-01-01',
      memberEmail: owner,
    },
    {
      id: 'income-editor-salary',
      source: 'Editor Salary',
      amount: 85000,
      cadence: 'monthly',
      categoryId: 'cat-salary',
      notes: 'QA member salary',
      startDate: '2026-01-01',
      memberEmail: editor,
    },
    {
      id: 'income-one-time-bonus',
      source: 'June Bonus',
      amount: 35000,
      cadence: 'one-time',
      categoryId: 'cat-bonus',
      notes: 'QA one-time income',
      month: '2026-06',
      memberEmail: member,
    },
  ];

  const templates = [
    {
      id: 'tpl-rent-monthly',
      name: 'Monthly Rent',
      categoryId: 'cat-rent',
      amount: 32000,
      type: 'recurring',
      frequency: 'monthly',
      startDate: '2026-01-05',
      memberEmail: owner,
      paymentModeId: 'pm-upi-gpay',
      auditTrail: [
        {
          id: 'audit-rent-created',
          operation: 'created',
          recordedDate: '2026-01-05T08:00:00.000Z',
          name: 'Monthly Rent',
          categoryId: 'cat-rent',
          amount: 32000,
          frequency: 'monthly',
          startDate: '2026-01-05',
          memberEmail: owner,
          paymentModeId: 'pm-upi-gpay',
        },
      ],
    },
    {
      id: 'tpl-utilities-weekly',
      name: 'Weekly Utilities',
      categoryId: 'cat-utilities',
      amount: 650,
      type: 'recurring',
      frequency: 'weekly',
      startDate: '2026-06-03',
      memberEmail: editor,
      paymentModeId: 'pm-card-rupay',
    },
    {
      id: 'tpl-insurance-quarterly',
      name: 'Quarterly Insurance',
      categoryId: 'cat-health',
      amount: 7200,
      type: 'recurring',
      frequency: 'quarterly',
      startDate: '2026-03-10',
      memberEmail: owner,
      paymentModeId: 'pm-netbanking-sbi',
    },
    {
      id: 'tpl-school-half-yearly',
      name: 'Half-yearly School Fee',
      categoryId: 'cat-utilities',
      amount: 24000,
      type: 'recurring',
      frequency: 'half-yearly',
      startDate: '2026-06-12',
      memberEmail: member,
      paymentModeId: 'pm-upi-gpay',
    },
    {
      id: 'tpl-annual-renewal',
      name: 'Annual Software Renewal',
      categoryId: 'cat-utilities',
      amount: 11800,
      type: 'recurring',
      frequency: 'annual',
      startDate: '2026-06-18',
      memberEmail: editor,
      paymentModeId: 'pm-card-visa',
    },
    {
      id: 'tpl-ended-subscription',
      name: 'Ended Subscription',
      categoryId: 'cat-utilities',
      amount: 999,
      type: 'recurring',
      frequency: 'monthly',
      startDate: '2026-01-01',
      endDate: '2026-05-31',
      memberEmail: owner,
      paymentModeId: 'pm-card-visa',
    },
    {
      id: 'tpl-skipped-current',
      name: 'Skipped Current Month',
      categoryId: 'cat-travel',
      amount: 3000,
      type: 'recurring',
      frequency: 'monthly',
      startDate: '2026-01-20',
      skippedMonths: ['2026-06'],
      memberEmail: member,
      paymentModeId: 'pm-wallet-paytm',
    },
  ];

  const expenses = [
    {
      id: 'exp-2026-05-groceries',
      month: '2026-05',
      date: '2026-05-11',
      name: 'May Groceries',
      categoryId: 'cat-groceries',
      amount: 4100.5,
      type: 'one-time',
      note: 'Past month baseline',
      memberEmail: owner,
      paymentModeId: 'pm-upi-gpay',
    },
    {
      id: 'exp-2026-06-groceries',
      month: '2026-06',
      date: '2026-06-12',
      name: 'June Groceries',
      categoryId: 'cat-groceries',
      amount: 5820.75,
      type: 'one-time',
      note: 'Current month grocery run',
      memberEmail: owner,
      paymentModeId: 'pm-upi-gpay',
    },
    {
      id: 'exp-2026-06-medical',
      month: '2026-06',
      date: '2026-06-14',
      name: 'Clinic Visit',
      categoryId: 'cat-health',
      amount: 2100,
      type: 'one-time',
      note: 'Health expense',
      memberEmail: editor,
      paymentModeId: 'pm-card-rupay',
    },
    {
      id: 'exp-2026-06-travel-planned',
      month: '2026-06',
      date: '2026-06-28',
      name: 'Airport Cab Planned',
      categoryId: 'cat-travel',
      amount: 1450,
      type: 'one-time',
      note: 'Future planned expense',
      memberEmail: member,
      paymentModeId: 'pm-wallet-paytm',
    },
    {
      id: 'exp-2026-07-flight',
      month: '2026-07',
      date: '2026-07-03',
      name: 'July Flight',
      categoryId: 'cat-travel',
      amount: 18500,
      type: 'one-time',
      note: 'Future month planned travel',
      memberEmail: member,
      paymentModeId: 'pm-card-visa',
    },
  ];

  const investments = [
    {
      id: 'inv-index-sip',
      name: 'Index SIP',
      amount: 16000,
      categoryId: 'cat-investments',
      frequency: 'monthly',
      startDate: '2026-01-07',
      notes: 'Monthly SIP plan',
      memberEmail: owner,
      paymentModeId: 'pm-upi-gpay',
      auditTrail: [
        {
          id: 'audit-sip-created',
          operation: 'created',
          recordedDate: '2026-01-07T09:00:00.000Z',
          name: 'Index SIP',
          amount: 16000,
          categoryId: 'cat-investments',
          frequency: 'monthly',
          startDate: '2026-01-07',
          notes: 'Monthly SIP plan',
          memberEmail: owner,
          paymentModeId: 'pm-upi-gpay',
        },
      ],
    },
    {
      id: 'inv-weekly-gold',
      name: 'Weekly Gold',
      amount: 1200,
      categoryId: 'cat-investments',
      frequency: 'weekly',
      startDate: '2026-06-02',
      notes: 'Weekly investment schedule',
      memberEmail: editor,
      paymentModeId: 'pm-card-rupay',
    },
    {
      id: 'inv-annual-ppf',
      name: 'Annual PPF',
      amount: 50000,
      categoryId: 'cat-investments',
      frequency: 'annual',
      startDate: '2026-06-20',
      notes: 'Annual investment schedule',
      memberEmail: member,
      paymentModeId: 'pm-netbanking-sbi',
    },
    {
      id: 'inv-one-time-june',
      name: 'One-time Equity Buy',
      amount: 22000,
      categoryId: 'cat-investments',
      frequency: 'one-time',
      date: '2026-06-09',
      notes: 'One-time investment',
      memberEmail: owner,
      paymentModeId: 'pm-upi-gpay',
    },
  ];

  const loans = [
    {
      id: 'loan-home',
      lender: 'HDFC Home Loan',
      loanType: 'Home',
      principal: 5200000,
      outstanding: 4380000,
      annualRate: 8.45,
      emi: 42500,
      startDate: '2026-06-15',
      endDate: '2036-06-15',
      notes: 'Long-running home loan',
      memberEmail: owner,
      paymentModeId: 'pm-netbanking-sbi',
      auditTrail: [
        {
          id: 'audit-home-loan-created',
          operation: 'created',
          recordedDate: '2026-06-01T09:00:00.000Z',
          lender: 'HDFC Home Loan',
          loanType: 'Home',
          principal: 5200000,
          outstanding: 4380000,
          annualRate: 8.45,
          emi: 42500,
          startDate: '2026-06-15',
          endDate: '2036-06-15',
          notes: 'Long-running home loan',
          memberEmail: owner,
          paymentModeId: 'pm-netbanking-sbi',
        },
      ],
    },
    {
      id: 'loan-personal',
      lender: 'SBI Personal Loan',
      loanType: 'Personal',
      principal: 250000,
      outstanding: 37500,
      annualRate: 11.2,
      emi: 12500,
      startDate: '2025-12-05',
      endDate: '2026-08-05',
      notes: 'Near closure loan',
      memberEmail: editor,
      paymentModeId: 'pm-card-rupay',
    },
    {
      id: 'loan-vehicle',
      lender: 'Axis Vehicle Loan',
      loanType: 'Vehicle',
      principal: 880000,
      outstanding: 720000,
      annualRate: 9.1,
      emi: 18500,
      startDate: '2026-07-10',
      endDate: '2030-07-10',
      notes: 'Future-starting loan',
      memberEmail: member,
      paymentModeId: 'pm-card-visa',
    },
  ];

  return {
    workspace,
    records: {
      paymentAccounts,
      paymentModes,
      categories,
      incomes,
      templates,
      expenses,
      investments,
      loans,
    },
  };
}
