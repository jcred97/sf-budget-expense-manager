import { createElement } from 'lwc';
import { readFileSync } from 'fs';
import { resolve as resolvePath } from 'path';
import BudgetExpenseManager from 'c/budgetExpenseManager';
import getSetupStatus from '@salesforce/apex/AppSetupController.getSetupStatus';
jest.mock('@salesforce/apex/AppSetupController.getSetupStatus', () => ({ default: jest.fn() }), {
    virtual: true
});
jest.mock('@salesforce/apex/AppSetupController.completeSetup', () => ({ default: jest.fn() }), {
    virtual: true
});
import getAllExpenseGroups from '@salesforce/apex/ExpenseController.getAllExpenseGroups';
import getRecurringExpenseOverview from '@salesforce/apex/RecurringExpenseController.getRecurringExpenseOverview';
import { fetchExpensePage, fetchDashboardData, fetchBankOptions } from 'c/expenseWorkspaceData';
import { loadStyle } from 'lightning/platformResourceLoader';
import LightningConfirm from 'lightning/confirm';
import deleteExpense from '@salesforce/apex/ExpenseController.deleteExpense';
import { refreshApex } from '@salesforce/apex';
import runDueExpensesBatch from '@salesforce/apex/RecurringExpenseAutomationController.runDueExpensesBatch';
import getRecurringRunStatus from '@salesforce/apex/RecurringExpenseAutomationController.getRecurringRunStatus';
jest.mock(
    '@salesforce/apex/RecurringExpenseAutomationController.getRecurringRunStatus',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/customPermission/Manage_Recurring_Expense_Automation',
    () => ({ default: true }),
    { virtual: true }
);

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

