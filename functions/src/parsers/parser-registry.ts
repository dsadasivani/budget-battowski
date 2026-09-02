import type {
  ParsedSmsTransaction,
  RawSmsInput,
  SmsTransactionParser,
} from '../domain/sms.types.js';
import { BankSmsParser } from './bank.parser.js';
import { GenericBankParser } from './generic-bank.parser.js';

export const smsParsers: readonly SmsTransactionParser[] = [
  new BankSmsParser('hdfc', 'HDFC', [/HDFC/i, /HDFCBK/i]),
  new BankSmsParser('icici', 'ICICI', [/ICICI/i, /ICICIB/i]),
  new BankSmsParser('axis', 'Axis', [/AXIS/i, /AXISBK/i]),
  new BankSmsParser('sbi', 'SBI', [/\bSBI\b/i, /SBIINB/i]),
  new GenericBankParser(),
];

export function parseSms(input: RawSmsInput): ParsedSmsTransaction | null {
  for (const parser of smsParsers) {
    if (!parser.supports(input)) continue;
    const parsed = parser.parse(input);
    if (parsed) return parsed;
  }
  return null;
}
