import { createElement } from 'lwc';
import BudgetExpenseSettings from 'c/budgetExpenseSettings';
import getSettings from '@salesforce/apex/SettingsController.getSettings';
import saveSettings from '@salesforce/apex/SettingsController.saveSettings';
import runDueExpensesBatch from '@salesforce/apex/RecurringExpenseAutomationController.runDueExpensesBatch';
import getRecurringRunStatus from '@salesforce/apex/RecurringExpenseAutomationController.getRecurringRunStatus';
import { subscribeRecurringRun, startRecurringRun } from 'c/recurringRunMonitor';
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
const mount = (active = true, embedded = false) => {
    const element = createElement('c-budget-expense-settings', { is: BudgetExpenseSettings });
    element.active = active;
    element.embedded = embedded;
    document.body.appendChild(element);
    return element;
};
const timeInput = element =>
    [...element.shadowRoot.querySelectorAll('lightning-input')].find(item => item.type === 'time');
const editTime = (element, value) => {
    const input = timeInput(element);
    input.value = value;
    input.dispatchEvent(new CustomEvent('change'));
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

    it('defers the first settings read until its embedded tab is activated', async () => {
        const element = mount(false);
        await flush();
        expect(getSettings).not.toHaveBeenCalled();
        expect(button(element, 'Save').disabled).toBe(true);
        expect(element.shadowRoot.querySelector('h1').textContent).toBe(
            'Global Automation Settings'
        );
        expect(element.shadowRoot.querySelector('.settings-subtitle').textContent).toBe(
            'Applies to all Expense Groups'
        );
        expect(element.shadowRoot.textContent).toContain('One app-wide recurring schedule');
        expect(
            [...element.shadowRoot.querySelectorAll('lightning-input')].find(
                item => item.type === 'toggle'
            ).label
        ).toBe('Enable recurring automation for all groups');
        expect(timeInput(element).label).toBe('Daily automation run time');
        element.active = true;
        await flush();
        expect(getSettings).toHaveBeenCalledTimes(1);
        expect(timeInput(element).value).toBe('14:30');
        element.active = false;
        element.active = true;
        await flush();
        expect(getSettings).toHaveBeenCalledTimes(1);
    });

    it('keeps unsaved automation inputs when its tab is hidden and reopened', async () => {
        const element = mount();
        await flush();
        editTime(element, '10:45');
        const toggle = [...element.shadowRoot.querySelectorAll('lightning-input')].find(
            item => item.type === 'toggle'
        );
        toggle.checked = true;
        toggle.dispatchEvent(new CustomEvent('change'));
        element.active = false;
        await flush();
        element.active = true;
        await flush();
        expect(timeInput(element).value).toBe('10:45');
        expect(toggle.checked).toBe(true);
        expect(getSettings).toHaveBeenCalledTimes(1);
        click(element, 'Save');
        await flush();
        expect(saveSettings).toHaveBeenCalledWith({
            request: { recurringExpensesEnabled: 'true', globalRecurringRunTime: '10:45' }
        });
    });

    it('settles a pending save and reports one change while its tab is inactive', async () => {
        let finishSave;
        saveSettings.mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    finishSave = resolve;
                })
        );
        const element = mount();
        const changed = jest.fn();
        element.addEventListener('settingschange', changed);
        await flush();
        editTime(element, '09:15');
        click(element, 'Save');
        element.active = false;
        await flush();
        expect(button(element, 'Save').disabled).toBe(true);
        finishSave({ ...settings, globalRecurringRunTime: '09:15' });
        await flush();
        expect(changed).toHaveBeenCalledTimes(1);
        expect(button(element, 'Save').disabled).toBe(false);
        expect(timeInput(element).value).toBe('09:15');
        element.active = true;
        await flush();
        expect(getSettings).toHaveBeenCalledTimes(1);
        expect(timeInput(element).value).toBe('09:15');
    });

    it('retains unsaved inputs after a pending save fails while inactive', async () => {
        let failSave;
        saveSettings.mockImplementationOnce(
            () =>
                new Promise((resolve, reject) => {
                    failSave = reject;
                })
        );
        const element = mount();
        const changed = jest.fn();
        const toast = jest.fn();
        element.addEventListener('settingschange', changed);
        element.addEventListener('lightning__showtoast', toast);
        await flush();
        editTime(element, '09:15');
        click(element, 'Save');
        element.active = false;
        failSave(new Error('Save unavailable'));
        await flush();
        expect(changed).not.toHaveBeenCalled();
        expect(toast.mock.calls[0][0].detail.message).toBe('Save unavailable');
        element.active = true;
        await flush();
        expect(timeInput(element).value).toBe('09:15');
        expect(button(element, 'Save').disabled).toBe(false);
        expect(getSettings).toHaveBeenCalledTimes(1);
    });

    it('defers a hidden recurring completion refresh and preserves edits when reopening', async () => {
        jest.useFakeTimers();
        getSettings.mockResolvedValue({ ...settings, recurringExpensesEnabled: true });
        runDueExpensesBatch.mockResolvedValue('job-id');
        getRecurringRunStatus
            .mockResolvedValueOnce({ jobId: 'job-id', status: 'Processing', isTerminal: false })
            .mockResolvedValue({ jobId: 'job-id', status: 'Completed', isTerminal: true });
        const element = mount();
        const toast = jest.fn();
        element.addEventListener('lightning__showtoast', toast);
        await flush();
        editTime(element, '11:20');
        click(element, 'Run Recurring');
        await flush();
        element.active = false;
        jest.advanceTimersByTime(2000);
        await flush();
        await flush();
        expect(getSettings).toHaveBeenCalledTimes(1);
        expect(toast).not.toHaveBeenCalled();
        getSettings.mockResolvedValueOnce({
            ...settings,
            recurringExpensesEnabled: true,
            lastRecurringRunMessage: 'Generated three expenses.'
        });
        element.active = true;
        await flush();
        expect(getSettings).toHaveBeenCalledTimes(2);
        expect(timeInput(element).value).toBe('11:20');
        expect(element.shadowRoot.textContent).toContain('Generated three expenses.');
        expect(button(element, 'Save').disabled).toBe(false);
        jest.useRealTimers();
    });

    it('does not let an older read clear the refresh required by a run that finishes while hidden', async () => {
        jest.useFakeTimers();
        getSettings.mockResolvedValue({ ...settings, recurringExpensesEnabled: true });
        runDueExpensesBatch.mockResolvedValue('job-id');
        getRecurringRunStatus
            .mockResolvedValueOnce({ jobId: 'job-id', status: 'Processing', isTerminal: false })
            .mockResolvedValue({ jobId: 'job-id', status: 'Completed', isTerminal: true });
        const element = mount();
        await flush();
        editTime(element, '11:20');
        let finishOlderRead;
        getSettings.mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    finishOlderRead = resolve;
                })
        );
        click(element, 'Refresh');
        await startRecurringRun();
        await flush();
        element.active = false;
        jest.advanceTimersByTime(2000);
        await flush();
        await flush();
        expect(getSettings).toHaveBeenCalledTimes(2);
        finishOlderRead({
            ...settings,
            recurringExpensesEnabled: true,
            lastRecurringRunMessage: 'Older diagnostics.'
        });
        await flush();
        getSettings.mockResolvedValueOnce({
            ...settings,
            recurringExpensesEnabled: true,
            lastRecurringRunMessage: 'Latest completed run.'
        });
        element.active = true;
        await flush();
        expect(getSettings).toHaveBeenCalledTimes(3);
        expect(element.shadowRoot.textContent).toContain('Latest completed run.');
        expect(timeInput(element).value).toBe('11:20');
        jest.useRealTimers();
    });

    it('refreshes schedule diagnostics while preserving unsaved automation inputs', async () => {
        const element = mount();
        await flush();
        editTime(element, '12:50');
        getSettings.mockResolvedValueOnce({
            ...settings,
            globalRecurringRunTime: '16:00',
            lastRecurringRunStatus: 'Completed',
            lastRecurringRunMessage: 'Updated status from another administrator.',
            recurringScheduleTimeZone: 'Asia/Manila'
        });
        click(element, 'Refresh');
        await flush();
        expect(timeInput(element).value).toBe('12:50');
        expect(element.shadowRoot.textContent).toContain(
            'Updated status from another administrator.'
        );
        expect(element.shadowRoot.textContent).toContain('Asia/Manila');
        click(element, 'Save');
        await flush();
        expect(saveSettings).toHaveBeenCalledWith({
            request: { recurringExpensesEnabled: 'false', globalRecurringRunTime: '12:50' }
        });
    });

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

    it('refreshes embedded run status without duplicating the workspace completion toast', async () => {
        getSettings.mockResolvedValue({ ...settings, recurringExpensesEnabled: true });
        runDueExpensesBatch.mockResolvedValue('job-id');
        const element = mount(true, true);
        const toast = jest.fn();
        element.addEventListener('lightning__showtoast', toast);
        await flush();
        click(element, 'Run Recurring');
        await flush();
        await flush();
        expect(getSettings).toHaveBeenCalledTimes(2);
        expect(toast).not.toHaveBeenCalled();
        expect(element.shadowRoot.querySelector('[role="status"]').textContent).toContain(
            'Completed'
        );
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
    it('shows a catch-up warning, refreshes saved status, and offers a permitted explicit rerun', async () => {
        getSettings.mockResolvedValue({ ...settings, recurringExpensesEnabled: true });
        runDueExpensesBatch.mockResolvedValue('job-id');
        getRecurringRunStatus.mockResolvedValueOnce({
            jobId: 'job-id',
            status: 'Completed',
            isTerminal: true,
            numberOfErrors: 0,
            outcomeAvailable: true,
            hasCatchUpRemaining: true
        });
        const element = mount();
        const toast = jest.fn();
        element.addEventListener('lightning__showtoast', toast);
        await flush();
        click(element, 'Run Recurring');
        await flush();
        await flush();
        expect(element.shadowRoot.querySelector('[role="status"]').textContent).toContain(
            'Catch-up may remain'
        );
        expect(toast.mock.calls[0][0].detail.variant).toBe('warning');
        expect(getSettings).toHaveBeenCalledTimes(2);
        expect(button(element, 'Run again').disabled).toBe(false);
        expect(runDueExpensesBatch).toHaveBeenCalledTimes(1);
        click(element, 'Run again');
        await flush();
        await flush();
        expect(runDueExpensesBatch).toHaveBeenCalledTimes(2);
        expect(button(element, 'Run Recurring').disabled).toBe(false);
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
