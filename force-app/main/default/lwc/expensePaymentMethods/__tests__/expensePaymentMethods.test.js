import { createElement } from 'lwc';
import { getRecord } from 'lightning/uiRecordApi';
import ExpenseModal from 'c/expenseModal';
import RecurringExpenseModal from 'c/recurringExpenseModal';
import { paymentMethodOptions } from 'c/expensePaymentMethods';

jest.mock('@salesforce/apex/ExchangeRateController.getPhpRate', () => ({ default: jest.fn() }), {
    virtual: true
});

const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
};
const banks = [
    { label: 'Debit bank', value: 'debit', supportedTransactionTypes: ['Debit Card'] },
    { label: 'Credit bank', value: 'credit', supportedTransactionTypes: ['Credit Card'] }
];

function change(element, field, value) {
    element.shadowRoot
        .querySelector(`[data-field="${field}"]`)
        .dispatchEvent(new CustomEvent('change', { detail: { value } }));
}

async function openModal(
    component,
    { edit = false, savedType = 'Bank Payment', bank = 'debit', duplicate, loading = false } = {}
) {
    const element = createElement('c-payment-test', { is: component });
    element.categoryOptions = [{ label: 'Food', value: 'category' }];
    element.bankOptions = banks;
    element.bankOptionsLoading = loading;
    if (duplicate) element.duplicateData = duplicate;
    if (edit) element.recordId = 'record';
    element.isOpen = true;
    document.body.appendChild(element);
    await flush();
    const form = element.shadowRoot.querySelector('lightning-record-edit-form');
    form.submit = jest.fn();
    const fields = Object.fromEntries(
        Object.entries({
            Category__c: 'category',
            Bank_Assignment__c: bank,
            Transaction_Type__c: savedType,
            Active__c: true,
            Next_Run_Date__c: '2026-10-03'
        }).map(([key, value]) => [key, { value }])
    );
    form.dispatchEvent(new CustomEvent('load', { detail: { records: { record: { fields } } } }));
    if (edit) getRecord.emit({ id: 'record', fields });
    await flush();
    element.shadowRoot
        .querySelectorAll('lightning-input-field, lightning-combobox')
        .forEach(input => {
            input.reportValidity = jest.fn().mockReturnValue(true);
        });
    return { element, form };
}

function submit(form) {
    form.dispatchEvent(
        new CustomEvent('submit', {
            cancelable: true,
            detail: { fields: { Name: 'Lunch', Active__c: true } }
        })
    );
}

afterEach(() => {
    document.body.replaceChildren();
    jest.clearAllMocks();
});

describe.each([
    ['expense', ExpenseModal],
    ['recurring', RecurringExpenseModal]
])('%s payment methods', (name, component) => {
    it('defaults to Cash without a bank and exposes only the selected bank methods', async () => {
        const { element, form } = await openModal(component);
        const selector = element.shadowRoot.querySelector('[data-field="transaction-type"]');
        expect(selector.value).toBe('Cash');
        expect(selector.options.map(option => option.value)).toEqual(['Cash']);
        change(element, 'bank', 'debit');
        await flush();
        expect(selector.options.map(option => option.value)).toEqual(['Cash', 'Debit Card']);
        change(element, 'transaction-type', 'Debit Card');
        submit(form);
        expect(form.submit).toHaveBeenCalledWith(
            expect.objectContaining({ Transaction_Type__c: 'Debit Card' })
        );
    });

    it('resets an unsupported method to Cash when the bank changes or is cleared', async () => {
        const { element } = await openModal(component);
        change(element, 'bank', 'debit');
        change(element, 'transaction-type', 'Debit Card');
        change(element, 'bank', 'credit');
        await flush();
        const selector = element.shadowRoot.querySelector('[data-field="transaction-type"]');
        expect(selector.value).toBe('Cash');
        change(element, 'transaction-type', 'Credit Card');
        change(element, 'bank', '__NO_BANK__');
        await flush();
        expect(selector.value).toBe('Cash');
        expect(selector.options.map(option => option.value)).toEqual(['Cash']);
    });

    it('preserves a saved unavailable method until the bank is changed', async () => {
        const { element, form } = await openModal(component, { edit: true });
        const selector = element.shadowRoot.querySelector('[data-field="transaction-type"]');
        expect(selector.value).toBe('Bank Payment');
        expect(selector.options.find(option => option.value === 'Bank Payment').label).toContain(
            'Saved'
        );
        submit(form);
        expect(form.submit).toHaveBeenCalledWith(
            expect.objectContaining({ Transaction_Type__c: 'Bank Payment' })
        );
        // A failed save releases the form for another edit.
        form.dispatchEvent(new CustomEvent('error', { detail: { message: 'Retry' } }));
        change(element, 'bank', 'credit');
        await flush();
        expect(selector.value).toBe('Cash');
        expect(selector.options.some(option => option.value === 'Bank Payment')).toBe(false);
    });

    it('preserves a blank historical type and a legacy noncash type without a bank', async () => {
        const blank = await openModal(component, { edit: true, savedType: null, bank: null });
        submit(blank.form);
        expect(blank.form.submit).toHaveBeenCalledWith(
            expect.objectContaining({ Transaction_Type__c: null })
        );
        document.body.replaceChildren();
        const legacy = await openModal(component, {
            edit: true,
            savedType: 'Credit Card',
            bank: null
        });
        submit(legacy.form);
        expect(legacy.form.submit).toHaveBeenCalledWith(
            expect.objectContaining({ Transaction_Type__c: 'Credit Card' })
        );
    });

    it('waits for bank loading and blocks submission on bank lookup failure', async () => {
        const { element, form } = await openModal(component, { loading: true });
        submit(form);
        expect(form.submit).not.toHaveBeenCalled();
        element.bankOptionsLoading = false;
        element.bankOptionsError = 'Lookup failed';
        await flush();
        submit(form);
        expect(form.submit).not.toHaveBeenCalled();
        expect(element.shadowRoot.querySelector('[data-field="transaction-type"]').disabled).toBe(
            true
        );
        element.bankOptionsError = '';
        await flush();
        submit(form);
        expect(form.submit).toHaveBeenCalledWith(
            expect.objectContaining({ Transaction_Type__c: 'Cash' })
        );
    });

    it('does not restore the historical method after a context refresh', async () => {
        const { element } = await openModal(component, { edit: true });
        change(element, 'bank', 'credit');
        change(element, 'transaction-type', 'Credit Card');
        getRecord.emit({
            id: 'record',
            fields: {
                Transaction_Type__c: { value: 'Bank Payment' },
                Bank_Assignment__c: { value: 'debit' }
            }
        });
        await flush();
        expect(element.shadowRoot.querySelector('[data-field="transaction-type"]').value).toBe(
            'Credit Card'
        );
    });
});

