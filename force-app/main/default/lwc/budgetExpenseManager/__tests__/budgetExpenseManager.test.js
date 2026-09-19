import { createElement } from 'lwc';
import BudgetExpenseManager from 'c/budgetExpenseManager';
import getAllExpenseGroups from '@salesforce/apex/ExpenseController.getAllExpenseGroups';
import {
    fetchExpensePage,
    fetchDashboardData,
    fetchBankOptions,
    fetchAllExpenseRows
} from 'c/expenseWorkspaceData';
import { downloadExpensesCsv } from 'c/expenseCsvExport';
import { loadStyle } from 'lightning/platformResourceLoader';

jest.mock(
    '@salesforce/apex/ExpenseController.getAllExpenseGroups',
    () => {
        const { createApexTestWireAdapter } = require('@salesforce/sfdx-lwc-jest');
        return { default: createApexTestWireAdapter(jest.fn()) };
    },
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/ExpenseController.getCategoriesByExpenseGroup',
    () => {
        const { createApexTestWireAdapter } = require('@salesforce/sfdx-lwc-jest');
        return { default: createApexTestWireAdapter(jest.fn()) };
    },
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/RecurringExpenseController.getRecurringExpenseOverview',
    () => {
        const { createApexTestWireAdapter } = require('@salesforce/sfdx-lwc-jest');
        return { default: createApexTestWireAdapter(jest.fn()) };
    },
    { virtual: true }
);
jest.mock('c/expenseWorkspaceData', () => ({
    fetchExpensePage: jest.fn(),
    fetchDashboardData: jest.fn(),
    fetchBankOptions: jest.fn(),
    fetchAllExpenseRows: jest.fn()
}));
jest.mock('c/expenseCsvExport', () => ({ downloadExpensesCsv: jest.fn() }));
jest.mock('@salesforce/apex/ExpenseController.deleteExpense', () => ({ default: jest.fn() }), {
    virtual: true
});
jest.mock('@salesforce/apex/ExpenseController.deleteExpenses', () => ({ default: jest.fn() }), {
    virtual: true
});
jest.mock(
    '@salesforce/apex/RecurringExpenseController.deactivateRecurringExpense',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/RecurringExpenseAutomationController.runDueExpensesBatch',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock('@salesforce/apex/ExchangeRateController.getPhpRate', () => ({ default: jest.fn() }), {
    virtual: true
});

const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};
const row = id => ({ id, name: id, amount: 10, expenseDate: '2026-09-01' });
const firstPage = () => ({
    rows: [row('1')],
    totalCount: 25,
    totalAmount: 250,
    hasMore: true,
    nextCursor: 'next'
});
const list = element => element.shadowRoot.querySelector('c-expense-list');
const dispatch = (element, type, detail) =>
    list(element).dispatchEvent(new CustomEvent(type, { detail }));

async function mount() {
    const element = createElement('c-budget-expense-manager', { is: BudgetExpenseManager });
    document.body.appendChild(element);
    getAllExpenseGroups.emit([{ Id: 'group', Name: 'Personal' }]);
    await flush();
    element.shadowRoot
        .querySelector('c-expense-dashboard')
        .dispatchEvent(new CustomEvent('viewexpenses'));
    await flush();
    return element;
}

