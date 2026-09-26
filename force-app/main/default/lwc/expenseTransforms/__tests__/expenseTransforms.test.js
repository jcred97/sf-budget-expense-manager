import {
    getTopAmountSummary,
    getTopCountSummary,
    groupByAmount,
    groupByCount
} from 'c/expenseTransforms';
import { formatPHP } from 'c/expenseFormatters';

describe('expense grouping by user-entered names', () => {
    it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])(
        'preserves totals and counts for %s',
        name => {
            const rows = [
                { category: name, bank: name, amount: 100 },
                { category: name, bank: name, amount: 50 },
                { category: 'Other', bank: 'Other', amount: 25 }
            ];

            expect(groupByAmount(rows, 'category')).toEqual([
                [name, 150],
                ['Other', 25]
            ]);
            expect(groupByCount(rows, 'bank')).toEqual([
                [name, 2],
                ['Other', 1]
            ]);
            expect(getTopAmountSummary(rows, 'category')).toEqual({
                name,
                amount: formatPHP(150)
            });
            expect(getTopCountSummary(rows, 'bank')).toEqual({ name, count: 2 });
        }
    );

    it('retains fallback groups and descending amount/count ordering', () => {
        const rows = [
            { category: 'Food', amount: 10 },
            { category: '', amount: 20 },
            { category: null, amount: 30 },
            { category: 'Travel', amount: 100 }
        ];

        expect(groupByAmount(rows, 'category', 'Uncategorized')).toEqual([
            ['Travel', 100],
            ['Uncategorized', 50],
            ['Food', 10]
        ]);
        expect(groupByCount(rows, 'category', 'Uncategorized')).toEqual([
            ['Uncategorized', 2],
            ['Food', 1],
            ['Travel', 1]
        ]);
    });
});
