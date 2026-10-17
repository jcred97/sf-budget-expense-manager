import { getObjectInfo } from 'lightning/uiObjectInfoApi';
import saveMonthlyBudget from '@salesforce/apex/BudgetController.saveMonthlyBudget';
import deleteMonthlyBudget from '@salesforce/apex/BudgetController.deleteMonthlyBudget';
import { createElement } from 'lwc';
import BudgetPanel from 'c/budgetPanel';
import getMonthlyBudget from '@salesforce/apex/BudgetController.getMonthlyBudget';
import { refreshApex } from '@salesforce/apex';

jest.mock('@salesforce/apex', () => ({ refreshApex: jest.fn() }), { virtual: true });
jest.mock(
    '@salesforce/apex/BudgetController.getMonthlyBudget',
    () => {
        const { createApexTestWireAdapter } = require('@salesforce/wire-service-jest-util');
        return { default: createApexTestWireAdapter(jest.fn()) };
    },
    { virtual: true }
);
jest.mock('@salesforce/apex/BudgetController.saveMonthlyBudget', () => ({ default: jest.fn() }), {
    virtual: true
});
jest.mock('@salesforce/apex/BudgetController.deleteMonthlyBudget', () => ({ default: jest.fn() }), {
    virtual: true
});

const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};
const button = (element, label) =>
    [...element.shadowRoot.querySelectorAll('lightning-button')].find(item => item.label === label);
const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((success, failure) => {
        resolve = success;
        reject = failure;
    });
    return { promise, resolve, reject };
};
const budgetInfo = {
    apiName: 'Budget__c',
    queryable: true,
    createable: true,
    updateable: true,
    deletable: true,
    fields: Object.fromEntries(
        ['Amount__c', 'Budget_Month__c', 'Expense_Group__c', 'Description__c'].map(name => [
            name,
            { createable: true, updateable: true }
        ])
    )
};
const budget = { id: 'budget-b', amount: 200, description: 'Current selection budget' };

async function mount() {
    const element = createElement('c-budget-panel', { is: BudgetPanel });
    element.expenseGroupId = 'group-a';
    element.budgetMonth = '2026-10-01';
    document.body.appendChild(element);
    await flush();
    getObjectInfo.emit(budgetInfo);
    await flush();
    getMonthlyBudget.error({ message: 'Initial load failed' });
    await flush();
    return element;
}

async function retry(element, request) {
    refreshApex.mockReturnValueOnce(request.promise);
    button(element, 'Retry').dispatchEvent(new CustomEvent('click'));
    await flush();
}

describe('monthly budget retry isolation', () => {
    beforeEach(() => jest.resetAllMocks());
    afterEach(() => document.body.replaceChildren());

    it('does not start another retry while the current retry is pending', async () => {
        const element = await mount();
        const request = deferred();
        const retryButton = button(element, 'Retry');
        await retry(element, request);
        retryButton.dispatchEvent(new CustomEvent('click'));
        await flush();
        expect(refreshApex).toHaveBeenCalledTimes(1);
        getMonthlyBudget.emit(budget);
        request.resolve();
        await flush();
        expect(element.shadowRoot.textContent).toContain(budget.description);
    });

    it('shows a current retry failure and allows a successful retry of the same wire', async () => {
        const element = await mount();
        const failed = deferred();
        await retry(element, failed);
        const originalWire = refreshApex.mock.calls[0][0];
        expect(originalWire.error.body.message).toBe('Initial load failed');
        failed.reject({ body: { message: 'Current retry failed' } });
        await flush();
        expect(element.shadowRoot.querySelector('[role="alert"]').textContent).toContain(
            'Current retry failed'
        );
        const succeeded = deferred();
        await retry(element, succeeded);
        expect(refreshApex.mock.calls[1][0]).toBe(originalWire);
        getMonthlyBudget.emit(budget);
        succeeded.resolve();
        await flush();
        expect(element.shadowRoot.querySelector('[role="alert"]')).toBeNull();
        expect(element.shadowRoot.textContent).toContain(budget.description);
    });

    it.each(['expenseGroupId', 'budgetMonth'])(
        'keeps the new budget visible when an old retry rejects after changing %s',
        async field => {
            const element = await mount();
            const oldRequest = deferred();
            await retry(element, oldRequest);
            element[field] = field === 'expenseGroupId' ? 'group-b' : '2026-11-01';
            await flush();
            getMonthlyBudget.emit(budget);
            await flush();
            oldRequest.reject({ body: { message: 'Old selection retry failed' } });
            await flush();
            expect(element.shadowRoot.querySelector('[role="alert"]')).toBeNull();
            expect(element.shadowRoot.textContent).toContain(budget.description);
        }
    );

    it.each(['resolve', 'reject'])(
        'keeps the new selection loading when the old retry %ss',
        async outcome => {
            const element = await mount();
            const oldRequest = deferred();
            await retry(element, oldRequest);
            element.expenseGroupId = 'group-b';
            await flush();
            oldRequest[outcome]({ body: { message: 'Old retry failed' } });
            await flush();
            expect(element.shadowRoot.querySelector('lightning-spinner')).not.toBeNull();
            expect(element.shadowRoot.querySelector('[role="alert"]')).toBeNull();
            expect(button(element, 'Set Budget')).toBeUndefined();
            getMonthlyBudget.emit(null);
            await flush();
            expect(element.shadowRoot.querySelector('lightning-spinner')).toBeNull();
            expect(button(element, 'Set Budget')).toBeDefined();
        }
    );

    it('ignores an old retry after switching away and back to the same group and month', async () => {
        const element = await mount();
        const oldRequest = deferred();
        await retry(element, oldRequest);
        element.budgetMonth = '2026-11-01';
        await flush();
        element.budgetMonth = '2026-10-01';
        await flush();
        oldRequest.reject({ body: { message: 'Previous visit failed' } });
        await flush();
        expect(element.shadowRoot.querySelector('lightning-spinner')).not.toBeNull();
        expect(element.shadowRoot.querySelector('[role="alert"]')).toBeNull();
    });

    it('does not let an old retry end a newer retry for another selection', async () => {
        const element = await mount();
        const oldRequest = deferred();
        await retry(element, oldRequest);
        element.expenseGroupId = 'group-b';
        await flush();
        getMonthlyBudget.error({ message: 'Group B load failed' });
        await flush();
        const newRequest = deferred();
        await retry(element, newRequest);
        expect(refreshApex.mock.calls[1][0]).not.toBe(refreshApex.mock.calls[0][0]);
        oldRequest.reject({ body: { message: 'Group A retry failed' } });
        await flush();
        expect(element.shadowRoot.querySelector('lightning-spinner')).not.toBeNull();
        expect(element.shadowRoot.querySelector('[role="alert"]')).toBeNull();
        newRequest.reject({ body: { message: 'Group B retry failed' } });
        await flush();
        expect(element.shadowRoot.querySelector('[role="alert"]').textContent).toContain(
            'Group B retry failed'
        );
    });

    it('invalidates a pending retry across disconnect and reconnect', async () => {
        const element = await mount();
        const oldRequest = deferred();
        await retry(element, oldRequest);
        element.remove();
        document.body.appendChild(element);
        await flush();
        getMonthlyBudget.emit(budget);
        await flush();
        oldRequest.reject({ body: { message: 'Disconnected request failed' } });
        await flush();
        expect(element.shadowRoot.querySelector('[role="alert"]')).toBeNull();
        expect(element.shadowRoot.textContent).toContain(budget.description);
    });
});

