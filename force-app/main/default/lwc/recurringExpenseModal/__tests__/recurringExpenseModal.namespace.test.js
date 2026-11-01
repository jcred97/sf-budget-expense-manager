import { createElement } from 'lwc';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';
import { getRecord } from 'lightning/uiRecordApi';
import RecurringExpenseModal from 'c/recurringExpenseModal';

jest.mock(
    '@salesforce/schema/Recurring_Expense__c',
    () => ({ default: { objectApiName: 'bemgr__Recurring_Expense__c' } }),
    { virtual: true }
);
jest.mock(
    '@salesforce/schema/Recurring_Expense__c.Id',
    () => ({ default: { objectApiName: 'bemgr__Recurring_Expense__c', fieldApiName: 'Id' } }),
    { virtual: true }
);
jest.mock(
    '@salesforce/schema/Recurring_Expense__c.Name',
    () => ({ default: { objectApiName: 'bemgr__Recurring_Expense__c', fieldApiName: 'Name' } }),
    { virtual: true }
);
jest.mock(
    '@salesforce/schema/Recurring_Expense__c.Amount__c',
    () => ({
        default: { objectApiName: 'bemgr__Recurring_Expense__c', fieldApiName: 'bemgr__Amount__c' }
    }),
    { virtual: true }
);
jest.mock(
    '@salesforce/schema/Recurring_Expense__c.Description__c',
    () => ({
        default: {
            objectApiName: 'bemgr__Recurring_Expense__c',
            fieldApiName: 'bemgr__Description__c'
        }
    }),
    { virtual: true }
);
jest.mock(
    '@salesforce/schema/Recurring_Expense__c.Frequency__c',
    () => ({
        default: {
            objectApiName: 'bemgr__Recurring_Expense__c',
            fieldApiName: 'bemgr__Frequency__c'
        }
    }),
    { virtual: true }
);
jest.mock(
    '@salesforce/schema/Recurring_Expense__c.Start_Date__c',
    () => ({
        default: {
            objectApiName: 'bemgr__Recurring_Expense__c',
            fieldApiName: 'bemgr__Start_Date__c'
        }
    }),
    { virtual: true }
);
jest.mock(
    '@salesforce/schema/Recurring_Expense__c.End_Date__c',
    () => ({
        default: {
            objectApiName: 'bemgr__Recurring_Expense__c',
            fieldApiName: 'bemgr__End_Date__c'
        }
    }),
    { virtual: true }
);
jest.mock(
    '@salesforce/schema/Recurring_Expense__c.Active__c',
    () => ({
        default: { objectApiName: 'bemgr__Recurring_Expense__c', fieldApiName: 'bemgr__Active__c' }
    }),
    { virtual: true }
);
jest.mock(
    '@salesforce/schema/Recurring_Expense__c.Category__c',
    () => ({
        default: {
            objectApiName: 'bemgr__Recurring_Expense__c',
            fieldApiName: 'bemgr__Category__c'
        }
    }),
    { virtual: true }
);
jest.mock(
    '@salesforce/schema/Recurring_Expense__c.Bank_Assignment__c',
    () => ({
        default: {
            objectApiName: 'bemgr__Recurring_Expense__c',
            fieldApiName: 'bemgr__Bank_Assignment__c'
        }
    }),
    { virtual: true }
);
jest.mock(
    '@salesforce/schema/Recurring_Expense__c.Bank__c',
    () => ({
        default: { objectApiName: 'bemgr__Recurring_Expense__c', fieldApiName: 'bemgr__Bank__c' }
    }),
    { virtual: true }
);
jest.mock(
    '@salesforce/schema/Recurring_Expense__c.Transaction_Type__c',
    () => ({
        default: {
            objectApiName: 'bemgr__Recurring_Expense__c',
            fieldApiName: 'bemgr__Transaction_Type__c'
        }
    }),
    { virtual: true }
);
jest.mock(
    '@salesforce/schema/Recurring_Expense__c.Next_Run_Date__c',
    () => ({
        default: {
            objectApiName: 'bemgr__Recurring_Expense__c',
            fieldApiName: 'bemgr__Next_Run_Date__c'
        }
    }),
    { virtual: true }
);

const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};
const qualified = name => (name.endsWith('__c') ? `bemgr__${name}` : name);
const metadata = () => ({
    apiName: 'bemgr__Recurring_Expense__c',
    queryable: true,
    createable: true,
    updateable: true,
    fields: Object.fromEntries(
        [
            'Name',
            'Amount__c',
            'Description__c',
            'Frequency__c',
            'Start_Date__c',
            'End_Date__c',
            'Active__c',
            'Category__c',
            'Bank_Assignment__c',
            'Bank__c',
            'Transaction_Type__c',
            'Next_Run_Date__c'
        ].map(name => [
            qualified(name),
            { apiName: qualified(name), createable: true, updateable: true }
        ])
    )
});
const field = (element, name) => element.shadowRoot.querySelector(`[data-field="${name}"]`);
const change = (input, value) =>
    input.dispatchEvent(new CustomEvent('change', { detail: { value } }));
const submit = (form, values = {}) =>
    form.dispatchEvent(
        new CustomEvent('submit', {
            cancelable: true,
            detail: {
                fields: {
                    Name: 'Rent',
                    bemgr__Active__c: true,
                    bemgr__Start_Date__c: '2026-10-01',
                    bemgr__End_Date__c: '2026-10-31',
                    ...values
                }
            }
        })
    );