describe('expense pagination UI', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        loadStyle.mockResolvedValue();
        fetchExpensePage.mockResolvedValue(firstPage());
        fetchDashboardData.mockResolvedValue({ rows: [], trend: [], budgets: [] });
        fetchBankOptions.mockResolvedValue([]);
    });
    afterEach(() => {
        document.body.replaceChildren();
        jest.useRealTimers();
    });

    it('fetches a cursor page once, keeps selection and full-result totals, and ends pagination', async () => {
        const element = await mount();
        expect(fetchExpensePage).toHaveBeenCalledWith(
            expect.objectContaining({ pageSize: 20, cursor: null })
        );
        dispatch(element, 'selectionchange', { id: '1', selected: true });
        let resolvePage;
        fetchExpensePage.mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    resolvePage = resolve;
                })
        );
        dispatch(element, 'loadmore');
        dispatch(element, 'loadmore');
        expect(fetchExpensePage).toHaveBeenCalledTimes(2);
        expect(fetchExpensePage.mock.calls[1][0]).toEqual(
            expect.objectContaining({ pageSize: 10, cursor: 'next' })
        );
        resolvePage({ rows: [row('2')], hasMore: false });
        await flush();
        const vm = list(element).viewModel;
        expect(vm.visibleRowsSummary).toBe('Showing 2 of 25');
        expect(vm.totalAmount).toBe(250);
        expect(vm.selectedCount).toBe(1);
        expect(vm.hasMoreRows).toBe(false);
    });

    it('ignores a late page after a filter change and debounces server search', async () => {
        jest.useFakeTimers();
        const element = await mount();
        let resolveOld;
        fetchExpensePage.mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    resolveOld = resolve;
                })
        );
        dispatch(element, 'loadmore');
        dispatch(element, 'filterchange', { field: 'searchTerm', value: 'new' });
        dispatch(element, 'filterchange', { field: 'searchTerm', value: 'newer' });
        fetchExpensePage.mockResolvedValueOnce({
            rows: [row('newer')],
            totalCount: 1,
            totalAmount: 10,
            hasMore: false
        });
        jest.advanceTimersByTime(300);
        await flush();
        resolveOld({ rows: [row('stale')], hasMore: false });
        await flush();
        expect(fetchExpensePage).toHaveBeenCalledTimes(3);
        expect(fetchExpensePage.mock.calls[2][0]).toEqual(
            expect.objectContaining({ searchTerm: 'newer', cursor: null })
        );
        expect(list(element).viewModel.filteredRows.map(item => item.id)).toEqual(['newer']);
    });

    it('preserves loaded rows and retries the same cursor after a failed page', async () => {
        const element = await mount();
        fetchExpensePage.mockRejectedValueOnce(new Error('Connection lost'));
        dispatch(element, 'loadmore');
        await flush();
        expect(list(element).viewModel.loadError).toBe('Connection lost');
        expect(list(element).viewModel.filteredRows).toHaveLength(1);
        fetchExpensePage.mockResolvedValueOnce({ rows: [row('2')], hasMore: false });
        dispatch(element, 'retry');
        await flush();
        expect(fetchExpensePage.mock.calls[2][0].cursor).toBe('next');
        expect(list(element).viewModel.loadError).toBe('');
    });

    it('renders every report row before opening print', async () => {
        const element = await mount();
        fetchAllExpenseRows.mockResolvedValue([row('1'), row('unloaded')]);
        const print = jest.spyOn(window, 'print').mockImplementation(() => {
            const report = element.shadowRoot.querySelector('c-expense-print-report');
            expect(report.viewModel.expenseCount).toBe(2);
            expect(report.shadowRoot.querySelectorAll('tbody tr')).toHaveLength(2);
        });
        [...element.shadowRoot.querySelectorAll('lightning-button')]
            .find(button => button.label === 'Print / PDF')
            .click();
        await flush();
        await flush();
        expect(print).toHaveBeenCalledTimes(1);
        print.mockRestore();
    });

    it('does not export after a filter change while the report is loading', async () => {
        const element = await mount();
        let resolveReport;
        fetchAllExpenseRows.mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    resolveReport = resolve;
                })
        );
        [...element.shadowRoot.querySelectorAll('lightning-button')]
            .find(button => button.label === 'Export CSV')
            .click();
        dispatch(element, 'filterchange', { field: 'categoryId', value: 'another' });
        resolveReport([row('stale')]);
        await flush();
        expect(downloadExpensesCsv).not.toHaveBeenCalled();
    });

    it('exports all matching rows, including rows not loaded in the list', async () => {
        const element = await mount();
        fetchAllExpenseRows.mockResolvedValue([row('1'), row('unloaded')]);
        [...element.shadowRoot.querySelectorAll('lightning-button')]
            .find(button => button.label === 'Export CSV')
            .click();
        await flush();
        expect(downloadExpensesCsv).toHaveBeenCalledWith(
            [row('1'), row('unloaded')],
            expect.any(String)
        );
        expect(list(element).viewModel.filteredRows).toHaveLength(1);
    });
});
