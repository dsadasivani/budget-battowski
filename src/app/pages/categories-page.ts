import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { BudgetStore } from '../budget.store';
import { AppPageSkeletonComponent } from '../shared/page-skeleton';

@Component({
  selector: 'app-categories-page',
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    AppPageSkeletonComponent,
  ],
  template: `
    @if (store.showPageSkeleton()) {
      <app-page-skeleton variant="categories" />
    } @else {
    <section class="page mobile-categories-page">
      <header class="page-header desktop-page-header">
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

      <div class="mobile-page-controls mobile-search-action-strip">
        <label class="search-box mobile-search-box">
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
          class="mobile-panel-add-button"
          mat-icon-button
          type="button"
          aria-label="Add category"
          matTooltip="Add category"
          (click)="store.openBulkEditor('planning', 1)"
          [disabled]="!store.canWrite()"
        >
          <mat-icon aria-hidden="true">add</mat-icon>
        </button>
      </div>

      <aside class="category-stat-tags" aria-label="Category summary">
        <span class="category-stat-tag blue">
          <span class="category-stat-icon" aria-hidden="true">
            <mat-icon>sell</mat-icon>
          </span>
          <span class="category-stat-copy">
            <span>Total Categories</span>
            <strong>{{ store.expenseCategories().length }}</strong>
          </span>
        </span>
        <span class="category-stat-tag red">
          <span class="category-stat-icon" aria-hidden="true">
            <mat-icon>warning</mat-icon>
          </span>
          <span class="category-stat-copy">
            <span>Over Budget</span>
            <strong>{{ store.overBudgetCategoryCount() }}</strong>
          </span>
        </span>
        <span class="category-stat-tag green">
          <span class="category-stat-icon" aria-hidden="true">
            <mat-icon>check_circle</mat-icon>
          </span>
          <span class="category-stat-copy">
            <span>Within Budget</span>
            <strong>{{ store.withinBudgetCategoryCount() }}</strong>
          </span>
        </span>
      </aside>

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
                [attr.aria-label]="'Edit category ' + category.name"
                matTooltip="Edit category"
                (click)="store.openBulkEditor('planning', 1, category.id)"
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
    }
  `,
  styles: [
    `
      .category-stat-tags {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-start;
        gap: 12px;
        min-width: 0;
      }

      .category-stat-tag {
        display: inline-grid;
        min-height: 52px;
        grid-template-columns: 34px auto;
        align-items: center;
        gap: 11px;
        padding: 8px 14px 8px 9px;
        border: 1px solid rgba(151, 164, 184, 0.28);
        border-radius: 8px;
        background: #fff;
        color: #34445b;
        box-shadow: 0 10px 22px rgba(43, 59, 85, 0.07);
      }

      .category-stat-icon {
        display: inline-grid;
        width: 34px;
        height: 34px;
        place-items: center;
        border-radius: 8px;
      }

      .category-stat-icon mat-icon {
        width: 19px;
        height: 19px;
        font-size: 19px;
      }

      .category-stat-copy {
        display: grid;
        gap: 1px;
        min-width: 0;
      }

      .category-stat-copy span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: #60708a;
        font-size: 0.74rem;
        font-weight: 700;
        letter-spacing: 0;
        text-transform: uppercase;
      }

      .category-stat-copy strong {
        color: #10213f;
        font-size: 1.18rem;
        font-weight: 800;
        line-height: 1;
      }

      .category-stat-tag.blue {
        background: linear-gradient(180deg, #f7fbff 0%, #fff 100%);
        border-color: #cfe2ff;
      }

      .category-stat-tag.red {
        background: linear-gradient(180deg, #fff5f5 0%, #fff 100%);
        border-color: #fecdd3;
      }

      .category-stat-tag.green {
        background: linear-gradient(180deg, #f3fff9 0%, #fff 100%);
        border-color: #bbf7d0;
      }

      .category-stat-tag.blue .category-stat-icon {
        background: #eaf4ff;
        color: #2563eb;
      }

      .category-stat-tag.red .category-stat-icon {
        background: #ffe4e6;
        color: #be123c;
      }

      .category-stat-tag.green .category-stat-icon {
        background: #dcfce7;
        color: #047857;
      }

      @media (max-width: 780px) {
        .category-stat-tags {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }

        .category-stat-tag {
          min-height: 56px;
          grid-template-columns: 24px minmax(0, 1fr);
          gap: 6px;
          padding: 8px;
          box-shadow: none;
        }

        .category-stat-icon {
          width: 24px;
          height: 24px;
          border-radius: 7px;
        }

        .category-stat-icon mat-icon {
          width: 16px;
          height: 16px;
          font-size: 16px;
        }

        .category-stat-copy {
          gap: 0;
        }

        .category-stat-copy span {
          overflow: visible;
          text-overflow: clip;
          white-space: normal;
          font-size: 0.64rem;
          line-height: 1.05;
          text-transform: none;
        }

        .category-stat-copy strong {
          font-size: 0.92rem;
        }
      }
    `,
  ],
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
