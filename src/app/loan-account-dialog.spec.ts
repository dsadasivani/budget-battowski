import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LoanAccountDialog,
  type LoanAccountDialogData,
  type LoanAccountDialogResult,
} from './loan-account-dialog';
import type { LoanAccount, LoanEvent } from './domain/loans/loan.models';

const account: LoanAccount = {
  id: 'axis-loan',
  schemaVersion: 2,
  lender: 'Axis Bank',
  loanType: 'Personal loan',
  notes: '',
  contract: {
    disbursedAmount: 2_500_000,
    disbursementDate: '2023-12-19',
    firstEmiDate: '2024-01-05',
    originalTenureMonths: 84,
    initialEmi: 42_152,
    initialAnnualRate: 10.5,
    firstPeriodInterestAmount: 13_125,
    interestType: 'fixed',
    interestCalculationMethod: 'daily-reducing',
    dayCountConvention: '30-360',
    compoundingFrequency: 'monthly',
    postPrepaymentStrategy: 'keep-emi-reduce-tenure',
    roundingPolicy: {
      monetaryScale: 0,
      interestRounding: 'half-up',
      installmentRounding: 'half-up',
      finalInstallmentAdjustment: true,
    },
  },
};

const partPayment: LoanEvent = {
  id: 'axis-part-payment',
  loanId: account.id,
  type: 'part-prepayment',
  effectiveDate: '2026-05-11',
  amount: 647_093,
  source: 'manual',
  createdDate: '2026-05-11T00:00:00.000Z',
};

describe('LoanAccountDialog lender matching', () => {
  const close = vi.fn<(result: LoanAccountDialogResult) => void>();

  beforeEach(async () => {
    close.mockClear();
    await TestBed.configureTestingModule({
      imports: [LoanAccountDialog],
      providers: [
        provideNoopAnimations(),
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            account,
            events: [partPayment],
            paymentModes: [],
          } satisfies LoanAccountDialogData,
        },
        { provide: MatDialogRef, useValue: { close } },
      ],
    }).compileComponents();
  });

  it('saves each accepted lender row as reconciliation evidence', () => {
    const fixture = TestBed.createComponent(LoanAccountDialog);
    const dialog = fixture.componentInstance;
    dialog.form.patchValue({
      matchCheckpointDate: '2026-06-05',
      matchInterestAmount: 11_420,
      matchClosingPrincipal: 1_144_928,
      matchSecondCheckpointDate: '2026-07-05',
      matchSecondInterestAmount: 10_018,
      matchSecondClosingPrincipal: 1_112_794,
    });

    dialog.findLenderMatch();
    expect(dialog.policyMatch()?.best?.totalDifference).toBe(0);
    dialog.applyLenderMatch();
    dialog.save();

    expect(close).toHaveBeenCalledWith(
      expect.objectContaining({
        lenderReconciliations: [
          expect.objectContaining({
            asOfDate: '2026-06-05',
            lenderReportedOutstanding: 1_144_928,
          }),
          expect.objectContaining({
            asOfDate: '2026-07-05',
            lenderReportedOutstanding: 1_112_794,
          }),
        ],
      }),
    );
  });

  it('clears an accepted match when lender evidence changes', () => {
    const fixture = TestBed.createComponent(LoanAccountDialog);
    const dialog = fixture.componentInstance;
    dialog.form.patchValue({
      matchCheckpointDate: '2026-06-05',
      matchInterestAmount: 11_420,
      matchClosingPrincipal: 1_144_928,
    });
    dialog.findLenderMatch();
    dialog.applyLenderMatch();

    dialog.form.controls.matchInterestAmount.setValue(11_421);

    expect(dialog.policyMatch()).toBeNull();
    expect(dialog.matchApplied()).toBe(false);
  });
});
