import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { describe, expect, it, vi } from 'vitest';

import { BudgetStore } from '../budget.store';
import { InvestmentStore } from '../stores/investment.store';
import { InvestmentsOverviewPage } from './investments-overview-page';

describe('InvestmentsOverviewPage', () => {
  it('shows the shared month and workspace-member controls on desktop and mobile', async () => {
    await TestBed.configureTestingModule({
      imports: [InvestmentsOverviewPage],
      providers: [
        provideNoopAnimations(),
        {
          provide: BudgetStore,
          useValue: {
            showPageSkeleton: signal(false),
            canWrite: signal(true),
            monthLabel: signal('August 2026'),
            selectedMemberEmail: signal('ALL'),
            activeMembers: signal([]),
            monthPickerView: signal('months'),
            pickerYear: signal(2026),
            pickerYearRangeLabel: signal('2020 - 2035'),
            pickerYears: signal([2026]),
            selectedMonthParts: signal({ year: 2026, monthIndex: 7 }),
            monthNames: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'],
            moveMonth: vi.fn(),
            openMonthPicker: vi.fn(),
            closeMonthPicker: vi.fn(),
            shiftMonthPicker: vi.fn(),
            showYearPicker: vi.fn(),
            selectPickerYear: vi.fn(),
            selectPickerMonth: vi.fn(),
            setSelectedMember: vi.fn(),
            memberDisplayName: vi.fn(),
          },
        },
        {
          provide: InvestmentStore,
          useValue: {
            loading: signal(false),
            error: signal(null),
            visibleAccounts: signal([]),
            refreshing: signal(false),
          },
        },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(InvestmentsOverviewPage);
    fixture.detectChanges();

    expect(fixture.componentInstance.viewMode()).toBe('list');
    const controls = fixture.nativeElement.querySelectorAll('app-month-member-controls');
    expect(controls).toHaveLength(2);
    expect(fixture.nativeElement.textContent).toContain('August 2026');
    expect(fixture.nativeElement.textContent).toContain('All Members');
  });
});
