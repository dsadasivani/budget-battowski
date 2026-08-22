import { describe, expect, it } from 'vitest';

import { extractLoanRepaymentSchedulePdf, parseLoanRepaymentScheduleText } from './loan-pdf-parser';

const axisText = `
AXIS BANK
Agreement Number : PPR000810206487
Loan Sanctioned : Rs. 25,00,000
Loan Amount Disbursed : Rs. 25,00,000.00 Current Interest(%) : 10.5
Loan Type : Personal Loan Tenure (Months) : 62
1 05/01/2024 25,00,000.00 42,152.00 29,027.00 13,125.00 24,70,973.00 10.50
29 05/05/2026 18,48,729.00 42,152.00 25,976.00 16,176.00 18,22,753.00 10.50
30 11/05/2026 18,22,753.00 6,47,093.00 6,47,093.00 0.00 11,75,660.00 0.00
31 05/06/2026 11,75,660.00 42,152.00 30,732.00 11,420.00 11,44,928.00 10.50
32 05/07/2026 11,44,928.00 42,152.00 32,134.00 10,018.00 11,12,794.00 10.50
63 05/02/2029 6,264.00 6,319.00 6,264.00 55.00 0.00 10.50
`;

function textPdf(text: string): File {
  const stream = `BT /F1 10 Tf 36 760 Td (${text.replaceAll(/[()\\]/g, '\\$&')}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(new TextEncoder().encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new File([pdf], 'schedule.pdf', { type: 'application/pdf' });
}

describe('loan PDF parser', () => {
  it('extracts contract suggestions, schedule checkpoints, and part-payments', () => {
    const result = parseLoanRepaymentScheduleText([axisText]);

    expect(result).toMatchObject({
      lender: 'Axis Bank',
      loanType: 'Personal Loan',
      accountReferenceLastFour: '6487',
      sanctionedAmount: 2_500_000,
      disbursedAmount: 2_500_000,
      firstEmiDate: '2024-01-05',
      contractualMaturityDate: '2029-02-05',
      initialEmi: 42_152,
      initialAnnualRate: 10.5,
      firstPeriodInterestAmount: 13_125,
      tenureMonths: 62,
    });
    expect(result.rows).toHaveLength(6);
    expect(result.checkpoints).toHaveLength(5);
    expect(result.checkpoints.slice(-2)).toEqual([
      { dueDate: '2026-07-05', interestAmount: 10_018, closingPrincipal: 1_112_794 },
      { dueDate: '2029-02-05', interestAmount: 55, closingPrincipal: 0 },
    ]);
    expect(result.partPayments).toEqual([{ effectiveDate: '2026-05-11', amount: 647_093 }]);
    expect(result.warnings).toContain(
      'Disbursement date was not present in the PDF and still needs to be entered.',
    );
  });

  it('reports a text-only failure without guessing rows', () => {
    const result = parseLoanRepaymentScheduleText(['Repayment advice without a table']);
    expect(result.rows).toEqual([]);
    expect(result.checkpoints).toEqual([]);
    expect(result.warnings).toContain('No repayment schedule rows were found.');
  });

  it('extracts a selected PDF in memory without producing a stored document', async () => {
    const result = await extractLoanRepaymentSchedulePdf(
      textPdf('1 05/01/2024 100,000.00 8,792.00 7,958.67 833.33 92,041.33 10.00'),
      () => import('pdfjs-dist/legacy/build/pdf.mjs'),
    );

    expect(result.checkpoints).toEqual([
      { dueDate: '2024-01-05', interestAmount: 833.33, closingPrincipal: 92_041.33 },
    ]);
  });
});
