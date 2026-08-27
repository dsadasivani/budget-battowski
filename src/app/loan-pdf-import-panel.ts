import { ChangeDetectionStrategy, Component, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import {
  extractLoanRepaymentSchedulePdf,
  type ParsedLoanPdf,
} from './domain/loans/loan-pdf-parser';

@Component({
  selector: 'app-loan-pdf-import-panel',
  imports: [MatButtonModule, MatProgressSpinnerModule],
  template: `
    <section class="pdf-import" aria-labelledby="pdf-import-heading">
      <div>
        <h4 id="pdf-import-heading">Import from repayment schedule</h4>
        <p>
          The PDF is read only in this browser. It is not uploaded, attached, or saved after the
          fields are extracted.
        </p>
      </div>
      <input
        #pdfInput
        hidden
        type="file"
        accept="application/pdf,.pdf"
        (change)="readPdf($event)"
      />
      <p id="pdf-privacy-note" class="visually-hidden">
        The selected PDF remains on this device and is discarded after processing.
      </p>
      <button
        mat-stroked-button
        type="button"
        aria-describedby="pdf-privacy-note"
        (click)="pdfInput.click()"
        [disabled]="loading()"
      >
        @if (loading()) {
          <mat-spinner diameter="18" aria-label="Reading repayment schedule" />
          Reading PDF
        } @else {
          Choose repayment schedule PDF
        }
      </button>
      @if (message()) {
        <p class="import-status" role="status" aria-live="polite">{{ message() }}</p>
      }
      @if (error()) {
        <p class="import-error" role="alert">{{ error() }}</p>
      }
    </section>
  `,
  styles: `
    .pdf-import {
      display: grid;
      gap: 10px;
      margin: 12px 0 16px;
      padding: 14px;
      border: 1px solid #bfdbfe;
      border-radius: 10px;
      background: #eff6ff;
    }
    h4,
    p {
      margin: 0;
    }
    p {
      color: #334155;
      font-size: 0.88rem;
    }
    button {
      justify-self: start;
    }
    button mat-spinner {
      display: inline-block;
      margin-right: 8px;
    }
    .import-status {
      color: #166534;
      font-weight: 600;
    }
    .import-error {
      color: #b91c1c;
      font-weight: 600;
    }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoanPdfImportPanel {
  readonly parsed = output<ParsedLoanPdf>();
  readonly loading = signal(false);
  readonly message = signal('');
  readonly error = signal('');

  async readPdf(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.loading.set(true);
    this.message.set('');
    this.error.set('');
    try {
      const result = await extractLoanRepaymentSchedulePdf(file);
      if (!result.checkpoints.length) {
        throw new Error('No EMI schedule rows could be extracted from this PDF.');
      }
      this.parsed.emit(result);
      this.message.set(
        `Extracted ${result.checkpoints.length} EMI row${result.checkpoints.length === 1 ? '' : 's'}${result.partPayments.length ? ` and ${result.partPayments.length} part-payment` : ''}. Review the values before applying the match.`,
      );
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'The repayment schedule could not be read.',
      );
    } finally {
      this.loading.set(false);
      input.value = '';
    }
  }
}
