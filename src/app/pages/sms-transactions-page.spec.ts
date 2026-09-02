import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SmsTransaction } from '../budget.models';
import { BudgetStore } from '../budget.store';
import { SmsTransactionStore } from '../stores/sms-transaction.store';
import { SmsTransactionsPage } from './sms-transactions-page';

const ready: SmsTransaction = {
  id: 'sms-ready',
  ownerUid: 'uid-owner',
  source: 'sms',
  deviceId: 'dev_12345678',
  sourceEventId: 'event-ready',
  sender: 'HDFCBK',
  rawMessage: 'Rs.450 debited from A/C XX1234 via UPI to ZOMATO',
  receivedAt: '2026-09-01T02:12:00.000Z',
  transactionDate: '2026-09-01T02:12:00.000Z',
  amount: 450,
  currency: 'INR',
  transactionType: 'debit',
  merchant: 'Zomato',
  bankName: 'HDFC',
  accountLastFour: '1234',
  paymentAccountId: 'account-hdfc',
  paymentModeId: 'mode-hdfc',
  categoryId: 'category-food',
  decision: 'pending',
  status: 'pending',
  parserId: 'hdfc',
  confidence: 0.92,
  createdDate: '2026-09-01T02:12:01.000Z',
  updatedDate: '2026-09-01T02:12:01.000Z',
};

const attention: SmsTransaction = {
  ...ready,
  id: 'sms-attention',
  sourceEventId: 'event-attention',
  merchant: 'Amazon',
  amount: 1299,
  categoryId: undefined,
  paymentModeId: undefined,
};

describe('SmsTransactionsPage', () => {
  const transactions = signal<SmsTransaction[]>([ready, attention]);
  const stage = vi.fn().mockResolvedValue(undefined);
  const updateMany = vi.fn().mockResolvedValue(undefined);
  const appendNotes = vi.fn().mockResolvedValue(undefined);
  const submitDecisions = vi.fn().mockResolvedValue({ processed: 1, discarded: 0, failed: [] });

  beforeEach(async () => {
    stage.mockClear();
    updateMany.mockClear();
    appendNotes.mockClear();
    submitDecisions.mockClear();
    transactions.set([ready, attention]);
    await TestBed.configureTestingModule({
      imports: [SmsTransactionsPage],
      providers: [
        provideNoopAnimations(),
        {
          provide: BudgetStore,
          useValue: {
            paymentModes: signal([
              {
                id: 'mode-hdfc',
                type: 'upi',
                name: 'HDFC UPI',
                paymentAccountId: 'account-hdfc',
              },
            ]),
            activePaymentModes: signal([
              {
                id: 'mode-hdfc',
                type: 'upi',
                name: 'HDFC UPI',
                paymentAccountId: 'account-hdfc',
              },
            ]),
            expenseCategories: signal([
              {
                id: 'category-food',
                name: 'Food & Dining',
                type: 'Expenses',
                monthlyBudget: 0,
                color: '#f97316',
              },
            ]),
            categoryName: (id: string) => (id === 'category-food' ? 'Food & Dining' : ''),
            paymentModeLabel: (id: string) => (id === 'mode-hdfc' ? 'HDFC UPI' : 'Not set'),
            paymentModeDisplayLabel: () => 'HDFC UPI',
          },
        },
        {
          provide: SmsTransactionStore,
          useValue: {
            transactions,
            loading: signal(false),
            saving: signal(false),
            error: signal(null),
            pending: () => transactions().filter((item) => item.status === 'pending'),
            processed: () => transactions().filter((item) => item.status === 'processed'),
            discarded: () => transactions().filter((item) => item.status === 'discarded'),
            stage,
            updateMany,
            appendNotes,
            submitDecisions,
          },
        },
      ],
    }).compileComponents();
  });

  it('renders pending rows and equivalent selectable mobile cards', () => {
    const fixture = TestBed.createComponent(SmsTransactionsPage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('.desktop-sms-table tbody > tr:not(.editor-row)')).toHaveLength(
      2,
    );
    expect(element.querySelectorAll('.mobile-sms-list .sms-card')).toHaveLength(2);
    expect(element.textContent).toContain('Pending 2');
    expect(element.textContent).toContain('Amazon');
  });

  it('filters by search and needs-attention state', () => {
    const fixture = TestBed.createComponent(SmsTransactionsPage);
    const page = fixture.componentInstance;
    page.query.set('zomato');
    expect(page.visibleTransactions().map((item) => item.id)).toEqual(['sms-ready']);
    page.query.set('');
    page.needsAttention.set(true);
    expect(page.visibleTransactions().map((item) => item.id)).toEqual(['sms-attention']);
  });

  it('supports selection, staged bulk decisions, category, paid-via, and notes', async () => {
    const fixture = TestBed.createComponent(SmsTransactionsPage);
    const page = fixture.componentInstance;
    page.selectedIds.set(new Set(['sms-ready', 'sms-attention']));
    page.stageSelected('accept');
    expect(stage).toHaveBeenCalledWith(['sms-ready', 'sms-attention'], 'accept');

    page.setCategory(['sms-ready'], { target: { value: 'category-food' } } as unknown as Event);
    page.setPaidVia(['sms-ready'], { target: { value: 'mode-hdfc' } } as unknown as Event);
    expect(updateMany).toHaveBeenCalledWith(['sms-ready'], { categoryId: 'category-food' });
    expect(updateMany).toHaveBeenCalledWith(['sms-ready'], {
      paymentModeId: 'mode-hdfc',
      paymentAccountId: 'account-hdfc',
    });

    page.bulkNotes.set('Dinner');
    page.applyBulkNotes();
    expect(appendNotes).toHaveBeenCalledWith(['sms-ready', 'sms-attention'], 'Dinner', false);
  });

  it('keeps raw SMS collapsed and blocks submit while an accepted row needs attention', () => {
    transactions.set([
      { ...ready, decision: 'accept' },
      { ...attention, decision: 'accept' },
    ]);
    const fixture = TestBed.createComponent(SmsTransactionsPage);
    const page = fixture.componentInstance;
    page.expandedId.set('sms-ready');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('details')?.hasAttribute('open')).toBe(false);
    expect(page.submissionIssues()).toHaveLength(1);
    expect(
      element.querySelector<HTMLButtonElement>('.submit-panel button[mat-flat-button]')?.disabled,
    ).toBe(true);
  });

  it('submits a valid mixed decision batch only on explicit Submit', async () => {
    transactions.set([
      { ...ready, decision: 'accept' },
      { ...attention, decision: 'discard' },
    ]);
    const fixture = TestBed.createComponent(SmsTransactionsPage);
    await fixture.componentInstance.submitDecisions();
    expect(submitDecisions).toHaveBeenCalledOnce();
    expect(submitDecisions.mock.calls[0][0]).toHaveLength(2);
  });

  it('passes AXE checks with populated desktop and mobile review markup', async () => {
    const fixture = TestBed.createComponent(SmsTransactionsPage);
    fixture.componentInstance.expandedId.set('sms-ready');
    fixture.detectChanges();
    const results = await axe.run(fixture.nativeElement, {
      resultTypes: ['violations'],
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  }, 12_000);
});
