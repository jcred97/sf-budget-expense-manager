import { createElement } from 'lwc';
import { getRecord } from 'lightning/uiRecordApi';
import ExpenseModal from 'c/expenseModal';

jest.mock('@salesforce/apex/ExchangeRateController.getPhpRate', () => ({ default: jest.fn() }), {
    virtual: true
});

const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
};
const snapshot = {
    Category__c: 'groceries',
    Expense_Date__c: '2026-10-01',
    Amount__c: 567.5,
    Original_Amount__c: 10,
    Original_Currency_Code__c: 'USD',
    Exchange_Rate_To_PHP__c: 56.75,
    Exchange_Rate_Date__c: '2026-09-30',
    Exchange_Rate_Source__c: 'ECB via Frankfurter',
    Transaction_Type__c: 'Cash'
};
const input = (element, field) => element.shadowRoot.querySelector(`[data-field="${field}"]`);

async function mount({ edit, duplicate } = {}) {
    const element = createElement('c-expense-modal', { is: ExpenseModal });
    element.categoryOptions = [{ label: 'Groceries', value: 'groceries' }];
    if (edit) element.recordId = 'expense-record';
    if (duplicate) element.duplicateData = duplicate;
    element.isOpen = true;
    document.body.appendChild(element);
    await flush();
    const form = element.shadowRoot.querySelector('lightning-record-edit-form');
    const fields = Object.fromEntries(
        Object.entries(edit || {}).map(([name, value]) => [name, { value }])
    );
    form.dispatchEvent(
        new CustomEvent('load', { detail: { records: { 'expense-record': { fields } } } })
    );
    if (edit) getRecord.emit({ id: 'expense-record', fields });
    await flush();
    element.shadowRoot.querySelectorAll('lightning-combobox, [data-fx-input]').forEach(field => {
        field.reportValidity = jest.fn().mockReturnValue(true);
    });
    form.submit = jest.fn();
    return { element, form };
}

async function change(element, field, value) {
    const fieldInput = input(element, field);
    fieldInput.value = value;
    fieldInput.dispatchEvent(new CustomEvent('change', { detail: { value } }));
    await flush();
}

async function toggle(element, checked) {
    const field = [...element.shadowRoot.querySelectorAll('lightning-input')].find(
        candidate => candidate.type === 'toggle'
    );
    field.checked = checked;
    field.dispatchEvent(new CustomEvent('change'));
    await flush();
}

function submit(form, fields = {}) {
    form.dispatchEvent(
        new CustomEvent('submit', {
            cancelable: true,
            detail: { fields: { Name: 'Lunch', ...fields } }
        })
    );
}

async function enterManualSnapshot(element) {
    await toggle(element, true);
    await change(element, 'category', 'groceries');
    const dateField = [...element.shadowRoot.querySelectorAll('lightning-input-field')].find(
        candidate => candidate.fieldName === 'Expense_Date__c'
    );
    dateField.dispatchEvent(new CustomEvent('change', { detail: { value: '2026-10-01' } }));
    await change(element, 'originalCurrency', 'usd');
    await change(element, 'originalAmount', '1');
    await change(element, 'exchangeRate', '1.005');
}

afterEach(() => {
    document.body.replaceChildren();
    jest.clearAllMocks();
});

describe('foreign-currency snapshot submission', () => {
    it('submits a complete manual snapshot and rounds the canonical PHP amount half up', async () => {
        const { element, form } = await mount();
        await enterManualSnapshot(element);
        expect(element.shadowRoot.textContent).toContain('₱1.01');
        submit(form, { Amount__c: 999, Expense_Date__c: '2026-10-01' });
        expect(form.submit).toHaveBeenCalledTimes(1);
        expect(form.submit.mock.calls[0][0]).toEqual({
            Name: 'Lunch',
            Expense_Date__c: '2026-10-01',
            Category__c: 'groceries',
            Amount__c: '1.01',
            Original_Amount__c: '1',
            Original_Currency_Code__c: 'USD',
            Exchange_Rate_To_PHP__c: '1.005',
            Exchange_Rate_Date__c: '2026-10-01',
            Exchange_Rate_Source__c: 'Manual',
            Transaction_Type__c: 'Cash',
            Transaction_Time__c: null,
            Bank_Assignment__c: null
        });
    });

    it('clears every foreign field when returning to PHP and keeps the converted amount', async () => {
        const { element, form } = await mount({ edit: snapshot });
        await toggle(element, false);
        const phpAmount = input(element, 'phpAmount');
        expect(phpAmount.value).toBe('567.50');
        expect(phpAmount.disabled).toBe(false);
        // LDS includes the visible Amount field in its submit event.
        submit(form, { ...snapshot, Amount__c: phpAmount.value });
        expect(form.submit).toHaveBeenCalledTimes(1);
        expect(form.submit.mock.calls[0][0]).toMatchObject({
            Amount__c: '567.50',
            Original_Amount__c: null,
            Original_Currency_Code__c: null,
            Exchange_Rate_To_PHP__c: null,
            Exchange_Rate_Date__c: null,
            Exchange_Rate_Source__c: null
        });
    });

    it.each(['edit', 'duplicate'])(
        'preserves the original snapshot during an unrelated %s save',
        async mode => {
            const { element, form } = await mount({ [mode]: snapshot });
            expect(input(element, 'originalCurrency').value).toBe('USD');
            expect(input(element, 'originalAmount').value).toBe('10');
            expect(input(element, 'exchangeRate').value).toBe('56.75');
            expect(element.shadowRoot.textContent).toContain('ECB via Frankfurter');
            submit(form, { Name: 'Renamed lunch', Amount__c: 999 });
            expect(form.submit).toHaveBeenCalledTimes(1);
            expect(form.submit.mock.calls[0][0]).toMatchObject({
                Name: 'Renamed lunch',
                Amount__c: '567.50',
                Original_Amount__c: '10',
                Original_Currency_Code__c: 'USD',
                Exchange_Rate_To_PHP__c: '56.75',
                Exchange_Rate_Date__c: '2026-09-30',
                Exchange_Rate_Source__c: 'ECB via Frankfurter'
            });
        }
    );

    it('does not submit when a foreign input fails Lightning validity checks', async () => {
        const { element, form } = await mount();
        await enterManualSnapshot(element);
        const amount = input(element, 'originalAmount');
        amount.reportValidity.mockReturnValue(false);
        submit(form);
        expect(amount.reportValidity).toHaveBeenCalled();
        expect(form.submit).not.toHaveBeenCalled();
    });

    it('blocks an invalid conversion even when Lightning stubs report valid inputs', async () => {
        const { element, form } = await mount();
        await enterManualSnapshot(element);
        await change(element, 'originalAmount', '0');
        submit(form);
        await flush();
        expect(form.submit).not.toHaveBeenCalled();
        expect(element.shadowRoot.textContent).toContain(
            'Enter a valid exchange rate or get a reference rate before saving.'
        );
    });

    it.each(['Exchange_Rate_Date__c', 'Exchange_Rate_Source__c'])(
        'blocks an incomplete saved snapshot missing %s even if visible fields pass validation',
        async missingField => {
            const { element, form } = await mount({ edit: { ...snapshot, [missingField]: null } });
            submit(form);
            await flush();
            expect(form.submit).not.toHaveBeenCalled();
            expect(element.shadowRoot.textContent).toContain(
                'Enter a valid exchange rate or get a reference rate before saving.'
            );
        }
    );
});
