import { createElement } from 'lwc';
import { getRecord, notifyRecordUpdateAvailable } from 'lightning/uiRecordApi';
import RecurringExpenseModal from 'c/recurringExpenseModal';

const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};
const field = (element, name) => element.shadowRoot.querySelector(`[data-field="${name}"]`);
const button = (element, label) =>
    [...element.shadowRoot.querySelectorAll('lightning-button')].find(item => item.label === label);
const formFor = element => element.shadowRoot.querySelector('lightning-record-edit-form');
const footer = element => element.shadowRoot.querySelector('.slds-modal__footer');
const contextError = element => element.shadowRoot.querySelector('[data-record-context-error]');
const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((accept, fail) => {
        resolve = accept;
        reject = fail;
    });
    return { promise, resolve, reject };
};
const record = (id = 'template-a', category = 'food') => ({
    id,
    fields: {
        Category__c: { value: category },
        Bank_Assignment__c: { value: null },
        Bank__c: { value: null },
        Transaction_Type__c: { value: 'Cash' },
        Active__c: { value: true },
        Next_Run_Date__c: { value: '2026-10-10' }
    }
});
const change = (input, value) => {
    input.value = value;
    input.dispatchEvent(new CustomEvent('change', { detail: { value } }));
};
const submit = (form, values = {}) =>
    form.dispatchEvent(
        new CustomEvent('submit', {
            cancelable: true,
            detail: {
                fields: {
                    Name: 'Rent',
                    Active__c: true,
                    Start_Date__c: '2026-10-01',
                    End_Date__c: '2026-10-31',
                    ...values
                }
            }
        })
    );
const load = async element => {
    const form = formFor(element);
    form.submit = jest.fn();
    form.dispatchEvent(new CustomEvent('load'));
    await flush();
    element.shadowRoot
        .querySelectorAll('lightning-input-field, lightning-combobox')
        .forEach(input => {
            // Isolate our guards from Salesforce's native field validation.
            input.reportValidity = jest.fn().mockReturnValue(true);
        });
    return form;
};
const mount = async (edit = true) => {
    const element = createElement('c-recurring-expense-modal', { is: RecurringExpenseModal });
    element.categoryOptions = [
        { label: 'Food', value: 'food' },
        { label: 'Housing', value: 'housing' }
    ];
    element.bankOptions = [
        { label: 'Credit bank', value: 'credit', supportedTransactionTypes: ['Credit Card'] }
    ];
    if (edit) element.recordId = 'template-a';
    element.isOpen = true;
    document.body.appendChild(element);
    await flush();
    formFor(element).submit = jest.fn();
    return element;
};
const ready = async (edit = true) => {
    const element = await mount(edit);
    const form = await load(element);
    if (edit) getRecord.emit(record());
    else change(field(element, 'category'), 'food');
    await flush();
    return { element, form };
};
const failContext = async element => {
    getRecord.error({ message: 'Record details unavailable' });
    await flush();
    expect(contextError(element).textContent).toContain('Record details unavailable');
};

