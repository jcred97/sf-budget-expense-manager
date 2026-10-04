import { createElement } from 'lwc';
import RecurringExpenses from 'c/recurringExpenses';
import getRecurringExpenseOverview from '@salesforce/apex/RecurringExpenseController.getRecurringExpenseOverview';
import runDueExpensesBatch from '@salesforce/apex/RecurringExpenseAutomationController.runDueExpensesBatch';
import { refreshApex } from '@salesforce/apex';

jest.mock(
    '@salesforce/customPermission/Manage_Recurring_Expense_Automation',
    () => ({ default: undefined }),
    { virtual: true }
);
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
    '@salesforce/apex/RecurringExpenseAutomationController.runDueExpensesBatch',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};
describe('recurring automation permission', () => {
    afterEach(() => {
        document.body.replaceChildren();
        jest.clearAllMocks();
    });
    it('hides Run Recurring while allowing refresh and template management', async () => {
        const element = createElement('c-recurring-expenses', { is: RecurringExpenses });
        element.expenseGroupId = 'group';
        document.body.appendChild(element);
        getRecurringExpenseOverview.emit({ expenseGroupId: 'group', rows: [] });
        await flush();
        const buttons = [...element.shadowRoot.querySelectorAll('lightning-button')];
        expect(buttons.find(button => button.label === 'Run Recurring')).toBeUndefined();
        expect(buttons.find(button => button.label === 'Add Recurring').disabled).toBe(false);
        const refresh = buttons.find(button => button.label === 'Refresh');
        expect(refresh.disabled).toBe(false);
        refresh.click();
        await flush();
        expect(refreshApex).toHaveBeenCalledTimes(1);
        expect(runDueExpensesBatch).not.toHaveBeenCalled();
    });
    it('does not enqueue automation if its handler is invoked without permission', async () => {
        const componentState = Object.create(RecurringExpenses.prototype);
        Object.defineProperties(componentState, {
            isRunningRecurring: { value: false },
            isRecurringLoading: { value: false }
        });
        await componentState.handleRunRecurringExpenses();
        expect(runDueExpensesBatch).not.toHaveBeenCalled();
        expect(componentState.isRunningRecurring).toBe(false);
    });
});
