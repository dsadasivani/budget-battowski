import { Injectable, signal } from '@angular/core';
import type { Workspace } from '../budget.models';

@Injectable({ providedIn: 'root' })
export class WorkspaceStore {
  readonly isWorkspaceDataLoading = signal(false);
  readonly workspaceId = signal<string | null>(null);
  readonly workspaces = signal<Workspace[]>([]);
  readonly selectedMemberEmail = signal('ALL');
}
