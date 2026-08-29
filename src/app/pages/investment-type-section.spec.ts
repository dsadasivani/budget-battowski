import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import type { InvestmentAccount } from '../domain/investments/investment.models';
import { EMPTY_INVESTMENT_SUMMARY } from '../domain/investments/investment.models';
import { InvestmentStore } from '../stores/investment.store';
import { InvestmentTypeSection, type InvestmentTypeGroup } from './investment-type-section';

describe('InvestmentTypeSection', () => {
  it('shows a stock broker as a Material chip', async () => {
    const account: InvestmentAccount = {
      id: 'investment-1',
      schemaVersion: 2,
      name: 'Reliance Industries Limited',
      type: 'STOCK',
      status: 'ACTIVE',
      institution: 'Zerodha',
      instrument: {
        kind: 'STOCK',
        tradingSymbol: 'RELIANCE',
        companyName: 'Reliance Industries Limited',
        exchange: 'NSE',
        provider: 'UPSTOX',
        upstoxInstrumentKey: 'NSE_EQ|INE002A01018',
      },
      summary: { ...EMPTY_INVESTMENT_SUMMARY },
      createdDate: '2026-08-29T00:00:00.000Z',
      updatedDate: '2026-08-29T00:00:00.000Z',
    };
    const group: InvestmentTypeGroup = {
      type: 'STOCK',
      label: 'Stocks',
      description: 'Direct equity holdings',
      icon: 'show_chart',
      accounts: [account],
    };
    await TestBed.configureTestingModule({
      imports: [InvestmentTypeSection],
      providers: [
        provideRouter([]),
        {
          provide: InvestmentStore,
          useValue: {
            display: (value: string | undefined) => Number(value ?? 0),
            recurringPlanDisplayAmount: vi.fn(),
            recurringPlanIsUpcoming: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(InvestmentTypeSection);
    fixture.componentRef.setInput('group', group);
    fixture.componentRef.setInput('portfolioValue', 0);
    fixture.componentRef.setInput('viewMode', 'grid');
    fixture.detectChanges();

    const chip = fixture.nativeElement.querySelector('mat-chip') as HTMLElement | null;
    expect(chip?.textContent).toContain('Zerodha');
    expect(chip?.closest('mat-chip-set')?.getAttribute('aria-label')).toBe('Broker: Zerodha');
  });
});
