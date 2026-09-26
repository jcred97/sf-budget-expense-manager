import { createElement } from 'lwc';
import BudgetExpenseManager from 'c/budgetExpenseManager';
import getAllExpenseGroups from '@salesforce/apex/ExpenseController.getAllExpenseGroups';
import getRecurringExpenseOverview from '@salesforce/apex/RecurringExpenseController.getRecurringExpenseOverview';
import {
    fetchExpensePage,
    fetchDashboardData,
    fetchBankOptions,
    fetchAllExpenseRows
} from 'c/expenseWorkspaceData';
import { downloadExpensesCsv } from 'c/expenseCsvExport';
import { loadStyle } from 'lightning/platformResourceLoader';
import LightningConfirm from 'lightning/confirm';
import deleteExpense from '@salesforce/apex/ExpenseController.deleteExpense';
import deleteExpenses from '@salesforce/apex/ExpenseController.deleteExpenses';

jest.mock('lightning/confirm', () => ({ open: jest.fn() }));

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
        LightningConfirm.open.mockResolvedValue(true);
        loadStyle.mockResolvedValue();
        fetchExpensePage.mockResolvedValue(firstPage());
        fetchDashboardData.mockResolvedValue({ rows: [], trend: [], budgets: [] });
        fetchBankOptions.mockResolvedValue([]);
    });
    afterEach(() => {
        document.body.replaceChildren();
        jest.useRealTimers();
    });

    it('presents recurring server rows through the combined view model', async () => {
        const element = await mount();
        getRecurringExpenseOverview.emit({
            activeCount: 1,
            dueTodayCount: 1,
            monthlyTotal: 100,
            rows: [{ id: 'recurring-1', name: 'Rent', bank: 'BPI', active: true, dueToday: true }]
        });
        element.shadowRoot.querySelector('[data-view="recurring"]').click();
        await flush();
        const model = element.shadowRoot.querySelector('c-recurring-expenses').viewModel;
        expect(model.rows[0]).toMatchObject({
            id: 'recurring-1',
            name: 'Rent',
            bank: 'BPI',
            bankDisplay: 'BPI',
            recordLink: '/recurring-1',
            statusLabel: 'Active',
            rowClass: 'recurring-row is-due',
            deactivateDisabled: false
        });
        expect(model.summaryCards[0].value).toBe(1);
        expect(model.summaryCards[1].value).toBe(1);
    });

    describe.each(['single', 'bulk'])('%s deletion rollback', mode => {
        const startDelete = element => {
            if (mode === 'bulk') {
                dispatch(element, 'selectionchange', { id: '1', selected: true });
                dispatch(element, 'selectionchange', { id: '3', selected: true });
                dispatch(element, 'bulkdelete');
            } else {
                dispatch(element, 'rowaction', { action: 'delete', id: '1' });
            }
        };

        it.each(['unchanged', 'filter', 'group'])(
            'restores only the original list when context is %s',
            async context => {
                fetchExpensePage.mockResolvedValueOnce({
                    ...firstPage(),
                    rows: [row('1'), row('2'), row('3')]
                });
                const element = await mount();
                const deleteMock = mode === 'bulk' ? deleteExpenses : deleteExpense;
                let rejectDelete;
                deleteMock.mockImplementationOnce(
                    () =>
                        new Promise((resolve, reject) => {
                            rejectDelete = reject;
                        })
                );
                startDelete(element);
                await flush();
                expect(deleteMock).toHaveBeenCalledTimes(1);
                expect(list(element).viewModel.filteredRows.map(item => item.id)).toEqual(
                    mode === 'bulk' ? ['2'] : ['2', '3']
                );

                if (context !== 'unchanged') {
                    fetchExpensePage.mockResolvedValueOnce({
                        rows: [row('new')],
                        totalCount: 1,
                        totalAmount: 10,
                        hasMore: false
                    });
                    if (context === 'filter') {
                        dispatch(element, 'filterchange', {
                            field: 'categoryId',
                            value: 'another'
                        });
                    } else {
                        element.shadowRoot
                            .querySelector('lightning-combobox')
                            .dispatchEvent(
                                new CustomEvent('change', { detail: { value: 'other-group' } })
                            );
                        await flush();
                        element.shadowRoot
                            .querySelector('c-expense-dashboard')
                            .dispatchEvent(new CustomEvent('viewexpenses'));
                    }
                    await flush();
                    dispatch(element, 'selectionchange', { id: 'new', selected: true });
                }

                rejectDelete(new Error('Deletion rejected'));
                await flush();
                const vm = list(element).viewModel;
                expect(vm.filteredRows.map(item => item.id)).toEqual(
                    context === 'unchanged' ? ['1', '2', '3'] : ['new']
                );
                expect(vm.selectedCount).toBe(
                    context === 'unchanged' ? (mode === 'bulk' ? 2 : 0) : 1
                );
                expect(vm.dateGroups[0].rows[0].isSelected).toBe(
                    context !== 'unchanged' || mode === 'bulk'
                );
            }
        );

        it('does not delete after the list changes while confirmation is pending', async () => {
            const element = await mount();
            let confirmDelete;
            LightningConfirm.open.mockImplementationOnce(
                () =>
                    new Promise(resolve => {
                        confirmDelete = resolve;
                    })
            );
            startDelete(element);
            dispatch(element, 'filterchange', { field: 'categoryId', value: 'another' });
            await flush();
            confirmDelete(true);
            await flush();
            expect(deleteExpense).not.toHaveBeenCalled();
            expect(deleteExpenses).not.toHaveBeenCalled();
        });
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
