import { Injectable, signal } from '@angular/core';
import type { OnboardingProgress } from '../budget.models';

@Injectable({ providedIn: 'root' })
export class OnboardingStore {
  private readonly tourLaunchRequestState = signal(0);

  readonly progress = signal<OnboardingProgress | null>(null);
  readonly tourLaunchRequest = this.tourLaunchRequestState.asReadonly();

  requestTourLaunch(): void {
    this.tourLaunchRequestState.update((request) => request + 1);
  }
}
