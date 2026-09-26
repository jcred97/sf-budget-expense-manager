import { buildRecurringViewModel } from 'c/recurringExpenseViewModel';
import { formatActiveWindow, formatDate, formatPHP } from 'c/expenseFormatters';

describe('recurring presentation', () => {
    it('builds rows and summaries without mutating server data', () => {
        const template = Object.freeze({
            id: 'template-1',
            name: 'Membership',
            categoryId: 'category-1',
            categoryName: 'Fitness',
            expenseGroupName: 'Health',
            bank: 'BPI',
            transactionType: 'Debit Card',
            amount: 1200,
            monthlyAmount: 100,
            nextRunDate: '2026-09-01',
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            active: true,
            dueToday: true
        });
        const model = buildRecurringViewModel({
            rows: Object.freeze([template]),
            overview: { activeCount: 1, dueTodayCount: 1, monthlyTotal: 100 },
            expenseGroupName: 'Health',
            isLoading: false
        });
        expect(model.rows[0]).toEqual({
            ...template,
            recordLink: '/template-1',
            categoryDisplay: 'Fitness',
            expenseGroupDisplay: 'Health',
            bankDisplay: 'BPI',
            transactionTypeDisplay: 'Debit Card',
            amountFormatted: formatPHP(1200),
            monthlyAmountFormatted: formatPHP(100),
            nextRunDateFormatted: formatDate(template.nextRunDate),
            activeWindowFormatted: formatActiveWindow(template.startDate, template.endDate),
            statusLabel: 'Active',
            statusClass: 'recurring-status is-active',
            deactivateDisabled: false,
            rowClass: 'recurring-row is-due'
        });
        expect(model.countLabel).toBe('1 recurring expense');
        expect(model.summaryCards.map(card => card.value)).toEqual([1, 1, formatPHP(100)]);
        expect(model.summaryCards.map(card => card.valueTitle)).toEqual(['1', '1', formatPHP(100)]);
        expect(template).not.toHaveProperty('bankDisplay');
    });

    it('retains fallback labels and inactive action state', () => {
        const model = buildRecurringViewModel({ rows: [{ id: 'inactive', active: false }] });
        expect(model.rows[0]).toMatchObject({
            categoryDisplay: 'Uncategorized',
            expenseGroupDisplay: 'No group',
            bankDisplay: 'No bank',
            transactionTypeDisplay: 'No type',
            amountFormatted: formatPHP(0),
            monthlyAmountFormatted: formatPHP(0),
            statusLabel: 'Inactive',
            statusClass: 'recurring-status is-inactive',
            deactivateDisabled: true,
            rowClass: 'recurring-row is-inactive'
        });
    });

    it('supports an empty loading view', () => {
        const model = buildRecurringViewModel({ expenseGroupName: 'Health', isLoading: true });
        expect(model).toMatchObject({
            rows: [],
            countLabel: '0 recurring expenses',
            expenseGroupName: 'Health',
            isLoading: true
        });
        expect(model.summaryCards.map(card => card.value)).toEqual([0, 0, formatPHP(0)]);
        expect(model.summaryCards[0].detail).toBe('0 total templates');
    });
});
