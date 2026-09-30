import { LightningElement } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

import getSettings from '@salesforce/apex/SettingsController.getSettings';
import saveSettings from '@salesforce/apex/SettingsController.saveSettings';
import runDueExpensesBatch from '@salesforce/apex/RecurringExpenseAutomationController.runDueExpensesBatch';

import { getErrorMessage } from 'c/expenseErrorUtils';

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
});

function formatDateTime(value) {
    return value ? DATE_TIME_FORMAT.format(new Date(value)) : '-';
}

export default class BudgetExpenseSettings extends LightningElement {
    settingsId;
    recurringExpensesEnabled = true;
    globalRecurringRunTime = '08:00';
    lastRunStatus = '-';
    lastRunDateTime;
    lastRunMessage = '-';
    scheduleActive = false;
    scheduleState = 'Not scheduled';
    scheduleNextRunDateTime;
    scheduleTimeZone = '-';

    isLoading = true;
    isSaving = false;
    isRunning = false;
    hasLoadedSettings = false;
    loadError;

    connectedCallback() {
        this.loadSettings();
    }

    get runButtonLabel() {
        return this.isRunning ? 'Running...' : 'Run Recurring';
    }

    get refreshButtonLabel() {
        return this.isLoading ? 'Refreshing...' : this.loadError ? 'Retry' : 'Refresh';
    }

    get isSaveDisabled() {
        return !this.hasLoadedSettings || this.isLoading || this.isSaving || this.isRunning;
    }

    get isRunDisabled() {
        return this.isSaveDisabled || !this.recurringExpensesEnabled;
    }

    get isRefreshDisabled() {
        return this.isLoading || this.isSaving || this.isRunning;
    }

    get scheduleText() {
        return `Daily at ${this.formattedGlobalRunTime} (${this.scheduleTimeZoneDisplay})`;
    }

    get formattedGlobalRunTime() {
        const [hourValue, minuteValue] = (this.globalRecurringRunTime || '08:00').split(':');
        const date = new Date();
        date.setHours(Number(hourValue), Number(minuteValue), 0, 0);
        return new Intl.DateTimeFormat('en-PH', {
            hour: 'numeric',
            minute: '2-digit'
        }).format(date);
    }

    get lastRecurringRunStatus() {
        return this.lastRunStatus || '-';
    }

    get lastRecurringRunDateTime() {
        return formatDateTime(this.lastRunDateTime);
    }

    get lastRecurringRunMessage() {
        return this.lastRunMessage || '-';
    }

    get scheduleStatusLabel() {
        if (!this.recurringExpensesEnabled) {
            return 'Disabled';
        }

        return this.scheduleActive ? 'Ready' : 'Needs attention';
    }

    get scheduleStatusClass() {
        if (!this.recurringExpensesEnabled) {
            return 'status-pill status-pill_neutral';
        }

        return this.scheduleActive
            ? 'status-pill status-pill_success'
            : 'status-pill status-pill_warning';
    }

    get scheduleStateDisplay() {
        if (!this.recurringExpensesEnabled) {
            return 'Automation is paused.';
        }

        const stateMap = {
            ACQUIRED: 'Automation is running now.',
            COMPLETE: 'Automation finished its scheduled work.',
            DELETED: 'Automation is not scheduled.',
            ERROR: 'Automation needs attention.',
            PAUSED: 'Automation is paused.',
            WAITING: 'Automation is ready.'
        };

        return stateMap[this.scheduleState] || 'Automation is not scheduled.';
    }

    get scheduleNextRunDisplay() {
        if (!this.recurringExpensesEnabled) {
            return 'Paused by setting';
        }

        return formatDateTime(this.scheduleNextRunDateTime);
    }

    get scheduleTimeZoneDisplay() {
        return this.scheduleTimeZone || '-';
    }

    async loadSettings() {
        this.isLoading = true;
        this.hasLoadedSettings = false;
        this.loadError = undefined;
        try {
            const settings = await getSettings();
            if (!settings) {
                throw new Error('Failed to load settings.');
            }
            this.applySettings(settings);
            this.hasLoadedSettings = true;
        } catch (error) {
            this.loadError = getErrorMessage(error, 'Failed to load settings.');
            this.showToast('Error', this.loadError, 'error');
        } finally {
            this.isLoading = false;
        }
    }

    async handleRefresh() {
        if (this.isRefreshDisabled) return;
        await this.loadSettings();
    }

    handleRecurringToggle(event) {
        this.recurringExpensesEnabled = event.target.checked;
    }

    handleGlobalRunTimeChange(event) {
        this.globalRecurringRunTime = event.target.value || '08:00';
    }

    async handleSave() {
        if (this.isSaveDisabled) return;
        this.isSaving = true;
        try {
            const settings = await saveSettings({
                request: {
                    recurringExpensesEnabled: String(this.recurringExpensesEnabled),
                    globalRecurringRunTime: this.globalRecurringRunTime
                }
            });
            this.applySettings(settings);
            this.showToast('Saved', 'Settings saved.', 'success');
        } catch (error) {
            this.showToast('Error', getErrorMessage(error, 'Failed to save settings.'), 'error');
        } finally {
            this.isSaving = false;
        }
    }

    async handleRunRecurringExpenses() {
        if (this.isRunDisabled) return;
        this.isRunning = true;
        try {
            await runDueExpensesBatch();
            this.showToast(
                'Recurring run started',
                'Due recurring expenses are being generated.',
                'success'
            );
            await this.loadSettings();
        } catch (error) {
            this.showToast(
                'Error',
                getErrorMessage(error, 'Failed to start recurring expense generation.'),
                'error'
            );
        } finally {
            this.isRunning = false;
        }
    }

    applySettings(settings) {
        this.settingsId = settings?.settingsId;
        this.recurringExpensesEnabled = settings?.recurringExpensesEnabled ?? true;
        this.globalRecurringRunTime = settings?.globalRecurringRunTime || '08:00';
        this.lastRunStatus = settings?.lastRecurringRunStatus || '-';
        this.lastRunDateTime = settings?.lastRecurringRunDateTime;
        this.lastRunMessage = settings?.lastRecurringRunMessage || '-';
        this.scheduleActive = settings?.recurringScheduleActive || false;
        this.scheduleState = settings?.recurringScheduleState || 'Not scheduled';
        this.scheduleNextRunDateTime = settings?.recurringScheduleNextRunDateTime;
        this.scheduleTimeZone = settings?.recurringScheduleTimeZone || '-';
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
