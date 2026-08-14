import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';

import { BudgetStore } from '../budget.store';

@Component({
  selector: 'app-month-member-controls',
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule],
  template: `
    <div class="period-controls" aria-label="Month and member filters">
      <div class="month-control" aria-label="Selected month">
        <button
          mat-icon-button
          type="button"
          aria-label="Previous month"
          matTooltip="Previous month"
          (click)="store.moveMonth(-1)"
        >
          <mat-icon aria-hidden="true">chevron_left</mat-icon>
        </button>
        <button
          class="month-picker-field"
          type="button"
          aria-label="Select month"
          matTooltip="Select month"
          [matMenuTriggerFor]="monthPickerMenu"
          #monthPickerTrigger="matMenuTrigger"
          (menuOpened)="store.openMonthPicker()"
          (menuClosed)="store.closeMonthPicker()"
        >
          <mat-icon aria-hidden="true">calendar_month</mat-icon>
          <span aria-hidden="true" class="month-picker-label">{{ store.monthLabel() }}</span>
        </button>
        <button
          mat-icon-button
          type="button"
          aria-label="Next month"
          matTooltip="Next month"
          (click)="store.moveMonth(1)"
        >
          <mat-icon aria-hidden="true">chevron_right</mat-icon>
        </button>
      </div>

      <mat-menu #monthPickerMenu="matMenu" class="month-picker-menu">
        <div class="month-picker-panel" (click)="$event.stopPropagation()">
          <header>
            <button
              mat-icon-button
              type="button"
              aria-label="Previous picker page"
              (click)="store.shiftMonthPicker($event, -1)"
            >
              <mat-icon aria-hidden="true">chevron_left</mat-icon>
            </button>
            <button type="button" class="month-picker-title" (click)="store.showYearPicker($event)">
              @if (store.monthPickerView() === 'years') {
                {{ store.pickerYearRangeLabel() }}
              } @else {
                {{ store.pickerYear() }}
              }
            </button>
            <button
              mat-icon-button
              type="button"
              aria-label="Next picker page"
              (click)="store.shiftMonthPicker($event, 1)"
            >
              <mat-icon aria-hidden="true">chevron_right</mat-icon>
            </button>
          </header>

          @if (store.monthPickerView() === 'years') {
            <div class="picker-grid year-grid" role="group" aria-label="Select year">
              @for (year of store.pickerYears(); track year) {
                <button
                  type="button"
                  [class.active]="year === store.pickerYear()"
                  (click)="store.selectPickerYear($event, year)"
                >
                  {{ year }}
                </button>
              }
            </div>
          } @else {
            <div class="picker-grid month-grid" role="group" aria-label="Select month">
              @for (month of store.monthNames; track month; let monthIndex = $index) {
                <button
                  type="button"
                  [class.active]="
                    store.selectedMonthParts().year === store.pickerYear() &&
                    store.selectedMonthParts().monthIndex === monthIndex
                  "
                  (click)="store.selectPickerMonth(monthIndex, monthPickerTrigger)"
                >
                  {{ month }}
                </button>
              }
            </div>
          }
        </div>
      </mat-menu>

      <div class="member-segments" aria-label="Filter by member">
        <button
          type="button"
          [class.active]="store.selectedMemberEmail() === 'ALL'"
          [attr.aria-pressed]="store.selectedMemberEmail() === 'ALL'"
          (click)="store.setSelectedMember('ALL')"
        >
          All Members
        </button>
        @for (member of store.activeMembers(); track member.email) {
          <button
            type="button"
            [class.active]="store.selectedMemberEmail() === member.email"
            [attr.aria-pressed]="store.selectedMemberEmail() === member.email"
            (click)="store.setSelectedMember(member.email)"
          >
            {{ store.memberDisplayName(member) }}
          </button>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonthMemberControls {
  readonly store = inject(BudgetStore);
}
