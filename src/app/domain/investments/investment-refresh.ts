import type { ProviderRefreshResult, ValuationSource } from './investment.models';

export interface ProviderRefreshJob {
  provider: ValuationSource;
  run: () => Promise<ProviderRefreshResult>;
}

export async function settleProviderRefreshes(
  jobs: readonly ProviderRefreshJob[],
): Promise<ProviderRefreshResult[]> {
  const settled = await Promise.allSettled(jobs.map((job) => job.run()));
  return settled.map((result, index) =>
    result.status === 'fulfilled'
      ? result.value
      : {
          provider: jobs[index].provider,
          success: false,
          updatedCount: 0,
          failedCount: 1,
          errorCode: 'UNAVAILABLE',
        },
  );
}
