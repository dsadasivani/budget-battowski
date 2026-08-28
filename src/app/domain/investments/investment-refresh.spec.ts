import { describe, expect, it } from 'vitest';

import { settleProviderRefreshes } from './investment-refresh';

describe('investment refresh isolation', () => {
  it('retains successful providers when another provider times out', async () => {
    const results = await settleProviderRefreshes([
      {
        provider: 'AMFI',
        run: async () => ({ provider: 'AMFI', success: true, updatedCount: 2, failedCount: 0 }),
      },
      {
        provider: 'UPSTOX',
        run: async () => {
          throw new DOMException('Timed out', 'TimeoutError');
        },
      },
    ]);
    expect(results).toEqual([
      { provider: 'AMFI', success: true, updatedCount: 2, failedCount: 0 },
      {
        provider: 'UPSTOX',
        success: false,
        updatedCount: 0,
        failedCount: 1,
        errorCode: 'UNAVAILABLE',
      },
    ]);
  });
});
