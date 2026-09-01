import { describe, expect, it } from 'vitest';
import { mapUpstoxLtpResponse, parseAmfiNavFeed, parseNpsNavDump } from './provider-parsers';

describe('investment provider parsers', () => {
  it('parses the current AMFI header dynamically, headings, blanks, and missing ISIN', () => {
    const fixture = `Scheme Code;ISIN Div Payout / ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date
Open Ended Schemes;;;;;;;
100001;INF0001;;Alpha Fund;Direct;Growth;123.4567;26-Aug-2026

100002;;;Old Fund;Regular;IDCW;9.5;01-Jan-2020`;
    const rows = parseAmfiNavFeed(fixture, '2026-08-27');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      schemeCode: '100001',
      plan: 'Direct',
      option: 'Growth',
      nav: '123.4567',
      navDate: '2026-08-26',
      stale: false,
    });
    expect(rows[1]).toMatchObject({ isinGrowth: undefined, stale: true });
  });

  it('parses a defensive NPS tabular dump', () => {
    const fixture = `Scheme Code\tPFM\tScheme Name\tNAV\tNAV Date\nSM001\tP01\tPension Equity\t42.125\t26/08/2026`;
    expect(parseNpsNavDump(fixture)).toEqual([
      {
        schemeCode: 'SM001',
        pfm: 'P01',
        schemeName: 'Pension Equity',
        nav: '42.125',
        navDate: '2026-08-26',
      },
    ]);
  });

  it('maps Upstox response keys to canonical instrument tokens', () => {
    const values = mapUpstoxLtpResponse({
      data: { 'NSE_EQ:RELIANCE': { instrument_token: 'NSE_EQ|INE002A01018', last_price: 1400 } },
    });
    expect(values.get('NSE_EQ|INE002A01018')).toBe('1400');
  });
});
