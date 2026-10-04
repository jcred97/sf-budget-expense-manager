import getExpensePage from '@salesforce/apex/ExpenseController.getExpensePage';
import getDashboardSummary from '@salesforce/apex/ExpenseController.getDashboardSummary';
import getMonthlyTrend from '@salesforce/apex/ExpenseController.getMonthlyTrend';
import getBudgetHistory from '@salesforce/apex/BudgetController.getBudgetHistory';
import getAvailableExpenseGroupBanks from '@salesforce/apex/BankController.getAvailableExpenseGroupBanks';
import {
    fetchExpensePage,
    fetchAllExpenseRows,
    fetchBankOptions,
    fetchDashboardData
} from 'c/expenseWorkspaceData';

jest.mock('@salesforce/apex/ExpenseController.getExpensePage', () => ({ default: jest.fn() }), {
    virtual: true
});
jest.mock(
    '@salesforce/apex/ExpenseController.getDashboardSummary',
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

    it('requests aggregate summaries and maps only bounded recent and largest expenses', async () => {
        const summary = {
            totalAmount: 25000,
            expenseCount: 500,
            recentExpenses: [rawRow('recent')],
            largestExpense: {
                ...rawRow('largest'),
                Amount__c: 5000,
                Bank_Assignment__c: 'assignment',
                Bank_Assignment__r: {
                    Active__c: false,
                    Bank__r: { Name: 'Inactive bank', Active__c: false }
                },
                Original_Amount__c: 100,
                Original_Currency_Code__c: 'USD',
                Exchange_Rate_To_PHP__c: 50
            }
        };
        getDashboardSummary.mockResolvedValue(summary);
        getMonthlyTrend.mockResolvedValue([{ year: 2026, monthNum: 9, total: 25000 }]);
        getBudgetHistory.mockResolvedValue([]);
        const data = await fetchDashboardData({
            expenseGroupId: 'group',
            startDate: '2026-09-01',
            endDate: '2026-09-30'
        });
        expect(getDashboardSummary).toHaveBeenCalledWith({
            filters: {
                expenseGroupId: 'group',
                categoryId: null,
                startDate: '2026-09-01',
                endDate: '2026-09-30'
            }
        });
        expect(getMonthlyTrend).toHaveBeenCalledWith({
            filters: {
                expenseGroupId: 'group',
                categoryId: null,
                startDate: '2026-04-01',
                endDate: '2026-09-30'
            }
        });
        expect(getBudgetHistory).toHaveBeenCalledWith({
            expenseGroupId: 'group',
            endMonth: '2026-09-30'
        });
        expect(data.rows.map(row => row.id)).toEqual(['recent']);
        expect(data.summary.expenseCount).toBe(500);
        expect(data.summary.largestExpense).toEqual(
            expect.objectContaining({
                id: 'largest',
                bankDisplay: 'Inactive bank',
                bankAssignmentActive: false,
                hasForeignCurrency: true
            })
        );
    });

    it('preserves per-assignment payment capabilities from Apex', async () => {
        getAvailableExpenseGroupBanks.mockResolvedValue([
            {
                assignmentId: 'bank',
                bankName: 'Debit bank',
                supportedTransactionTypes: ['Debit Card']
            },
            { assignmentId: 'cash-only', bankName: 'Cash only', supportedTransactionTypes: [] }
        ]);
        expect(await fetchBankOptions('group')).toEqual([
            { value: 'bank', label: 'Debit bank', supportedTransactionTypes: ['Debit Card'] },
            { value: 'cash-only', label: 'Cash only', supportedTransactionTypes: [] }
        ]);
    });

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
