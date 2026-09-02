import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseSms } from './parser-registry.js';
import { isLikelyFinancialSms } from '../utils/validation.js';

function parse(sender: string, message: string) {
  return parseSms({ sender, message, receivedAt: '2026-09-01T02:12:00.000Z' });
}

describe('SMS parser registry', () => {
  it('parses representative HDFC debit and credit messages', () => {
    const debit = parse(
      'VM-HDFCBK',
      'Rs.450 debited from HDFC A/C XX1234 via UPI to ZOMATO on 01-Sep. Ref 123456789.',
    );
    assert.equal(debit?.parserId, 'hdfc');
    assert.equal(debit?.transactionType, 'debit');
    assert.equal(debit?.amount, 450);
    assert.equal(debit?.accountLastFour, '1234');
    assert.equal(debit?.paymentHint, 'upi');
    assert.match(debit?.merchant ?? '', /zomato/i);

    const credit = parse('AD-HDFCBK', 'INR 25,000 credited to HDFC A/C XX1234 as salary.');
    assert.equal(credit?.transactionType, 'credit');
    assert.equal(credit?.amount, 25_000);
  });

  it('selects ICICI, Axis, and SBI parsers', () => {
    assert.equal(
      parse('VM-ICICIB', 'INR 288 debited from account XX4242 via UPI to UBER.')?.parserId,
      'icici',
    );
    assert.equal(
      parse('AX-AXISBK', 'Rs.1,299 spent on Axis card XX0009 at AMAZON.')?.parserId,
      'axis',
    );
    assert.equal(
      parse('BZ-SBIINB', 'Rs.3,411 debited from SBI A/c XX8899 at DMART.')?.parserId,
      'sbi',
    );
  });

  it('classifies card purchase, ATM withdrawal, refund, reversal, and transfer', () => {
    assert.equal(
      parse('BANK', 'Rs.900 spent on credit card XX1111 at FUEL STATION.')?.paymentHint,
      'credit-card',
    );
    assert.equal(
      parse('BANK', 'INR 2,000 withdrawn from A/C XX1111 at ATM.')?.transactionType,
      'withdrawal',
    );
    assert.equal(
      parse('BANK', 'Rs.450 refunded to card XX1111 by ZOMATO.')?.transactionType,
      'refund',
    );
    assert.equal(
      parse('BANK', 'INR 288 reversed for A/C XX1111 ref ABC12345.')?.transactionType,
      'refund',
    );
    assert.equal(
      parse('BANK', 'Rs.20,000 transferred from account XX1111 to another bank.')?.transactionType,
      'transfer',
    );
  });

  it('rejects malformed, promotional, and OTP messages', () => {
    assert.equal(parse('BANK', 'Your account statement is available.'), null);
    assert.equal(
      isLikelyFinancialSms({ sender: 'SHOP', message: 'Sale offer: shop now', receivedAt: '' }),
      false,
    );
    assert.equal(
      isLikelyFinancialSms({
        sender: 'BANK',
        message: 'OTP 123456 for INR 450 purchase',
        receivedAt: '',
      }),
      false,
    );
  });
});