it('does not grandfather an unsupported method when duplicating an expense', async () => {
    const { element, form } = await openModal(ExpenseModal, {
        duplicate: { Bank_Assignment__c: 'debit', Transaction_Type__c: 'Credit Card' }
    });
    expect(element.shadowRoot.querySelector('[data-field="transaction-type"]').value).toBe('Cash');
    submit(form);
    expect(form.submit).toHaveBeenCalledWith(
        expect.objectContaining({ Transaction_Type__c: 'Cash' })
    );
});

it('keeps a supported duplicated method and resets Save & New to Cash', async () => {
    const { element, form } = await openModal(ExpenseModal, {
        duplicate: { Bank_Assignment__c: 'debit', Transaction_Type__c: 'Debit Card' }
    });
    expect(element.shadowRoot.querySelector('[data-field="transaction-type"]').value).toBe(
        'Debit Card'
    );
    [...element.shadowRoot.querySelectorAll('lightning-button')]
        .find(button => button.label === 'Save & New')
        .click();
    submit(form);
    form.dispatchEvent(new CustomEvent('success'));
    await flush();
    const selector = element.shadowRoot.querySelector('[data-field="transaction-type"]');
    expect(selector.value).toBe('Cash');
    expect(selector.options.map(option => option.value)).toEqual(['Cash']);
});

it('offers Cash alone for a bank whose capability list is empty or absent', () => {
    expect(paymentMethodOptions([{ value: 'bank' }], 'bank', null, false)).toEqual([
        { label: 'Cash', value: 'Cash' }
    ]);
});

it('reloads the saved payment method when reopening the same expense', async () => {
    const { element } = await openModal(ExpenseModal, { edit: true });
    change(element, 'transaction-type', 'Cash');
    element.isOpen = false;
    await flush();
    element.isOpen = true;
    await flush();
    getRecord.emit({ id: 'record', fields: { Transaction_Type__c: { value: 'Debit Card' } } });
    const form = element.shadowRoot.querySelector('lightning-record-edit-form');
    form.dispatchEvent(
        new CustomEvent('load', {
            detail: { records: { record: { fields: { Bank_Assignment__c: { value: 'debit' } } } } }
        })
    );
    await flush();
    expect(element.shadowRoot.querySelector('[data-field="transaction-type"]').value).toBe(
        'Debit Card'
    );
});

it('keeps a loaded expense editable when its record ID is assigned again', async () => {
    const { element, form } = await openModal(ExpenseModal, { edit: true });
    change(element, 'transaction-type', 'Debit Card');
    element.recordId = 'record';
    await flush();
    submit(form);
    expect(form.submit).toHaveBeenCalledWith(
        expect.objectContaining({ Transaction_Type__c: 'Debit Card' })
    );
});

it('retains a supported duplicate until asynchronous bank capabilities settle', async () => {
    const { element } = await openModal(ExpenseModal, {
        loading: true,
        duplicate: { Bank_Assignment__c: 'debit', Transaction_Type__c: 'Debit Card' }
    });
    element.bankOptions = [];
    await flush();
    expect(element.shadowRoot.querySelector('[data-field="transaction-type"]').value).toBe(
        'Debit Card'
    );
    element.bankOptions = banks;
    element.bankOptionsLoading = false;
    await flush();
    expect(element.shadowRoot.querySelector('[data-field="transaction-type"]').value).toBe(
        'Debit Card'
    );
});

it('blocks an expense edit until the payment context loads and offers recovery on failure', async () => {
    const element = createElement('c-expense-modal', { is: ExpenseModal });
    element.categoryOptions = [{ label: 'Food', value: 'category' }];
    element.recordId = 'record';
    element.isOpen = true;
    document.body.appendChild(element);
    await flush();
    const form = element.shadowRoot.querySelector('lightning-record-edit-form');
    form.submit = jest.fn();
    form.dispatchEvent(new CustomEvent('load', { detail: {} }));
    submit(form);
    expect(form.submit).not.toHaveBeenCalled();
    getRecord.error({ message: 'Saved payment unavailable' });
    await flush();
    submit(form);
    expect(form.submit).not.toHaveBeenCalled();
    expect(element.shadowRoot.querySelector('[data-payment-context-error]').textContent).toContain(
        'Saved payment unavailable'
    );
    expect(element.shadowRoot.querySelector('[data-modal-close]').disabled).toBe(false);
    expect(
        element.shadowRoot.querySelector('.slds-modal__footer').classList.contains('slds-hide')
    ).toBe(true);
});
