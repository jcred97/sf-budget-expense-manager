import { createElement } from 'lwc';
import RecurringExpenses from 'c/recurringExpenses';
import getRecurringExpenseOverview from '@salesforce/apex/RecurringExpenseController.getRecurringExpenseOverview';
import getRecurringExpensePage from '@salesforce/apex/RecurringExpenseController.getRecurringExpensePage';
import deactivateRecurringExpense from '@salesforce/apex/RecurringExpenseController.deactivateRecurringExpense';
import { refreshApex } from '@salesforce/apex';
import LightningConfirm from 'lightning/confirm';
import runDueExpensesBatch from '@salesforce/apex/RecurringExpenseAutomationController.runDueExpensesBatch';
import getRecurringRunStatus from '@salesforce/apex/RecurringExpenseAutomationController.getRecurringRunStatus';
import { subscribeRecurringRun, startRecurringRun } from 'c/recurringRunMonitor';
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
    '@salesforce/apex/RecurringExpenseController.getRecurringExpenseOverview',
    () => {
        const { createApexTestWireAdapter } = require('@salesforce/sfdx-lwc-jest');
        return { default: createApexTestWireAdapter(jest.fn()) };
    },
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/RecurringExpenseController.getRecurringExpensePage',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
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
const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};

async function mount() {
    const element = createElement('c-recurring-expenses', { is: RecurringExpenses });
    element.expenseGroupId = 'group';
    element.active = true;
    document.body.appendChild(element);
    await flush();
    return element;
}
describe('recurring screen', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        getRecurringRunStatus.mockResolvedValue({
            jobId: 'batch-job',
            status: 'Completed',
            isTerminal: true,
            numberOfErrors: 0
        });
        LightningConfirm.open.mockResolvedValue(true);
    });
    afterEach(() => {
        document.body.replaceChildren();
        jest.useRealTimers();
    });
    const modal = element => element.shadowRoot.querySelector('c-recurring-expense-modal');
    const selectRecurring = (element, value) =>
        element.shadowRoot
            .querySelector('lightning-button-menu')
            .dispatchEvent(new CustomEvent('select', { detail: { value } }));
    const changeGroup = element => {
        element.expenseGroupId = 'other-group';
    };
    async function mountRecurring() {
        const element = await mount();
        await flush();
        getRecurringExpenseOverview.emit({
            rows: [{ id: 'template', name: 'Rent', bank: 'BPI', active: true }]
        });
        await flush();
        return element;
    }

    const findButton = (element, label) =>
        [...element.shadowRoot.querySelectorAll('lightning-button')].find(
            item => item.label === label
        );
    it('starts automation for permitted users and prevents a second request while busy', async () => {
        const element = await mountRecurring();
        let complete;
        runDueExpensesBatch.mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    complete = resolve;
                })
        );
        const generationStarted = jest.fn();
        element.addEventListener('generationcompleted', generationStarted);
        findButton(element, 'Run Recurring').click();
        await flush();
        expect(findButton(element, 'Running...').disabled).toBe(true);
        expect(findButton(element, 'Refresh').disabled).toBe(true);
        findButton(element, 'Running...').click();
        expect(runDueExpensesBatch).toHaveBeenCalledTimes(1);
        complete('batch-job');
        await flush();
        await flush();
        expect(generationStarted).toHaveBeenCalledTimes(1);
        expect(findButton(element, 'Run Recurring').disabled).toBe(false);
    });

    it('silently refreshes a cached overview once when mounting after another entry point completed', async () => {
        const keepMonitorConnected = subscribeRecurringRun(jest.fn());
        runDueExpensesBatch.mockResolvedValue('batch-job');
        await startRecurringRun();
        await flush();
        const element = await mount();
        const completed = jest.fn();
        element.addEventListener('generationcompleted', completed);
        getRecurringExpenseOverview.emit({ rows: [], dueTodayCount: 3 });
        await flush();
        expect(refreshApex).toHaveBeenCalledTimes(1);
        getRecurringExpenseOverview.emit({ rows: [], dueTodayCount: 0 });
        await flush();
        expect(refreshApex).toHaveBeenCalledTimes(1);
        expect(completed).not.toHaveBeenCalled();
        keepMonitorConnected();
    });
    it('warns when a completed run reached the cap, refreshes once, and permits explicit rerun', async () => {
        const element = await mountRecurring();
        refreshApex.mockClear();
        runDueExpensesBatch.mockResolvedValue('batch-job');
        getRecurringRunStatus.mockResolvedValueOnce({
            jobId: 'batch-job',
            status: 'Completed',
            isTerminal: true,
            numberOfErrors: 0,
            outcomeAvailable: true,
            hasCatchUpRemaining: true
        });
        const completed = jest.fn();
        const toast = jest.fn();
        element.addEventListener('generationcompleted', completed);
        element.addEventListener('lightning__showtoast', toast);
        findButton(element, 'Run Recurring').click();
        await flush();
        await flush();
        const status = element.shadowRoot.querySelector('[role="status"]');
        expect(status.textContent).toContain('Catch-up may remain');
        expect(status.classList.contains('slds-theme_warning')).toBe(true);
        expect(toast.mock.calls[0][0].detail.variant).toBe('warning');
        expect(refreshApex).toHaveBeenCalledTimes(1);
        expect(completed).toHaveBeenCalledTimes(1);
        expect(findButton(element, 'Run again').disabled).toBe(false);
        expect(runDueExpensesBatch).toHaveBeenCalledTimes(1);
        findButton(element, 'Run again').click();
        await flush();
        await flush();
        expect(runDueExpensesBatch).toHaveBeenCalledTimes(2);
        expect(element.shadowRoot.querySelector('[role="status"]').textContent).not.toContain(
            'Catch-up may remain'
        );
    });

    it('presents recurring server rows through the combined view model', async () => {
        const element = await mount();
        getRecurringExpenseOverview.emit({
            activeCount: 1,
            dueTodayCount: 1,
            monthlyTotal: 100,
            rows: [{ id: 'recurring-1', name: 'Rent', bank: 'BPI', active: true, dueToday: true }]
        });
        await flush();
        const screen = element.shadowRoot;
        expect(screen.querySelector('.recurring-row.is-due').textContent).toContain('Rent');
        expect(screen.querySelector('a').getAttribute('href')).toBe('/recurring-1');
        expect(screen.textContent).toContain('BPI');
        expect(screen.textContent).toContain('Active');
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
        expect(element.shadowRoot.querySelector('lightning-spinner')).not.toBeNull();
        getRecurringExpenseOverview.emit({ rows: [] });
        await flush();
        expect(element.shadowRoot.querySelector('lightning-spinner')).toBeNull();
    });
    const loadMore = element =>
        [...element.shadowRoot.querySelectorAll('lightning-button')].find(button =>
            ['Load more', 'Loading...', 'Retry loading more'].includes(button.label)
        );
    async function mountPaged() {
        const element = await mount();
        getRecurringExpenseOverview.emit({
            expenseGroupId: 'group',
            totalCount: 501,
            activeCount: 501,
            monthlyTotal: 50100,
            rows: [{ id: 'first', name: 'First' }],
            hasMore: true,
            nextCursor: 'cursor1'
        });
        await flush();
        return element;
    }
    it('loads beyond 500 templates while retaining full overview totals', async () => {
        const element = await mountPaged();
        expect(element.shadowRoot.textContent).toContain('1 of 501 recurring expenses');
        expect(element.shadowRoot.textContent).toContain('501 total templates');
        getRecurringExpensePage.mockResolvedValue({
            rows: Array.from({ length: 500 }, (_, index) => ({
                id: `remaining${index}`,
                name: `Remaining ${index}`
            })),
            hasMore: false
        });
        loadMore(element).click();
        await flush();
        expect(getRecurringExpensePage).toHaveBeenCalledWith({
            expenseGroupId: 'group',
            cursor: 'cursor1',
            pageSize: 50
        });
        expect(element.shadowRoot.querySelectorAll('article')).toHaveLength(501);
        expect(element.shadowRoot.textContent).toContain('501 recurring expenses');
        expect(element.shadowRoot.textContent).toContain('501 total templates');
        expect(loadMore(element)).toBeUndefined();
    });
    it('preserves rows and retries a failed page without skipping its cursor', async () => {
        const element = await mountPaged();
        getRecurringExpensePage.mockRejectedValueOnce(new Error('Connection lost'));
        loadMore(element).click();
        await flush();
        expect(element.shadowRoot.querySelectorAll('article')).toHaveLength(1);
        expect(element.shadowRoot.querySelector('[role="alert"]').textContent).toContain(
            'Connection lost'
        );
        getRecurringExpensePage.mockResolvedValueOnce({
            rows: [{ id: 'second', name: 'Second' }],
            hasMore: false
        });
        loadMore(element).click();
        await flush();
        expect(getRecurringExpensePage.mock.calls.map(([params]) => params.cursor)).toEqual([
            'cursor1',
            'cursor1'
        ]);
        expect(element.shadowRoot.querySelectorAll('article')).toHaveLength(2);
    });
    it('ignores page and wire results from the previous group', async () => {
        const element = await mountPaged();
        let resolvePage;
        getRecurringExpensePage.mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    resolvePage = resolve;
                })
        );
        loadMore(element).click();
        element.expenseGroupId = 'other-group';
        await flush();
        getRecurringExpenseOverview.emit({
            expenseGroupId: 'other-group',
            rows: [{ id: 'new', name: 'New group' }]
        });
        resolvePage({ rows: [{ id: 'old', name: 'Old group' }] });
        getRecurringExpenseOverview.emit({
            expenseGroupId: 'group',
            rows: [{ id: 'stale', name: 'Stale' }]
        });
        await flush();
        expect(element.shadowRoot.querySelectorAll('article')).toHaveLength(1);
        expect(element.shadowRoot.textContent).toContain('New group');
        expect(element.shadowRoot.textContent).not.toContain('Old group');
        expect(element.shadowRoot.textContent).not.toContain('Stale');
    });
    it('resets pagination on save and discards the old same-group page request', async () => {
        const element = await mountPaged();
        let resolvePage;
        getRecurringExpensePage.mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    resolvePage = resolve;
                })
        );
        loadMore(element).click();
        modal(element).dispatchEvent(new CustomEvent('success', { detail: { mode: 'edit' } }));
        getRecurringExpenseOverview.emit({
            expenseGroupId: 'group',
            rows: [{ id: 'refreshed', name: 'Refreshed' }],
            totalCount: 1
        });
        resolvePage({
            rows: [{ id: 'old', name: 'Old page' }],
            hasMore: true,
            nextCursor: 'cursor2'
        });
        await flush();
        expect(element.shadowRoot.querySelectorAll('article')).toHaveLength(1);
        expect(element.shadowRoot.textContent).toContain('Refreshed');
        expect(loadMore(element)).toBeUndefined();
    });
    it('deduplicates page overlap and refuses a looping cursor', async () => {
        const element = await mountPaged();
        getRecurringExpensePage.mockResolvedValueOnce({
            rows: [{ id: 'first' }, { id: 'second', name: 'Second' }],
            hasMore: true,
            nextCursor: 'cursor2'
        });
        loadMore(element).click();
        await flush();
        expect(element.shadowRoot.querySelectorAll('article')).toHaveLength(2);
        getRecurringExpensePage.mockResolvedValueOnce({
            rows: [{ id: 'third' }],
            hasMore: true,
            nextCursor: 'cursor1'
        });
        loadMore(element).click();
        await flush();
        expect(element.shadowRoot.querySelectorAll('article')).toHaveLength(2);
        expect(element.shadowRoot.querySelector('[role="alert"]').textContent).toContain(
            'Unable to advance'
        );
    });
    it('resets already loaded pages after a mutation even if the overview is unchanged', async () => {
        const element = await mountPaged();
        getRecurringExpensePage.mockResolvedValueOnce({
            rows: [{ id: 'second', name: 'Second' }],
            hasMore: true,
            nextCursor: 'cursor2'
        });
        loadMore(element).click();
        await flush();
        expect(element.shadowRoot.querySelectorAll('article')).toHaveLength(2);
        modal(element).dispatchEvent(new CustomEvent('success', { detail: { mode: 'edit' } }));
        await flush();
        expect(element.shadowRoot.querySelectorAll('article')).toHaveLength(1);
        getRecurringExpensePage.mockResolvedValueOnce({ rows: [], hasMore: false });
        loadMore(element).click();
        await flush();
        expect(getRecurringExpensePage.mock.calls[1][0].cursor).toBe('cursor1');
    });
    it('discards a disconnected page response and restores the first page on reconnect', async () => {
        const element = await mountPaged();
        let resolvePage;
        getRecurringExpensePage.mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    resolvePage = resolve;
                })
        );
        loadMore(element).click();
        element.remove();
        resolvePage({ rows: [{ id: 'disconnected', name: 'Disconnected' }], hasMore: false });
        await flush();
        document.body.appendChild(element);
        await flush();
        expect(element.shadowRoot.querySelectorAll('article')).toHaveLength(1);
        expect(element.shadowRoot.textContent).not.toContain('Disconnected');
        expect(loadMore(element)).toBeDefined();
    });
    it('shows an initial overview failure with retry instead of an empty group', async () => {
        const element = await mount();
        getRecurringExpenseOverview.error({ message: 'Overview failed' });
        await flush();
        expect(element.shadowRoot.querySelector('[role="alert"]')).not.toBeNull();
        expect(element.shadowRoot.textContent).not.toContain(
            'No recurring expenses for this group'
        );
        [...element.shadowRoot.querySelectorAll('lightning-button')]
            .find(button => button.label === 'Retry')
            .click();
        await flush();
        expect(refreshApex).toHaveBeenCalled();
        getRecurringExpenseOverview.emit({ expenseGroupId: 'group', rows: [] });
        await flush();
        expect(element.shadowRoot.querySelector('[role="alert"]')).toBeNull();
        expect(element.shadowRoot.textContent).toContain('No recurring expenses for this group');
    });
});
