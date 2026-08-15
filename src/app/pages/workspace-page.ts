import { CommonModule, NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { BudgetStore } from '../budget.store';
import { AppPageSkeletonComponent } from '../shared/page-skeleton';

@Component({
  selector: 'app-workspace-page',
  imports: [
    CommonModule,
    NgOptimizedImage,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    AppPageSkeletonComponent,
  ],
  template: `
    @if (store.showPageSkeleton()) {
      <app-page-skeleton variant="utility" />
    } @else {
      <section class="page narrow mobile-workspace-page">
        <header class="page-header desktop-page-header">
          <div>
            <h1>Workspace Management</h1>
            <p>Manage shared access and workspace-level actions.</p>
          </div>
          <button
            mat-flat-button
            type="button"
            (click)="store.createWorkspace()"
            [disabled]="!store.userEmail() || store.isSyncing()"
          >
            <mat-icon aria-hidden="true">add_business</mat-icon>
            Create Workspace
          </button>
        </header>

        @if (store.pendingCategoryRemapCount() > 0) {
          <aside class="remap-recovery" role="status" aria-live="polite">
            <mat-icon aria-hidden="true">sync_problem</mat-icon>
            <div>
              <strong>Category remapping needs attention</strong>
              <p>
                {{ store.pendingCategoryRemapCount() }} resumable operation{{
                  store.pendingCategoryRemapCount() === 1 ? '' : 's'
                }}
                remain.
              </p>
            </div>
            <button
              mat-stroked-button
              type="button"
              (click)="store.retryCategoryRemaps()"
              [disabled]="store.isSyncing()"
            >
              Retry now
            </button>
          </aside>
        }

        <section class="content-grid even">
          <article class="panel-card">
            <header class="panel-heading mobile-panel-heading-with-action">
              <div>
                <h2>Workspaces</h2>
                <p>Select which budget space is active.</p>
              </div>
              <button
                class="mobile-panel-add-button"
                mat-icon-button
                type="button"
                aria-label="Create workspace"
                matTooltip="Create workspace"
                (click)="store.createWorkspace()"
                [disabled]="!store.userEmail() || store.isSyncing()"
              >
                <mat-icon aria-hidden="true">add_business</mat-icon>
              </button>
            </header>
            <div class="soft-list">
              @for (workspace of store.activeWorkspaces(); track workspace.id) {
                <button
                  class="workspace-row"
                  type="button"
                  [class.active]="workspace.id === store.workspaceId()"
                  (click)="store.selectWorkspace(workspace.id)"
                >
                  <span class="icon-chip blue"
                    ><mat-icon aria-hidden="true">home_work</mat-icon></span
                  >
                  <span>
                    <strong>{{ workspace.name }}</strong>
                    <small
                      >{{ workspace.members.length }} member{{
                        workspace.members.length === 1 ? '' : 's'
                      }}</small
                    >
                  </span>
                  <mat-icon aria-hidden="true">chevron_right</mat-icon>
                </button>
              } @empty {
                <div class="empty-state">No workspace loaded</div>
              }
            </div>
          </article>

          <article class="panel-card">
            <header class="panel-heading split">
              <div>
                <h2>Workspace Members</h2>
                <p>{{ store.activeWorkspace()?.name || 'Current workspace' }}</p>
              </div>
              @if (store.canManageWorkspace()) {
                <button mat-stroked-button type="button" (click)="store.addWorkspaceMember()">
                  <mat-icon aria-hidden="true">person_add</mat-icon>
                  Add Member
                </button>
              }
            </header>
            <div class="soft-list">
              @for (member of store.activeMembers(); track member.email) {
                <article class="member-row-card">
                  <span class="avatar" aria-hidden="true">
                    @if (member.photoUrl) {
                      <img [src]="member.photoUrl" alt="" referrerpolicy="no-referrer" />
                    } @else {
                      {{ store.memberInitial(member.email) }}
                    }
                  </span>
                  <div>
                    <strong>{{ store.memberDisplayName(member) }}</strong>
                    <small>{{ member.email }} &middot; {{ member.role }}</small>
                  </div>
                  @if (store.canManageWorkspace() && member.role !== 'owner') {
                    <button
                      mat-icon-button
                      type="button"
                      [attr.aria-label]="'Remove access for ' + store.memberDisplayName(member)"
                      matTooltip="Remove access"
                      (click)="store.archiveWorkspaceMember(member.email)"
                    >
                      <mat-icon aria-hidden="true">person_remove</mat-icon>
                    </button>
                  }
                </article>
              } @empty {
                <div class="empty-state">No members yet</div>
              }
            </div>
          </article>
        </section>

        <article class="panel-card archived-workspaces-card">
          <header class="panel-heading">
            <h2>Archived Workspaces</h2>
            <p>Archived workspaces are hidden from switchers but remain available for cleanup.</p>
          </header>
          <div class="soft-list compact-archive-list">
            @for (workspace of store.archivedWorkspaces(); track workspace.id) {
              <article class="archived-payment-row archived-workspace-row">
                <span class="icon-chip archived-payment-icon" aria-hidden="true">
                  <mat-icon>inventory_2</mat-icon>
                </span>
                <div>
                  <strong>{{ workspace.name }}</strong>
                  <small>
                    {{ workspace.members.length }} member{{
                      workspace.members.length === 1 ? '' : 's'
                    }}
                    &middot; archived {{ store.shortDateLabel(workspace.archivedDate || '') }}
                  </small>
                </div>
                <div class="archive-row-actions">
                  <button
                    mat-stroked-button
                    type="button"
                    (click)="store.deleteArchivedWorkspace(workspace.id)"
                    [disabled]="!store.canManageWorkspaceRecord(workspace) || store.isSyncing()"
                  >
                    <mat-icon aria-hidden="true">delete_forever</mat-icon>
                    Delete
                  </button>
                </div>
              </article>
            } @empty {
              <div class="empty-state">No archived workspaces</div>
            }
          </div>
        </article>

        <article class="panel-card archived-payments-card">
          <header class="panel-heading">
            <h2>Archived Payments</h2>
            <p>
              Restore archived payment modes and accounts, or delete the ones you no longer need.
            </p>
          </header>

          <section class="archived-payment-columns">
            <div>
              <h3>Payment Modes</h3>
              <div class="soft-list compact-archive-list">
                @for (paymentMode of store.archivedPaymentModes(); track paymentMode.id) {
                  <article class="archived-payment-row">
                    <span class="icon-chip archived-payment-icon" aria-hidden="true">
                      <img
                        [ngSrc]="store.paymentModeIconSrc(paymentMode)"
                        width="28"
                        height="28"
                        alt=""
                      />
                    </span>
                    <div>
                      <strong>{{ store.paymentModeDisplayLabel(paymentMode) }}</strong>
                      <small>{{ store.paymentModeTypeLabel(paymentMode.type) }}</small>
                    </div>
                    <div class="archive-row-actions">
                      <button
                        mat-stroked-button
                        type="button"
                        (click)="store.restorePaymentMode(paymentMode.id)"
                        [disabled]="!store.canWrite() || store.isSyncing()"
                      >
                        <mat-icon aria-hidden="true">restore</mat-icon>
                        Restore
                      </button>
                      <button
                        mat-stroked-button
                        type="button"
                        (click)="store.deleteArchivedPaymentMode(paymentMode.id)"
                        [disabled]="!store.canWrite() || store.isSyncing()"
                      >
                        <mat-icon aria-hidden="true">delete_forever</mat-icon>
                        Delete
                      </button>
                    </div>
                  </article>
                } @empty {
                  <div class="empty-state">No archived payment modes</div>
                }
              </div>
            </div>

            <div>
              <h3>Payment Accounts</h3>
              <div class="soft-list compact-archive-list">
                @for (account of store.archivedPaymentAccounts(); track account.id) {
                  <article class="archived-payment-row">
                    <span class="icon-chip archived-payment-icon" aria-hidden="true">
                      <img
                        [ngSrc]="store.paymentAccountIconSrc(account)"
                        width="28"
                        height="28"
                        alt=""
                      />
                    </span>
                    <div>
                      <strong>{{ store.paymentAccountLabel(account) }}</strong>
                      <small>{{ store.paymentAccountDetail(account) }}</small>
                    </div>
                    <div class="archive-row-actions">
                      <button
                        mat-stroked-button
                        type="button"
                        (click)="store.restorePaymentAccount(account.id)"
                        [disabled]="!store.canWrite() || store.isSyncing()"
                      >
                        <mat-icon aria-hidden="true">restore</mat-icon>
                        Restore
                      </button>
                      <button
                        mat-stroked-button
                        type="button"
                        (click)="store.deleteArchivedPaymentAccount(account.id)"
                        [disabled]="!store.canWrite() || store.isSyncing()"
                      >
                        <mat-icon aria-hidden="true">delete_forever</mat-icon>
                        Delete
                      </button>
                    </div>
                  </article>
                } @empty {
                  <div class="empty-state">No archived payment accounts</div>
                }
              </div>
            </div>
          </section>
        </article>

        <article class="panel-card action-strip">
          <div>
            <h2>Workspace Actions</h2>
            <p>Only owners can rename or archive the active workspace.</p>
          </div>
          <button
            mat-stroked-button
            type="button"
            (click)="store.renameWorkspace()"
            [disabled]="!store.canManageWorkspace()"
          >
            <mat-icon aria-hidden="true">drive_file_rename_outline</mat-icon>
            Rename
          </button>
          <button
            mat-stroked-button
            type="button"
            (click)="store.archiveWorkspace()"
            [disabled]="!store.canManageWorkspace()"
          >
            <mat-icon aria-hidden="true">archive</mat-icon>
            Archive
          </button>
        </article>
      </section>
    }
  `,
  styles: [
    `
      .archived-payments-card {
        display: grid;
        gap: 18px;
      }

      .remap-recovery {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 12px;
        margin-bottom: 18px;
        padding: 14px 16px;
        border: 1px solid #f59e0b;
        border-radius: 10px;
        background: #fffbeb;
        color: #78350f;
      }

      .remap-recovery p {
        margin: 2px 0 0;
      }

      .archived-workspaces-card {
        margin-top: 18px;
      }

      .archived-payment-columns {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
      }

      h3 {
        margin: 0 0 10px;
        color: #10213f;
        font-size: 0.95rem;
        font-weight: 800;
      }

      .compact-archive-list {
        gap: 10px;
      }

      .archived-payment-row {
        display: grid;
        grid-template-columns: 44px minmax(0, 1fr) auto;
        align-items: center;
        gap: 12px;
        padding: 12px;
        border: 1px solid #e5ebf3;
        border-radius: 8px;
        background: #fbfcfe;
      }

      .archived-payment-row strong,
      .archived-payment-row small {
        display: block;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .archived-payment-row strong {
        color: #17233b;
        font-size: 0.95rem;
      }

      .archived-payment-row small {
        margin-top: 3px;
        color: #66748a;
        font-size: 0.78rem;
        font-weight: 700;
      }

      .archived-payment-icon img {
        display: block;
        width: 28px;
        height: 28px;
        object-fit: contain;
      }

      .archived-payment-icon mat-icon {
        font-size: 24px;
        width: 24px;
        height: 24px;
      }

      .archive-row-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        flex-wrap: wrap;
      }

      @media (max-width: 780px) {
        .archived-payment-columns {
          grid-template-columns: 1fr;
        }

        .archived-payment-row {
          grid-template-columns: 40px minmax(0, 1fr);
        }

        .archive-row-actions {
          grid-column: 1 / -1;
          justify-content: stretch;
        }

        .archive-row-actions button {
          flex: 1 1 130px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspacePage {
  readonly store = inject(BudgetStore);
}