describe('workspace coordination', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        getSetupStatus.mockResolvedValue({ ready: true });
        LightningConfirm.open.mockResolvedValue(true);
        loadStyle.mockResolvedValue();
        fetchExpensePage.mockResolvedValue(firstPage());
        fetchDashboardData.mockResolvedValue({
            summary: { expenseCount: 0 },
            rows: [],
            trend: [],
            budgets: []
        });
        fetchBankOptions.mockResolvedValue([]);
    });
    afterEach(() => {
        document.body.replaceChildren();
        jest.useRealTimers();
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

    it('waits for the read-only setup check before mounting any workspace screens', async () => {
        let resolve;
        getSetupStatus.mockImplementationOnce(
            () =>
                new Promise(accept => {
                    resolve = accept;
                })
        );
        const element = createElement('c-budget-expense-manager', { is: BudgetExpenseManager });
        document.body.appendChild(element);
        getAllExpenseGroups.emit([{ Id: 'group', Name: 'Personal' }]);
        await flush();
        expect(element.shadowRoot.querySelector('c-app-setup')).not.toBeNull();
        expect(list(element)).toBeNull();
        expect(fetchDashboardData).not.toHaveBeenCalled();
        expect(fetchExpensePage).not.toHaveBeenCalled();
        resolve({ ready: true });
        await flush();
        await flush();
        expect(element.shadowRoot.querySelector('c-app-setup')).toBeNull();
        expect(list(element)).not.toBeNull();
        expect(element.shadowRoot.querySelector('c-expense-dashboard')).not.toBeNull();
    });
    it('keeps an uninitialized user in setup until an administrator finishes and Refresh confirms readiness', async () => {
        getSetupStatus
            .mockResolvedValueOnce({ ready: false, canManageSetup: false, message: 'Await setup.' })
            .mockResolvedValueOnce({ ready: true });
        const element = createElement('c-budget-expense-manager', { is: BudgetExpenseManager });
        document.body.appendChild(element);
        await flush();
        const setup = element.shadowRoot.querySelector('c-app-setup');
        expect(setup.shadowRoot.textContent).toContain('Ask an app administrator');
        expect(list(element)).toBeNull();
        [...setup.shadowRoot.querySelectorAll('lightning-button')]
            .find(item => item.label === 'Refresh')
            .click();
        await flush();
        await flush();
        expect(list(element)).not.toBeNull();
        expect(element.shadowRoot.querySelector('c-app-setup')).toBeNull();
    });
    it('keeps the workspace closed after setup-check failure and offers explicit recovery', async () => {
        getSetupStatus.mockRejectedValueOnce(new Error('Setup check unavailable'));
        const element = createElement('c-budget-expense-manager', { is: BudgetExpenseManager });
        document.body.appendChild(element);
        await flush();
        expect(list(element)).toBeNull();
        expect(element.shadowRoot.querySelector('c-app-setup').shadowRoot.textContent).toContain(
            'Setup check unavailable'
        );
    });
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

    it('refreshes other screens only when a recurring run completes after navigation', async () => {
        jest.useFakeTimers();
        const element = await mountRecurring();
        getRecurringRunStatus
            .mockResolvedValueOnce({ jobId: 'batch-job', status: 'Queued', isTerminal: false })
            .mockResolvedValue({
                jobId: 'batch-job',
                status: 'Completed',
                isTerminal: true,
                numberOfErrors: 0
            });
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
        started('batch-job');
        await flush();
        expect(fetchDashboardData).not.toHaveBeenCalled();
        expect(fetchExpensePage).not.toHaveBeenCalled();
        expect(recurringButton(element, 'Running...').disabled).toBe(true);
        jest.advanceTimersByTime(2000);
        await flush();
        await flush();
        expect(fetchDashboardData).toHaveBeenCalledTimes(1);
        expect(fetchExpensePage).toHaveBeenCalledTimes(1);
        expect(recurringButton(element, 'Run Recurring').disabled).toBe(false);
        jest.advanceTimersByTime(20000);
        await flush();
        expect(fetchDashboardData).toHaveBeenCalledTimes(1);
        expect(fetchExpensePage).toHaveBeenCalledTimes(1);
        jest.useRealTimers();
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

    const dashboard = element => element.shadowRoot.querySelector('c-expense-dashboard');
    const navigate = async (element, view) => {
        element.shadowRoot.querySelector(`[data-view="${view}"]`).click();
        await flush();
    };

    it('shows only the selected screen while retaining each screen instance', async () => {
        const element = await mount();
        const instances = {
            dashboard: dashboard(element),
            expenses: list(element),
            recurring: recurring(element)
        };
        const panels = {
            dashboard: instances.dashboard.parentElement,
            expenses: instances.expenses.shadowRoot.querySelector('.expense-screen'),
            recurring: instances.recurring.parentElement
        };
        for (const selected of ['dashboard', 'expenses', 'recurring', 'expenses', 'dashboard']) {
            // Navigation follows a render before the next user click.
            // eslint-disable-next-line no-await-in-loop
            await navigate(element, selected);
            for (const [view, panel] of Object.entries(panels)) {
                expect(panel.hidden).toBe(view !== selected);
                expect(
                    element.shadowRoot
                        .querySelector(`[data-view="${view}"]`)
                        .getAttribute('aria-current')
                ).toBe(view === selected ? 'page' : null);
            }
            expect(dashboard(element)).toBe(instances.dashboard);
            expect(list(element)).toBe(instances.expenses);
            expect(recurring(element)).toBe(instances.recurring);
        }
    });

    it('keeps inactive screen sections hidden against authored section display rules', () => {
        // Jest omits component styles. Exercise the real CSS in a light-DOM cascade fixture;
        // this verifies display behavior rather than the hidden attribute alone.
        const stylesheet = document.createElement('style');
        stylesheet.textContent = 'section { display: block; }';
        document.body.appendChild(stylesheet);
        const panels = [];
        for (const className of ['workspace-view', 'expense-screen']) {
            const section = document.createElement('section');
            section.className = className;
            section.hidden = true;
            document.body.appendChild(section);
            expect(window.getComputedStyle(section).display).toBe('block');
            panels.push(section);
        }
        stylesheet.textContent += `
            ${readFileSync(resolvePath(__dirname, '../budgetExpenseManager.css'), 'utf8')}
            ${readFileSync(resolvePath(__dirname, '../../expenseList/expenseList.css'), 'utf8')}`;
        for (const section of panels) {
            expect(window.getComputedStyle(section).display).toBe('none');
            section.hidden = false;
            expect(window.getComputedStyle(section).display).toBe('block');
        }
    });
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
            summary: { expenseCount: 1, totalAmount: 10 },
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
});
