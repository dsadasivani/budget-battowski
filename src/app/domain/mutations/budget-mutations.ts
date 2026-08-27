import type {
  BudgetCategory,
  BudgetCollectionName,
  BudgetDataMap,
  ExpenseEntry,
  ExpenseTemplate,
  IncomeSource,
  InvestmentEntry,
  PaymentAccount,
  PaymentMode,
} from '../../budget.models';
import type { EntityMutations } from './entity-mutations';

export interface BudgetMutationSet {
  paymentAccounts?: EntityMutations<PaymentAccount>;
  paymentModes?: EntityMutations<PaymentMode>;
  categories?: EntityMutations<BudgetCategory>;
  incomes?: EntityMutations<IncomeSource>;
  templates?: EntityMutations<ExpenseTemplate>;
  expenses?: EntityMutations<ExpenseEntry>;
  investments?: EntityMutations<InvestmentEntry>;
}

export function mutationEntries(mutationSet: BudgetMutationSet): Array<{
  collection: BudgetCollectionName;
  mutations: EntityMutations<BudgetDataMap[BudgetCollectionName]>;
}> {
  return (
    Object.entries(mutationSet) as Array<
      [BudgetCollectionName, EntityMutations<BudgetDataMap[BudgetCollectionName]> | undefined]
    >
  )
    .filter(
      (
        entry,
      ): entry is [BudgetCollectionName, EntityMutations<BudgetDataMap[BudgetCollectionName]>] =>
        !!entry[1],
    )
    .map(([collection, mutations]) => ({ collection, mutations }));
}
