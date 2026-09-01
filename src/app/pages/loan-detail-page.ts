import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { BudgetStore } from '../budget.store';
import {
  simulatePrepayment,
  type LoanPrepaymentScenarioResult,
} from '../domain/loans/loan-scenario-engine';
import type { LoanEvent, LoanEventType, LoanScheduleEntry } from '../domain/loans/loan.models';

type DisplayScheduleRow = Omit<LoanScheduleEntry, 'installmentNumber' | 'interimEvents'> & {
  key: string;
  displayNumber: number;
  kind: 'installment' | 'part-prepayment';
};

function localDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

@Component({
  selector: 'app-loan-detail-page',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTabsModule,
  ],
  template: `
    <section class="page mobile-loan-detail-page loan-detail-page">
      @if (account(); as loan) {
        @if (calculation(); as result) {
          <header class="page-header loan-page-header">
            <div>
              <a class="back-link" routerLink="/loans">
                <mat-icon aria-hidden="true">arrow_back</mat-icon>
                All loans
              </a>
              <h1>{{ loan.lender }}</h1>
              <p>
                {{ readableLabel(loan.loanType) }} · Account
                {{
                  loan.accountReferenceLastFour
                    ? 'ending ' + loan.accountReferenceLastFour
                    : 'reference not stored'
                }}
              </p>
            </div>
            <div class="header-actions">
              <span class="as-of-badge">
                <mat-icon aria-hidden="true">event_available</mat-icon>
                Updated {{ result.position.asOfDate | date: 'mediumDate' }}
              </span>
              <div class="loan-lifecycle-actions">
                @if (loan.archivedDate) {
                  <span class="archived-badge">Archived</span>
                  <button
                    mat-stroked-button
                    type="button"
                    (click)="restoreLoan()"
                    [disabled]="!store.canWrite()"
                  >
                    Restore
                  </button>
                  <button
                    mat-stroked-button
                    type="button"
                    class="danger-button"
                    (click)="permanentlyDeleteLoan()"
                    [disabled]="!store.canWrite()"
                  >
                    Delete permanently
                  </button>
                } @else {
                  <button
                    mat-stroked-button
                    type="button"
                    (click)="archiveLoan()"
                    [disabled]="!store.canWrite()"
                  >
                    <mat-icon aria-hidden="true">archive</mat-icon>
                    Archive
                  </button>
                }
              </div>
            </div>
          </header>

          <section class="stat-grid four" aria-label="Loan summary">
            <article class="stat-card">
              <div class="icon-chip red">
                <mat-icon aria-hidden="true">account_balance</mat-icon>
              </div>
              <div>
                <span>Outstanding principal</span>
                <strong>{{
                  result.position.outstandingPrincipal
                    | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                }}</strong>
              </div>
            </article>
            <article class="stat-card">
              <div class="icon-chip orange"><mat-icon aria-hidden="true">payments</mat-icon></div>
              <div>
                <span>Monthly EMI</span>
                <strong>{{
                  result.position.currentEmi | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                }}</strong>
                <small>{{ result.position.currentAnnualRate | number: '1.0-2' }}% interest</small>
              </div>
            </article>
            <article class="stat-card">
              <div class="icon-chip blue">
                <mat-icon aria-hidden="true">calendar_month</mat-icon>
              </div>
              <div>
                <span>Remaining installments</span>
                <strong>{{ result.position.remainingInstallments }}</strong>
                <small>{{ completedInstallments() }} completed</small>
              </div>
            </article>
            <article class="stat-card">
              <div class="icon-chip teal"><mat-icon aria-hidden="true">flag</mat-icon></div>
              <div>
                <span>Expected closure</span>
                <strong>{{
                  result.position.projectedPayoffDate
                    ? (result.position.projectedPayoffDate | date: 'MMM y')
                    : 'Needs attention'
                }}</strong>
                <small>Based on the current schedule</small>
              </div>
            </article>
          </section>

          @if (result.diagnostics.length) {
            <section class="diagnostics" aria-label="Loan calculation notices">
              @for (diagnostic of result.diagnostics; track diagnostic.code + diagnostic.message) {
                <p [class.error]="diagnostic.severity === 'error'">
                  <mat-icon aria-hidden="true">{{
                    diagnostic.severity === 'error' ? 'warning' : 'info'
                  }}</mat-icon>
                  {{ diagnostic.message }}
                </p>
              }
            </section>
          }

          <section class="panel-card loan-detail-panel">
            <mat-tab-group
              animationDuration="150ms"
              [mat-stretch-tabs]="false"
              mat-align-tabs="start"
              preserveContent
            >
              <mat-tab label="Overview">
                <section class="tab-content overview-layout">
                  <article class="overview-section repayment-overview">
                    <header class="panel-heading">
                      <div>
                        <h2>Repayment progress</h2>
                        <p>How much of the original principal has been repaid.</p>
                      </div>
                    </header>
                    <div class="progress-copy">
                      <strong>{{ principalProgress() | number: '1.0-0' }}%</strong>
                      <span
                        >{{ completedInstallments() }} of
                        {{ currentScheduleInstallments() }} current-schedule installments</span
                      >
                    </div>
                    <mat-progress-bar
                      mode="determinate"
                      [value]="principalProgress()"
                      aria-label="Principal repayment progress"
                    />
                    <div class="repayment-metrics">
                      <div>
                        <span>Principal repaid</span>
                        <strong>{{
                          result.position.principalRepaid === undefined
                            ? 'Unavailable'
                            : (result.position.principalRepaid
                              | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN')
                        }}</strong>
                      </div>
                      <div>
                        <span>Interest paid</span>
                        <strong>{{
                          result.position.interestPaid === undefined
                            ? 'Unavailable'
                            : (result.position.interestPaid
                              | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN')
                        }}</strong>
                      </div>
                      <div>
                        <span>Future interest</span>
                        <strong>{{
                          result.position.futureInterest
                            | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                        }}</strong>
                      </div>
                      <div>
                        <span>Prepayments</span>
                        <strong>{{
                          result.position.prepaymentsMade
                            | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                        }}</strong>
                      </div>
                    </div>
                  </article>
                  <article class="overview-section loan-terms">
                    <header class="panel-heading">
                      <div>
                        <h2>Loan terms</h2>
                        <p>Terms used to calculate this account.</p>
                      </div>
                    </header>
                    <dl>
                      <div>
                        <dt>Original amount</dt>
                        <dd>
                          {{
                            loan.contract.disbursedAmount
                              | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                          }}
                        </dd>
                      </div>
                      <div>
                        <dt>Original tenure</dt>
                        <dd>{{ originalInstallments() }} months</dd>
                      </div>
                      <div>
                        <dt>Current schedule</dt>
                        <dd>{{ currentScheduleInstallments() }} installments</dd>
                      </div>
                      <div>
                        <dt>Interest type</dt>
                        <dd>{{ readableLabel(loan.contract.interestType) }}</dd>
                      </div>
                      <div>
                        <dt>Payment frequency</dt>
                        <dd>Monthly</dd>
                      </div>
                      <div class="wide-term">
                        <dt>Prepayment approach</dt>
                        <dd>{{ readableLabel(loan.contract.postPrepaymentStrategy) }}</dd>
                      </div>
                      <div>
                        <dt>Interest calculation</dt>
                        <dd>
                          {{ interestCalculationLabel(loan.contract.interestCalculationMethod) }}
                        </dd>
                      </div>
                      <div>
                        <dt>Day count</dt>
                        <dd>{{ dayCountLabel(loan.contract.dayCountConvention) }}</dd>
                      </div>
                      <div>
                        <dt>Precision</dt>
                        <dd>
                          {{
                            loan.contract.roundingPolicy.monetaryScale === 0
                              ? 'Whole rupees'
                              : 'Rupees and paise'
                          }}
                        </dd>
                      </div>
                      @if (loan.contract.firstPeriodInterestAmount !== undefined) {
                        <div>
                          <dt>First EMI interest</dt>
                          <dd>
                            {{
                              loan.contract.firstPeriodInterestAmount
                                | currency: 'INR' : 'symbol' : '1.0-2' : 'en-IN'
                            }}
                          </dd>
                        </div>
                      }
                    </dl>
                  </article>
                </section>
              </mat-tab>

              <mat-tab label="Schedule">
                <section class="tab-content">
                  <header class="section-heading">
                    <div>
                      <h2>Amortization schedule</h2>
                      <p>Recorded history and calculated projections remain visibly distinct.</p>
                    </div>
                  </header>
                  <div class="table-wrap" tabindex="0" aria-label="Loan amortization schedule">
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Due</th>
                          <th>Opening</th>
                          <th>Interest</th>
                          <th>Principal</th>
                          <th>Payment</th>
                          <th>Prepayment</th>
                          <th>Closing</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (row of visibleSchedule(); track row.key) {
                          <tr [class.projected]="row.provenance === 'projected'">
                            <td>{{ row.displayNumber }}</td>
                            <td>{{ row.dueDate | date: 'mediumDate' }}</td>
                            <td>{{ row.openingPrincipal | number: '1.0-0' }}</td>
                            <td>{{ row.interestComponent | number: '1.0-0' }}</td>
                            <td>{{ row.principalComponent | number: '1.0-0' }}</td>
                            <td>{{ row.scheduledPayment | number: '1.0-0' }}</td>
                            <td>{{ row.prepaymentAmount | number: '1.0-0' }}</td>
                            <td>{{ row.closingPrincipal | number: '1.0-0' }}</td>
                            <td>
                              <span class="status">
                                {{
                                  row.kind === 'part-prepayment' ? 'part prepayment' : row.status
                                }}
                              </span>
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                  @if (visibleSchedule().length < displaySchedule().length) {
                    <button mat-stroked-button type="button" (click)="showMoreSchedule()">
                      Show more installments
                    </button>
                  }
                </section>
              </mat-tab>

              <mat-tab label="Transactions">
                <section class="tab-content split-layout">
                  <article>
                    <h2>Recorded event ledger</h2>
                    <div class="timeline">
                      @for (transaction of result.transactions; track transaction.id) {
                        <div>
                          <time>{{ transaction.date | date: 'mediumDate' }}</time
                          ><strong>{{ transaction.label }}</strong
                          ><span>{{
                            transaction.amount === undefined
                              ? transaction.source
                              : (transaction.amount
                                | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN')
                          }}</span>
                        </div>
                      } @empty {
                        <p class="empty-state">No recorded events yet.</p>
                      }
                    </div>
                  </article>
                  <form class="form-card" [formGroup]="eventForm" (ngSubmit)="recordEvent()">
                    <h2>Record an event</h2>
                    <mat-form-field appearance="outline"
                      ><mat-label>Type</mat-label
                      ><mat-select formControlName="type">
                        @for (type of eventTypes; track type) {
                          <mat-option [value]="type">{{ type }}</mat-option>
                        }
                      </mat-select></mat-form-field
                    >
                    <mat-form-field appearance="outline"
                      ><mat-label>Effective date</mat-label
                      ><input matInput type="date" formControlName="effectiveDate"
                    /></mat-form-field>
                    @if (eventNeedsValue()) {
                      <mat-form-field appearance="outline"
                        ><mat-label>{{ eventValueLabel() }}</mat-label
                        ><input
                          matInput
                          type="number"
                          [attr.min]="eventMinimum()"
                          step="0.01"
                          formControlName="value"
                      /></mat-form-field>
                    }
                    <mat-form-field appearance="outline"
                      ><mat-label>Notes</mat-label
                      ><textarea matInput formControlName="notes"></textarea>
                    </mat-form-field>
                    <button
                      mat-flat-button
                      type="submit"
                      [disabled]="eventForm.invalid || !eventValueValid() || !store.canWrite()"
                    >
                      Record event
                    </button>
                  </form>
                </section>
              </mat-tab>

              <mat-tab label="Insights">
                <section class="tab-content split-layout">
                  <form class="form-card" [formGroup]="scenarioForm" (ngSubmit)="runScenario()">
                    <h2>Prepayment simulator</h2>
                    <p>This never changes recorded data.</p>
                    <mat-form-field appearance="outline"
                      ><mat-label>Prepayment</mat-label
                      ><input matInput type="number" min="1" formControlName="amount"
                    /></mat-form-field>
                    <mat-form-field appearance="outline"
                      ><mat-label>Date</mat-label
                      ><input matInput type="date" formControlName="date"
                    /></mat-form-field>
                    <mat-form-field appearance="outline"
                      ><mat-label>Strategy</mat-label
                      ><mat-select formControlName="strategy"
                        ><mat-option value="keep-emi-reduce-tenure">Keep EMI</mat-option
                        ><mat-option value="keep-tenure-reduce-emi"
                          >Keep tenure</mat-option
                        ></mat-select
                      ></mat-form-field
                    >
                    <button mat-flat-button type="submit">Calculate scenario</button>
                  </form>
                  @if (scenario(); as value) {
                    <article class="scenario-card" aria-live="polite">
                      <h2>Scenario result</h2>
                      <dl>
                        <div>
                          <dt>Current payoff</dt>
                          <dd>{{ value.baselinePayoffDate | date: 'MMM y' }}</dd>
                        </div>
                        <div>
                          <dt>New payoff</dt>
                          <dd>{{ value.projectedPayoffDate | date: 'MMM y' }}</dd>
                        </div>
                        <div>
                          <dt>Months saved</dt>
                          <dd>{{ value.monthsSaved }}</dd>
                        </div>
                        <div>
                          <dt>Interest before</dt>
                          <dd>
                            {{
                              value.futureInterestBefore
                                | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                            }}
                          </dd>
                        </div>
                        <div>
                          <dt>Interest after</dt>
                          <dd>
                            {{
                              value.futureInterestAfter
                                | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                            }}
                          </dd>
                        </div>
                        <div>
                          <dt>Interest saved</dt>
                          <dd>
                            {{
                              value.interestSaved | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                            }}
                          </dd>
                        </div>
                      </dl>
                      <button
                        mat-stroked-button
                        type="button"
                        (click)="recordScenario()"
                        [disabled]="!store.canWrite()"
                      >
                        Record this prepayment
                      </button>
                    </article>
                  }
                </section>
              </mat-tab>

              <mat-tab label="Documents">
                <section class="tab-content">
                  <h2>Source documents</h2>
                  <p>
                    Keep a reference to the lender documents associated with this loan. Automated
                    statement import is not yet available.
                  </p>
                  @for (document of documents(); track document.id) {
                    <article class="document-row">
                      <mat-icon aria-hidden="true">description</mat-icon>
                      <div>
                        <strong>{{ document.name }}</strong>
                        <p>{{ document.kind }} · {{ document.importStatus }}</p>
                      </div>
                    </article>
                  } @empty {
                    <div class="empty-state">No lender documents recorded.</div>
                  }
                </section>
              </mat-tab>
            </mat-tab-group>
          </section>
        }
      } @else {
        <section class="panel-card empty-state">
          <h1>Loan not found</h1>
          <p>The account may have been archived, deleted, or not loaded yet.</p>
          <a mat-flat-button routerLink="/loans">Return to loans</a>
        </section>
      }
    </section>
  `,
  styles: `
    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      width: fit-content;
      margin-bottom: 8px;
      color: #2f80ed;
      font-size: 0.9rem;
      font-weight: 600;
      text-decoration: none;
    }
    .back-link mat-icon {
      width: 19px;
      height: 19px;
      font-size: 19px;
    }
    .loan-page-header {
      align-items: center;
    }
    .as-of-badge {
      display: inline-flex;
      min-height: 42px;
      align-items: center;
      gap: 8px;
      padding: 0 14px;
      border: 1px solid #dce4ef;
      border-radius: 999px;
      background: #fff;
      color: #526079;
      box-shadow: 0 8px 22px rgba(15, 23, 42, 0.05);
      font-size: 0.86rem;
      font-weight: 600;
      white-space: nowrap;
    }
    .as-of-badge mat-icon {
      width: 19px;
      height: 19px;
      color: #0f9f8f;
      font-size: 19px;
    }
    .loan-lifecycle-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      flex-wrap: wrap;
    }
    .loan-lifecycle-actions .danger-button {
      color: #b42318;
      border-color: #f3b5af;
    }
    .archived-badge {
      padding: 6px 10px;
      border-radius: 999px;
      color: #475569;
      background: #eef2f7;
      font-size: 0.75rem;
      font-weight: 800;
    }
    .stat-card > div:not(.icon-chip) {
      display: grid;
      gap: 4px;
    }
    .stat-card span,
    .stat-card small {
      color: #66748a;
      font-size: 0.82rem;
      font-weight: 500;
    }
    .diagnostics {
      display: grid;
      gap: 8px;
    }
    .diagnostics p {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      padding: 12px 14px;
      border: 1px solid #bfdbfe;
      border-radius: 8px;
      color: #1e3a8a;
      background: #eff6ff;
    }
    .diagnostics p.error {
      border-color: #fecaca;
      color: #991b1b;
      background: #fef2f2;
    }
    .loan-detail-panel {
      overflow: hidden;
      padding: 0;
    }
    .tab-content {
      padding: 24px;
    }
    .overview-layout {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(300px, 0.75fr);
      gap: 18px;
      align-items: start;
    }
    .overview-section,
    .form-card,
    .scenario-card {
      padding: 20px;
      border: 1px solid #e0e7f1;
      border-radius: 8px;
      background: #fff;
    }
    .overview-section {
      min-width: 0;
    }
    .progress-copy {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      margin: 4px 0 12px;
    }
    .progress-copy strong {
      color: #0b1426;
      font-size: 1.65rem;
    }
    .progress-copy span,
    .repayment-metrics span,
    dt {
      color: #66748a;
      font-size: 0.8rem;
      font-weight: 500;
    }
    .repayment-metrics {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-top: 20px;
    }
    .repayment-metrics > div {
      display: grid;
      gap: 5px;
      padding: 14px;
      border-radius: 8px;
      background: #f8fafc;
    }
    .repayment-metrics strong {
      color: #0b1426;
      font-size: 1.05rem;
    }
    dl {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }
    .loan-terms dl {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin: 0;
    }
    .loan-terms dl > div {
      padding-bottom: 12px;
      border-bottom: 1px solid #edf1f6;
    }
    .loan-terms .wide-term {
      grid-column: 1 / -1;
    }
    dd {
      margin: 3px 0 0;
      color: #0b1426;
      font-weight: 700;
    }
    .section-heading {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }
    .section-heading h2 {
      margin: 0;
    }
    .section-heading p {
      color: #64748b;
    }
    .table-wrap {
      max-height: 62vh;
      margin: 16px 0;
      overflow: auto;
      border: 1px solid #e0e7f1;
      border-radius: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      white-space: nowrap;
    }
    th,
    td {
      padding: 10px 12px;
      border-bottom: 1px solid #e2e8f0;
      text-align: right;
    }
    th:first-child,
    td:first-child,
    th:nth-child(2),
    td:nth-child(2),
    th:last-child,
    td:last-child {
      text-align: left;
    }
    th {
      position: sticky;
      top: 0;
      z-index: 1;
      color: #526079;
      background: #f7f9fc;
      font-size: 0.78rem;
      font-weight: 700;
    }
    tr.projected {
      color: #475569;
      background: #f8fafc;
    }
    .status {
      padding: 3px 7px;
      border-radius: 999px;
      background: #e2e8f0;
      font-size: 0.72rem;
      text-transform: capitalize;
    }
    .split-layout {
      display: grid;
      grid-template-columns: minmax(0, 1.4fr) minmax(280px, 0.8fr);
      gap: 20px;
      align-items: start;
    }
    .form-card {
      display: grid;
      gap: 4px;
      background: #f9fbfd;
    }
    .form-card h2 {
      margin-top: 0;
    }
    .timeline {
      border-left: 2px solid #cbd5e1;
      padding-left: 18px;
    }
    .timeline > div {
      display: grid;
      grid-template-columns: 110px 1fr auto;
      gap: 12px;
      padding: 12px 0;
      border-bottom: 1px solid #e2e8f0;
    }
    time {
      color: #64748b;
    }
    .scenario-card dl {
      grid-template-columns: repeat(2, 1fr);
    }
    .document-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px;
      border-bottom: 1px solid #e2e8f0;
    }
    .document-row mat-icon {
      color: #2f80ed;
    }
    .document-row p {
      margin: 2px 0;
      color: #64748b;
    }
    @media (max-width: 900px) {
      .overview-layout {
        grid-template-columns: 1fr;
      }
      .split-layout {
        grid-template-columns: 1fr;
      }
    }
    @media (max-width: 600px) {
      .loan-page-header {
        align-items: flex-start;
        flex-direction: column;
      }
      .loan-page-header .header-actions {
        width: 100%;
        justify-content: flex-start;
      }
      .as-of-badge {
        white-space: normal;
      }
      .tab-content {
        padding: 18px;
      }
      .repayment-metrics,
      .loan-terms dl {
        grid-template-columns: 1fr;
      }
      .loan-terms .wide-term {
        grid-column: auto;
      }
      .timeline > div {
        grid-template-columns: 1fr;
        gap: 3px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoanDetailPage {
  readonly store = inject(BudgetStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);
  readonly loanId = this.route.snapshot.paramMap.get('loanId') ?? '';
  readonly account = computed(() => this.store.loanAccount(this.loanId));
  readonly calculation = computed(() => this.store.loanCalculation(this.loanId));
  readonly scheduleLimit = signal(60);
  readonly displaySchedule = computed<DisplayScheduleRow[]>(() => {
    const schedule = this.calculation()?.schedule ?? [];
    const displayRows: DisplayScheduleRow[] = [];
    let displayNumber = 0;

    for (const row of schedule) {
      const interimEvents = [...(row.interimEvents ?? [])].sort((left, right) =>
        left.effectiveDate.localeCompare(right.effectiveDate),
      );
      for (const interimEvent of interimEvents) {
        displayNumber += 1;
        displayRows.push({
          key: `event-${interimEvent.id}`,
          displayNumber,
          kind: 'part-prepayment',
          dueDate: interimEvent.effectiveDate,
          openingPrincipal: interimEvent.openingPrincipal,
          annualRate: row.annualRate,
          interestAccrued: 0,
          scheduledPayment: interimEvent.amount,
          interestComponent: 0,
          principalComponent: interimEvent.amount,
          prepaymentAmount: interimEvent.amount,
          charges: 0,
          actualPaymentAmount:
            interimEvent.provenance === 'recorded' ? interimEvent.amount : undefined,
          actualPaymentDate:
            interimEvent.provenance === 'recorded' ? interimEvent.effectiveDate : undefined,
          closingPrincipal: interimEvent.closingPrincipal,
          status: interimEvent.provenance === 'recorded' ? 'adjusted' : 'future',
          provenance: interimEvent.provenance,
        });
      }

      displayNumber += 1;
      displayRows.push({
        ...row,
        key: `installment-${row.installmentNumber}-${row.dueDate}`,
        displayNumber,
        kind: 'installment',
        openingPrincipal: interimEvents.at(-1)?.closingPrincipal ?? row.openingPrincipal,
        prepaymentAmount: interimEvents.length ? 0 : row.prepaymentAmount,
      });
    }
    return displayRows;
  });
  readonly visibleSchedule = computed(() => this.displaySchedule().slice(0, this.scheduleLimit()));
  readonly originalInstallments = computed(() => {
    const account = this.account();
    const calculation = this.calculation();
    return account?.contract.originalTenureMonths ?? calculation?.schedule.length ?? 0;
  });
  readonly completedInstallments = computed(
    () => this.calculation()?.schedule.filter((row) => row.status === 'paid').length ?? 0,
  );
  readonly currentScheduleInstallments = computed(
    () => this.completedInstallments() + (this.calculation()?.position.remainingInstallments ?? 0),
  );
  readonly principalProgress = computed(() => {
    const account = this.account();
    const principalRepaid = this.calculation()?.position.principalRepaid;
    if (!account || principalRepaid === undefined || account.contract.disbursedAmount <= 0)
      return 0;
    return Math.min(100, Math.max(0, (principalRepaid / account.contract.disbursedAmount) * 100));
  });
  readonly scenario = signal<LoanPrepaymentScenarioResult | null>(null);
  readonly documents = computed(() =>
    this.store.loanDocuments().filter((item) => item.loanId === this.loanId),
  );
  readonly eventTypes: LoanEventType[] = [
    'emi-payment',
    'part-prepayment',
    'rate-change',
    'emi-change',
    'tenure-change',
    'disbursement',
    'charge',
    'penal-charge',
    'charge-reversal',
    'waiver',
    'refund',
    'adjustment',
    'moratorium-start',
    'moratorium-end',
    'balance-anchor',
    'foreclosure',
  ];
  readonly eventForm = this.formBuilder.nonNullable.group({
    type: ['emi-payment' as LoanEventType, Validators.required],
    effectiveDate: [localDate(), Validators.required],
    value: [0],
    notes: [''],
  });
  readonly scenarioForm = this.formBuilder.nonNullable.group({
    amount: [240000, [Validators.required, Validators.min(1)]],
    date: [localDate(), Validators.required],
    strategy: ['keep-emi-reduce-tenure' as 'keep-emi-reduce-tenure' | 'keep-tenure-reduce-emi'],
  });

  readableLabel(value: string): string {
    const label = value
      .split('-')
      .map((part, index) =>
        index === 0 ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part,
      )
      .join(' ');
    return label.replaceAll('emi', 'EMI');
  }

  dayCountLabel(value: string): string {
    if (value === '30-360') return '30-day months (30/360)';
    if (value === 'actual-actual') return 'Leap-year adjusted';
    return value.startsWith('actual-') ? `Actual days ÷ ${value.slice('actual-'.length)}` : value;
  }

  interestCalculationLabel(value: string): string {
    return value === 'daily-reducing' ? 'Based on daily balance' : 'Once per EMI cycle';
  }

  showMoreSchedule(): void {
    this.scheduleLimit.update((value) => value + 60);
  }

  eventNeedsValue(): boolean {
    const type = this.eventForm.controls.type.value;
    return type !== 'moratorium-start' && type !== 'moratorium-end';
  }

  eventValueLabel(): string {
    switch (this.eventForm.controls.type.value) {
      case 'rate-change':
        return 'New annual rate (%)';
      case 'emi-change':
        return 'New EMI';
      case 'tenure-change':
        return 'New remaining installments';
      case 'balance-anchor':
        return 'Lender-reported principal';
      case 'foreclosure':
        return 'Settlement amount (optional)';
      case 'adjustment':
        return 'Principal adjustment (+/-)';
      default:
        return 'Amount';
    }
  }

  eventMinimum(): number | null {
    const type = this.eventForm.controls.type.value;
    if (type === 'adjustment') return null;
    if (type === 'tenure-change') return 1;
    if (type === 'rate-change' || type === 'balance-anchor' || type === 'foreclosure') return 0;
    return 0.01;
  }

  eventValueValid(): boolean {
    if (!this.eventNeedsValue()) return true;
    const type = this.eventForm.controls.type.value;
    const value = this.eventForm.controls.value.value;
    if (type === 'adjustment') return value !== 0;
    if (type === 'tenure-change') return Number.isInteger(value) && value >= 1;
    if (type === 'rate-change' || type === 'balance-anchor' || type === 'foreclosure') {
      return value >= 0;
    }
    return value > 0;
  }

  async archiveLoan(): Promise<void> {
    await this.store.archiveLoanAccount(this.loanId);
  }

  async restoreLoan(): Promise<void> {
    await this.store.restoreLoanAccount(this.loanId);
  }

  async permanentlyDeleteLoan(): Promise<void> {
    if (await this.store.permanentlyDeleteLoanAccount(this.loanId)) {
      await this.router.navigate(['/loans']);
    }
  }

  async recordEvent(): Promise<void> {
    if (this.eventForm.invalid || !this.eventValueValid()) return;
    const value = this.eventForm.getRawValue();
    const base = {
      id: '',
      loanId: this.loanId,
      effectiveDate: value.effectiveDate,
      notes: value.notes,
      source: 'manual' as const,
      createdDate: new Date().toISOString(),
    };
    let event: LoanEvent;
    if (value.type === 'rate-change')
      event = { ...base, type: 'rate-change', newAnnualRate: value.value };
    else if (value.type === 'emi-change')
      event = { ...base, type: 'emi-change', newEmi: value.value };
    else if (value.type === 'tenure-change')
      event = {
        ...base,
        type: 'tenure-change',
        newRemainingInstallments: value.value,
      };
    else if (value.type === 'moratorium-start' || value.type === 'moratorium-end')
      event = { ...base, type: value.type };
    else if (value.type === 'foreclosure')
      event = { ...base, type: 'foreclosure', amount: value.value || undefined };
    else event = { ...base, type: value.type, amount: value.value } as LoanEvent;
    if (await this.store.recordLoanEvent(event)) this.eventForm.patchValue({ value: 0, notes: '' });
  }

  runScenario(): void {
    const account = this.account();
    if (!account || this.scenarioForm.invalid) return;
    const value = this.scenarioForm.getRawValue();
    this.scenario.set(
      simulatePrepayment({
        account,
        events: this.store.loanEvents().filter((item) => item.loanId === this.loanId),
        asOfDate: localDate(),
        prepaymentDate: value.date,
        amount: value.amount,
        strategy: value.strategy,
      }),
    );
  }

  async recordScenario(): Promise<void> {
    const value = this.scenarioForm.getRawValue();
    const saved = await this.store.recordLoanEvent({
      id: '',
      loanId: this.loanId,
      type: 'part-prepayment',
      effectiveDate: value.date,
      amount: value.amount,
      source: 'manual',
      notes: 'Recorded from prepayment simulator',
      createdDate: new Date().toISOString(),
    });
    if (saved) this.scenario.set(null);
  }
}
