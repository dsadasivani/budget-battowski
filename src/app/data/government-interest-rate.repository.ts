import { Injectable } from '@angular/core';
import type { FirebaseApp } from 'firebase/app';
import { doc, getDoc, getFirestore } from 'firebase/firestore';

import {
  GOVERNMENT_INTEREST_RATES,
  parseGovernmentInterestRates,
} from '../domain/investments/government-interest-rates';
import type {
  GovernmentInterestRate,
  GovernmentInterestRateSource,
} from '../domain/investments/investment.models';

const CONFIGURATION_COLLECTION = 'investmentConfiguration';
const GOVERNMENT_RATES_DOCUMENT = 'governmentSavingsRates';

export interface GovernmentInterestRateSet {
  rates: readonly GovernmentInterestRate[];
  source: GovernmentInterestRateSource;
}

export const BUNDLED_GOVERNMENT_INTEREST_RATE_SET: GovernmentInterestRateSet = {
  rates: GOVERNMENT_INTEREST_RATES,
  source: 'BUNDLED',
};

@Injectable({ providedIn: 'root' })
export class GovernmentInterestRateRepository {
  async load(app: FirebaseApp | null | undefined): Promise<GovernmentInterestRateSet> {
    if (!app) return BUNDLED_GOVERNMENT_INTEREST_RATE_SET;
    try {
      const snapshot = await getDoc(
        doc(getFirestore(app), CONFIGURATION_COLLECTION, GOVERNMENT_RATES_DOCUMENT),
      );
      if (!snapshot.exists()) return BUNDLED_GOVERNMENT_INTEREST_RATE_SET;
      const data = snapshot.data();
      if (data['schemaVersion'] !== 1) return BUNDLED_GOVERNMENT_INTEREST_RATE_SET;
      const rates = parseGovernmentInterestRates(data['rates']);
      return rates ? { rates, source: 'FIRESTORE' } : BUNDLED_GOVERNMENT_INTEREST_RATE_SET;
    } catch {
      return BUNDLED_GOVERNMENT_INTEREST_RATE_SET;
    }
  }
}
