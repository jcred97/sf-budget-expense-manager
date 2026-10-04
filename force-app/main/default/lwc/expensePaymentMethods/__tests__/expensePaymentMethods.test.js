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
    {
        edit = false,
        savedType = 'Bank Payment',
        bank = 'debit',
        duplicate,
        loading = false,
        legacyBank = '',
        active = true
    } = {}
) {
    const element = createElement('c-payment-test', { is: component });
    element.categoryOptions = [{ label: 'Food', value: 'category' }];
    element.bankOptions = banks;
    element.bankOptionsLoading = loading;
    if (duplicate) element.duplicateData = duplicate;
    if (edit) element.recordId = 'record';
    if (legacyBank && component === ExpenseModal) element.currentBank = { legacyBank };
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
            Bank__c: legacyBank,
            Active__c: active,
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

describe('recurring No bank selection', () => {
    it.each([
        ['an active assignment', 'debit', '', true],
        ['an inactive assignment', 'archived', '', false],
        ['a legacy bank', null, 'Old bank', true]
    ])('clears %s without adding a fake inactive bank', async (name, bank, legacyBank, active) => {
        const { element, form } = await openModal(RecurringExpenseModal, {
            edit: true,
            bank,
            legacyBank,
            active,
            savedType: 'Debit Card'
        });
        change(element, 'bank', '__NO_BANK__');
        await flush();
        const bankInput = element.shadowRoot.querySelector('[data-field="bank"]');
        expect(bankInput.value).toBe('__NO_BANK__');
        expect(bankInput.options.filter(option => option.value === '__NO_BANK__')).toEqual([
            { label: 'No bank', value: '__NO_BANK__' }
        ]);
        expect(bankInput.options.some(option => option.inactive)).toBe(false);
        expect(element.shadowRoot.textContent).not.toContain('is inactive');
        expect(element.shadowRoot.textContent).not.toContain('Legacy bank:');
        const typeInput = element.shadowRoot.querySelector('[data-field="transaction-type"]');
        expect(typeInput.value).toBe('Cash');
        submit(form);
        expect(form.submit).toHaveBeenCalledWith(
            expect.objectContaining({
                Active__c: true,
                Bank_Assignment__c: null,
                Bank__c: null,
                Transaction_Type__c: 'Cash'
            })
        );
    });

    it('retains an untouched inactive assignment and blocks reactivation until it is changed', async () => {
        const { element, form } = await openModal(RecurringExpenseModal, {
            edit: true,
            bank: 'archived',
            active: false,
            savedType: 'Debit Card'
        });
        const bankInput = element.shadowRoot.querySelector('[data-field="bank"]');
        expect(bankInput.options.filter(option => option.value === '__NO_BANK__')).toHaveLength(1);
        expect(bankInput.options.find(option => option.value === 'archived')).toEqual(
            expect.objectContaining({ value: 'archived', inactive: true })
        );
        expect(element.shadowRoot.textContent).toContain('is inactive');
        form.dispatchEvent(
            new CustomEvent('submit', {
                cancelable: true,
                detail: { fields: { Name: 'Historical template', Active__c: false } }
            })
        );
        expect(form.submit).toHaveBeenCalledWith(
            expect.objectContaining({
                Active__c: false,
                Bank_Assignment__c: 'archived',
                Transaction_Type__c: 'Debit Card'
            })
        );
        form.dispatchEvent(new CustomEvent('error', { detail: { message: 'Retry' } }));
        form.submit.mockClear();
        submit(form);
        await flush();
        expect(form.submit).not.toHaveBeenCalled();
        expect(element.shadowRoot.querySelector('[data-form-error]').textContent).toContain(
            'Choose an active bank or No bank before reactivating'
        );
    });
});

describe.each([
    ['expense', ExpenseModal],
    ['recurring', RecurringExpenseModal]
])('%s payment methods', (name, component) => {
    it('places Bank before Transaction Type in the form', async () => {
        const { element } = await openModal(component);
        const fields = [...element.shadowRoot.querySelectorAll('lightning-combobox')].map(
            input => input.dataset.field
        );
        expect(fields.indexOf('bank')).toBeLessThan(fields.indexOf('transaction-type'));
    });

    it('blocks a bank with no enabled methods and recovers by choosing No bank', async () => {
        const { element, form } = await openModal(component);
        element.bankOptions = [
            { value: 'empty', label: 'No methods', supportedTransactionTypes: [] }
        ];
        change(element, 'bank', 'empty');
        await flush();
        const selector = element.shadowRoot.querySelector('[data-field="transaction-type"]');
        expect(selector.value).toBe('');
        expect(selector.options).toEqual([]);
        expect(
            element.shadowRoot.querySelector('[data-payment-method-error]').textContent
        ).toContain('Choose No bank for Cash');
        submit(form);
        expect(form.submit).not.toHaveBeenCalled();
        change(element, 'bank', '__NO_BANK__');
        await flush();
        expect(selector.value).toBe('Cash');
        submit(form);
        expect(form.submit).toHaveBeenCalledWith(
            expect.objectContaining({ Transaction_Type__c: 'Cash', Bank_Assignment__c: null })
        );
    });

    it('preserves historical Cash with a bank until the bank is changed', async () => {
        const { element, form } = await openModal(component, { edit: true, savedType: 'Cash' });
        const selector = element.shadowRoot.querySelector('[data-field="transaction-type"]');
        expect(selector.value).toBe('Cash');
        expect(selector.options.find(option => option.value === 'Cash').label).toContain('Saved');
        submit(form);
        expect(form.submit).toHaveBeenCalledWith(
            expect.objectContaining({ Transaction_Type__c: 'Cash' })
        );
        form.dispatchEvent(new CustomEvent('error', { detail: { message: 'Retry' } }));
        change(element, 'bank', 'credit');
        await flush();
        expect(selector.value).toBe('Credit Card');
        expect(selector.options.some(option => option.value === 'Cash')).toBe(false);
        element.bankOptions = [{ value: 'empty', supportedTransactionTypes: [] }];
        change(element, 'bank', 'empty');
        await flush();
        form.submit.mockClear();
        submit(form);
        expect(form.submit).not.toHaveBeenCalled();
    });

    it('defaults to Cash without a bank and exposes only the selected bank methods', async () => {
        const { element, form } = await openModal(component);
        expect(element.shadowRoot.querySelector('[data-field="bank"]').value).toBe('__NO_BANK__');
        const selector = element.shadowRoot.querySelector('[data-field="transaction-type"]');
        expect(selector.value).toBe('Cash');
        expect(selector.options.map(option => option.value)).toEqual(['Cash']);
        change(element, 'bank', 'debit');
        await flush();
        expect(selector.options.map(option => option.value)).toEqual(['Debit Card']);
        change(element, 'transaction-type', 'Debit Card');
        submit(form);
        expect(form.submit).toHaveBeenCalledWith(
            expect.objectContaining({ Transaction_Type__c: 'Debit Card' })
        );
    });

    it('selects the first enabled method on bank change and Cash when the bank is cleared', async () => {
        const { element } = await openModal(component);
        change(element, 'bank', 'debit');
        change(element, 'transaction-type', 'Debit Card');
        change(element, 'bank', 'credit');
        await flush();
        const selector = element.shadowRoot.querySelector('[data-field="transaction-type"]');
        expect(selector.value).toBe('Credit Card');
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
        expect(selector.value).toBe('Credit Card');
        expect(selector.options.some(option => option.value === 'Bank Payment')).toBe(false);
    });

    it('preserves an untouched historical method even when all bank methods are disabled', async () => {
        const { element, form } = await openModal(component, { edit: true });
        element.bankOptions = [{ value: 'debit', supportedTransactionTypes: [] }];
        await flush();
        const selector = element.shadowRoot.querySelector('[data-field="transaction-type"]');
        expect(selector.value).toBe('Bank Payment');
        expect(selector.options.map(option => option.value)).toEqual(['Bank Payment']);
        submit(form);
        expect(form.submit).toHaveBeenCalledWith(
            expect.objectContaining({ Transaction_Type__c: 'Bank Payment' })
        );
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

    it('offers only the saved method for a legacy bank until No bank is explicitly chosen', async () => {
        const { element, form } = await openModal(component, {
            edit: true,
            bank: null,
            savedType: 'Credit Card',
            legacyBank: 'Old bank'
        });
        const selector = element.shadowRoot.querySelector('[data-field="transaction-type"]');
        expect(selector.options.map(option => option.value)).toEqual(['Credit Card']);
        expect(selector.options[0].label).toContain('Saved');
        change(element, 'bank', '__NO_BANK__');
        await flush();
        expect(selector.value).toBe('Cash');
        expect(selector.options.map(option => option.value)).toEqual(['Cash']);
        submit(form);
        expect(form.submit).toHaveBeenCalledWith(
            expect.objectContaining({
                Transaction_Type__c: 'Cash',
                Bank_Assignment__c: null,
                Bank__c: null
            })
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
    expect(element.shadowRoot.querySelector('[data-field="transaction-type"]').value).toBe(
        'Debit Card'
    );
    submit(form);
    expect(form.submit).toHaveBeenCalledWith(
        expect.objectContaining({ Transaction_Type__c: 'Debit Card' })
    );
});

it('blocks a duplicate with a bank that has no enabled payment methods', async () => {
    const { element, form } = await openModal(ExpenseModal, {
        duplicate: { Bank_Assignment__c: 'debit', Transaction_Type__c: 'Cash' }
    });
    element.bankOptions = [{ value: 'debit', supportedTransactionTypes: [] }];
    await flush();
    expect(element.shadowRoot.querySelector('[data-field="transaction-type"]').value).toBe('');
    submit(form);
    expect(form.submit).not.toHaveBeenCalled();
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

it('offers no methods for a bank whose capability list is empty or absent', () => {
    expect(paymentMethodOptions([{ value: 'bank' }], 'bank', null, false)).toEqual([]);
    expect(
        paymentMethodOptions(
            [{ value: 'bank', supportedTransactionTypes: [] }],
            'bank',
            null,
            false
        )
    ).toEqual([]);
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
