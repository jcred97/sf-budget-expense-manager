import { buildExpensesCsv } from 'c/expenseCsvExport';

const exportRow = fields => buildExpensesCsv([{ transactionTimeDisplay: '-', ...fields }]);
const quoted = value => `"${value.replace(/"/g, '""')}"`;

describe('CSV formula protection', () => {
    it.each(['=1+1', '+1+1', '-1+1', '@SUM(A1)', '  =1+1', '\t=1+1', '\r=1+1', '\n=1+1'])(
        'exports %j as literal text',
        value => {
            expect(exportRow({ name: value })).toContain(quoted(`'${value}`));
        }
    );

    it.each(['name', 'category', 'expenseGroup', 'bank', 'transactionType', 'exchangeRateSource'])(
        'protects the %s text column',
        field => {
            expect(exportRow({ [field]: '=1+1' })).toContain('"\'=1+1"');
        }
    );

    it('preserves numeric values and precision while protecting numeric-looking names', () => {
        const csv = exportRow({
            name: '-100',
            amount: -100,
            originalAmount: '-123456789012345.6789',
            exchangeRateToPhp: '1.23456789'
        });
        expect(csv).toContain('"\'-100"');
        expect(csv).toContain('"-100","-123456789012345.6789","","1.23456789"');
    });

    it('does not exempt formula content in numeric columns', () => {
        expect(exportRow({ amount: '=1+1' })).toContain('"\'=1+1"');
    });

    it('retains CSV escaping and ordinary text', () => {
        const name = 'Lunch, "with friends"\nSecond line';
        expect(exportRow({ name, amount: 0 })).toContain(quoted(name));
        expect(exportRow({ name: '=HYPERLINK("example")' })).toContain(
            quoted('\'=HYPERLINK("example")')
        );
        expect(buildExpensesCsv()).toBe(
            '"Date","Time","Expense Name","Category","Expense Group","Bank","Type",' +
                '"Amount (PHP)","Original Amount","Original Currency","Exchange Rate to PHP",' +
                '"Exchange Rate Date","Exchange Rate Source"'
        );
    });
});
