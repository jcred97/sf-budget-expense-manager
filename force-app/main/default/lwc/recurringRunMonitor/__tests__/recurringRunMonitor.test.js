import { subscribeRecurringRun, startRecurringRun, retryRecurringRun } from 'c/recurringRunMonitor';
import runDueExpensesBatch from '@salesforce/apex/RecurringExpenseAutomationController.runDueExpensesBatch';
import getRecurringRunStatus from '@salesforce/apex/RecurringExpenseAutomationController.getRecurringRunStatus';
jest.mock(
    '@salesforce/apex/RecurringExpenseAutomationController.runDueExpensesBatch',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/RecurringExpenseAutomationController.getRecurringRunStatus',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};
const result = (status, isTerminal = false, numberOfErrors = 0) => ({
    jobId: 'job',
    status,
    isTerminal,
    numberOfErrors
});
let unsubscribe;
let listener;
beforeEach(() => {
    jest.useFakeTimers();
    jest.resetAllMocks();
    runDueExpensesBatch.mockResolvedValue('job');
    getRecurringRunStatus.mockResolvedValue(result('Completed', true));
    listener = jest.fn();
    unsubscribe = subscribeRecurringRun(listener);
});
afterEach(async () => {
    // Finish retained jobs so independent tests start from an idle coordinator.
    getRecurringRunStatus.mockResolvedValue(result('Completed', true));
    retryRecurringRun();
    await flush();
    unsubscribe();
    jest.useRealTimers();
});
it('polls sequentially, disables duplicate enqueue, and reports terminal errors once', async () => {
    getRecurringRunStatus
        .mockResolvedValueOnce(result('Queued'))
        .mockResolvedValueOnce(result('Processing'))
        .mockResolvedValueOnce(result('Completed', true, 1));
    await startRecurringRun();
    await flush();
    await startRecurringRun();
    expect(runDueExpensesBatch).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls.at(-1)[0]).toMatchObject({ busy: true, label: 'Queued' });
    jest.advanceTimersByTime(2000);
    await flush();
    expect(listener.mock.calls.at(-1)[0].label).toBe('Running');
    jest.advanceTimersByTime(2000);
    await flush();
    expect(listener.mock.calls.at(-1)[0]).toMatchObject({
        busy: false,
        label: 'Completed with errors',
        terminal: true
    });
    jest.advanceTimersByTime(20000);
    await flush();
    expect(getRecurringRunStatus).toHaveBeenCalledTimes(3);
});
it('retains job and run lock on check failure, then retries the same job', async () => {
    getRecurringRunStatus.mockRejectedValueOnce(new Error('Offline'));
    await startRecurringRun();
    await flush();
    expect(listener.mock.calls.at(-1)[0]).toMatchObject({
        busy: true,
        jobId: 'job',
        retry: true,
        error: 'Offline'
    });
    await startRecurringRun();
    retryRecurringRun();
    await flush();
    expect(runDueExpensesBatch).toHaveBeenCalledTimes(1);
    expect(getRecurringRunStatus).toHaveBeenLastCalledWith({ jobId: 'job' });
    expect(listener.mock.calls.at(-1)[0].terminal).toBe(true);
});
it('reports a limited completed run without chaining and clears its warning on explicit rerun', async () => {
    getRecurringRunStatus.mockResolvedValueOnce({
        ...result('Completed', true),
        outcomeAvailable: true,
        hasCatchUpRemaining: true
    });
    await startRecurringRun();
    await flush();
    expect(listener.mock.calls.at(-1)[0]).toMatchObject({
        busy: false,
        terminal: true,
        hasCatchUpRemaining: true,
        label: 'Completed; catch-up may remain'
    });
    expect(listener.mock.calls.at(-1)[0].message).toContain('run again if needed');
    jest.advanceTimersByTime(20000);
    await flush();
    expect(runDueExpensesBatch).toHaveBeenCalledTimes(1);
    getRecurringRunStatus.mockResolvedValue({
        ...result('Completed', true),
        outcomeAvailable: true,
        hasCatchUpRemaining: false
    });
    await startRecurringRun();
    await flush();
    expect(runDueExpensesBatch).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls.at(-1)[0]).toMatchObject({
        label: 'Completed',
        hasCatchUpRemaining: false,
        message: ''
    });
});
it('does not claim catch-up completion when the exact job outcome is unavailable', async () => {
    getRecurringRunStatus.mockResolvedValue({
        ...result('Completed', true),
        outcomeAvailable: false,
        hasCatchUpRemaining: false
    });
    await startRecurringRun();
    await flush();
    expect(listener.mock.calls.at(-1)[0]).toMatchObject({
        busy: false,
        label: 'Completed; catch-up status unavailable',
        hasCatchUpRemaining: false
    });
});
it('rejects another job outcome and keeps the requested run locked until its status is verified', async () => {
    getRecurringRunStatus.mockResolvedValueOnce({
        ...result('Completed', true),
        jobId: 'another-job',
        outcomeAvailable: true,
        hasCatchUpRemaining: true
    });
    await startRecurringRun();
    await flush();
    expect(listener.mock.calls.at(-1)[0]).toMatchObject({
        busy: true,
        jobId: 'job',
        retry: true,
        label: 'Queued'
    });
    expect(listener.mock.calls.at(-1)[0].hasCatchUpRemaining).not.toBe(true);
    await startRecurringRun();
    expect(runDueExpensesBatch).toHaveBeenCalledTimes(1);
    retryRecurringRun();
    await flush();
    expect(getRecurringRunStatus).toHaveBeenLastCalledWith({ jobId: 'job' });
    expect(listener.mock.calls.at(-1)[0]).toMatchObject({ busy: false, label: 'Completed' });
});
it('prioritizes transaction errors over the generation-limit warning', async () => {
    getRecurringRunStatus.mockResolvedValue({
        ...result('Completed', true, 1),
        outcomeAvailable: true,
        hasCatchUpRemaining: true
    });
    await startRecurringRun();
    await flush();
    expect(listener.mock.calls.at(-1)[0]).toMatchObject({
        label: 'Completed with errors',
        hasCatchUpRemaining: false
    });
});
it('bounds polling and requires explicit retry while retaining the pending run', async () => {
    getRecurringRunStatus.mockResolvedValue(result('Processing'));
    await startRecurringRun();
    await flush();
    for (let i = 1; i < 150; i += 1) {
        jest.advanceTimersByTime(2000);
        // Each next check is scheduled only after the previous promise settles.
        // eslint-disable-next-line no-await-in-loop
        await flush();
    }
    expect(getRecurringRunStatus).toHaveBeenCalledTimes(150);
    expect(listener.mock.calls.at(-1)[0]).toMatchObject({ busy: true, retry: true });
    jest.advanceTimersByTime(20000);
    await flush();
    expect(getRecurringRunStatus).toHaveBeenCalledTimes(150);
});
it('ignores a disconnected in-flight result and resumes retained job on reconnect', async () => {
    let resolveOld;
    getRecurringRunStatus.mockImplementationOnce(
        () =>
            new Promise(resolve => {
                resolveOld = resolve;
            })
    );
    await startRecurringRun();
    await flush();
    unsubscribe();
    const received = listener.mock.calls.length;
    resolveOld(result('Completed', true));
    await flush();
    expect(listener).toHaveBeenCalledTimes(received);
    unsubscribe = subscribeRecurringRun(listener);
    await flush();
    expect(getRecurringRunStatus).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls.at(-1)[0].terminal).toBe(true);
});
it('retains a job returned after disconnect and shares its lock with another entry point', async () => {
    let resolveStart;
    runDueExpensesBatch.mockImplementationOnce(
        () =>
            new Promise(resolve => {
                resolveStart = resolve;
            })
    );
    const pending = startRecurringRun();
    unsubscribe();
    resolveStart('job');
    await pending;
    await flush();
    expect(getRecurringRunStatus).not.toHaveBeenCalled();
    unsubscribe = subscribeRecurringRun(listener);
    await startRecurringRun();
    await flush();
    expect(runDueExpensesBatch).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls.at(-1)[0].terminal).toBe(true);
});
it.each(['Failed', 'Aborted'])('releases the lock only after %s is verified', async status => {
    getRecurringRunStatus.mockResolvedValue(result(status, true));
    await startRecurringRun();
    await flush();
    expect(listener.mock.calls.at(-1)[0]).toMatchObject({
        busy: false,
        terminal: true,
        label: status
    });
});
