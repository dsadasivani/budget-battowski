import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  MAT_BOTTOM_SHEET_DATA,
  MatBottomSheetRef,
} from '@angular/material/bottom-sheet';
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
  memberName?: string;
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonthlyReviewDialog {
  private readonly dialogRef =
    inject<MatDialogRef<MonthlyReviewDialog, MonthlyReviewResult>>(MatDialogRef, {
      optional: true,
    });
  private readonly bottomSheetRef = inject<
    MatBottomSheetRef<MonthlyReviewDialog, MonthlyReviewResult>
  >(MatBottomSheetRef, { optional: true });
  private readonly dialogData = inject<MonthlyReviewData>(MAT_DIALOG_DATA, { optional: true });
  private readonly bottomSheetData = inject<MonthlyReviewData>(MAT_BOTTOM_SHEET_DATA, {
    optional: true,
  });
  protected readonly data = this.resolveData();
  protected readonly rows = signal<MonthlyReviewRow[]>(this.data.rows.map((row) => ({ ...row })));
  protected readonly expenseCount = computed(
    () => this.rows().filter((row) => row.sourceType === 'expense').length,
  );
  protected readonly investmentCount = computed(
    () => this.rows().filter((row) => row.sourceType === 'investment').length,
  );
  protected readonly validationError = signal('');

  protected sourceLabel(row: MonthlyReviewRow): string {
    return row.sourceType === 'expense' ? 'Recurring expense' : 'Investment';
  }

  protected toggleDelete(row: MonthlyReviewRow): void {
    row.pendingDelete = !row.pendingDelete;
    this.rows.update((rows) => [...rows]);
  }

  protected approveRow(row: MonthlyReviewRow): void {
    if (!this.isValidAmount(row)) {
      this.validationError.set(`Amount must be zero or more for ${row.label}.`);
      return;
    }

    this.close({
      rows: [
        {
          ...row,
          amount: Number(row.amount) || 0,
          pendingDelete: false,
        },
      ],
    });
  }

  protected approve(): void {
    const invalidRow = this.rows().find((row) => !this.isValidAmount(row));

    if (invalidRow) {
      this.validationError.set('Amount must be zero or more for every approved row.');
      return;
    }

    this.close({
      rows: this.rows().map((row) => ({
        ...row,
        amount: Number(row.amount) || 0,
      })),
    });
  }

  protected cancel(): void {
    this.close();
  }

  private isValidAmount(row: MonthlyReviewRow): boolean {
    return row.pendingDelete || (Number.isFinite(Number(row.amount)) && Number(row.amount) >= 0);
  }

  private close(result?: MonthlyReviewResult): void {
    if (this.bottomSheetRef) {
      this.bottomSheetRef.dismiss(result);
      return;
    }

    this.dialogRef?.close(result);
  }

  private resolveData(): MonthlyReviewData {
    const data = this.dialogData ?? this.bottomSheetData;
    if (!data) {
      throw new Error('Monthly review data is required.');
    }

    return data;
  }
}
