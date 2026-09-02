import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import type {
  PaymentMode,
  SmsTransaction,
  SmsTransactionDecision,
  SmsTransactionStatus,
} from '../budget.models';
import { BudgetStore } from '../budget.store';
import {
  isReady,
  searchableSmsText,
  submissionIssue,
  transactionDate,
} from '../domain/sms/sms-review';
import { SmsTransactionStore } from '../stores/sms-transaction.store';

type SmsTab = Extract<SmsTransactionStatus, 'pending' | 'processed' | 'discarded'>;

@Component({
  selector: 'app-sms-transactions-page',
  imports: [CommonModule, MatButtonModule, MatIconModule, MatProgressBarModule],
  templateUrl: './sms-transactions-page.html',
  styleUrl: './sms-transactions-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SmsTransactionsPage {
  readonly budget = inject(BudgetStore);
  readonly sms = inject(SmsTransactionStore);
  readonly activeTab = signal<SmsTab>('pending');
  readonly query = signal('');
  readonly dateFrom = signal('');
  readonly dateTo = signal('');
  readonly bank = signal('');
  readonly paidVia = signal('');
  readonly category = signal('');
  readonly decision = signal<SmsTransactionDecision | ''>('');
  readonly needsAttention = signal(false);
  readonly selectedIds = signal(new Set<string>());
  readonly expandedId = signal<string | null>(null);
  readonly bulkNotes = signal('');
  readonly replaceBulkNotes = signal(false);
  readonly statusMessage = signal<string | null>(null);
  readonly submissionFailures = signal(new Map<string, string>());

  readonly banks = computed(() =>
    [
      ...new Set(
        this.sms
          .transactions()
          .map((item) => item.bankName)
          .filter(Boolean) as string[],
      ),
    ].sort(),
  );
  readonly tabTransactions = computed(() =>
    this.sms.transactions().filter((transaction) => transaction.status === this.activeTab()),
  );
  readonly visibleTransactions = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.tabTransactions().filter((transaction) => {
      const date = transactionDate(transaction) ?? '';
      const categoryId = transaction.categoryId ?? transaction.suggestedCategoryId ?? '';
      return (
        (!query || searchableSmsText(transaction).includes(query)) &&
        (!this.dateFrom() || date >= this.dateFrom()) &&
        (!this.dateTo() || date <= this.dateTo()) &&
        (!this.bank() || transaction.bankName === this.bank()) &&
        (!this.paidVia() || transaction.paymentModeId === this.paidVia()) &&
        (!this.category() || categoryId === this.category()) &&
        (!this.decision() || transaction.decision === this.decision()) &&
        (!this.needsAttention() || !!submissionIssue({ ...transaction, decision: 'accept' }))
      );
    });
  });
  readonly selectedTransactions = computed(() => {
    const ids = this.selectedIds();
    return this.visibleTransactions().filter((transaction) => ids.has(transaction.id));
  });
  readonly stagedTransactions = computed(() =>
    this.sms.pending().filter((transaction) => transaction.decision !== 'pending'),
  );
  readonly readyTransactions = computed(() => this.sms.pending().filter(isReady));
  readonly submissionIssues = computed(() =>
    this.stagedTransactions().flatMap((transaction) => {
      const issue = submissionIssue(transaction);
      return issue ? [issue] : [];
    }),
  );
  readonly allVisibleSelected = computed(
    () =>
      this.visibleTransactions().length > 0 &&
      this.visibleTransactions().every((transaction) => this.selectedIds().has(transaction.id)),
  );

  selectTab(tab: SmsTab): void {
    this.activeTab.set(tab);
    this.selectedIds.set(new Set());
    this.expandedId.set(null);
  }

  setText(target: ReturnType<typeof signal<string>>, event: Event): void {
    target.set((event.target as HTMLInputElement | HTMLSelectElement).value);
  }

  setDecisionFilter(event: Event): void {
    this.decision.set((event.target as HTMLSelectElement).value as SmsTransactionDecision | '');
  }

  toggleAttention(event: Event): void {
    this.needsAttention.set((event.target as HTMLInputElement).checked);
  }

  toggleExpanded(id: string): void {
    this.expandedId.update((current) => (current === id ? null : id));
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  toggleSelected(id: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selectedIds.update((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  toggleAll(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selectedIds.set(
      checked
        ? new Set(this.visibleTransactions().map((transaction) => transaction.id))
        : new Set(),
    );
  }

  stage(ids: readonly string[], decision: SmsTransactionDecision): void {
    this.statusMessage.set(null);
    void this.sms.stage(ids, decision).then(() => {
      this.statusMessage.set(
        `${ids.length} transaction${ids.length === 1 ? '' : 's'} staged as ${decision}.`,
      );
    });
  }

  stageSelected(decision: SmsTransactionDecision): void {
    this.stage(
      this.selectedTransactions().map((transaction) => transaction.id),
      decision,
    );
  }

  acceptReady(): void {
    this.stage(
      this.readyTransactions().map((transaction) => transaction.id),
      'accept',
    );
  }

  setCategory(ids: readonly string[], event: Event): void {
    const categoryId = (event.target as HTMLSelectElement).value || undefined;
    void this.sms.updateMany(ids, { categoryId });
  }

  setPaidVia(ids: readonly string[], event: Event): void {
    const paymentModeId = (event.target as HTMLSelectElement).value || undefined;
    const paymentMode = this.budget.paymentModes().find((mode) => mode.id === paymentModeId);
    void this.sms.updateMany(ids, {
      paymentModeId,
      paymentAccountId: paymentMode?.paymentAccountId,
    });
  }

  setNotes(id: string, event: Event): void {
    void this.sms.updateMany([id], { notes: (event.target as HTMLTextAreaElement).value });
  }

  setBulkNotes(event: Event): void {
    this.bulkNotes.set((event.target as HTMLInputElement).value);
  }

  setReplaceNotes(event: Event): void {
    this.replaceBulkNotes.set((event.target as HTMLInputElement).checked);
  }

  applyBulkNotes(): void {
    void this.sms
      .appendNotes(
        this.selectedTransactions().map((transaction) => transaction.id),
        this.bulkNotes(),
        this.replaceBulkNotes(),
      )
      .then(() => this.bulkNotes.set(''));
  }

  useSuggestion(transaction: SmsTransaction): void {
    if (transaction.suggestedCategoryId) {
      void this.sms.updateMany([transaction.id], { categoryId: transaction.suggestedCategoryId });
    }
  }

  async submitDecisions(): Promise<void> {
    this.statusMessage.set(null);
    this.submissionFailures.set(new Map());
    const result = await this.sms.submitDecisions(this.stagedTransactions());
    this.submissionFailures.set(
      new Map(result.failed.map((failure) => [failure.id, failure.message])),
    );
    if (!result.failed.length) {
      this.statusMessage.set(
        `${result.processed} expense${result.processed === 1 ? '' : 's'} created; ${result.discarded} transaction${result.discarded === 1 ? '' : 's'} discarded.`,
      );
      this.selectedIds.set(new Set());
    }
  }

  categoryName(transaction: SmsTransaction): string {
    const categoryId = transaction.categoryId ?? transaction.suggestedCategoryId;
    return categoryId ? this.budget.categoryName(categoryId) : 'Not set';
  }

  paymentModeLabel(transaction: SmsTransaction): string {
    return transaction.paymentModeId
      ? this.budget.paymentModeLabel(transaction.paymentModeId)
      : 'Not set';
  }

  paymentModeOption(mode: PaymentMode): string {
    return this.budget.paymentModeDisplayLabel(mode);
  }

  dateValue(transaction: SmsTransaction): string {
    return transactionDate(transaction) ?? '';
  }

  decisionLabel(transaction: SmsTransaction): string {
    return transaction.decision === 'pending'
      ? 'Not decided'
      : transaction.decision === 'accept'
        ? 'Accept staged'
        : 'Discard staged';
  }

  needsRowAttention(transaction: SmsTransaction): boolean {
    return !!submissionIssue(transaction) || this.submissionFailures().has(transaction.id);
  }

  failureMessage(id: string): string | undefined {
    return this.submissionFailures().get(id);
  }

  trackIds(transactions: readonly SmsTransaction[]): string[] {
    return transactions.map((transaction) => transaction.id);
  }
}
