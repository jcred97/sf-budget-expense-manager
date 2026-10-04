import { createElement } from 'lwc';
import BudgetExpenseSettings from 'c/budgetExpenseSettings';
import getSettings from '@salesforce/apex/SettingsController.getSettings';
import saveSettings from '@salesforce/apex/SettingsController.saveSettings';
import runDueExpensesBatch from '@salesforce/apex/RecurringExpenseAutomationController.runDueExpensesBatch';
import getRecurringRunStatus from '@salesforce/apex/RecurringExpenseAutomationController.getRecurringRunStatus';
import { subscribeRecurringRun } from 'c/recurringRunMonitor';
jest.mock(
    '@salesforce/apex/RecurringExpenseAutomationController.getRecurringRunStatus',
    () => ({ default: jest.fn() }),
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
jest.mock(
    '@salesforce/customPermission/Manage_Recurring_Expense_Automation',
    () => ({ __esModule: true, default: true }),
    { virtual: true }
);

const automationPermission = require('@salesforce/customPermission/Manage_Recurring_Expense_Automation');

const settings = { recurringExpensesEnabled: false, globalRecurringRunTime: '14:30' };
const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};
const button = (element, label) =>
    [...element.shadowRoot.querySelectorAll('lightning-button')].find(item => item.label === label);
const click = (element, label) => button(element, label).dispatchEvent(new CustomEvent('click'));
const mount = () => {
    const element = createElement('c-budget-expense-settings', { is: BudgetExpenseSettings });
    document.body.appendChild(element);
    return element;
};

