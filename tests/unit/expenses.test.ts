import { describe, it, expect } from 'vitest';
import {
  parseRupees,
  rupees,
  formatInr,
  expenseInput,
  expensePatch,
  expenseQuery,
  amount,
} from '@/modules/expenses/contracts';
describe('Exact expense money and contracts', () => {
  it('returns validation errors rather than throwing for malformed paise strings', () => {
    for (const amountMinor of [
      'abc',
      '1.5',
      '',
      '1e3',
      '0x10',
      ' ',
      '-1',
      '0',
      '9'.repeat(200),
    ]) {
      expect(amount.safeParse(amountMinor).success).toBe(false);
      expect(
        expenseInput.safeParse({
          title: 'Venue',
          amountMinor,
          paidAt: '2027-03-14',
        }).success,
      ).toBe(false);
      expect(expensePatch.safeParse({ amountMinor }).success).toBe(false);
    }
  });
  it('converts decimal rupees without floating-point rounding', () => {
    expect(parseRupees('0.29')).toBe('29');
    expect(parseRupees('90071992547409.93')).toBe('9007199254740993');
    expect(rupees('9223372036854775807')).toBe('92233720368547758.07');
    expect(formatInr('123456789')).toBe('₹12,34,567.89');
  });
  it('rejects zero, negatives, exponents, excess precision and int64 overflow', () => {
    for (const v of ['0', '-1', '1e3', '2.005', 'NaN', '92233720368547758.08'])
      expect(() => parseRupees(v)).toThrow();
  });
  it('rejects impossible dates, foreign fields and unsupported currency', () => {
    const input = { title: 'Venue', amountMinor: '123', paidAt: '2028-02-29' };
    expect(expenseInput.parse(input).currency).toBe('INR');
    for (const changes of [
      { paidAt: '2027-02-29' },
      { currency: 'USD' },
      { amountMinor: 123 },
      { amountMinor: '001' },
      { entryType: 'refund' },
      { weddingId: 'invented' },
    ])
      expect(expenseInput.safeParse({ ...input, ...changes }).success).toBe(
        false,
      );
    expect(expensePatch.safeParse({}).success).toBe(false);
    expect(
      expenseQuery.safeParse({ from: '2027-02-02', to: '2027-02-01' }).success,
    ).toBe(false);
  });
});
