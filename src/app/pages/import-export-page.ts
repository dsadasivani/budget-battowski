import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { BudgetStore } from '../budget.store';
import { AppPageSkeletonComponent } from '../shared/page-skeleton';

@Component({
  selector: 'app-import-export-page',
  imports: [CommonModule, MatButtonModule, MatIconModule, AppPageSkeletonComponent],
  template: `
    @if (store.showPageSkeleton()) {
      <app-page-skeleton variant="utility" />
    } @else {
      <section class="page narrow mobile-import-export-page">
        <header class="page-header desktop-page-header">
          <div>
            <h1>Import &amp; Export</h1>
            <p>Move budget data through the validated Excel workflow.</p>
          </div>
        </header>

        <section class="utility-grid import-export-grid" aria-label="Import and export workflow">
          <article class="panel-card action-card import-export-card">
            <div class="import-export-card-heading">
              <span class="icon-chip blue"><mat-icon aria-hidden="true">download</mat-icon></span>
              <div>
                <h2>Download Template</h2>
                <p>Start with the validated workbook format.</p>
              </div>
            </div>
            <button mat-flat-button type="button" (click)="store.downloadImportTemplate()">
              <mat-icon aria-hidden="true">download</mat-icon>
              Download template
            </button>
          </article>

          <article class="panel-card action-card import-export-card">
            <div class="import-export-card-heading">
              <span class="icon-chip teal"
                ><mat-icon aria-hidden="true">upload_file</mat-icon></span
              >
              <div>
                <h2>Upload Budget File</h2>
                <p>Import categories, expenses, plans, investments, and loans.</p>
              </div>
            </div>
            <button
              mat-flat-button
              type="button"
              (click)="budgetImportInput.click()"
              [disabled]="!store.canWrite()"
            >
              <mat-icon aria-hidden="true">upload_file</mat-icon>
              Upload file
            </button>
            <input
              #budgetImportInput
              class="visually-hidden-file"
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-label="Upload budget import file"
              (change)="store.importBudgetFile($event)"
            />
          </article>

          <article class="panel-card action-card import-export-card import-status-card">
            <div class="import-export-card-heading">
              <span class="icon-chip green"
                ><mat-icon aria-hidden="true">fact_check</mat-icon></span
              >
              <div>
                <h2>Import Status</h2>
                <p>Review the latest import result.</p>
              </div>
            </div>
            @if (store.importSummary(); as summary) {
              <div class="import-status-summary" aria-label="Import summary">
                <span>
                  <strong>{{ summary.success }}</strong>
                  Imported
                </span>
                <span>
                  <strong>{{ summary.total }}</strong>
                  Total rows
                </span>
                <span [class.has-errors]="summary.error">
                  <strong>{{ summary.error }}</strong>
                  Need attention
                </span>
              </div>
              @if (store.processedImportFile()) {
                <button mat-stroked-button type="button" (click)="store.downloadProcessedImport()">
                  <mat-icon aria-hidden="true">download_done</mat-icon>
                  Download processed
                </button>
              }
            } @else {
              <p>No file has been imported in this session.</p>
            }
          </article>
        </section>
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportExportPage {
  readonly store = inject(BudgetStore);
}
