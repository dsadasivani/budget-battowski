import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { BudgetStore } from '../budget.store';

@Component({
  selector: 'app-workspace-page',
  imports: [CommonModule, MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    <section class="page narrow">
      <header class="page-header">
        <div>
          <h1>Workspace</h1>
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

      <section class="content-grid even">
        <article class="panel-card">
          <header class="panel-heading">
            <h2>Workspaces</h2>
            <p>Select which budget space is active.</p>
          </header>
          <div class="soft-list">
            @for (workspace of store.workspaces(); track workspace.id) {
              <button
                class="workspace-row"
                type="button"
                [class.active]="workspace.id === store.workspaceId()"
                (click)="store.selectWorkspace(workspace.id)"
              >
                <span class="icon-chip blue"><mat-icon aria-hidden="true">home_work</mat-icon></span>
                <span>
                  <strong>{{ workspace.name }}</strong>
                  <small>{{ workspace.members.length }} member{{ workspace.members.length === 1 ? '' : 's' }}</small>
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
                Add Editor
              </button>
            }
          </header>
          <div class="soft-list">
            @for (member of store.activeMembers(); track member.email) {
              <article class="member-row-card">
                <span class="avatar">{{ store.memberInitial(member.email) }}</span>
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
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspacePage {
  readonly store = inject(BudgetStore);
}
