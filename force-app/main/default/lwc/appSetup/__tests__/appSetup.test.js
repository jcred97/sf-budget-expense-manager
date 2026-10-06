import { createElement } from 'lwc';
import AppSetup from 'c/appSetup';
import getSetupStatus from '@salesforce/apex/AppSetupController.getSetupStatus';
import completeSetup from '@salesforce/apex/AppSetupController.completeSetup';
import getAllExpenseGroups from '@salesforce/apex/ExpenseController.getAllExpenseGroups';
import { refreshApex } from '@salesforce/apex';
jest.mock('@salesforce/apex/AppSetupController.getSetupStatus', () => ({ default: jest.fn() }), {
    virtual: true
});
jest.mock('@salesforce/apex/AppSetupController.completeSetup', () => ({ default: jest.fn() }), {
    virtual: true
});
jest.mock('@salesforce/apex', () => ({ refreshApex: jest.fn() }), { virtual: true });
jest.mock(
    '@salesforce/apex/ExpenseController.getAllExpenseGroups',
    () => {
        const { createApexTestWireAdapter } = require('@salesforce/sfdx-lwc-jest');
        return { default: createApexTestWireAdapter(jest.fn()) };
    },
    { virtual: true }
);
const adminStatus = {
    ready: false,
    canManageSetup: true,
    canCompleteSetup: true,
    organizationCurrencyCode: 'PHP',
    message: 'Confirm PHP reporting currency.'
};
const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};
const button = (element, label) =>
    [...element.shadowRoot.querySelectorAll('lightning-button')].find(item => item.label === label);
