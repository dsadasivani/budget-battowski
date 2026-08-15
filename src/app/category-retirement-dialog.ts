import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import type { BudgetCategory } from './budget.models';

export interface CategoryRetirementData {
  category: BudgetCategory;
  candidates: BudgetCategory[];
  usage: {
    expenses: number;
    recurringExpenses: number;
    incomes: number;
    investments: number;
    totalAmount: number;
  };
}

export type CategoryRetirementResult =
  | { action: 'archive' }
  | { action: 'remap'; replacementCategoryId: string }
  | { action: 'remap'; newCategoryName: string };

@Component({
  selector: 'app-category-retirement-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>Remove {{ data.category.name }}?</h2>
    <mat-dialog-content>
      <p>
        This category is used by <strong>{{ totalRecords() }}</strong> records with
        <strong>{{ formatMoney(data.usage.totalAmount) }}</strong> recorded value.
      </p>
      <ul aria-label="Category usage impact">
        <li>{{ data.usage.expenses }} expenses</li>
        <li>{{ data.usage.recurringExpenses }} recurring expense plans</li>
        <li>{{ data.usage.incomes }} income sources</li>
        <li>{{ data.usage.investments }} investments</li>
      </ul>

      @if (totalRecords()) {
        <p>Choose another category for every linked record, or create a replacement.</p>
        <form [formGroup]="form">
          <mat-form-field appearance="outline">
            <mat-label>Replacement category</mat-label>
            <mat-select formControlName="replacementCategoryId">
              <mat-option value="NEW">Create a new category</mat-option>
              @for (category of data.candidates; track category.id) {
                <mat-option [value]="category.id">{{ category.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          @if (creatingCategory()) {
            <mat-form-field appearance="outline">
              <mat-label>New category name</mat-label>
              <input matInput formControlName="newCategoryName" />
            </mat-form-field>
          }
        </form>
      } @else {
        <p>The category has no linked records. It will be archived and hidden from new entries.</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="cancel()">Cancel</button>
      <button mat-flat-button type="button" (click)="confirm()" [disabled]="!canConfirm()">
        <mat-icon aria-hidden="true">archive</mat-icon>
        {{ totalRecords() ? 'Remap and archive' : 'Archive category' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content {
      display: grid;
      gap: 12px;
      max-width: 560px;
    }
    form {
      display: grid;
      gap: 8px;
    }
    mat-form-field {
      width: 100%;
    }
    ul {
      margin: 0;
      padding-left: 20px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryRetirementDialog {
  readonly data = inject<CategoryRetirementData>(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject<MatDialogRef<CategoryRetirementDialog, CategoryRetirementResult>>(MatDialogRef);

  readonly form = new FormGroup({
    replacementCategoryId: new FormControl('', { nonNullable: true }),
    newCategoryName: new FormControl('', { nonNullable: true, validators: Validators.required }),
  });
  readonly selectionVersion = signal(0);
  readonly creatingCategory = computed(() => {
    this.selectionVersion();
    return this.form.controls.replacementCategoryId.value === 'NEW';
  });
  readonly totalRecords = computed(
    () =>
      this.data.usage.expenses +
      this.data.usage.recurringExpenses +
      this.data.usage.incomes +
      this.data.usage.investments,
  );
  readonly canConfirm = computed(() => {
    this.selectionVersion();
    if (!this.totalRecords()) {
      return true;
    }
    const replacement = this.form.controls.replacementCategoryId.value;
    return (
      !!replacement && (replacement !== 'NEW' || !!this.form.controls.newCategoryName.value.trim())
    );
  });

  constructor() {
    this.form.valueChanges.subscribe(() => this.selectionVersion.update((value) => value + 1));
  }

  formatMoney(value: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  }

  cancel(): void {
    this.dialogRef.close();
  }

  confirm(): void {
    if (!this.totalRecords()) {
      this.dialogRef.close({ action: 'archive' });
      return;
    }

    const replacementCategoryId = this.form.controls.replacementCategoryId.value;
    if (replacementCategoryId === 'NEW') {
      const newCategoryName = this.form.controls.newCategoryName.value.trim();
      if (newCategoryName) {
        this.dialogRef.close({ action: 'remap', newCategoryName });
      }
      return;
    }

    if (replacementCategoryId) {
      this.dialogRef.close({ action: 'remap', replacementCategoryId });
    }
  }
}
