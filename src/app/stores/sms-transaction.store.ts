import { Injectable, computed, effect, inject, signal } from '@angular/core';

import type { SmsTransaction, SmsTransactionDecision } from '../budget.models';
import { SmsTransactionRepository } from '../data/sms-transaction.repository';
import { submissionIssue } from '../domain/sms/sms-review';
import { BudgetStore } from '../budget.store';

export interface SmsSubmitResult {
  processed: number;
  discarded: number;
  failed: Array<{ id: string; message: string }>;
}

@Injectable({ providedIn: 'root' })
export class SmsTransactionStore {
  private readonly budget = inject(BudgetStore);
  private repository: SmsTransactionRepository | null = null;
  readonly transactions = signal<SmsTransaction[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly pending = computed(() =>
    this.transactions().filter((transaction) => transaction.status === 'pending'),
  );
  readonly processed = computed(() =>
    this.transactions().filter((transaction) => transaction.status === 'processed'),
  );
  readonly discarded = computed(() =>
    this.transactions().filter((transaction) => transaction.status === 'discarded'),
  );

  constructor() {
    effect((onCleanup) => {
      const workspaceId = this.budget.workspaceId();
      const app = this.budget.firebase.app;
      this.transactions.set([]);
      this.repository = null;
      if (!workspaceId || !app) return;
      this.loading.set(true);
      this.error.set(null);
      const repository = new SmsTransactionRepository(app, workspaceId);
      this.repository = repository;
      let unsubscribe: (() => void) | undefined;
      let disposed = false;
      void repository
        .listen(
          (transactions) => {
            if (disposed) return;
            this.transactions.set(transactions);
            this.loading.set(false);
          },
          (reason) => {
            if (disposed) return;
            this.error.set(
              reason instanceof Error ? reason.message : 'Unable to load SMS transactions.',
            );
            this.loading.set(false);
          },
        )
        .then((stop) => {
          if (disposed) stop();
          else unsubscribe = stop;
        });
      onCleanup(() => {
        disposed = true;
        unsubscribe?.();
      });
    });
  }

  async updateMany(
    ids: readonly string[],
    patch: Partial<
      Pick<
        SmsTransaction,
        'categoryId' | 'paymentAccountId' | 'paymentModeId' | 'notes' | 'decision'
      >
    >,
  ): Promise<void> {
    const repository = this.requireRepository();
    this.saving.set(true);
    this.error.set(null);
    try {
      await repository.updateMany(ids, patch);
    } catch (reason) {
      this.error.set(reason instanceof Error ? reason.message : 'Unable to save SMS transactions.');
      throw reason;
    } finally {
      this.saving.set(false);
    }
  }

  stage(ids: readonly string[], decision: SmsTransactionDecision): Promise<void> {
    return this.updateMany(ids, { decision });
  }

  async appendNotes(ids: readonly string[], notes: string, replace = false): Promise<void> {
    const trimmed = notes.trim();
    if (!trimmed || !ids.length) return;
    this.saving.set(true);
    try {
      for (const transaction of this.transactions().filter((item) => ids.includes(item.id))) {
        const nextNotes = replace
          ? trimmed
          : [transaction.notes?.trim(), trimmed].filter(Boolean).join('\n');
        await this.requireRepository().updateMany([transaction.id], { notes: nextNotes });
      }
    } finally {
      this.saving.set(false);
    }
  }

  async submitDecisions(transactions: readonly SmsTransaction[]): Promise<SmsSubmitResult> {
    const selected = transactions.filter((transaction) => transaction.decision !== 'pending');
    const issues = selected.flatMap((transaction) => {
      const issue = submissionIssue(transaction);
      return issue ? [{ id: issue.transactionId, message: issue.messages.join(', ') }] : [];
    });
    if (issues.length) return { processed: 0, discarded: 0, failed: issues };
    this.saving.set(true);
    this.error.set(null);
    const result: SmsSubmitResult = { processed: 0, discarded: 0, failed: [] };
    try {
      for (const item of selected) {
        try {
          const outcome = await this.requireRepository().submit(
            item,
            this.memberEmail(item.ownerUid),
          );
          if (outcome === 'processed') result.processed += 1;
          if (outcome === 'discarded') result.discarded += 1;
        } catch (reason) {
          result.failed.push({
            id: item.id,
            message: reason instanceof Error ? reason.message : 'Submission failed.',
          });
        }
      }
      if (result.failed.length)
        this.error.set(`${result.failed.length} decision(s) could not be submitted.`);
      return result;
    } finally {
      this.saving.set(false);
    }
  }

  private memberEmail(ownerUid: string): string | undefined {
    return this.budget.activeWorkspace()?.members.find((member) => member.uid === ownerUid)?.email;
  }

  private requireRepository(): SmsTransactionRepository {
    if (!this.repository)
      throw new Error('Open a Firebase workspace before using SMS transactions.');
    return this.repository;
  }
}
