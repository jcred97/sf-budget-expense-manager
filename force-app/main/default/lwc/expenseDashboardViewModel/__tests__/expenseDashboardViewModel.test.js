import { buildDashboardViewModel } from 'c/expenseDashboardViewModel';
import { getDashboardViewModel } from 'c/expenseWorkspaceViewModels';
import { formatPHP, formatDate } from 'c/expenseFormatters';

const params = {
    endDate: '2026-09-30',
    budgetMonth: '2026-09-01',
    expenseGroupId: 'group',
    selectedMonthLabel: 'September 2026',
    expenseGroupName: 'Household',
    periodLabel: 'September',
    rows: Array.from({ length: 5 }, (_, index) => ({
        id: `${index}`,
        amount: 10,
        categoryDisplay: 'Recent category',
        bankDisplay: 'Recent bank'
    })),
    trend: [{ year: 2026, monthNum: 9, total: 25000 }],
    budgets: [{ budgetMonth: '2026-09-01', amount: 30000 }]
};
const summary = {
    totalAmount: 25000,
    expenseCount: 500,
    activeDayCount: 25,
    categoryTotals: [
        { name: 'Older category', total: 20000, count: 400 },
        { name: 'Recent category', total: 5000, count: 100 }
    ],
    bankTotals: [
        { name: 'High amount bank', total: 20000, count: 5 },
        { name: 'No bank', total: 5000, count: 495 }
    ],
    topBank: { name: 'No bank', total: 5000, count: 495 },
    topDay: { expenseDate: '2026-09-10', total: 5000, count: 100 },
    largestExpense: { id: 'older', name: 'Older largest expense', amount: 5000 }
};

describe('dashboard aggregate presentation', () => {
    it('uses complete summaries for counts, charts, insights and budgets with only five recent rows', () => {
        const view = buildDashboardViewModel({ ...params, summary });
        expect(view.totalAmount).toBe(25000);
        expect(view.expenseCount).toBe(500);
        expect(view.averageExpense).toBe(formatPHP(50));
        expect(view.budgetContext.spentAmount).toBe(25000);
        expect(view.recentRows).toHaveLength(5);
        expect(view.topCategory).toEqual({ name: 'Older category', amount: formatPHP(20000) });
        expect(view.topBank).toEqual({ name: 'No bank', count: 495 });
        expect(view.categoryChartData[0]).toEqual(
            expect.objectContaining({ name: 'Older category', formattedTotal: formatPHP(20000) })
        );
        expect(view.bankChartData[0].name).toBe('High amount bank');
        expect(view.insights).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    key: 'largest',
                    value: formatPHP(5000),
                    detail: 'Older largest expense'
                }),
                expect.objectContaining({
                    key: 'top-day',
                    value: formatPHP(5000),
                    detail: `${formatDate('2026-09-10')} / 100 expenses`
                }),
                expect.objectContaining({ key: 'daily-average', value: formatPHP(1000) })
            ])
        );
        expect(view.budgetHistoryData[0]).toEqual(
            expect.objectContaining({
                monthLabel: 'Sep 2026',
                spentDisplay: formatPHP(25000),
                varianceDisplay: `${formatPHP(5000)} remaining`
            })
        );
    });

    it('keeps empty summary charts and insights empty without deriving totals from detail rows', () => {
        const view = buildDashboardViewModel({
            ...params,
            summary: { totalAmount: 0, expenseCount: 0, activeDayCount: 0 },
            showEmptyState: true
        });
        expect(view.expenseCount).toBe(0);
        expect(view.totalAmount).toBe(0);
        expect(view.showEmptyState).toBe(true);
        expect(view.categoryChartData).toEqual([]);
        expect(view.bankChartData).toEqual([]);
        expect(view.topCategory.name).toBe('-');
        expect(view.insights[1].detail).toBe('- / No activity');
    });

    it('invalidates memoization when only the complete summary changes', () => {
        const owner = {};
        const first = getDashboardViewModel(owner, { ...params, summary });
        expect(getDashboardViewModel(owner, { ...params, summary })).toBe(first);
        const next = getDashboardViewModel(owner, {
            ...params,
            summary: { ...summary, totalAmount: 30000 }
        });
        expect(next).not.toBe(first);
        expect(next.budgetContext.spentAmount).toBe(30000);
    });
});
