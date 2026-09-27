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
import { refreshApex } from '@salesforce/apex';
import deactivateRecurringExpense from '@salesforce/apex/RecurringExpenseController.deactivateRecurringExpense';
import runDueExpensesBatch from '@salesforce/apex/RecurringExpenseAutomationController.runDueExpensesBatch';

jest.mock('lightning/confirm', () => ({ open: jest.fn() }));
jest.mock('@salesforce/apex', () => ({ refreshApex: jest.fn() }), { virtual: true });

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
        const screen = element.shadowRoot.querySelector('c-recurring-expenses').shadowRoot;
        expect(screen.querySelector('.recurring-row.is-due').textContent).toContain('Rent');
        expect(screen.querySelector('a').getAttribute('href')).toBe('/recurring-1');
        expect(screen.textContent).toContain('BPI');
        expect(screen.textContent).toContain('Active');
    });

    const recurring = element => element.shadowRoot.querySelector('c-recurring-expenses');
    const modal = element =>
        recurring(element).shadowRoot.querySelector('c-recurring-expense-modal');
    const recurringButton = (element, label) =>
        [...recurring(element).shadowRoot.querySelectorAll('lightning-button')].find(
            button => button.label === label
        );
    const selectRecurring = (element, value) =>
        recurring(element)
            .shadowRoot.querySelector('lightning-button-menu')
            .dispatchEvent(new CustomEvent('select', { detail: { value } }));
    const changeGroup = element =>
        element.shadowRoot
            .querySelector('lightning-combobox')
            .dispatchEvent(new CustomEvent('change', { detail: { value: 'other-group' } }));
    async function mountRecurring() {
        const element = await mount();
        element.shadowRoot.querySelector('[data-view="recurring"]').click();
        await flush();
        getRecurringExpenseOverview.emit({
            rows: [{ id: 'template', name: 'Rent', bank: 'BPI', active: true }]
        });
        await flush();
        return element;
    }

    it('owns the recurring modal and refreshes shared options and saved templates', async () => {
        const element = await mountRecurring();
        fetchBankOptions.mockClear();
        recurringButton(element, 'Add Recurring').click();
        await flush();
        expect(modal(element).isOpen).toBe(true);
        expect(modal(element).recordId).toBeNull();
        expect(fetchBankOptions).toHaveBeenCalledTimes(1);
        modal(element).dispatchEvent(new CustomEvent('close'));
        await flush();
        selectRecurring(element, 'edit');
        await flush();
        expect(modal(element).recordId).toBe('template');
        expect(modal(element).currentBankLabel).toBe('BPI');
        refreshApex.mockClear();
        modal(element).dispatchEvent(new CustomEvent('success', { detail: { mode: 'edit' } }));
        await flush();
        expect(refreshApex).toHaveBeenCalledTimes(1);
        changeGroup(element);
        await flush();
        expect(modal(element).isOpen).toBe(false);
        expect(recurring(element).shadowRoot.querySelector('.recurring-row')).toBeNull();
        expect(getRecurringExpenseOverview.getLastConfig()).toEqual({
            expenseGroupId: 'other-group'
        });
    });

    it('deactivates a template and refreshes its screen', async () => {
        const element = await mountRecurring();
        refreshApex.mockClear();
        selectRecurring(element, 'deactivate');
        await flush();
        expect(deactivateRecurringExpense).toHaveBeenCalledWith({ recurringExpenseId: 'template' });
        expect(refreshApex).toHaveBeenCalledTimes(1);
    });

    it('does not deactivate an old group after its confirmation is left open', async () => {
        const element = await mountRecurring();
        let confirm;
        LightningConfirm.open.mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    confirm = resolve;
                })
        );
        selectRecurring(element, 'deactivate');
        changeGroup(element);
        await flush();
        confirm(true);
        await flush();
        expect(deactivateRecurringExpense).not.toHaveBeenCalled();
    });

    it('refreshes other screens when a recurring run starts after navigation', async () => {
        const element = await mountRecurring();
        let started;
        runDueExpensesBatch.mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    started = resolve;
                })
        );
        recurringButton(element, 'Run Recurring').click();
        await flush();
        expect(recurringButton(element, 'Running...').disabled).toBe(true);
        element.shadowRoot.querySelector('[data-view="expenses"]').click();
        await flush();
        fetchDashboardData.mockClear();
        fetchExpensePage.mockClear();
        started();
        await flush();
        expect(fetchDashboardData).toHaveBeenCalledTimes(1);
        expect(fetchExpensePage).toHaveBeenCalledTimes(1);
        expect(recurringButton(element, 'Run Recurring').disabled).toBe(false);
    });

    it('re-enables generation after a failed start without refreshing other screens', async () => {
        const element = await mountRecurring();
        runDueExpensesBatch.mockRejectedValueOnce(new Error('Start failed'));
        fetchDashboardData.mockClear();
        fetchExpensePage.mockClear();
        recurringButton(element, 'Run Recurring').click();
        await flush();
        expect(recurringButton(element, 'Run Recurring').disabled).toBe(false);
        expect(fetchDashboardData).not.toHaveBeenCalled();
        expect(fetchExpensePage).not.toHaveBeenCalled();
    });

    it('keeps a new group loading when the previous group refresh finishes', async () => {
        const element = await mountRecurring();
        let refreshed;
        refreshApex.mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    refreshed = resolve;
                })
        );
        modal(element).dispatchEvent(new CustomEvent('success', { detail: { mode: 'create' } }));
        changeGroup(element);
        await flush();
        refreshed();
        await flush();
        expect(recurring(element).shadowRoot.querySelector('lightning-spinner')).not.toBeNull();
        getRecurringExpenseOverview.emit({ rows: [] });
        await flush();
        expect(recurring(element).shadowRoot.querySelector('lightning-spinner')).toBeNull();
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
