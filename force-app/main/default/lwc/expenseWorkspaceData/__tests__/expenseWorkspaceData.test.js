import getExpensePage from '@salesforce/apex/ExpenseController.getExpensePage';
import { fetchExpensePage, fetchAllExpenseRows } from 'c/expenseWorkspaceData';

jest.mock('@salesforce/apex/ExpenseController.getExpensePage', () => ({ default: jest.fn() }), {
    virtual: true
});
jest.mock(
    '@salesforce/apex/ExpenseController.getExpensesByFilters',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock('@salesforce/apex/ExpenseController.getMonthlyTrend', () => ({ default: jest.fn() }), {
    virtual: true
});
jest.mock(
    '@salesforce/apex/BankController.getAvailableExpenseGroupBanks',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock('@salesforce/apex/BudgetController.getBudgetHistory', () => ({ default: jest.fn() }), {
    virtual: true
});

const rawRow = id => ({ Id: id, Name: id, Amount__c: 10 });

describe('expense page and report requests', () => {
    beforeEach(() => jest.resetAllMocks());

    it('passes filters, search, and cursor to Apex and maps the bounded response', async () => {
        getExpensePage.mockResolvedValue({
            rows: [rawRow('1')],
            totalCount: 50,
            totalAmount: 500,
            hasMore: true,
            nextCursor: 'next'
        });
        const result = await fetchExpensePage({
            expenseGroupId: 'group',
            categoryId: 'All',
            searchTerm: 'bank',
            cursor: 'previous',
            pageSize: 10
        });
        expect(getExpensePage).toHaveBeenCalledWith(
            expect.objectContaining({
                filters: expect.objectContaining({ expenseGroupId: 'group', categoryId: null }),
                pagination: { searchTerm: 'bank', pageSize: 10, cursor: 'previous' }
            })
        );
        expect(result.rows[0].id).toBe('1');
        expect(result.totalCount).toBe(50);
    });

    it('loads every report page in sequence and removes repeated IDs', async () => {
        getExpensePage
            .mockResolvedValueOnce({ rows: [rawRow('1')], hasMore: true, nextCursor: 'next' })
            .mockResolvedValueOnce({ rows: [rawRow('1'), rawRow('2')], hasMore: false });
        const rows = await fetchAllExpenseRows({ categoryId: 'category' });
        expect(rows.map(row => row.id)).toEqual(['1', '2']);
        expect(getExpensePage.mock.calls[1][0].pagination).toEqual(
            expect.objectContaining({ cursor: 'next', pageSize: 200 })
        );
    });

    it('rejects a partial report when a later page fails', async () => {
        getExpensePage
            .mockResolvedValueOnce({ rows: [rawRow('1')], hasMore: true, nextCursor: 'next' })
            .mockRejectedValueOnce(new Error('Network error'));
        await expect(fetchAllExpenseRows({})).rejects.toThrow('Network error');
    });

    it('stops when filters change during the request', async () => {
        let current = true;
        getExpensePage.mockImplementation(async () => {
            current = false;
            return { rows: [rawRow('1')], hasMore: true, nextCursor: 'next' };
        });
        expect(await fetchAllExpenseRows({}, () => current)).toBeNull();
        expect(getExpensePage).toHaveBeenCalledTimes(1);
    });

    it('rejects a repeating cursor instead of looping or returning an incomplete report', async () => {
        getExpensePage.mockResolvedValue({
            rows: [rawRow('1')],
            hasMore: true,
            nextCursor: 'same'
        });
        await expect(fetchAllExpenseRows({})).rejects.toThrow('complete report');
        expect(getExpensePage).toHaveBeenCalledTimes(2);
    });
});