describe('settings loading protection', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        getRecurringRunStatus.mockResolvedValue({
            jobId: 'job-id',
            status: 'Completed',
            isTerminal: true,
            numberOfErrors: 0
        });
        automationPermission.default = true;
        getSettings.mockResolvedValue(settings);
        saveSettings.mockResolvedValue(settings);
    });
    afterEach(() => document.body.replaceChildren());

    it('runs enabled automation with permission and refreshes settings', async () => {
        getSettings.mockResolvedValue({ ...settings, recurringExpensesEnabled: true });
        runDueExpensesBatch.mockResolvedValue('job-id');
        const element = mount();
        await flush();
        expect(button(element, 'Run Recurring').disabled).toBe(false);
        click(element, 'Run Recurring');
        await flush();
        expect(runDueExpensesBatch).toHaveBeenCalledTimes(1);
        expect(getSettings).toHaveBeenCalledTimes(2);
    });

    it('keeps controls locked until a failed run finishes and refreshes partial results once', async () => {
        jest.useFakeTimers();
        getSettings.mockResolvedValue({ ...settings, recurringExpensesEnabled: true });
        runDueExpensesBatch.mockResolvedValue('job-id');
        getRecurringRunStatus
            .mockResolvedValueOnce({ jobId: 'job-id', status: 'Processing', isTerminal: false })
            .mockResolvedValue({ jobId: 'job-id', status: 'Failed', isTerminal: true });
        const element = mount();
        await flush();
        click(element, 'Run Recurring');
        await flush();
        expect(getSettings).toHaveBeenCalledTimes(1);
        expect(button(element, 'Save').disabled).toBe(true);
        expect(button(element, 'Running...').disabled).toBe(true);
        jest.advanceTimersByTime(2000);
        await flush();
        await flush();
        expect(element.shadowRoot.querySelector('[role="status"]').textContent).toContain('Failed');
        expect(getSettings).toHaveBeenCalledTimes(2);
        expect(button(element, 'Run Recurring').disabled).toBe(false);
        jest.advanceTimersByTime(20000);
        await flush();
        expect(getSettings).toHaveBeenCalledTimes(2);
        jest.useRealTimers();
    });

    it('shows status retry without unlocking the job and resumes that job', async () => {
        getSettings.mockResolvedValue({ ...settings, recurringExpensesEnabled: true });
        runDueExpensesBatch.mockResolvedValue('job-id');
        getRecurringRunStatus.mockRejectedValueOnce(new Error('Connection unavailable'));
        const element = mount();
        await flush();
        click(element, 'Run Recurring');
        await flush();
        expect(button(element, 'Running...').disabled).toBe(true);
        expect(getSettings).toHaveBeenCalledTimes(1);
        click(element, 'Retry status check');
        await flush();
        await flush();
        expect(runDueExpensesBatch).toHaveBeenCalledTimes(1);
        expect(getRecurringRunStatus).toHaveBeenLastCalledWith({ jobId: 'job-id' });
        expect(getSettings).toHaveBeenCalledTimes(2);
    });

    it('ignores settings responses from a disconnected mount after reconnect', async () => {
        let resolveOld;
        getSettings.mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    resolveOld = resolve;
                })
        );
        const element = mount();
        await flush();
        element.remove();
        document.body.appendChild(element);
        await flush();
        resolveOld({ recurringExpensesEnabled: true, globalRecurringRunTime: '01:00' });
        await flush();
        const input = [...element.shadowRoot.querySelectorAll('lightning-input')].find(
            item => item.type === 'time'
        );
        expect(input.value).toBe('14:30');
    });

    it('loads only once when reconnecting after another entry point observes completion', async () => {
        jest.useFakeTimers();
        getSettings.mockResolvedValue({ ...settings, recurringExpensesEnabled: true });
        runDueExpensesBatch.mockResolvedValue('job-id');
        getRecurringRunStatus
            .mockResolvedValueOnce({ jobId: 'job-id', status: 'Queued', isTerminal: false })
            .mockResolvedValue({ jobId: 'job-id', status: 'Completed', isTerminal: true });
        const keepMonitorConnected = subscribeRecurringRun(jest.fn());
        const element = mount();
        await flush();
        click(element, 'Run Recurring');
        await flush();
        element.remove();
        jest.advanceTimersByTime(2000);
        await flush();
        document.body.appendChild(element);
        await flush();
        await flush();
        expect(getSettings).toHaveBeenCalledTimes(2);
        expect(button(element, 'Run Recurring').disabled).toBe(false);
        keepMonitorConnected();
        jest.useRealTimers();
    });

    it('blocks saving and running during a slow initial load, then saves loaded values', async () => {
        let resolveLoad;
        getSettings.mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    resolveLoad = resolve;
                })
        );
        const element = mount();
        await flush();
        expect(button(element, 'Save').disabled).toBe(true);
        element.shadowRoot
            .querySelectorAll('lightning-input')
            .forEach(input => expect(input.disabled).toBe(true));
        click(element, 'Save');
        click(element, 'Run Recurring');
        expect(saveSettings).not.toHaveBeenCalled();
        expect(runDueExpensesBatch).not.toHaveBeenCalled();
        resolveLoad(settings);
        await flush();
        expect(button(element, 'Save').disabled).toBe(false);
        click(element, 'Save');
        await flush();
        expect(saveSettings).toHaveBeenCalledWith({
            request: { recurringExpensesEnabled: 'false', globalRecurringRunTime: '14:30' }
        });
    });

    it('keeps a failed load locked until Retry succeeds', async () => {
        getSettings.mockRejectedValueOnce(new Error('Unavailable'));
        const element = mount();
        await flush();
        expect(element.shadowRoot.querySelector('[role="alert"]').textContent).toContain(
            'Unavailable'
        );
        expect(button(element, 'Save').disabled).toBe(true);
        click(element, 'Save');
        expect(saveSettings).not.toHaveBeenCalled();
        click(element, 'Retry');
        await flush();
        expect(button(element, 'Save').disabled).toBe(false);
        expect(element.shadowRoot.querySelector('[role="alert"]')).toBeNull();
    });

    it('locks previously loaded settings after a failed refresh', async () => {
        const element = mount();
        await flush();
        getSettings.mockRejectedValueOnce(new Error('Refresh failed'));
        click(element, 'Refresh');
        click(element, 'Save');
        await flush();
        expect(button(element, 'Save').disabled).toBe(true);
        expect(saveSettings).not.toHaveBeenCalled();
    });

    it('prevents duplicate saves and refreshes while saving', async () => {
        let resolveSave;
        saveSettings.mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    resolveSave = resolve;
                })
        );
        const element = mount();
        await flush();
        click(element, 'Save');
        click(element, 'Save');
        click(element, 'Refresh');
        await flush();
        expect(saveSettings).toHaveBeenCalledTimes(1);
        expect(getSettings).toHaveBeenCalledTimes(1);
        expect(button(element, 'Refresh').disabled).toBe(true);
        resolveSave(settings);
        await flush();
        expect(button(element, 'Save').disabled).toBe(false);
    });

    it('does not treat an empty load response as successfully loaded settings', async () => {
        getSettings.mockResolvedValueOnce(null);
        const element = mount();
        await flush();
        expect(button(element, 'Save').disabled).toBe(true);
        expect(button(element, 'Retry')).toBeDefined();
    });
});
