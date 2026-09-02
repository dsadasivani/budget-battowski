import type {
  ParsedSmsTransaction,
  RawSmsInput,
  SmsTransactionParser,
} from '../domain/sms.types.js';
import { parseCommon } from './parser.helpers.js';

export class GenericBankParser implements SmsTransactionParser {
  readonly id = 'generic-bank';
  readonly version = '1.0.0';

  supports(): boolean {
    return true;
  }

  parse(input: RawSmsInput): ParsedSmsTransaction | null {
    return parseCommon(input, this.id);
  }
}
