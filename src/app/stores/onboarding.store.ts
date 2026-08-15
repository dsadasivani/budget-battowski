import { Injectable, signal } from '@angular/core';
import type { OnboardingProgress } from '../budget.models';

@Injectable({ providedIn: 'root' })
export class OnboardingStore {
  readonly progress = signal<OnboardingProgress | null>(null);
}
