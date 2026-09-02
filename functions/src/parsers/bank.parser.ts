import type {
  ParsedSmsTransaction,
  RawSmsInput,
  SmsTransactionParser,
} from '../domain/sms.types.js';
import { parseCommon } from './parser.helpers.js';

export class BankSmsParser implements SmsTransactionParser {
  readonly version = '1.0.0';

  constructor(
    readonly id: string,
    private readonly bankName: string,
    private readonly identifiers: readonly RegExp[],
  ) {}

  supports(input: RawSmsInput): boolean {
    const candidate = `${input.sender} ${input.message}`;
    return this.identifiers.some((identifier) => identifier.test(candidate));
  }

  parse(input: RawSmsInput): ParsedSmsTransaction | null {
    return parseCommon(input, this.id, this.bankName);
  }
}
