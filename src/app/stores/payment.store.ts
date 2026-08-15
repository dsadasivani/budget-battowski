import { Injectable, signal } from '@angular/core';
import type { PaymentAccount, PaymentMode } from '../budget.models';

@Injectable({ providedIn: 'root' })
export class PaymentStore {
  readonly paymentAccounts = signal<PaymentAccount[]>([]);
  readonly paymentModes = signal<PaymentMode[]>([]);
}
