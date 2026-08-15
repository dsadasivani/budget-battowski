import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import type { BudgetCategory, Cadence, IncomeSource } from './budget.models';

export interface IncomeEditorData {
  categories: BudgetCategory[];
  income?: IncomeSource;
  memberEmail?: string;
  selectedMonth: string;
}

function recordId(): string {
  return `income-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

@Component({
  selector: 'app-income-editor-dialog',
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
    <header class="dialog-heading">
      <div>
        <span class="eyebrow">Income</span>
        <h2 mat-dialog-title>{{ isEditing ? 'Edit income' : 'Add income' }}</h2>
        <p>
          {{
            isEditing
              ? 'Identity fields stay fixed; financial changes use their effective date.'
              : 'Record a monthly or one-time income source.'
          }}
        </p>
      </div>
      <button mat-icon-button type="button" aria-label="Close income editor" (click)="cancel()">
        <mat-icon aria-hidden="true">close</mat-icon>
      </button>
    </header>

    <mat-dialog-content>
      <form class="income-form" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field appearance="outline">
          <mat-label>Source</mat-label>
          <input matInput formControlName="source" autocomplete="off" />
          @if (form.controls.source.touched && form.controls.source.invalid) {
            <mat-error>Source is required.</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Cadence</mat-label>
          <mat-select formControlName="cadence">
            <mat-option value="monthly">Monthly</mat-option>
            <mat-option value="one-time">One-time</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Income category</mat-label>
          <mat-select formControlName="categoryId">
            @for (category of data.categories; track category.id) {
              <mat-option [value]="category.id">{{ category.name }}</mat-option>
            }
          </mat-select>
          @if (form.controls.categoryId.touched && form.controls.categoryId.invalid) {
            <mat-error>Income category is required.</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Amount</mat-label>
          <input matInput formControlName="amount" type="number" min="0.01" step="0.01" />
          @if (form.controls.amount.touched && form.controls.amount.invalid) {
            <mat-error>Enter an amount greater than zero.</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>{{
            form.controls.cadence.value === 'one-time' ? 'Income date' : 'Start date'
          }}</mat-label>
          <input matInput formControlName="startDate" type="date" />
        </mat-form-field>

        @if (form.controls.cadence.value === 'monthly') {
          <mat-form-field appearance="outline">
            <mat-label>End date (optional)</mat-label>
            <input matInput formControlName="endDate" type="date" />
          </mat-form-field>
        }

        <mat-form-field class="notes-field" appearance="outline">
          <mat-label>Notes (optional)</mat-label>
          <textarea matInput formControlName="notes" rows="3"></textarea>
        </mat-form-field>

        @if (validationError()) {
          <p class="validation-error" role="alert">{{ validationError() }}</p>
        }
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="cancel()">Cancel</button>
      <button mat-flat-button type="button" (click)="save()">
        {{ isEditing ? 'Save changes' : 'Add income' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .dialog-heading {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 24px 24px 8px;
    }
    .dialog-heading h2,
    .dialog-heading p {
      margin: 0;
    }
    .dialog-heading p {
      margin-top: 6px;
      color: #667085;
    }
    .eyebrow {
      color: #047857;
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .income-form {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px 14px;
      padding-top: 8px;
    }
    .notes-field,
    .validation-error {
      grid-column: 1 / -1;
    }
    .validation-error {
      margin: 0;
      color: #b42318;
      font-weight: 700;
    }
    @media (max-width: 640px) {
      .income-form {
        grid-template-columns: 1fr;
      }
      .notes-field,
      .validation-error {
        grid-column: auto;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IncomeEditorDialog {
  private readonly dialogRef = inject<MatDialogRef<IncomeEditorDialog, IncomeSource>>(MatDialogRef);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly data = inject<IncomeEditorData>(MAT_DIALOG_DATA);
  protected readonly isEditing = !!this.data.income;
  protected readonly validationError = signal('');
  protected readonly form = this.formBuilder.nonNullable.group({
    source: [this.data.income?.source ?? '', Validators.required],
    cadence: [this.data.income?.cadence ?? ('monthly' as Cadence), Validators.required],
    categoryId: [this.data.income?.categoryId ?? '', Validators.required],
    amount: [this.data.income?.amount ?? 0, [Validators.required, Validators.min(0.01)]],
    startDate: [
      this.data.income?.startDate ?? `${this.data.income?.month ?? this.data.selectedMonth}-01`,
      Validators.required,
    ],
    endDate: [this.data.income?.endDate ?? ''],
    notes: [this.data.income?.notes ?? ''],
  });

  constructor() {
    if (this.isEditing) {
      this.form.controls.source.disable();
      this.form.controls.cadence.disable();
    }
  }

  protected cancel(): void {
    this.dialogRef.close();
  }

  protected save(): void {
    this.validationError.set('');
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    const value = this.form.getRawValue();
    if (value.endDate && value.endDate < value.startDate) {
      this.validationError.set('End date cannot be before the start date.');
      return;
    }
    const now = new Date().toISOString();
    this.dialogRef.close({
      id: this.data.income?.id ?? recordId(),
      source: value.source.trim(),
      cadence: value.cadence,
      categoryId: value.categoryId,
      amount: Number(value.amount),
      startDate: value.startDate,
      month: value.startDate.slice(0, 7),
      endDate: value.cadence === 'monthly' && value.endDate ? value.endDate : undefined,
      notes: value.notes.trim(),
      createdDate: this.data.income?.createdDate ?? now,
      memberEmail: this.data.income?.memberEmail ?? this.data.memberEmail,
      auditTrail: this.data.income?.auditTrail ?? [],
    });
  }
}
