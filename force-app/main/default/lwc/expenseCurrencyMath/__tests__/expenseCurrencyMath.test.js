import { multiplyDecimalHalfUp } from 'c/expenseCurrencyMath';

describe('decimal currency conversion', () => {
    it.each([
        ['2.675', '1', '2.68'],
        ['2.674999999999999999', '1', '2.67'],
        ['1.005', '3', '3.02'],
        ['0.01', '0.5', '0.01'],
        ['99.995', '1', '100.00'],
        ['0', '57.123456789', '0.00']
    ])('converts %s at rate %s using decimal HALF_UP cents', (amount, rate, expected) => {
        expect(multiplyDecimalHalfUp(amount, rate)).toBe(expected);
    });

    it('preserves financial digits beyond JavaScript safe integer precision', () => {
        expect(multiplyDecimalHalfUp('9007199254740993', '9')).toBe('81064793292668937.00');
        expect(multiplyDecimalHalfUp('123456789.123456789', '10', 8)).toBe('1234567891.23456789');
    });

    it.each([
        ['1.2345e2', '1e-1', '12.35'],
        ['125E-2', '2E+2', '250.00'],
        ['5e-3', '1', '0.01'],
        [' 00012.50 ', '02', '25.00']
    ])('accepts decimal scientific notation and normalized input %s', (amount, rate, expected) => {
        expect(multiplyDecimalHalfUp(amount, rate)).toBe(expected);
    });

    it('supports requested output precision including whole-unit rounding', () => {
        expect(multiplyDecimalHalfUp('9.5', '1', 0)).toBe('10');
        expect(multiplyDecimalHalfUp('1.2345', '1', 3)).toBe('1.235');
        expect(multiplyDecimalHalfUp('12', '2', 4)).toBe('24.0000');
    });

    it.each([null, undefined, '', ' ', '-1', 'NaN', Infinity, '12,000', '1e', 'USD 12'])(
        'rejects invalid or signed financial input %s rather than displaying a converted amount',
        invalid => {
            expect(multiplyDecimalHalfUp(invalid, '57')).toBeNull();
            expect(multiplyDecimalHalfUp('100', invalid)).toBeNull();
        }
    );

    it.each([-1, 1.5, '2', NaN, Infinity])('rejects invalid output precision %s', precision => {
        expect(multiplyDecimalHalfUp('100', '57', precision)).toBeNull();
    });
});
