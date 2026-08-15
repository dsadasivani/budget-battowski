import { Injectable } from '@angular/core';

import { BudgetStore } from '../budget.store';

/**
 * Compatibility facade for the current page API. Domain stores can move behind this
 * boundary incrementally without requiring a coordinated rewrite of every route.
 */
@Injectable()
export class BudgetFacade extends BudgetStore {}
