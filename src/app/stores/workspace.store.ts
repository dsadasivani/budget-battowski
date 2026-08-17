import { Injectable, computed, inject, signal } from '@angular/core';
import type { OwnedRecord, Workspace } from '../budget.models';
import { isWorkspaceOwner, matchesMember, normalizeEmail } from '../domain/identity/identity';
import { SessionStore } from './session.store';

@Injectable({ providedIn: 'root' })
export class WorkspaceStore {
  private readonly session = inject(SessionStore);
  readonly isWorkspaceDataLoading = signal(false);
  readonly workspaceId = signal<string | null>(null);
  readonly workspaces = signal<Workspace[]>([]);
  readonly selectedMemberEmail = signal('ALL');
  readonly activeWorkspace = computed(
    () => this.workspaces().find((workspace) => workspace.id === this.workspaceId()) ?? null,
  );
  readonly activeMembers = computed(() =>
    (this.activeWorkspace()?.members ?? [])
      .filter((member) => !member.archivedDate)
      .sort((left, right) =>
        (left.displayName || left.email).localeCompare(right.displayName || right.email),
      ),
  );
  readonly selectedMember = computed(() => {
    const selectedEmail = this.selectedMemberEmail();
    return selectedEmail === 'ALL'
      ? null
      : (this.activeMembers().find(
          (member) => normalizeEmail(member.email) === normalizeEmail(selectedEmail),
        ) ?? null);
  });
  readonly selectedMemberId = computed(() => {
    const member = this.selectedMember();
    return member?.uid ?? 'ALL';
  });
  readonly canManageWorkspace = computed(() => {
    const workspace = this.activeWorkspace();
    return (
      !!workspace &&
      isWorkspaceOwner(workspace, {
        uid: this.session.userUid() ?? undefined,
      })
    );
  });

  matchesSelectedMember(record: Pick<OwnedRecord, 'ownerUid' | 'memberEmail'>): boolean {
    if (this.selectedMemberEmail() === 'ALL') {
      return true;
    }
    const member = this.selectedMember();
    return member ? matchesMember(record, member) : false;
  }
}
