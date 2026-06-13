import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';

export type MonthlyReviewSourceType = 'expense' | 'investment';

export interface MonthlyReviewRow {
  id: string;
  sourceId: string;
  sourceType: MonthlyReviewSourceType;
  label: string;
  categoryName: string;
  amount: number;
  pendingDelete?: boolean;
  existingRecordId?: string;
}

export interface MonthlyReviewData {
  monthLabel: string;
  rows: MonthlyReviewRow[];
}

export interface MonthlyReviewResult {
  rows: MonthlyReviewRow[];
}

@Component({
  selector: 'app-monthly-review-dialog',
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTooltipModule,
  ],
  templateUrl: './monthly-review-dialog.html',
  styleUrl: './monthly-review-dialog.scss',
})
export class MonthlyReviewDialog {
  private readonly dialogRef =
    inject<MatDialogRef<MonthlyReviewDialog, MonthlyReviewResult>>(MatDialogRef);
  protected readonly data = inject<MonthlyReviewData>(MAT_DIALOG_DATA);
  protected readonly rows = signal<MonthlyReviewRow[]>(this.data.rows.map((row) => ({ ...row })));
  protected readonly validationError = signal('');

  protected sourceLabel(row: MonthlyReviewRow): string {
    return row.sourceType === 'expense' ? 'Recurring expense' : 'Investment';
  }

  protected toggleDelete(row: MonthlyReviewRow): void {
    row.pendingDelete = !row.pendingDelete;
    this.rows.update((rows) => [...rows]);
  }

  protected approve(): void {
    const invalidRow = this.rows().find(
      (row) =>
        !row.pendingDelete && (!Number.isFinite(Number(row.amount)) || Number(row.amount) < 0),
    );

    if (invalidRow) {
      this.validationError.set('Amount must be zero or more for every approved row.');
      return;
    }

    this.dialogRef.close({
      rows: this.rows().map((row) => ({
        ...row,
        amount: Number(row.amount) || 0,
      })),
    });
  }
}