const confirm = element => {
    const input = element.shadowRoot.querySelector('lightning-input');
    input.checked = true;
    input.dispatchEvent(new CustomEvent('change'));
};
const mount = async () => {
    const element = createElement('c-app-setup', { is: AppSetup });
    const ready = jest.fn();
    element.addEventListener('ready', ready);
    document.body.appendChild(element);
    await flush();
    return { element, ready };
};
describe('guided app setup', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        getSetupStatus.mockResolvedValue(adminStatus);
        refreshApex.mockResolvedValue();
    });
    afterEach(() => document.body.replaceChildren());
    it('checks existing initialization without writing or requiring optional services and records', async () => {
        getSetupStatus.mockResolvedValue({
            ready: true,
            canManageSetup: false,
            baseCurrencyCode: 'PHP'
        });
        const { ready } = await mount();
        expect(ready).toHaveBeenCalledTimes(1);
        expect(ready.mock.calls[0][0].detail).toEqual({ completed: false });
        expect(completeSetup).not.toHaveBeenCalled();
    });
    it('requires explicit currency confirmation and leaves optional configuration out of readiness', async () => {
        const { element, ready } = await mount();
        expect(button(element, 'Finish setup').disabled).toBe(true);
        button(element, 'Finish setup').dispatchEvent(new CustomEvent('click'));
        expect(completeSetup).not.toHaveBeenCalled();
        confirm(element);
        await flush();
        expect(button(element, 'Finish setup').disabled).toBe(false);
        expect(element.shadowRoot.textContent).toContain('optional');
        completeSetup.mockResolvedValue({ ...adminStatus, ready: true });
        button(element, 'Finish setup').click();
        await flush();
        expect(completeSetup).toHaveBeenCalledWith({ confirmed: true });
        expect(ready.mock.calls[0][0].detail).toEqual({ completed: true });
    });
    it('keeps normal users in an administrator-wait state and allows read-only Refresh', async () => {
        getSetupStatus
            .mockResolvedValueOnce({
                ready: false,
                canManageSetup: false,
                canCompleteSetup: false,
                message: 'Await administrator setup.'
            })
            .mockResolvedValueOnce({ ready: true });
        const { element, ready } = await mount();
        expect(element.shadowRoot.textContent).toContain('Ask an app administrator');
        expect(button(element, 'Finish setup')).toBeUndefined();
        expect(element.shadowRoot.querySelector('lightning-record-edit-form')).toBeNull();
        button(element, 'Refresh').click();
        await flush();
        expect(ready).toHaveBeenCalledTimes(1);
        expect(completeSetup).not.toHaveBeenCalled();
    });
    it('shows a load failure and recovers by explicit Refresh without initialization', async () => {
        getSetupStatus
            .mockRejectedValueOnce(new Error('Status unavailable'))
            .mockResolvedValueOnce(adminStatus);
        const { element } = await mount();
        expect(element.shadowRoot.querySelector('[role="alert"]').textContent).toContain(
            'Status unavailable'
        );
        button(element, 'Refresh').click();
        await flush();
        expect(button(element, 'Finish setup')).toBeDefined();
        expect(completeSetup).not.toHaveBeenCalled();
    });
    it('blocks repeated completion while pending and retains confirmation after failure for explicit retry', async () => {
        let reject;
        completeSetup
            .mockImplementationOnce(
                () =>
                    new Promise((resolve, fail) => {
                        reject = fail;
                    })
            )
            .mockResolvedValueOnce({ ...adminStatus, ready: true });
        const { element, ready } = await mount();
        confirm(element);
        button(element, 'Finish setup').click();
        button(element, 'Finish setup').dispatchEvent(new CustomEvent('click'));
        await flush();
        expect(completeSetup).toHaveBeenCalledTimes(1);
        expect(button(element, 'Finish setup').disabled).toBe(true);
        reject(new Error('Could not initialize'));
        await flush();
        expect(ready).not.toHaveBeenCalled();
        expect(element.shadowRoot.querySelector('[role="alert"]').textContent).toContain(
            'Could not initialize'
        );
        expect(button(element, 'Finish setup').disabled).toBe(false);
        button(element, 'Finish setup').click();
        await flush();
        expect(ready).toHaveBeenCalledTimes(1);
    });
    it('does not initialize an unsupported organization currency', async () => {
        getSetupStatus.mockResolvedValue({
            ...adminStatus,
            organizationCurrencyCode: 'USD',
            canCompleteSetup: false,
            message: 'This release requires PHP.'
        });
        const { element } = await mount();
        confirm(element);
        await flush();
        expect(element.shadowRoot.textContent).toContain('USD');
        expect(button(element, 'Finish setup').disabled).toBe(true);
        expect(element.shadowRoot.querySelector('lightning-record-edit-form')).toBeNull();
        button(element, 'Finish setup').dispatchEvent(new CustomEvent('click'));
        expect(completeSetup).not.toHaveBeenCalled();
    });
    it('does not initialize an unsupported PHP organization when the server disables completion', async () => {
        getSetupStatus.mockResolvedValue({
            ...adminStatus,
            canCompleteSetup: false,
            message: 'Fresh setup requires a single-currency PHP organization.'
        });
        const { element, ready } = await mount();
        confirm(element);
        await flush();
        expect(element.shadowRoot.textContent).toContain('single-currency PHP organization');
        expect(button(element, 'Finish setup').disabled).toBe(true);
        expect(element.shadowRoot.querySelector('lightning-record-edit-form')).toBeNull();
        button(element, 'Finish setup').dispatchEvent(new CustomEvent('click'));
        expect(completeSetup).not.toHaveBeenCalled();
        expect(ready).not.toHaveBeenCalled();
    });
    it('shows an incomplete completion status as an alert without entering the workspace', async () => {
        completeSetup.mockResolvedValue({
            ...adminStatus,
            ready: false,
            canCompleteSetup: false,
            message: 'Setup configuration needs attention.'
        });
        const { element, ready } = await mount();
        confirm(element);
        button(element, 'Finish setup').click();
        await flush();
        expect(ready).not.toHaveBeenCalled();
        expect(element.shadowRoot.querySelector('[role="alert"]').textContent).toContain(
            'Setup configuration needs attention'
        );
        expect(button(element, 'Finish setup').disabled).toBe(true);
    });
    it('lets an administrator create a group and explicitly create a category for that group', async () => {
        const { element } = await mount();
        getAllExpenseGroups.emit([]);
        await flush();
        const group = element.shadowRoot.querySelector('[data-form="group"]');
        expect(button(element, 'Create category').disabled).toBe(true);
        group.dispatchEvent(new CustomEvent('success', { detail: { id: 'created-group' } }));
        await flush();
        expect(refreshApex).toHaveBeenCalledTimes(1);
        expect(button(element, 'Create category').disabled).toBe(false);
        const category = element.shadowRoot.querySelector('[data-form="category"]');
        category.submit = jest.fn();
        category.dispatchEvent(
            new CustomEvent('submit', {
                cancelable: true,
                detail: { fields: { Name: 'Groceries' } }
            })
        );
        expect(category.submit).toHaveBeenCalledWith({
            Name: 'Groceries',
            Expense_Group__c: 'created-group'
        });
        category.dispatchEvent(new CustomEvent('success', { detail: { id: 'created-category' } }));
        await flush();
        expect(element.shadowRoot.textContent).toContain('Category created');
        expect(completeSetup).not.toHaveBeenCalled();
    });
    it('ignores a status response after disconnect so it cannot open a stale workspace', async () => {
        let resolve;
        getSetupStatus.mockImplementationOnce(
            () =>
                new Promise(accept => {
                    resolve = accept;
                })
        );
        const { element, ready } = await mount();
        expect(element.shadowRoot.querySelector('lightning-spinner')).not.toBeNull();
        element.remove();
        resolve({ ready: true });
        await flush();
        expect(ready).not.toHaveBeenCalled();
    });
    it('shows optional group-read failure and permits retry without blocking currency confirmation', async () => {
        const { element } = await mount();
        getAllExpenseGroups.error({ message: 'Groups unavailable' });
        await flush();
        expect(element.shadowRoot.textContent).toContain('Groups unavailable');
        confirm(element);
        await flush();
        expect(button(element, 'Finish setup').disabled).toBe(false);
        button(element, 'Retry loading groups').click();
        await flush();
        expect(refreshApex).toHaveBeenCalledTimes(1);
        getAllExpenseGroups.emit([{ Id: 'existing', Name: 'Existing group' }]);
        await flush();
        expect(element.shadowRoot.textContent).not.toContain('Groups unavailable');
    });
});
