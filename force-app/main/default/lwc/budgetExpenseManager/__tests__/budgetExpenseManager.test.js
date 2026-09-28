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
const expenseButton = (element, label) =>
    [...list(element).shadowRoot.querySelectorAll('lightning-button')].find(
        button => button.label === label
    );
const rowIds = element =>
    [...list(element).shadowRoot.querySelectorAll('input[type="checkbox"]')].map(
        input => input.dataset.id
    );
const selectedRows = element =>
    [...list(element).shadowRoot.querySelectorAll('input[type="checkbox"]')].filter(
        input => input.checked
    );
const dispatch = (element, type, detail) => {
    const screen = list(element).shadowRoot;
    if (type === 'filterchange') {
        screen
            .querySelector(`[data-field="${detail.field}"]`)
            .dispatchEvent(new CustomEvent('change', { detail: { value: detail.value } }));
    } else if (type === 'selectionchange') {
        const input = screen.querySelector(`input[data-id="${detail.id}"]`);
        input.checked = detail.selected;
        input.dispatchEvent(new CustomEvent('change'));
    } else if (type === 'rowaction') {
        screen
            .querySelector(`lightning-button-menu[data-id="${detail.id}"]`)
            .dispatchEvent(new CustomEvent('select', { detail: { value: detail.action } }));
    } else {
        const labels = { bulkdelete: 'Delete Selected', loadmore: 'Load More', retry: 'Retry' };
        const button = expenseButton(element, labels[type]) || expenseButton(element, 'Loading...');
        button.click();
    }
};

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

    const dashboard = element => element.shadowRoot.querySelector('c-expense-dashboard');
    const navigate = async (element, view) => {
        element.shadowRoot.querySelector(`[data-view="${view}"]`).click();
        await flush();
    };
    const dashboardButton = (element, label) =>
        [...dashboard(element).shadowRoot.querySelectorAll('lightning-button')].find(
            button => button.label === label
        );

    it('keeps the dashboard month independent from expenses and preserves it across navigation', async () => {
        const element = await mount();
        const originalRange = fetchDashboardData.mock.calls[0][0];
        await navigate(element, 'dashboard');
        dashboard(element)
            .shadowRoot.querySelector('c-expense-month-navigator')
            .dispatchEvent(new CustomEvent('previous'));
        await flush();
        const previousRange = fetchDashboardData.mock.calls.at(-1)[0];
        expect(previousRange.startDate).not.toBe(originalRange.startDate);
        expect(previousRange.startDate < originalRange.startDate).toBe(true);
        expect(previousRange.endDate < originalRange.startDate).toBe(true);
        await navigate(element, 'expenses');
        expect(list(element).shadowRoot.querySelector('[data-field="startDate"]').value).toBe(
            originalRange.startDate
        );
        const instance = dashboard(element);
        await navigate(element, 'dashboard');
        expect(dashboard(element)).toBe(instance);
        expect(fetchDashboardData.mock.calls.at(-1)[0]).toEqual(previousRange);
        dashboard(element)
            .shadowRoot.querySelector('c-expense-month-navigator')
            .dispatchEvent(new CustomEvent('next'));
        await flush();
        expect(fetchDashboardData.mock.calls.at(-1)[0]).toEqual(originalRange);
    });

    it.each(['resolve', 'reject'])(
        'ignores an old dashboard request that later %ss after a group switch',
        async outcome => {
            const element = await mount();
            let complete;
            fetchDashboardData.mockImplementationOnce(
                () =>
                    new Promise((resolve, reject) => {
                        complete = outcome === 'resolve' ? resolve : reject;
                    })
            );
            await navigate(element, 'dashboard');
            fetchDashboardData.mockResolvedValueOnce({
                rows: [row('new-group-expense')],
                trend: [],
                budgets: []
            });
            changeGroup(element);
            await flush();
            complete(
                outcome === 'resolve'
                    ? { rows: [row('old-group-expense')], trend: [], budgets: [] }
                    : new Error('Old request failed')
            );
            await flush();
            const screen = dashboard(element).shadowRoot;
            expect(screen.textContent).toContain('new-group-expense');
            expect(screen.textContent).not.toContain('old-group-expense');
            expect(screen.querySelector('[role="alert"]')).toBeNull();
            expect(screen.querySelector('lightning-spinner')).toBeNull();
        }
    );

    it('retries dashboard failures and refreshes after budget changes', async () => {
        const element = await mount();
        fetchDashboardData.mockRejectedValueOnce(new Error('Unavailable'));
        await navigate(element, 'dashboard');
        expect(dashboard(element).shadowRoot.querySelector('[role="alert"]').textContent).toContain(
            'Failed to load the dashboard.'
        );
        fetchDashboardData.mockClear();
        dashboardButton(element, 'Retry').click();
        await flush();
        expect(fetchDashboardData).toHaveBeenCalledTimes(1);
        expect(dashboard(element).shadowRoot.querySelector('[role="alert"]')).toBeNull();
        dashboard(element)
            .shadowRoot.querySelector('c-budget-panel')
            .dispatchEvent(new CustomEvent('budgetchange'));
        await flush();
        expect(fetchDashboardData).toHaveBeenCalledTimes(2);
    });

    it('opens the shared expense modal from the dashboard and refreshes after saving', async () => {
        const element = await mount();
        await navigate(element, 'dashboard');
        dashboardButton(element, 'Add Expense').click();
        await flush();
        const expenseModal = list(element).shadowRoot.querySelector('c-expense-modal');
        expect(expenseModal.isOpen).toBe(true);
        fetchDashboardData.mockClear();
        fetchExpensePage.mockClear();
        expenseModal.dispatchEvent(new CustomEvent('success'));
        await flush();
        expect(fetchDashboardData).toHaveBeenCalledTimes(1);
        expect(fetchExpensePage).toHaveBeenCalledTimes(1);
    });

    it('clears dashboard data when the selected group disappears', async () => {
        fetchDashboardData.mockResolvedValueOnce({
            rows: [row('removed-group-expense')],
            trend: [],
            budgets: []
        });
        const element = await mount();
        expect(dashboard(element).shadowRoot.textContent).toContain('removed-group-expense');
        fetchDashboardData.mockClear();
        getAllExpenseGroups.emit([]);
        await flush();
        expect(dashboard(element).shadowRoot.textContent).not.toContain('removed-group-expense');
        expect(fetchDashboardData).not.toHaveBeenCalled();
        expect(dashboard(element).shadowRoot.querySelector('lightning-spinner')).toBeNull();
    });

    describe.each(['single', 'bulk'])('%s deletion rollback', mode => {
        const startDelete = async element => {
            if (mode === 'bulk') {
                dispatch(element, 'selectionchange', { id: '1', selected: true });
                dispatch(element, 'selectionchange', { id: '3', selected: true });
                await flush();
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
                await startDelete(element);
                await flush();
                expect(deleteMock).toHaveBeenCalledTimes(1);
                expect(rowIds(element)).toEqual(mode === 'bulk' ? ['2'] : ['2', '3']);

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

                expect(rowIds(element)).toEqual(
                    context === 'unchanged' ? ['1', '2', '3'] : ['new']
                );
                expect(selectedRows(element).length).toBe(
                    context === 'unchanged' ? (mode === 'bulk' ? 2 : 0) : 1
                );
                expect(
                    list(element).shadowRoot.querySelector('input[type="checkbox"]').checked
                ).toBe(context !== 'unchanged' || mode === 'bulk');
            }
        );

        it('does not delete after the list changes while confirmation is pending', async () => {
            fetchExpensePage.mockResolvedValueOnce({ ...firstPage(), rows: [row('1'), row('3')] });
            const element = await mount();
            let confirmDelete;
            LightningConfirm.open.mockImplementationOnce(
                () =>
                    new Promise(resolve => {
                        confirmDelete = resolve;
                    })
            );
            await startDelete(element);
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

        expect(list(element).shadowRoot.querySelector('.table-status').textContent).toBe(
            'Showing 2 of 25'
        );
        expect(
            list(element).shadowRoot.querySelector('.expenses-total strong').textContent
        ).toContain('250.00');
        expect(selectedRows(element).length).toBe(1);
        expect(expenseButton(element, 'Load More')).toBeUndefined();
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
        expect(rowIds(element)).toEqual(['newer']);
    });

    it('preserves loaded rows and retries the same cursor after a failed page', async () => {
        const element = await mount();
        fetchExpensePage.mockRejectedValueOnce(new Error('Connection lost'));
        dispatch(element, 'loadmore');
        await flush();
        expect(list(element).shadowRoot.querySelector('[role="alert"]').textContent).toContain(
            'Connection lost'
        );
        expect(rowIds(element)).toHaveLength(1);
        fetchExpensePage.mockResolvedValueOnce({ rows: [row('2')], hasMore: false });
        dispatch(element, 'retry');
        await flush();
        expect(fetchExpensePage.mock.calls[2][0].cursor).toBe('next');
        expect(list(element).shadowRoot.querySelector('[role="alert"]')).toBeNull();
    });

    it('preserves expense filters, loaded pages, and selection across navigation', async () => {
        const element = await mount();
        dispatch(element, 'filterchange', { field: 'categoryId', value: 'food' });
        await flush();
        dispatch(element, 'selectionchange', { id: '1', selected: true });
        fetchExpensePage.mockResolvedValueOnce({ rows: [row('2')], hasMore: false });
        dispatch(element, 'loadmore');
        await flush();
        fetchExpensePage.mockClear();
        await navigate(element, 'dashboard');
        expect(list(element).shadowRoot.querySelector('.expense-screen').hidden).toBe(true);
        await navigate(element, 'expenses');
        expect(rowIds(element)).toEqual(['1', '2']);
        expect(selectedRows(element).map(input => input.dataset.id)).toEqual(['1']);
        expect(list(element).shadowRoot.querySelector('[data-field="categoryId"]').value).toBe(
            'food'
        );
        expect(fetchExpensePage).not.toHaveBeenCalled();
    });

    it('closes the expense modal and resets selection and category when the group changes', async () => {
        const element = await mount();
        dispatch(element, 'selectionchange', { id: '1', selected: true });
        dispatch(element, 'rowaction', { id: '1', action: 'edit' });
        await flush();
        const expenseModal = list(element).shadowRoot.querySelector('c-expense-modal');
        expect(expenseModal.isOpen).toBe(true);
        expect(expenseModal.recordId).toBe('1');
        changeGroup(element);
        await flush();
        expect(expenseModal.isOpen).toBe(false);
        expect(selectedRows(element)).toHaveLength(0);
        expect(fetchExpensePage.mock.calls.at(-1)[0]).toEqual(
            expect.objectContaining({
                expenseGroupId: 'other-group',
                categoryId: 'All',
                cursor: null
            })
        );
    });

    it.each(['success', 'failure'])(
        'reconciles a duplicated bank only after a successful lookup: %s',
        async outcome => {
            fetchExpensePage.mockResolvedValueOnce({
                ...firstPage(),
                rows: [
                    {
                        ...row('1'),
                        bank: 'BPI',
                        bankAssignmentId: 'bank',
                        bankAssignmentActive: true
                    }
                ]
            });
            const element = await mount();
            let finishLookup;
            fetchBankOptions.mockImplementationOnce(
                () =>
                    new Promise((resolve, reject) => {
                        finishLookup = outcome === 'success' ? resolve : reject;
                    })
            );
            dispatch(element, 'rowaction', { id: '1', action: 'duplicate' });
            await flush();
            const expenseModal = list(element).shadowRoot.querySelector('c-expense-modal');
            expect(expenseModal.duplicateData.Bank_Assignment__c).toBe('bank');
            expect(expenseModal.bankOptionsLoading).toBe(true);
            finishLookup(outcome === 'success' ? [] : new Error('Bank lookup failed'));
            await flush();
            await flush();
            expect(expenseModal.duplicateData.Bank_Assignment__c).toBe(
                outcome === 'success' ? null : 'bank'
            );
            expect(expenseModal.bankSelectionNotice).toBe(
                outcome === 'success'
                    ? 'BPI is not currently available for new expenses and was not copied.'
                    : ''
            );
            expect(expenseModal.bankOptionsError).toBe(
                outcome === 'failure' ? 'Bank lookup failed' : ''
            );
        }
    );

    it('refreshes the dashboard after an expense deletion succeeds', async () => {
        const element = await mount();
        fetchDashboardData.mockClear();
        dispatch(element, 'rowaction', { id: '1', action: 'delete' });
        await flush();
        expect(deleteExpense).toHaveBeenCalledWith({ expenseId: '1' });
        expect(fetchDashboardData).toHaveBeenCalledTimes(1);
    });

    it('does not print a report from a previous group', async () => {
        const element = await mount();
        let finishReport;
        fetchAllExpenseRows.mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    finishReport = resolve;
                })
        );
        const print = jest.spyOn(window, 'print').mockImplementation(() => {});
        expenseButton(element, 'Print / PDF').click();
        changeGroup(element);
        await flush();
        finishReport([row('old-group')]);
        await flush();
        expect(print).not.toHaveBeenCalled();
        expect(list(element).shadowRoot.querySelector('c-expense-print-report')).toBeNull();
        print.mockRestore();
    });

    it('renders every report row before opening print', async () => {
        const element = await mount();
        fetchAllExpenseRows.mockResolvedValue([row('1'), row('unloaded')]);
        const print = jest.spyOn(window, 'print').mockImplementation(() => {
            const report = list(element).shadowRoot.querySelector('c-expense-print-report');
            expect(report.viewModel.expenseCount).toBe(2);
            expect(report.shadowRoot.querySelectorAll('tbody tr')).toHaveLength(2);
        });
        [...list(element).shadowRoot.querySelectorAll('lightning-button')]
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
        [...list(element).shadowRoot.querySelectorAll('lightning-button')]
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
        [...list(element).shadowRoot.querySelectorAll('lightning-button')]
            .find(button => button.label === 'Export CSV')
            .click();
        await flush();
        expect(downloadExpensesCsv).toHaveBeenCalledWith(
            [row('1'), row('unloaded')],
            expect.any(String)
        );
        expect(rowIds(element)).toHaveLength(1);
    });
});
