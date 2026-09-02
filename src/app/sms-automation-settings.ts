import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import {
  IngestionDeviceSummary,
  IngestionDeviceStatus,
  SmsAutomationApi,
} from './data/sms-automation.api';
import { BudgetStore } from './budget.store';

@Component({
  selector: 'app-sms-automation-settings',
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule],
  template: `
    <section class="sms-settings" aria-labelledby="sms-automation-title">
      <header>
        <span class="icon-chip blue"><mat-icon aria-hidden="true">sms</mat-icon></span>
        <div>
          <h2 id="sms-automation-title">Automatic SMS Transactions</h2>
          <p>Connect MacroDroid on Android. Detected transactions always wait for your review.</p>
        </div>
      </header>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate" aria-label="Loading connected devices" />
      }
      @if (error(); as message) {
        <p class="automation-notice error" role="alert">{{ message }}</p>
      }
      @if (message(); as notice) {
        <p class="automation-notice success" role="status">{{ notice }}</p>
      }

      <ol class="setup-steps">
        <li>
          <span>1</span>
          <div>
            <strong>Install MacroDroid</strong>
            <p>MacroDroid Free is sufficient for the single Budget Battowski connector macro.</p>
            <a
              mat-stroked-button
              href="https://play.google.com/store/apps/details?id=com.arlosoft.macrodroid"
              target="_blank"
              rel="noopener noreferrer"
              >Open Play Store<mat-icon aria-hidden="true">open_in_new</mat-icon></a
            >
          </div>
        </li>
        <li>
          <span>2</span>
          <div>
            <strong>Install the connector</strong>
            <p>
              Follow the universal connector setup. It contains no account identifiers or permanent
              credentials.
            </p>
            <a mat-stroked-button href="/macrodroid/sms-connector-setup.html" target="_blank"
              >Open connector guide<mat-icon aria-hidden="true">description</mat-icon></a
            >
          </div>
        </li>
        <li>
          <span>3</span>
          <div>
            <strong>Pair this workspace</strong>
            <p>Generate a single-use code, then enter it when the connector prompts you.</p>
            @if (pairingCode(); as code) {
              <div class="pairing-code" aria-live="polite">
                <span>Pairing code</span><strong>{{ formattedPairingCode() }}</strong
                ><small>Expires {{ pairingExpiryLabel() }}</small
                ><button mat-stroked-button type="button" (click)="copyCode()">
                  <mat-icon aria-hidden="true">content_copy</mat-icon>Copy code
                </button>
              </div>
            } @else {
              <button
                mat-flat-button
                type="button"
                (click)="startPairing()"
                [disabled]="busy() || !budget.workspaceId()"
              >
                <mat-icon aria-hidden="true">phonelink_ring</mat-icon>Connect Android
              </button>
            }
          </div>
        </li>
      </ol>

      <section class="device-section" aria-labelledby="connected-devices-title">
        <header>
          <div>
            <h3 id="connected-devices-title">Connected Devices</h3>
            <p>Secrets are never shown after pairing.</p>
          </div>
          <button
            mat-icon-button
            type="button"
            aria-label="Refresh connected devices"
            (click)="refresh()"
            [disabled]="busy()"
          >
            <mat-icon aria-hidden="true">refresh</mat-icon>
          </button>
        </header>
        <div class="device-list">
          @for (device of visibleDevices(); track device.id) {
            <article class="device-card">
              <span class="device-icon"><mat-icon aria-hidden="true">smartphone</mat-icon></span>
              <div class="device-copy">
                @if (renamingId() === device.id) {
                  <label
                    ><span class="sr-only">Device name</span
                    ><input
                      type="text"
                      [value]="renameValue()"
                      maxlength="80"
                      (input)="setRenameValue($event)"
                  /></label>
                } @else {
                  <strong>{{ device.deviceName }}</strong>
                }
                <span>SMS Automation · {{ device.connectorVersion || 'Connector' }}</span>
                <span
                  class="device-status"
                  [class.active]="device.status === 'active'"
                  [class.paused]="device.status === 'paused'"
                  ><i aria-hidden="true"></i>{{ statusLabel(device) }}</span
                >
                <small>Last active: {{ activityLabel(device.lastSeenAt) }}</small>
                <small>Last SMS synced: {{ activityLabel(device.lastSmsReceivedAt) }}</small>
                @if (isStale(device)) {
                  <p class="stale-warning">
                    <mat-icon aria-hidden="true">warning</mat-icon>SMS automation hasn't checked in
                    recently. Some transactions may not have been captured.
                  </p>
                }
              </div>
              <div class="device-actions">
                @if (renamingId() === device.id) {
                  <button mat-stroked-button type="button" (click)="saveRename(device)">Save</button
                  ><button mat-button type="button" (click)="cancelRename()">Cancel</button>
                } @else {
                  <button mat-button type="button" (click)="beginRename(device)">Rename</button>
                  <button
                    mat-button
                    type="button"
                    (click)="setStatus(device, device.status === 'active' ? 'paused' : 'active')"
                  >
                    {{ device.status === 'active' ? 'Pause' : 'Resume' }}
                  </button>
                  @if (confirmRevokeId() === device.id) {
                    <button
                      class="danger-button"
                      mat-stroked-button
                      type="button"
                      (click)="setStatus(device, 'revoked')"
                    >
                      Confirm disconnect</button
                    ><button mat-button type="button" (click)="confirmRevokeId.set(null)">
                      Cancel
                    </button>
                  } @else {
                    <button
                      class="danger-button"
                      mat-button
                      type="button"
                      (click)="confirmRevokeId.set(device.id)"
                    >
                      Disconnect
                    </button>
                  }
                }
              </div>
            </article>
          } @empty {
            <div class="device-empty">
              <mat-icon aria-hidden="true">phonelink_off</mat-icon
              ><strong>No Android device connected</strong>
              <p>Generate a pairing code to connect your first device.</p>
            </div>
          }
        </div>
      </section>
    </section>
  `,
  styles: `
    :host {
      display: block;
      grid-column: 1 / -1;
    }
    .sms-settings {
      display: grid;
      gap: 1.2rem;
      border: 1px solid #dbe3ef;
      border-radius: 1rem;
      background: #fff;
      padding: 1.25rem;
    }
    .sms-settings > header,
    .device-section > header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.8rem;
    }
    .sms-settings > header {
      justify-content: flex-start;
    }
    h2,
    h3,
    p {
      margin: 0;
    }
    header p,
    .setup-steps p,
    .device-section p {
      color: #64748b;
    }
    .setup-steps {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .setup-steps li {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      border: 1px solid #e2e8f0;
      border-radius: 0.8rem;
      padding: 1rem;
    }
    .setup-steps li > span {
      display: grid;
      place-items: center;
      flex: 0 0 1.8rem;
      height: 1.8rem;
      border-radius: 999px;
      background: #dbeafe;
      color: #1d4ed8;
      font-weight: 800;
    }
    .setup-steps li div {
      display: grid;
      gap: 0.55rem;
      align-items: start;
    }
    .pairing-code {
      border-radius: 0.7rem;
      background: #eff6ff;
      padding: 0.8rem;
    }
    .pairing-code strong {
      font-size: 1.7rem;
      letter-spacing: 0.15em;
      color: #1e3a8a;
    }
    .pairing-code small {
      color: #475569;
    }
    .device-section {
      display: grid;
      gap: 0.75rem;
      border-top: 1px solid #e2e8f0;
      padding-top: 1rem;
    }
    .device-list {
      display: grid;
      gap: 0.65rem;
    }
    .device-card {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: start;
      gap: 0.8rem;
      border: 1px solid #e2e8f0;
      border-radius: 0.75rem;
      padding: 0.85rem;
    }
    .device-icon {
      display: grid;
      place-items: center;
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 0.65rem;
      background: #eef2ff;
      color: #4338ca;
    }
    .device-copy {
      display: grid;
      gap: 0.2rem;
    }
    .device-copy > span,
    .device-copy small {
      color: #64748b;
    }
    .device-status {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-weight: 700;
    }
    .device-status i {
      width: 0.55rem;
      height: 0.55rem;
      border-radius: 999px;
      background: #94a3b8;
    }
    .device-status.active {
      color: #166534;
    }
    .device-status.active i {
      background: #22c55e;
    }
    .device-status.paused {
      color: #9a3412;
    }
    .device-status.paused i {
      background: #f97316;
    }
    .device-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 0.25rem;
    }
    .danger-button {
      color: #b91c1c;
    }
    .stale-warning {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      margin-top: 0.4rem;
      color: #9a3412 !important;
    }
    .stale-warning mat-icon {
      flex: 0 0 auto;
    }
    .automation-notice {
      border-radius: 0.6rem;
      padding: 0.7rem 0.8rem;
    }
    .automation-notice.error {
      background: #fef2f2;
      color: #991b1b;
    }
    .automation-notice.success {
      background: #ecfdf5;
      color: #166534;
    }
    .device-empty {
      display: grid;
      place-items: center;
      gap: 0.35rem;
      min-height: 8rem;
      text-align: center;
      color: #64748b;
    }
    input {
      box-sizing: border-box;
      min-height: 2.5rem;
      width: 100%;
      border: 1px solid #cbd5e1;
      border-radius: 0.5rem;
      padding: 0.5rem 0.65rem;
      font: inherit;
    }
    input:focus-visible,
    button:focus-visible,
    a:focus-visible {
      outline: 3px solid #93c5fd;
      outline-offset: 2px;
    }
    @media (max-width: 900px) {
      .setup-steps {
        grid-template-columns: 1fr;
      }
    }
    @media (max-width: 600px) {
      .device-card {
        grid-template-columns: auto 1fr;
      }
      .device-actions {
        grid-column: 1 / -1;
        justify-content: flex-start;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SmsAutomationSettings {
  readonly budget = inject(BudgetStore);
  private readonly api = inject(SmsAutomationApi);
  readonly devices = signal<IngestionDeviceSummary[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);
  readonly pairingCode = signal<string | null>(null);
  readonly pairingExpiresAt = signal<string | null>(null);
  readonly renamingId = signal<string | null>(null);
  readonly renameValue = signal('');
  readonly confirmRevokeId = signal<string | null>(null);
  readonly visibleDevices = computed(() =>
    this.devices().filter((device) => device.status !== 'revoked'),
  );
  readonly formattedPairingCode = computed(
    () => this.pairingCode()?.replace(/(\d{3})(\d{3})/, '$1 $2') ?? '',
  );
  readonly pairingExpiryLabel = computed(() => this.activityLabel(this.pairingExpiresAt()));

  constructor() {
    effect((onCleanup) => {
      const workspaceId = this.budget.workspaceId();
      this.devices.set([]);
      this.pairingCode.set(null);
      if (!workspaceId || !this.budget.firebase.app) return;
      void this.refresh();
      const interval = setInterval(() => {
        if (this.pairingCode()) void this.refresh(true);
      }, 5_000);
      onCleanup(() => clearInterval(interval));
    });
  }

  async refresh(silent = false): Promise<void> {
    const workspaceId = this.budget.workspaceId();
    if (!workspaceId) return;
    const pairingExpiresAt = this.pairingExpiresAt();
    if (pairingExpiresAt && Date.parse(pairingExpiresAt) <= Date.now()) {
      this.pairingCode.set(null);
      this.pairingExpiresAt.set(null);
      this.message.set('The pairing code expired. Generate a new code when you are ready.');
    }
    if (!silent) this.loading.set(true);
    const previousActive = this.visibleDevices().length;
    try {
      const devices = await this.api.devices(workspaceId);
      this.devices.set(devices);
      if (
        this.pairingCode() &&
        devices.filter((device) => device.status !== 'revoked').length > previousActive
      ) {
        this.pairingCode.set(null);
        this.pairingExpiresAt.set(null);
        this.message.set('Android device connected successfully.');
      }
      this.error.set(null);
    } catch (reason) {
      if (!silent) this.error.set(this.errorMessage(reason));
    } finally {
      if (!silent) this.loading.set(false);
    }
  }

  async startPairing(): Promise<void> {
    const workspaceId = this.budget.workspaceId();
    if (!workspaceId) return;
    this.busy.set(true);
    this.error.set(null);
    this.message.set(null);
    try {
      const session = await this.api.createPairingSession(workspaceId);
      this.pairingCode.set(session.pairingCode);
      this.pairingExpiresAt.set(session.expiresAt);
    } catch (reason) {
      this.error.set(this.errorMessage(reason));
    } finally {
      this.busy.set(false);
    }
  }

  async copyCode(): Promise<void> {
    const code = this.pairingCode();
    if (!code) return;
    await globalThis.navigator.clipboard.writeText(code);
    this.message.set('Pairing code copied.');
  }

  beginRename(device: IngestionDeviceSummary): void {
    this.renamingId.set(device.id);
    this.renameValue.set(device.deviceName);
  }

  setRenameValue(event: Event): void {
    this.renameValue.set((event.target as HTMLInputElement).value);
  }

  cancelRename(): void {
    this.renamingId.set(null);
    this.renameValue.set('');
  }

  async saveRename(device: IngestionDeviceSummary): Promise<void> {
    const value = this.renameValue().trim();
    if (!value) return;
    await this.update(device, { deviceName: value });
    this.cancelRename();
  }

  async setStatus(device: IngestionDeviceSummary, status: IngestionDeviceStatus): Promise<void> {
    await this.update(device, { status });
    this.confirmRevokeId.set(null);
  }

  statusLabel(device: IngestionDeviceSummary): string {
    return device.status === 'active'
      ? 'Active'
      : device.status === 'paused'
        ? 'Paused'
        : 'Disconnected';
  }

  activityLabel(value: string | null | undefined): string {
    if (!value) return 'never';
    const elapsed = Date.now() - Date.parse(value);
    if (!Number.isFinite(elapsed)) return 'unknown';
    const minutes = Math.max(0, Math.round(elapsed / 60_000));
    if (minutes < 2) return 'just now';
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hours ago`;
    return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value));
  }

  isStale(device: IngestionDeviceSummary): boolean {
    return (
      device.status === 'active' &&
      (!device.lastSeenAt || Date.now() - Date.parse(device.lastSeenAt) > 8 * 60 * 60_000)
    );
  }

  private async update(
    device: IngestionDeviceSummary,
    update: { deviceName?: string; status?: IngestionDeviceStatus },
  ): Promise<void> {
    const workspaceId = this.budget.workspaceId();
    if (!workspaceId) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.updateDevice(workspaceId, device.id, update);
      await this.refresh(true);
      this.message.set('Device settings updated.');
    } catch (reason) {
      this.error.set(this.errorMessage(reason));
    } finally {
      this.busy.set(false);
    }
  }

  private errorMessage(reason: unknown): string {
    const code = reason instanceof Error ? reason.message : '';
    const messages: Record<string, string> = {
      RATE_LIMITED: 'Too many attempts. Wait a few minutes and try again.',
      WORKSPACE_FORBIDDEN: 'You no longer have access to this workspace.',
      DEVICE_NOT_FOUND: 'That device is no longer connected.',
    };
    return messages[code] ?? (code || 'SMS automation request failed.');
  }
}
