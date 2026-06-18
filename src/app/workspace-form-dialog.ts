import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  MAT_BOTTOM_SHEET_DATA,
  MatBottomSheetModule,
  MatBottomSheetRef,
} from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import type { UserProfile, WorkspaceMember } from './budget.models';

export type WorkspaceFormMode = 'create' | 'add-member' | 'rename';

export type WorkspaceFormData = {
  mode: WorkspaceFormMode;
  ownerProfile: UserProfile;
  workspaceName?: string;
  existingMembers: WorkspaceMember[];
  lookupUserProfile: (email: string) => Promise<UserProfile | null>;
};

export type WorkspaceFormResult = {
  mode: WorkspaceFormMode;
  name: string;
  members: UserProfile[];
};

export type WorkspaceConfirmData = {
  title: string;
  message: string;
  confirmLabel: string;
  icon: string;
};

type LookupState = 'idle' | 'loading' | 'found' | 'missing' | 'error';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Component({
  selector: 'app-workspace-form-dialog',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatBottomSheetModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  template: `
    <section class="workspace-form" [attr.aria-labelledby]="titleId">
      <header class="workspace-form-header">
        <span class="workspace-form-mark" aria-hidden="true">
          <mat-icon>{{ data.mode === 'create' ? 'add_business' : 'person_add' }}</mat-icon>
        </span>
        <div>
          <h2 [id]="titleId">{{ title() }}</h2>
          <p>{{ subtitle() }}</p>
        </div>
        <button
          mat-icon-button
          type="button"
          [attr.aria-label]="'Close ' + title().toLowerCase()"
          (click)="close()"
        >
          <mat-icon aria-hidden="true">close</mat-icon>
        </button>
      </header>

      <form [formGroup]="form" (ngSubmit)="submit()">
        @if (showsNameField()) {
          <mat-form-field appearance="outline">
            <mat-label>Name</mat-label>
            <input matInput formControlName="name" autocomplete="off" />
          </mat-form-field>
        }

        @if (showsMemberSearch()) {
          <section class="member-search" aria-labelledby="member-search-title">
          <div class="member-search-heading">
            <h3 id="member-search-title">Workspace members</h3>
            <span>{{ selectedProfiles().length }} selected</span>
          </div>

          <div class="member-search-row">
            <mat-form-field appearance="outline">
              <mat-label>Member email</mat-label>
              <input
                matInput
                type="email"
                formControlName="memberEmail"
                autocomplete="email"
                inputmode="email"
                (keydown.enter)="searchFromKeyboard($event)"
              />
            </mat-form-field>
            <button
              mat-stroked-button
              type="button"
              (click)="searchMember()"
              [disabled]="lookupState() === 'loading'"
            >
              <mat-icon aria-hidden="true">search</mat-icon>
              Search
            </button>
          </div>

          @if (lookupState() === 'loading') {
            <p class="lookup-note" aria-live="polite">Searching...</p>
          } @else if (lookupState() === 'missing') {
            <p class="form-error" role="alert">That user doesn't exist.</p>
          } @else if (lookupState() === 'error' || memberError()) {
            <p class="form-error" role="alert">{{ memberError() }}</p>
          }

          @if (foundProfile(); as profile) {
            <article class="profile-result">
              <span class="avatar" aria-hidden="true">
                @if (profile.photoUrl) {
                  <img [src]="profile.photoUrl" alt="" referrerpolicy="no-referrer" />
                } @else {
                  {{ memberInitial(profile) }}
                }
              </span>
              <div>
                <strong>{{ profile.displayName || profile.email }}</strong>
                <small>{{ profile.email }}</small>
              </div>
              <button mat-stroked-button type="button" (click)="addFoundMember()">
                <mat-icon aria-hidden="true">person_add</mat-icon>
                Add
              </button>
            </article>
          }

          @if (selectedProfiles().length) {
            <div class="selected-members" aria-label="Selected workspace members">
              @for (profile of selectedProfiles(); track profile.email) {
                <article class="selected-member">
                  <span class="avatar mini" aria-hidden="true">
                    @if (profile.photoUrl) {
                      <img [src]="profile.photoUrl" alt="" referrerpolicy="no-referrer" />
                    } @else {
                      {{ memberInitial(profile) }}
                    }
                  </span>
                  <div>
                    <strong>{{ profile.displayName || profile.email }}</strong>
                    <small>{{ profile.email }}</small>
                  </div>
                  <button
                    mat-icon-button
                    type="button"
                    [attr.aria-label]="'Remove ' + (profile.displayName || profile.email)"
                    (click)="removeSelectedMember(profile.email)"
                  >
                    <mat-icon aria-hidden="true">close</mat-icon>
                  </button>
                </article>
              }
            </div>
          }
          </section>
        }

        @if (formError()) {
          <p class="form-error" role="alert">{{ formError() }}</p>
        }

        <footer class="workspace-form-actions">
          <button mat-stroked-button type="button" (click)="close()">Cancel</button>
          <button mat-flat-button type="submit" [disabled]="!canSubmit()">
            {{ submitLabel() }}
          </button>
        </footer>
      </form>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .workspace-form {
        display: grid;
        gap: 18px;
        width: min(620px, 92vw);
        max-width: 100%;
        padding: 22px;
        color: #17233b;
      }

      .workspace-form-header {
        display: grid;
        grid-template-columns: 46px minmax(0, 1fr) auto;
        align-items: center;
        gap: 12px;
      }

      .workspace-form-mark {
        display: inline-flex;
        width: 46px;
        height: 46px;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        background: #eaf4ff;
        color: #135ab8;
      }

      .workspace-form-header h2,
      .workspace-form-header p,
      .member-search-heading h3,
      .member-search-heading span,
      .profile-result strong,
      .profile-result small,
      .selected-member strong,
      .selected-member small {
        margin: 0;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .workspace-form-header h2 {
        font-size: 1.25rem;
        font-weight: 800;
      }

      .workspace-form-header p {
        margin-top: 3px;
        color: #66748a;
        font-size: 0.88rem;
        font-weight: 700;
      }

      form,
      .member-search,
      .selected-members {
        display: grid;
        gap: 14px;
      }

      .member-search {
        padding: 14px;
        border: 1px solid #e5ebf3;
        border-radius: 8px;
        background: #fbfcfe;
      }

      .member-search-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .member-search-heading h3 {
        color: #17233b;
        font-size: 0.95rem;
        font-weight: 800;
      }

      .member-search-heading span {
        color: #66748a;
        font-size: 0.78rem;
        font-weight: 800;
      }

      .member-search-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: start;
        gap: 10px;
      }

      .member-search-row button,
      .workspace-form-actions button,
      .profile-result button {
        min-height: 48px;
      }

      .profile-result,
      .selected-member {
        display: grid;
        grid-template-columns: 44px minmax(0, 1fr) auto;
        align-items: center;
        gap: 12px;
        padding: 12px;
        border: 1px solid #d9e3f0;
        border-radius: 8px;
        background: #fff;
      }

      .avatar {
        display: inline-flex;
        width: 40px;
        height: 40px;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        border-radius: 50%;
        background: #eaf4ff;
        color: #135ab8;
        font-size: 0.85rem;
        font-weight: 900;
      }

      .avatar.mini {
        width: 34px;
        height: 34px;
        font-size: 0.75rem;
      }

      .avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .profile-result strong,
      .selected-member strong {
        display: block;
        color: #17233b;
        font-size: 0.94rem;
      }

      .profile-result small,
      .selected-member small {
        display: block;
        margin-top: 3px;
        color: #66748a;
        font-size: 0.78rem;
        font-weight: 700;
      }

      .lookup-note,
      .form-error {
        margin: 0;
        font-size: 0.88rem;
        font-weight: 800;
      }

      .lookup-note {
        color: #475569;
      }

      .form-error {
        color: #be123c;
      }

      .workspace-form-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }

      @media (max-width: 780px) {
        .workspace-form {
          width: 100%;
          max-height: calc(100dvh - 44px);
          overflow: auto;
          padding: 18px 16px 20px;
        }

        .workspace-form-header {
          grid-template-columns: 42px minmax(0, 1fr) auto;
        }

        .workspace-form-mark {
          width: 42px;
          height: 42px;
        }

        .member-search-row,
        .profile-result {
          grid-template-columns: 40px minmax(0, 1fr);
        }

        .member-search-row mat-form-field {
          grid-column: 1 / -1;
        }

        .member-search-row button,
        .profile-result button {
          grid-column: 1 / -1;
          justify-self: stretch;
        }

        .workspace-form-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceFormDialog {
  private readonly dialogRef = inject<MatDialogRef<WorkspaceFormDialog, WorkspaceFormResult>>(
    MatDialogRef,
    { optional: true },
  );
  private readonly bottomSheetRef = inject<
    MatBottomSheetRef<WorkspaceFormDialog, WorkspaceFormResult>
  >(MatBottomSheetRef, { optional: true });
  private readonly dialogData = inject<WorkspaceFormData>(MAT_DIALOG_DATA, { optional: true });
  private readonly bottomSheetData = inject<WorkspaceFormData>(MAT_BOTTOM_SHEET_DATA, {
    optional: true,
  });
  private readonly formBuilder = inject(FormBuilder);

  protected readonly data = this.dialogData ?? this.bottomSheetData ?? this.missingData();
  protected readonly titleId = `workspace-form-title-${Math.random().toString(36).slice(2)}`;
  protected readonly lookupState = signal<LookupState>('idle');
  protected readonly foundProfile = signal<UserProfile | null>(null);
  protected readonly selectedProfiles = signal<UserProfile[]>([]);
  protected readonly memberError = signal('');
  protected readonly formError = signal('');
  protected readonly form = this.formBuilder.group({
    name: this.formBuilder.nonNullable.control(this.data.workspaceName ?? '', {
      validators: this.data.mode === 'create' || this.data.mode === 'rename'
        ? [Validators.required]
        : [],
    }),
    memberEmail: this.formBuilder.nonNullable.control('', [Validators.email]),
  });
  protected readonly title = computed(() =>
    this.data.mode === 'create'
      ? 'Create Workspace'
      : this.data.mode === 'rename'
        ? 'Rename Workspace'
        : 'Add Workspace Members',
  );
  protected readonly subtitle = computed(() =>
    this.data.mode === 'create'
      ? 'Name the workspace and add editors.'
      : this.data.mode === 'rename'
        ? 'Update the workspace name.'
      : 'Search for signed-in users to grant editor access.',
  );
  protected readonly submitLabel = computed(() =>
    this.data.mode === 'create'
      ? 'Create Workspace'
      : this.data.mode === 'rename'
        ? 'Save Name'
        : 'Add Members',
  );
  protected readonly canSubmit = computed(() => {
    if (this.data.mode === 'create' || this.data.mode === 'rename') {
      return !!this.form.controls.name.value.trim();
    }

    return this.selectedProfiles().length > 0;
  });

  protected isCreateMode(): boolean {
    return this.data.mode === 'create';
  }

  protected showsNameField(): boolean {
    return this.data.mode === 'create' || this.data.mode === 'rename';
  }

  protected showsMemberSearch(): boolean {
    return this.data.mode !== 'rename';
  }

  protected searchFromKeyboard(event: Event): void {
    event.preventDefault();
    void this.searchMember();
  }

  protected async searchMember(): Promise<void> {
    const email = normalizeEmail(this.form.controls.memberEmail.value);
    this.form.controls.memberEmail.setValue(email);
    this.form.controls.memberEmail.markAsTouched();
    this.lookupState.set('idle');
    this.foundProfile.set(null);
    this.memberError.set('');
    this.formError.set('');

    if (!email) {
      this.memberError.set('Enter a member email.');
      this.lookupState.set('error');
      return;
    }

    if (this.form.controls.memberEmail.invalid) {
      this.memberError.set('Enter a valid email address.');
      this.lookupState.set('error');
      return;
    }

    if (email === this.data.ownerProfile.email || this.isActiveExistingMember(email)) {
      this.memberError.set('Already in this workspace.');
      this.lookupState.set('error');
      return;
    }

    if (this.isSelected(email)) {
      this.memberError.set('Already selected.');
      this.lookupState.set('error');
      return;
    }

    this.lookupState.set('loading');

    try {
      const profile = await this.data.lookupUserProfile(email);
      if (!profile) {
        this.lookupState.set('missing');
        return;
      }

      this.foundProfile.set(profile);
      this.lookupState.set('found');
    } catch {
      this.memberError.set('Unable to search for that user right now.');
      this.lookupState.set('error');
    }
  }

  protected addFoundMember(): void {
    const profile = this.foundProfile();
    if (!profile || this.isSelected(profile.email) || this.isActiveExistingMember(profile.email)) {
      return;
    }

    this.selectedProfiles.update((profiles) =>
      [...profiles, profile].sort((left, right) =>
        (left.displayName || left.email).localeCompare(right.displayName || right.email),
      ),
    );
    this.form.controls.memberEmail.setValue('');
    this.foundProfile.set(null);
    this.lookupState.set('idle');
    this.memberError.set('');
  }

  protected removeSelectedMember(email: string): void {
    this.selectedProfiles.update((profiles) => profiles.filter((profile) => profile.email !== email));
  }

  protected submit(): void {
    this.formError.set('');
    if (!this.canSubmit()) {
      this.formError.set(
        this.data.mode === 'add-member' ? 'Add at least one member.' : 'Workspace name is required.',
      );
      return;
    }

    const result: WorkspaceFormResult = {
      mode: this.data.mode,
      name: this.form.controls.name.value.trim(),
      members: this.selectedProfiles(),
    };

    if (this.bottomSheetRef) {
      this.bottomSheetRef.dismiss(result);
      return;
    }

    this.dialogRef?.close(result);
  }

  protected close(): void {
    if (this.bottomSheetRef) {
      this.bottomSheetRef.dismiss();
      return;
    }

    this.dialogRef?.close();
  }

  protected memberInitial(profile: Pick<UserProfile, 'displayName' | 'email'>): string {
    const name = profile.displayName || profile.email;
    return name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  private isSelected(email: string): boolean {
    return this.selectedProfiles().some((profile) => profile.email === email);
  }

  private isActiveExistingMember(email: string): boolean {
    return this.data.existingMembers.some((member) => member.email === email && !member.archivedDate);
  }

  private missingData(): never {
    throw new Error('Workspace form data is required.');
  }
}

@Component({
  selector: 'app-workspace-confirm-dialog',
  imports: [
    CommonModule,
    MatBottomSheetModule,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
  ],
  template: `
    <section class="workspace-confirm" aria-labelledby="workspace-confirm-title">
      <header>
        <span class="workspace-confirm-mark" aria-hidden="true">
          <mat-icon>{{ data.icon }}</mat-icon>
        </span>
        <div>
          <h2 id="workspace-confirm-title">{{ data.title }}</h2>
          <p>{{ data.message }}</p>
        </div>
      </header>

      <footer>
        <button mat-stroked-button type="button" (click)="close(false)">Cancel</button>
        <button mat-flat-button type="button" (click)="close(true)">
          {{ data.confirmLabel }}
        </button>
      </footer>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .workspace-confirm {
        display: grid;
        gap: 20px;
        width: min(440px, 92vw);
        max-width: 100%;
        padding: 22px;
        color: #17233b;
      }

      .workspace-confirm header {
        display: grid;
        grid-template-columns: 46px minmax(0, 1fr);
        gap: 12px;
        align-items: center;
      }

      .workspace-confirm-mark {
        display: inline-flex;
        width: 46px;
        height: 46px;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        background: #fff1f2;
        color: #be123c;
      }

      .workspace-confirm h2,
      .workspace-confirm p {
        margin: 0;
      }

      .workspace-confirm h2 {
        font-size: 1.16rem;
        font-weight: 800;
      }

      .workspace-confirm p {
        margin-top: 4px;
        color: #66748a;
        font-size: 0.9rem;
        font-weight: 700;
        line-height: 1.45;
      }

      .workspace-confirm footer {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }

      .workspace-confirm footer button {
        min-height: 44px;
      }

      @media (max-width: 780px) {
        .workspace-confirm {
          width: 100%;
          padding: 18px 16px 20px;
        }

        .workspace-confirm footer {
          display: grid;
          grid-template-columns: 1fr 1fr;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceConfirmDialog {
  private readonly dialogRef = inject<MatDialogRef<WorkspaceConfirmDialog, boolean>>(MatDialogRef, {
    optional: true,
  });
  private readonly bottomSheetRef = inject<MatBottomSheetRef<WorkspaceConfirmDialog, boolean>>(
    MatBottomSheetRef,
    { optional: true },
  );
  private readonly dialogData = inject<WorkspaceConfirmData>(MAT_DIALOG_DATA, { optional: true });
  private readonly bottomSheetData = inject<WorkspaceConfirmData>(MAT_BOTTOM_SHEET_DATA, {
    optional: true,
  });

  protected readonly data = this.dialogData ?? this.bottomSheetData ?? this.missingData();

  protected close(confirmed: boolean): void {
    if (this.bottomSheetRef) {
      this.bottomSheetRef.dismiss(confirmed);
      return;
    }

    this.dialogRef?.close(confirmed);
  }

  private missingData(): never {
    throw new Error('Workspace confirmation data is required.');
  }
}
