import { getObjectInfos } from 'lightning/uiObjectInfoApi';
import { createElement } from 'lwc';
import ExpenseDashboard from 'c/expenseDashboard';
import { fetchDashboardData } from 'c/expenseWorkspaceData';
jest.mock('c/expenseWorkspaceData', () => ({ fetchDashboardData: jest.fn() }));
const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};
const info = apiName => ({
    apiName,
    queryable: true,
    createable: true,
    fields: Object.fromEntries(
        [
            'Amount__c',
            'Budget_Month__c',
            'Expense_Group__c',
            'Name',
            'Expense_Date__c',
            'Category__c',
            'Transaction_Type__c'
        ].map(name => [name, { createable: true }])
    )
});
const metadata = { results: [{ result: info('Budget__c') }, { result: info('Expense__c') }] };
const row = id => ({ id, name: id, amount: 10, expenseDate: '2026-09-01' });

async function mount() {
    const element = createElement('c-expense-dashboard', { is: ExpenseDashboard });
    element.expenseGroupId = 'group';
    document.body.appendChild(element);
    await flush();
    getObjectInfos.emit(metadata);
    await flush();
    return element;
}
const changeGroup = element => {
    element.expenseGroupId = 'other-group';
};
const dashboardButton = (element, label) =>
    [...element.shadowRoot.querySelectorAll('lightning-button')].find(
        button => button.label === label
    );
describe('dashboard screen', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        fetchDashboardData.mockResolvedValue({
            summary: { expenseCount: 0 },
            rows: [],
            trend: [],
            budgets: []
        });
    });
    afterEach(() => {
        document.body.replaceChildren();
        jest.useRealTimers();
    });
    it('keeps spending available without Budget access and hides denied creation', async () => {
        const element = await mount();
        fetchDashboardData.mockClear();
        getObjectInfos.emit({
            results: [
                { statusCode: 403, result: { errorCode: 'INSUFFICIENT_ACCESS' } },
                { result: { ...info('Expense__c'), createable: false } }
            ]
        });
        await flush();
        expect(fetchDashboardData).toHaveBeenLastCalledWith(
            expect.objectContaining({ includeBudgets: false })
        );
        expect(element.shadowRoot.querySelector('c-budget-panel')).toBeNull();
        expect(element.shadowRoot.querySelector('c-budget-history')).toBeNull();
        expect(element.shadowRoot.querySelector('c-expense-summary-cards')).not.toBeNull();
        expect(dashboardButton(element, 'Add Expense')).toBeUndefined();
    });
    it('fails closed on missing metadata and a metadata error', async () => {
        const element = createElement('c-expense-dashboard', { is: ExpenseDashboard });
        element.expenseGroupId = 'group';
        document.body.appendChild(element);
        await flush();
        expect(dashboardButton(element, 'Add Expense')).toBeUndefined();
        getObjectInfos.error();
        await flush();
        expect(element.shadowRoot.querySelector('c-budget-panel')).toBeNull();
        expect(dashboardButton(element, 'Add Expense')).toBeUndefined();
    });
    it('uses the requested object position when UI API returns namespaced API names', async () => {
        const element = await mount();
        getObjectInfos.emit({
            results: ['Budget__c', 'Expense__c'].map(kind => ({
                result: { ...info(kind), apiName: `bemgr__${kind}` }
            }))
        });
        await flush();
        expect(element.shadowRoot.querySelector('c-budget-panel')).not.toBeNull();
        expect(dashboardButton(element, 'Add Expense')).toBeDefined();
    });
    it('shows a budget history failure separately from successful spending data', async () => {
        const element = await mount();
        fetchDashboardData.mockResolvedValueOnce({
            summary: { expenseCount: 5, totalAmount: 100 },
            rows: [],
            trend: [],
            budgets: [],
            budgetError: { body: { message: 'Budget history unavailable' } }
        });
        element.refresh();
        await flush();
        expect(element.shadowRoot.textContent).toContain('5 expenses');
        expect(element.shadowRoot.querySelector('c-expense-summary-cards')).not.toBeNull();
        expect(element.shadowRoot.querySelector('[role="alert"]').textContent).toContain(
            'Budget history unavailable'
        );
        expect(dashboardButton(element, 'Retry budget history')).toBeDefined();
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
            element.refresh();
            await flush();
            fetchDashboardData.mockResolvedValueOnce({
                summary: { expenseCount: 500, totalAmount: 25000 },
                rows: [row('new-group-expense')],
                trend: [],
                budgets: []
            });
            changeGroup(element);
            await flush();
            complete(
                outcome === 'resolve'
                    ? {
                          summary: { expenseCount: 2, totalAmount: 20 },
                          rows: [row('old-group-expense')],
                          trend: [],
                          budgets: []
                      }
                    : new Error('Old request failed')
            );
            await flush();
            const screen = element.shadowRoot;
            expect(screen.textContent).toContain('new-group-expense');
            expect(screen.textContent).not.toContain('old-group-expense');
            expect(screen.textContent).toContain('500 expenses');
            expect(screen.querySelector('c-budget-panel').spentAmount).toBe(25000);
            expect(screen.querySelector('[role="alert"]')).toBeNull();
            expect(screen.querySelector('lightning-spinner')).toBeNull();
        }
    );
    it('retries dashboard failures and refreshes after budget changes', async () => {
        const element = await mount();
        fetchDashboardData.mockRejectedValueOnce(new Error('Unavailable'));
        element.refresh();
        await flush();
        expect(element.shadowRoot.querySelector('[role="alert"]').textContent).toContain(
            'Failed to load the dashboard.'
        );
        fetchDashboardData.mockClear();
        dashboardButton(element, 'Retry').click();
        await flush();
        expect(fetchDashboardData).toHaveBeenCalledTimes(1);
        expect(element.shadowRoot.querySelector('[role="alert"]')).toBeNull();
        element.shadowRoot
            .querySelector('c-budget-panel')
            .dispatchEvent(new CustomEvent('budgetchange'));
        await flush();
        expect(fetchDashboardData).toHaveBeenCalledTimes(2);
    });
});
