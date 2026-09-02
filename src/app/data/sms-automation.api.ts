import { Injectable, inject } from '@angular/core';
import { getAuth } from 'firebase/auth';

import { BudgetStore } from '../budget.store';

export type IngestionDeviceStatus = 'active' | 'paused' | 'revoked';

export interface IngestionDeviceSummary {
  id: string;
  workspaceId: string;
  type: 'macrodroid-sms';
  deviceName: string;
  status: IngestionDeviceStatus;
  createdAt?: string;
  updatedAt?: string;
  lastSeenAt?: string;
  lastSmsReceivedAt?: string;
  lastSuccessfulWebhookAt?: string;
  connectorVersion?: string;
}

interface PairingSessionResponse {
  pairingCode: string;
  expiresAt: string;
}

@Injectable({ providedIn: 'root' })
export class SmsAutomationApi {
  private readonly budget = inject(BudgetStore);

  async createPairingSession(workspaceId: string): Promise<PairingSessionResponse> {
    return this.request<PairingSessionResponse>('/api/v1/integrations/sms/pairing-sessions', {
      method: 'POST',
      body: JSON.stringify({ workspaceId }),
    });
  }

  async devices(workspaceId: string): Promise<IngestionDeviceSummary[]> {
    const result = await this.request<{ devices: IngestionDeviceSummary[] }>(
      `/api/v1/integrations/sms/devices?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: 'GET' },
    );
    return Array.isArray(result.devices) ? result.devices : [];
  }

  async updateDevice(
    workspaceId: string,
    deviceId: string,
    update: { deviceName?: string; status?: IngestionDeviceStatus },
  ): Promise<void> {
    await this.request(`/api/v1/integrations/sms/devices/${encodeURIComponent(deviceId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ workspaceId, ...update }),
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const app = this.budget.firebase.app;
    if (!app) throw new Error('Firebase is required for SMS automation.');
    const user = getAuth(app).currentUser;
    if (!user) throw new Error('Sign in before managing SMS automation.');
    const response = await fetch(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${await user.getIdToken()}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(
        typeof body['code'] === 'string' ? body['code'] : 'SMS automation request failed.',
      );
    }
    return body as T;
  }
}
