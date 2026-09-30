import { createElement } from 'lwc';
import RecurringExpenses from 'c/recurringExpenses';
import getRecurringExpenseOverview from '@salesforce/apex/RecurringExpenseController.getRecurringExpenseOverview';
import deactivateRecurringExpense from '@salesforce/apex/RecurringExpenseController.deactivateRecurringExpense';
import { refreshApex } from '@salesforce/apex';
import LightningConfirm from 'lightning/confirm';
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
});
