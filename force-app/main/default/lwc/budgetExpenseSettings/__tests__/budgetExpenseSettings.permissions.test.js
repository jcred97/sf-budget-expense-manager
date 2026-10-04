import { createElement } from 'lwc';
import BudgetExpenseSettings from 'c/budgetExpenseSettings';
import getSettings from '@salesforce/apex/SettingsController.getSettings';
import saveSettings from '@salesforce/apex/SettingsController.saveSettings';
import runDueExpensesBatch from '@salesforce/apex/RecurringExpenseAutomationController.runDueExpensesBatch';

jest.mock(
    '@salesforce/customPermission/Manage_Recurring_Expense_Automation',
    () => ({ default: undefined }),
    { virtual: true }
);
jest.mock('@salesforce/apex/SettingsController.getSettings', () => ({ default: jest.fn() }), {
    virtual: true
});
jest.mock('@salesforce/apex/SettingsController.saveSettings', () => ({ default: jest.fn() }), {
    virtual: true
});
jest.mock(
    '@salesforce/apex/RecurringExpenseAutomationController.runDueExpensesBatch',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

const settings = { recurringExpensesEnabled: true, globalRecurringRunTime: '08:00' };
const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};
const button = (element, label) =>
    [...element.shadowRoot.querySelectorAll('lightning-button')].find(item => item.label === label);

describe('settings without automation permission', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        getSettings.mockResolvedValue(settings);
        saveSettings.mockResolvedValue(settings);
    });
    afterEach(() => document.body.replaceChildren());

    it('hides manual running while preserving settings save and refresh', async () => {
        const element = createElement('c-budget-expense-settings', { is: BudgetExpenseSettings });
        document.body.appendChild(element);
        await flush();
        expect(button(element, 'Run Recurring')).toBeUndefined();
        expect(button(element, 'Save').disabled).toBe(false);
        expect(button(element, 'Refresh').disabled).toBe(false);
        button(element, 'Save').dispatchEvent(new CustomEvent('click'));
        await flush();
        expect(saveSettings).toHaveBeenCalledWith({
            request: { recurringExpensesEnabled: 'true', globalRecurringRunTime: '08:00' }
        });
        button(element, 'Refresh').dispatchEvent(new CustomEvent('click'));
        await flush();
        expect(getSettings).toHaveBeenCalledTimes(2);
        expect(runDueExpensesBatch).not.toHaveBeenCalled();
    });
});
