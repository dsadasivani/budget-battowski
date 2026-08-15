import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IncomeEditorDialog, type IncomeEditorData } from './income-editor-dialog';
import type { IncomeSource } from './budget.models';

describe('IncomeEditorDialog', () => {
  const close = vi.fn();
  const data: IncomeEditorData = {
    selectedMonth: '2026-08',
    memberEmail: 'creator@example.com',
    categories: [
      {
        id: 'category-salary',
        name: 'Salary',
        monthlyBudget: 0,
        color: '#047857',
        type: 'Income',
      },
    ],
  };

  beforeEach(async () => {
    close.mockReset();
    await TestBed.configureTestingModule({
      imports: [IncomeEditorDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close } },
      ],
    }).compileComponents();
  });

  it('creates a monthly income owned by the acting member', () => {
    const fixture = TestBed.createComponent(IncomeEditorDialog);
    const dialog = fixture.componentInstance as unknown as {
      form: {
        patchValue: (value: Record<string, unknown>) => void;
      };
      save: () => void;
    };
    dialog.form.patchValue({
      source: 'Salary',
      cadence: 'monthly',
      categoryId: 'category-salary',
      amount: 125000,
      startDate: '2026-08-01',
      endDate: '2027-07-31',
      notes: 'Primary income',
    });

    dialog.save();

    expect(close).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'Salary',
        cadence: 'monthly',
        categoryId: 'category-salary',
        amount: 125000,
        month: '2026-08',
        memberEmail: 'creator@example.com',
      }),
    );
  });

  it('keeps source, cadence, and permanent ownership immutable while editing', async () => {
    const income: IncomeSource = {
      id: 'income-salary',
      source: 'Salary',
      cadence: 'monthly',
      categoryId: 'category-salary',
      amount: 100000,
      month: '2026-01',
      startDate: '2026-01-01',
      notes: '',
      createdDate: '2026-01-01T00:00:00.000Z',
      memberEmail: 'original-owner@example.com',
    };
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [IncomeEditorDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { ...data, income } satisfies IncomeEditorData },
        { provide: MatDialogRef, useValue: { close } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(IncomeEditorDialog);
    const dialog = fixture.componentInstance as unknown as {
      form: {
        controls: {
          source: { disabled: boolean };
          cadence: { disabled: boolean };
          amount: { setValue: (value: number) => void };
        };
      };
      save: () => void;
    };

    expect(dialog.form.controls.source.disabled).toBe(true);
    expect(dialog.form.controls.cadence.disabled).toBe(true);
    dialog.form.controls.amount.setValue(110000);
    dialog.save();

    expect(close).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'income-salary',
        source: 'Salary',
        cadence: 'monthly',
        amount: 110000,
        memberEmail: 'original-owner@example.com',
      }),
    );
  });
});
