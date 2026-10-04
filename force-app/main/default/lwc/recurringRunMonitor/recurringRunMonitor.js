import runDueExpensesBatch from '@salesforce/apex/RecurringExpenseAutomationController.runDueExpensesBatch';
import getRecurringRunStatus from '@salesforce/apex/RecurringExpenseAutomationController.getRecurringRunStatus';
import { getErrorMessage } from 'c/expenseErrorUtils';

const subscribers = new Set();
let state = { busy: false, label: '', retry: false };
let timer;
let version = 0;
let attempts = 0;
let checking = false;
const notify = () => subscribers.forEach(listener => listener({ ...state }));
const clearTimer = () => {
    clearTimeout(timer);
    timer = undefined;
};

async function poll() {
    timer = undefined;
    if (!state.jobId || !state.busy || checking || !subscribers.size) return;
    const requestVersion = version;
    checking = true;
    attempts += 1;
    try {
        const result = await getRecurringRunStatus({ jobId: state.jobId });
        if (requestVersion !== version) return;
        if (!result || result.jobId !== state.jobId) throw new Error('Unable to verify this run.');
        const terminal = result.isTerminal === true;
        const completedWithoutErrors = result.status === 'Completed' && !result.numberOfErrors;
        const hasCatchUpRemaining =
            terminal &&
            completedWithoutErrors &&
            result.outcomeAvailable === true &&
            result.hasCatchUpRemaining === true;
        const outcomeUnknown =
            terminal && completedWithoutErrors && result.outcomeAvailable === false;
        const message = hasCatchUpRemaining
            ? 'Run reached the generation limit. Catch-up may remain; review due templates and run again if needed, or wait for the next scheduled run.'
            : outcomeUnknown
              ? 'Run completed. Catch-up status is unavailable for this run. Refresh the recurring overview to check remaining due templates.'
              : '';
        const label =
            result.status === 'Completed' && result.numberOfErrors > 0
                ? 'Completed with errors'
                : hasCatchUpRemaining
                  ? 'Completed; catch-up may remain'
                  : outcomeUnknown
                    ? 'Completed; catch-up status unavailable'
                    : ['Processing', 'Preparing'].includes(result.status)
                      ? 'Running'
                      : ['Holding', 'Queued'].includes(result.status)
                        ? 'Queued'
                        : result.status;
        state = {
            ...state,
            busy: !terminal,
            terminal,
            label,
            message,
            hasCatchUpRemaining,
            retry: false,
            error: ''
        };
        if (!terminal && attempts >= 150) {
            state = {
                ...state,
                retry: true,
                error: 'This run is still pending. Retry the status check.'
            };
        }
        notify();
        // A sequential timer bounds status checks and is cleared on disconnect.
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        if (!terminal && !state.retry) timer = setTimeout(poll, 2000);
    } catch (error) {
        if (requestVersion !== version) return;
        state = {
            ...state,
            retry: true,
            error: getErrorMessage(error, 'Unable to check the run status.')
        };
        notify();
    } finally {
        if (requestVersion === version) checking = false;
    }
}

export function subscribeRecurringRun(listener) {
    subscribers.add(listener);
    listener({ ...state });
    if (state.busy && state.jobId && !state.retry && !checking && !timer) poll();
    return () => {
        subscribers.delete(listener);
        if (!subscribers.size) {
            clearTimer();
            version += 1;
            checking = false;
            if (!state.busy) state = { busy: false, label: '', retry: false };
        }
    };
}

export async function startRecurringRun() {
    if (state.busy) return;
    clearTimer();
    state = { busy: true, label: 'Starting', retry: false };
    notify();
    try {
        const jobId = await runDueExpensesBatch();
        if (!jobId) throw new Error('The recurring run did not return a job ID.');
        attempts = 0;
        state = { busy: true, jobId, label: 'Queued', retry: false };
        notify();
        poll();
    } catch (error) {
        state = { busy: false, label: '', retry: false };
        notify();
        throw error;
    }
}

export function retryRecurringRun() {
    if (!state.busy || !state.jobId || checking) return;
    clearTimer();
    attempts = 0;
    state = { ...state, retry: false, error: '' };
    notify();
    poll();
}