describe('budget schema capabilities', () => {
    beforeEach(() => jest.resetAllMocks());
    afterEach(() => document.body.replaceChildren());

    it('suppresses the budget request and actions when metadata is missing or denied', async () => {
        const element = createElement('c-budget-panel', { is: BudgetPanel });
        element.expenseGroupId = 'group-a';
        element.budgetMonth = '2026-10-01';
        document.body.appendChild(element);
        await flush();
        expect(getMonthlyBudget.getLastConfig()).toEqual({
            expenseGroupId: undefined,
            budgetMonth: undefined
        });
        expect(element.shadowRoot.querySelector('section')).toBeNull();
        getObjectInfo.error();
        await flush();
        expect(element.shadowRoot.querySelector('section')).toBeNull();
        expect(saveMonthlyBudget).not.toHaveBeenCalled();
    });

    it('shows a read-only budget without mutation controls', async () => {
        const element = await mount();
        getObjectInfo.emit({
            ...budgetInfo,
            createable: false,
            updateable: false,
            deletable: false
        });
        await flush();
        getMonthlyBudget.emit(budget);
        await flush();
        expect(element.shadowRoot.textContent).toContain(budget.description);
        expect(button(element, 'Edit')).toBeUndefined();
        expect(button(element, 'Remove')).toBeUndefined();
        getMonthlyBudget.emit(null);
        await flush();
        expect(button(element, 'Set Budget')).toBeUndefined();
        expect(deleteMonthlyBudget).not.toHaveBeenCalled();
    });

    it('preserves a restricted description when saving an otherwise editable amount', async () => {
        const element = await mount();
        getObjectInfo.emit({
            ...budgetInfo,
            fields: {
                ...budgetInfo.fields,
                Description__c: { createable: false, updateable: false }
            }
        });
        await flush();
        getMonthlyBudget.emit(budget);
        await flush();
        saveMonthlyBudget.mockResolvedValue({ ...budget, amount: 300 });
        button(element, 'Edit').click();
        await flush();
        element.shadowRoot
            .querySelector('c-budget-modal')
            .dispatchEvent(
                new CustomEvent('save', { detail: { amount: 300, description: 'Do not apply' } })
            );
        await flush();
        expect(saveMonthlyBudget).toHaveBeenCalledWith({
            request: {
                budgetId: budget.id,
                expenseGroupId: 'group-a',
                budgetMonth: '2026-10-01',
                amount: 300,
                descriptionProvided: false
            }
        });
    });

    it('rejects an already-open modal save after amount edit access is removed', async () => {
        const element = await mount();
        getMonthlyBudget.emit(budget);
        await flush();
        button(element, 'Edit').click();
        await flush();
        const modal = element.shadowRoot.querySelector('c-budget-modal');
        getObjectInfo.emit({ ...budgetInfo, updateable: false });
        await flush();
        modal.dispatchEvent(new CustomEvent('save', { detail: { amount: 300 } }));
        await flush();
        expect(saveMonthlyBudget).not.toHaveBeenCalled();
    });
});