describe('recurring modal loading and retry lifecycle', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        notifyRecordUpdateAvailable.mockReset().mockResolvedValue();
    });
    afterEach(() => document.body.replaceChildren());

    it('hides the form before load and blocks editing until matching record context arrives', async () => {
        const element = await mount();
        expect(footer(element).classList.contains('slds-hide')).toBe(true);
        const form = await load(element);
        expect(button(element, 'Save').disabled).toBe(true);
        submit(form);
        expect(form.submit).not.toHaveBeenCalled();
        getRecord.emit(record('another-template', 'housing'));
        await flush();
        expect(button(element, 'Save').disabled).toBe(true);
        expect(field(element, 'category').value).toBe('');
        getRecord.emit(record());
        await flush();
        expect(footer(element).classList.contains('slds-hide')).toBe(false);
        expect(button(element, 'Save').disabled).toBe(false);
        expect(field(element, 'category').value).toBe('food');
    });

    it('waits for form load when record context arrives first', async () => {
        const element = await mount();
        getRecord.emit(record());
        await flush();
        expect(footer(element).classList.contains('slds-hide')).toBe(true);
        await load(element);
        expect(footer(element).classList.contains('slds-hide')).toBe(false);
    });

    it('shows an initial form-load error with usable Close and resets on reopening', async () => {
        const element = await mount(false);
        formFor(element).dispatchEvent(
            new CustomEvent('error', { detail: { message: 'Form load failed' } })
        );
        await flush();
        expect(element.shadowRoot.querySelector('[data-form-load-error]').textContent).toContain(
            'Form load failed'
        );
        expect(footer(element).classList.contains('slds-hide')).toBe(true);
        const closed = jest.fn();
        element.addEventListener('close', closed);
        element.shadowRoot.querySelector('[data-form-load-close]').click();
        expect(closed).toHaveBeenCalledTimes(1);
        element.isOpen = false;
        await flush();
        element.isOpen = true;
        await flush();
        await load(element);
        expect(element.shadowRoot.querySelector('[data-form-load-error]')).toBeNull();
        expect(footer(element).classList.contains('slds-hide')).toBe(false);
    });

    it('blocks on context error, then accepts fresh wire data during retry', async () => {
        const element = await mount();
        const form = await load(element);
        await failContext(element);
        submit(form);
        expect(form.submit).not.toHaveBeenCalled();
        const pending = deferred();
        notifyRecordUpdateAvailable.mockReturnValueOnce(pending.promise);
        button(element, 'Retry').click();
        await flush();
        expect(notifyRecordUpdateAvailable).toHaveBeenCalledWith([{ recordId: 'template-a' }]);
        expect(button(element, 'Save').disabled).toBe(true);
        // The notification stub does not refresh LDS: emit its response separately.
        getRecord.emit(record());
        pending.resolve();
        await flush();
        expect(contextError(element)).toBeNull();
        expect(button(element, 'Save').disabled).toBe(false);
        submit(form);
        expect(form.submit).toHaveBeenCalledTimes(1);
    });

    it('keeps an actionable error when reload rejects and permits a later retry', async () => {
        const element = await mount();
        await load(element);
        await failContext(element);
        notifyRecordUpdateAvailable.mockRejectedValueOnce(new Error('Reload failed'));
        button(element, 'Retry').click();
        await flush();
        expect(contextError(element).textContent).toContain('Reload failed');
        expect(button(element, 'Save').disabled).toBe(true);
        const pending = deferred();
        notifyRecordUpdateAvailable.mockReturnValueOnce(pending.promise);
        button(element, 'Retry').click();
        getRecord.emit(record());
        pending.resolve();
        await flush();
        expect(contextError(element)).toBeNull();
        expect(button(element, 'Save').disabled).toBe(false);
    });

    it('reports incomplete reload when notification resolves without fresh wire data', async () => {
        const element = await mount();
        await load(element);
        await failContext(element);
        button(element, 'Retry').click();
        await flush();
        expect(contextError(element).textContent).toContain('did not reload');
        expect(button(element, 'Save').disabled).toBe(true);
    });

    it.each(['resolve', 'reject'])(
        'ignores an old retry %s after reopening without unlocking the new load',
        async outcome => {
            const element = await mount();
            await load(element);
            await failContext(element);
            const pending = deferred();
            notifyRecordUpdateAvailable.mockReturnValueOnce(pending.promise);
            button(element, 'Retry').click();
            await flush();
            element.isOpen = false;
            await flush();
            element.isOpen = true;
            await flush();
            await load(element);
            if (outcome === 'resolve') pending.resolve();
            else pending.reject(new Error('Old retry failed'));
            await flush();
            expect(contextError(element)).toBeNull();
            expect(button(element, 'Save').disabled).toBe(true);
            expect(footer(element).classList.contains('slds-hide')).toBe(true);
            getRecord.emit(record('template-a', 'housing'));
            await flush();
            expect(field(element, 'category').value).toBe('housing');
            expect(button(element, 'Save').disabled).toBe(false);
        }
    );

    it.each(['resolve', 'reject'])(
        'ignores an old retry %s after changing the edited record',
        async outcome => {
            const element = await mount();
            await load(element);
            await failContext(element);
            const pending = deferred();
            notifyRecordUpdateAvailable.mockReturnValueOnce(pending.promise);
            button(element, 'Retry').click();
            element.recordId = 'template-b';
            await flush();
            getRecord.emit(record('template-b', 'housing'));
            await flush();
            if (outcome === 'resolve') pending.resolve();
            else pending.reject(new Error('Old record retry failed'));
            await flush();
            expect(contextError(element)).toBeNull();
            expect(field(element, 'category').value).toBe('housing');
            expect(button(element, 'Save').disabled).toBe(false);
        }
    );

    it('rejects reversed dates and submits after dates are corrected', async () => {
        const { element, form } = await ready();
        submit(form, { Start_Date__c: '2026-10-20', End_Date__c: '2026-10-10' });
        await flush();
        expect(form.submit).not.toHaveBeenCalled();
        expect(element.shadowRoot.querySelector('[data-date-error]').textContent).toContain(
            'End Date cannot be before Start Date'
        );
        change(field(element, 'start-date'), '2026-10-01');
        await flush();
        expect(element.shadowRoot.querySelector('[data-date-error]')).toBeNull();
        submit(form);
        expect(form.submit).toHaveBeenCalledWith(
            expect.objectContaining({ Start_Date__c: '2026-10-01', End_Date__c: '2026-10-31' })
        );
    });

    it('honors native field validation failure before submitting', async () => {
        const { element, form } = await ready();
        const name = element.shadowRoot.querySelector('[data-initial-focus]');
        name.reportValidity.mockReturnValueOnce(false);
        submit(form);
        expect(name.reportValidity).toHaveBeenCalledTimes(1);
        expect(form.submit).not.toHaveBeenCalled();
        submit(form);
        expect(form.submit).toHaveBeenCalledTimes(1);
    });

    it('blocks duplicate submission and closing while saving and preserves inputs on error for retry', async () => {
        const { element, form } = await ready();
        const closed = jest.fn();
        element.addEventListener('close', closed);
        change(field(element, 'category'), 'housing');
        change(field(element, 'bank'), 'credit');
        await flush();
        const name = element.shadowRoot.querySelector('[data-initial-focus]');
        name.value = 'Edited rent';
        submit(form, { Name: 'Edited rent' });
        // Synthetic duplicate submit exercises the handler guard, not a browser action.
        submit(form, { Name: 'Duplicate request' });
        await flush();
        expect(form.submit).toHaveBeenCalledTimes(1);
        expect(button(element, 'Saving...').disabled).toBe(true);
        expect(button(element, 'Cancel').disabled).toBe(true);
        expect(element.shadowRoot.querySelector('[data-modal-close]').disabled).toBe(true);
        expect(name.disabled).toBe(true);
        expect(element.shadowRoot.querySelector('[data-saving-status]')).not.toBeNull();
        expect(field(element, 'category').disabled).toBe(true);
        expect(field(element, 'bank').disabled).toBe(true);
        expect(field(element, 'transaction-type').disabled).toBe(true);
        // Dispatch directly to test the Close handler guard despite the disabled native button.
        element.shadowRoot
            .querySelector('[data-modal-close]')
            .dispatchEvent(new CustomEvent('click'));
        element.shadowRoot
            .querySelector('.slds-modal')
            .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(closed).not.toHaveBeenCalled();
        form.dispatchEvent(new CustomEvent('error', { detail: { message: 'Save failed' } }));
        await flush();
        expect(element.shadowRoot.querySelector('[data-form-error]').textContent).toContain(
            'Save failed'
        );
        expect(field(element, 'category').value).toBe('housing');
        expect(field(element, 'bank').value).toBe('credit');
        expect(field(element, 'transaction-type').value).toBe('Credit Card');
        expect(name.value).toBe('Edited rent');
        expect(closed).not.toHaveBeenCalled();
        expect(button(element, 'Save').disabled).toBe(false);
        submit(form, { Name: 'Edited rent' });
        expect(form.submit).toHaveBeenCalledTimes(2);
        expect(form.submit).toHaveBeenLastCalledWith(
            expect.objectContaining({
                Name: 'Edited rent',
                Category__c: 'housing',
                Bank_Assignment__c: 'credit',
                Transaction_Type__c: 'Credit Card'
            })
        );
    });

    it.each([true, false])(
        'emits saved record and correct mode before requesting close (edit=%s)',
        async edit => {
            const { element, form } = await ready(edit);
            const saved = jest.fn();
            const closed = jest.fn();
            element.addEventListener('success', saved);
            element.addEventListener('close', closed);
            submit(form);
            form.dispatchEvent(new CustomEvent('success', { detail: { id: 'saved-template' } }));
            await flush();
            expect(saved).toHaveBeenCalledTimes(1);
            expect(saved.mock.calls[0][0].detail).toEqual({
                recordId: 'saved-template',
                mode: edit ? 'edit' : 'create'
            });
            expect(closed).toHaveBeenCalledTimes(1);
            expect(saved.mock.invocationCallOrder[0]).toBeLessThan(
                closed.mock.invocationCallOrder[0]
            );
            // The parent owns isOpen; the child requests closure without mutating the public property.
            expect(element.isOpen).toBe(true);
            expect(button(element, 'Save').disabled).toBe(false);
        }
    );
});