const ready = async ({ edit = true, values = {}, objectInfo = metadata() } = {}) => {
    const element = createElement('c-recurring-expense-modal', { is: RecurringExpenseModal });
    element.categoryOptions = [{ label: 'Food', value: 'food' }];
    element.bankOptions = [
        { label: 'Credit bank', value: 'credit', supportedTransactionTypes: ['Credit Card'] }
    ];
    if (edit) element.recordId = 'template-a';
    element.isOpen = true;
    document.body.appendChild(element);
    getObjectInfo.emit(objectInfo);
    await flush();
    const form = element.shadowRoot.querySelector('lightning-record-edit-form');
    form.submit = jest.fn();
    form.dispatchEvent(new CustomEvent('load'));
    if (edit)
        getRecord.emit({
            id: 'template-a',
            fields: Object.fromEntries(
                Object.entries({
                    Category__c: 'food',
                    Bank_Assignment__c: 'credit',
                    Bank__c: null,
                    Transaction_Type__c: 'Credit Card',
                    Active__c: true,
                    Next_Run_Date__c: '2026-10-10',
                    ...values
                }).map(([name, value]) => [qualified(name), { value }])
            )
        });
    else change(field(element, 'category'), 'food');
    await flush();
    element.shadowRoot
        .querySelectorAll('lightning-input-field, lightning-combobox')
        .forEach(input => {
            input.reportValidity = jest.fn().mockReturnValue(true);
        });
    return { element, form };
};

describe('recurring modal installed namespace', () => {
    afterEach(() => document.body.replaceChildren());

    it('binds native inputs and reads qualified record context before submitting qualified fields', async () => {
        const { element, form } = await ready();
        expect(form.objectApiName.objectApiName).toBe('bemgr__Recurring_Expense__c');
        const inputs = [...element.shadowRoot.querySelectorAll('lightning-input-field')];
        expect(inputs.map(input => input.fieldName.fieldApiName)).toEqual([
            'Name',
            'bemgr__Amount__c',
            'bemgr__Description__c',
            'bemgr__Frequency__c',
            'bemgr__Start_Date__c',
            'bemgr__End_Date__c',
            'bemgr__Active__c'
        ]);
        expect(field(element, 'category').value).toBe('food');
        expect(field(element, 'bank').value).toBe('credit');
        expect(field(element, 'transaction-type').value).toBe('Credit Card');
        expect(element.shadowRoot.textContent).toContain('Oct 10, 2026');
        submit(form, { bemgr__Amount__c: 125 });
        expect(form.submit).toHaveBeenCalledWith(
            expect.objectContaining({
                Name: 'Rent',
                bemgr__Amount__c: 125,
                bemgr__Category__c: 'food',
                bemgr__Bank_Assignment__c: 'credit',
                bemgr__Transaction_Type__c: 'Credit Card'
            })
        );
        expect(
            Object.keys(form.submit.mock.calls[0][0])
                .filter(name => name.endsWith('__c'))
                .every(name => name.startsWith('bemgr__'))
        ).toBe(true);
    });

    it('creates with qualified category and payment values and clears a bank explicitly', async () => {
        const { element, form } = await ready({ edit: false });
        change(field(element, 'bank'), 'credit');
        await flush();
        submit(form);
        expect(form.submit).toHaveBeenCalledWith(
            expect.objectContaining({
                bemgr__Category__c: 'food',
                bemgr__Bank_Assignment__c: 'credit',
                bemgr__Bank__c: null,
                bemgr__Transaction_Type__c: 'Credit Card'
            })
        );
    });

    it('validates qualified dates and prevents reactivation with an inactive bank', async () => {
        const { element, form } = await ready({
            values: { Active__c: false, Bank_Assignment__c: 'inactive' }
        });
        submit(form, { bemgr__End_Date__c: '2026-09-30' });
        expect(form.submit).not.toHaveBeenCalled();
        await flush();
        expect(element.shadowRoot.querySelector('[data-date-error]')).not.toBeNull();
        submit(form);
        expect(form.submit).not.toHaveBeenCalled();
        await flush();
        expect(element.shadowRoot.querySelector('[data-form-error]').textContent).toContain(
            'reactivating'
        );
        change(field(element, 'bank'), '__NO_BANK__');
        await flush();
        submit(form);
        expect(form.submit).toHaveBeenCalledWith(
            expect.objectContaining({
                bemgr__Active__c: true,
                bemgr__Bank_Assignment__c: null,
                bemgr__Bank__c: null,
                bemgr__Transaction_Type__c: 'Cash'
            })
        );
    });

    it('preserves legacy bank and omits qualified readonly fields', async () => {
        const objectInfo = metadata();
        objectInfo.fields.bemgr__Bank_Assignment__c.updateable = false;
        objectInfo.fields.bemgr__Bank__c.updateable = false;
        objectInfo.fields.bemgr__Category__c.updateable = false;
        const { element, form } = await ready({
            objectInfo,
            values: { Bank_Assignment__c: null, Bank__c: 'Old bank' }
        });
        expect(element.shadowRoot.textContent).toContain('Legacy bank: Old bank');
        submit(form, { bemgr__Bank__c: null, bemgr__Category__c: 'tampered' });
        const saved = form.submit.mock.calls[0][0];
        expect(saved).toHaveProperty('Name', 'Rent');
        expect(saved).not.toHaveProperty('bemgr__Bank__c');
        expect(saved).not.toHaveProperty('bemgr__Bank_Assignment__c');
        expect(saved).not.toHaveProperty('bemgr__Category__c');
    });
});
