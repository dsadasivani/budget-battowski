import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { BudgetStore } from '../budget.store';

@Component({
  selector: 'app-categories-page',
  imports: [CommonModule, MatButtonModule, MatIconModule, MatProgressBarModule, MatTooltipModule],
  template: `
    <section class="page">
      <header class="page-header">
        <div>
          <h1>Categories</h1>
          <p>Organize and budget your spending categories.</p>
        </div>
        <div class="header-actions">
          <label class="search-box wide">
            <mat-icon aria-hidden="true">search</mat-icon>
            <span class="sr-only">Search categories</span>
            <input
              type="search"
              placeholder="Search categories..."
              [value]="query()"
              (input)="setQuery($event)"
            />
          </label>
          <button
            mat-flat-button
            type="button"
            (click)="store.openBulkEditor('planning', 1)"
            [disabled]="!store.canWrite()"
          >
            <mat-icon aria-hidden="true">add</mat-icon>
            Add Category
          </button>
        </div>
      </header>

      <section class="stat-grid three">
        <article class="stat-card">
          <span class="icon-chip blue"><mat-icon aria-hidden="true">sell</mat-icon></span>
          <p>Total Categories</p>
          <strong>{{ store.expenseCategories().length }}</strong>
        </article>
        <article class="stat-card">
          <span class="icon-chip red"><mat-icon aria-hidden="true">warning</mat-icon></span>
          <p>Over Budget</p>
          <strong>{{ store.overBudgetCategoryCount() }}</strong>
        </article>
        <article class="stat-card">
          <span class="icon-chip green"><mat-icon aria-hidden="true">check_circle</mat-icon></span>
          <p>Within Budget</p>
          <strong>{{ store.withinBudgetCategoryCount() }}</strong>
        </article>
      </section>

      <section class="category-grid" aria-label="Budget categories">
        @for (category of filteredRows(); track category.id) {
          <article class="category-card" [class.warn]="category.statusTone === 'warning'" [class.danger]="category.statusTone === 'danger'">
            <header>
              <span class="category-icon {{ category.tone }}">
                <mat-icon aria-hidden="true">{{ category.icon }}</mat-icon>
              </span>
              <div>
                <h2>{{ category.name }}</h2>
                <p>Monthly budget {{ category.monthlyBudget | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</p>
              </div>
              <button
                mat-icon-button
                type="button"
                aria-label="Edit categories"
                matTooltip="Edit categories"
                (click)="store.openBulkEditor('planning', 1)"
                [disabled]="!store.canWrite()"
              >
                <mat-icon aria-hidden="true">edit</mat-icon>
              </button>
            </header>
            <div class="category-card-body">
              <span>Spent {{ category.spent | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</span>
              <span class="badge" [class.success]="category.statusTone === 'success'" [class.warning]="category.statusTone === 'warning'" [class.danger]="category.statusTone === 'danger'">
                {{ category.statusLabel }}
              </span>
            </div>
            <mat-progress-bar
              mode="determinate"
              [value]="category.percent"
              [attr.aria-label]="category.name + ' budget used'"
            ></mat-progress-bar>
            <b>{{ category.used | percent: '1.0-0' }}</b>
          </article>
        } @empty {
          <div class="empty-state">No categories match this view</div>
        }
      </section>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoriesPage {
  readonly store = inject(BudgetStore);
  readonly query = signal('');
  readonly filteredRows = computed(() => {
    const query = this.query().trim().toLowerCase();
    if (!query) {
      return this.store.categoryCards();
    }

    return this.store
      .categoryCards()
      .filter((category) => category.name.toLowerCase().includes(query));
  });

  setQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
}
