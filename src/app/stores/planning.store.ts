import { Injectable, signal } from '@angular/core';
import type { ExpenseTemplate } from '../budget.models';

@Injectable({ providedIn: 'root' })
export class PlanningStore {
  readonly templates = signal<ExpenseTemplate[]>([]);
}
