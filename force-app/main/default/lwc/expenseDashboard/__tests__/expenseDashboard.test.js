import { createElement } from 'lwc';
import ExpenseDashboard from 'c/expenseDashboard';
import { fetchDashboardData } from 'c/expenseWorkspaceData';
jest.mock('c/expenseWorkspaceData', () => ({ fetchDashboardData: jest.fn() }));
const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};
const row = id => ({ id, name: id, amount: 10, expenseDate: '2026-09-01' });

async function mount() {
    const element = createElement('c-expense-dashboard', { is: ExpenseDashboard });
    element.expenseGroupId = 'group';
    document.body.appendChild(element);
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
