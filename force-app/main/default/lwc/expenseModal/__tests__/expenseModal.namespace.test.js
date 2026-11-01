import { createElement } from 'lwc';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';
import { getRecord } from 'lightning/uiRecordApi';
import ExpenseModal from 'c/expenseModal';

jest.mock('@salesforce/apex/ExchangeRateController.getPhpRate', () => ({ default: jest.fn() }), {
    virtual: true
});
jest.mock(
    '@salesforce/schema/Expense__c',
    () => ({ default: { objectApiName: 'bemgr__Expense__c' } }),
    { virtual: true }
);
jest.mock(
    '@salesforce/schema/Expense__c.Id',
    () => ({ default: { objectApiName: 'bemgr__Expense__c', fieldApiName: 'Id' } }),
    { virtual: true }
);
jest.mock(
    '@salesforce/schema/Expense__c.Name',
    () => ({ default: { objectApiName: 'bemgr__Expense__c', fieldApiName: 'Name' } }),
    { virtual: true }
);
jest.mock(
    '@salesforce/schema/Expense__c.Amount__c',
    () => ({ default: { objectApiName: 'bemgr__Expense__c', fieldApiName: 'bemgr__Amount__c' } }),
    { virtual: true }
);
jest.mock(
    '@salesforce/schema/Expense__c.Category__c',
    () => ({ default: { objectApiName: 'bemgr__Expense__c', fieldApiName: 'bemgr__Category__c' } }),
    { virtual: true }
);
jest.mock(
    '@salesforce/schema/Expense__c.Bank_Assignment__c',
    () => ({
        default: { objectApiName: 'bemgr__Expense__c', fieldApiName: 'bemgr__Bank_Assignment__c' }
    }),
    { virtual: true }
);
jest.mock(
    '@salesforce/schema/Expense__c.Bank__c',
    () => ({ default: { objectApiName: 'bemgr__Expense__c', fieldApiName: 'bemgr__Bank__c' } }),
    { virtual: true }
);
jest.mock(
    '@salesforce/schema/Expense__c.Transaction_Type__c',
    () => ({
        default: { objectApiName: 'bemgr__Expense__c', fieldApiName: 'bemgr__Transaction_Type__c' }
    }),
    { virtual: true }
);
jest.mock(
    '@salesforce/schema/Expense__c.Transaction_Time__c',
    () => ({
        default: { objectApiName: 'bemgr__Expense__c', fieldApiName: 'bemgr__Transaction_Time__c' }
    }),
    { virtual: true }
);
jest.mock(
    '@salesforce/schema/Expense__c.Expense_Date__c',
    () => ({
        default: { objectApiName: 'bemgr__Expense__c', fieldApiName: 'bemgr__Expense_Date__c' }
    }),
    { virtual: true }
);
jest.mock(
    '@salesforce/schema/Expense__c.Original_Amount__c',
    () => ({
        default: { objectApiName: 'bemgr__Expense__c', fieldApiName: 'bemgr__Original_Amount__c' }
    }),
    { virtual: true }
);
jest.mock(
    '@salesforce/schema/Expense__c.Original_Currency_Code__c',
    () => ({
        default: {
            objectApiName: 'bemgr__Expense__c',
            fieldApiName: 'bemgr__Original_Currency_Code__c'
        }
    }),
    { virtual: true }
);
jest.mock(
    '@salesforce/schema/Expense__c.Exchange_Rate_To_PHP__c',
    () => ({
        default: {
            objectApiName: 'bemgr__Expense__c',
            fieldApiName: 'bemgr__Exchange_Rate_To_PHP__c'
        }
    }),
    { virtual: true }
);
jest.mock(
    '@salesforce/schema/Expense__c.Exchange_Rate_Date__c',
    () => ({
        default: {
            objectApiName: 'bemgr__Expense__c',
            fieldApiName: 'bemgr__Exchange_Rate_Date__c'
        }
    }),
    { virtual: true }
);
jest.mock(
    '@salesforce/schema/Expense__c.Exchange_Rate_Source__c',
    () => ({
        default: {
            objectApiName: 'bemgr__Expense__c',
            fieldApiName: 'bemgr__Exchange_Rate_Source__c'
        }
    }),
    { virtual: true }
);

const namespace = name => (name.endsWith('__c') ? `bemgr__${name}` : name);
const metadata = () => ({
    apiName: 'bemgr__Expense__c',
    queryable: true,
    createable: true,
    updateable: true,
    fields: Object.fromEntries(
        [
            'Id',
            'Name',
            'Amount__c',
            'Category__c',
            'Bank_Assignment__c',
            'Bank__c',
            'Transaction_Type__c',
            'Transaction_Time__c',
            'Expense_Date__c',
            'Original_Amount__c',
            'Original_Currency_Code__c',
            'Exchange_Rate_To_PHP__c',
            'Exchange_Rate_Date__c',
            'Exchange_Rate_Source__c'
        ].map(name => [
            namespace(name),
            { apiName: namespace(name), createable: true, updateable: true }
        ])
    )
});
const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
};
const input = (element, field) => element.shadowRoot.querySelector(`[data-field="${field}"]`);

async function mount({ edit = false, values = {} } = {}) {
    const element = createElement('c-expense-modal', { is: ExpenseModal });
    element.categoryOptions = [{ label: 'Food', value: 'category-1' }];
    element.bankOptions = [
        { label: 'Bank', value: 'assignment-1', supportedTransactionTypes: ['Credit Card'] }
    ];
    if (edit) element.recordId = 'expense-1';
    element.isOpen = true;
    document.body.appendChild(element);
    getObjectInfo.emit(metadata());
    await flush();
    const form = element.shadowRoot.querySelector('lightning-record-edit-form');
    const record = {
        id: 'expense-1',
        apiName: 'bemgr__Expense__c',
        fields: Object.fromEntries(
            Object.entries(values).map(([name, value]) => [namespace(name), { value }])
        )
    };
    form.dispatchEvent(new CustomEvent('load', { detail: { records: { 'expense-1': record } } }));
    if (edit) getRecord.emit(record);
    await flush();
    element.shadowRoot.querySelectorAll('lightning-combobox, [data-fx-input]').forEach(field => {
        field.reportValidity = jest.fn().mockReturnValue(true);
    });
    form.submit = jest.fn();
    return { element, form };
}
function submit(form, fields) {
    form.dispatchEvent(new CustomEvent('submit', { cancelable: true, detail: { fields } }));
}
afterEach(() => {
    document.body.replaceChildren();
    jest.clearAllMocks();
});

it('loads a qualified LDS payment and FX snapshot and submits one canonical key per field', async () => {
    const { element, form } = await mount({
        edit: true,
        values: {
            Category__c: 'category-1',
            Bank_Assignment__c: 'assignment-1',
            Transaction_Type__c: 'Credit Card',
            Transaction_Time__c: '12:30:00.000Z',
            Expense_Date__c: '2026-10-01',
            Original_Amount__c: 10,
            Original_Currency_Code__c: 'USD',
            Exchange_Rate_To_PHP__c: 56,
            Exchange_Rate_Date__c: '2026-10-01',
            Exchange_Rate_Source__c: 'Manual'
        }
    });
    expect(form.objectApiName).toEqual({ objectApiName: 'bemgr__Expense__c' });
    expect(input(element, 'phpAmount').fieldName.fieldApiName).toBe('bemgr__Amount__c');
    expect(input(element, 'category').value).toBe('category-1');
    expect(input(element, 'bank').value).toBe('assignment-1');
    expect(input(element, 'transaction-type').value).toBe('Credit Card');
    expect(input(element, 'originalAmount').value).toBe('10');
    expect(input(element, 'originalCurrency').value).toBe('USD');
    expect(input(element, 'exchangeRate').value).toBe('56');
    submit(form, { Name: 'Lunch', bemgr__Amount__c: 999, bemgr__Expense_Date__c: '2026-10-01' });
    expect(form.submit).toHaveBeenCalledTimes(1);
    expect(form.submit.mock.calls[0][0]).toEqual({
        Name: 'Lunch',
        bemgr__Amount__c: '560.00',
        bemgr__Expense_Date__c: '2026-10-01',
        bemgr__Category__c: 'category-1',
        bemgr__Bank_Assignment__c: 'assignment-1',
        bemgr__Transaction_Type__c: 'Credit Card',
        bemgr__Transaction_Time__c: '12:30:00.000Z',
        bemgr__Original_Amount__c: '10',
        bemgr__Original_Currency_Code__c: 'USD',
        bemgr__Exchange_Rate_To_PHP__c: '56',
        bemgr__Exchange_Rate_Date__c: '2026-10-01',
        bemgr__Exchange_Rate_Source__c: 'Manual'
    });
});

it('omits the entire qualified FX snapshot and PHP amount when one FX field is read-only', async () => {
    const { form } = await mount({
        edit: true,
        values: {
            Category__c: 'category-1',
            Transaction_Type__c: 'Cash',
            Original_Amount__c: 10,
            Original_Currency_Code__c: 'USD',
            Exchange_Rate_To_PHP__c: 56,
            Exchange_Rate_Date__c: '2026-10-01',
            Exchange_Rate_Source__c: 'Manual'
        }
    });
    const restricted = metadata();
    restricted.fields.bemgr__Exchange_Rate_Source__c.updateable = false;
    getObjectInfo.emit(restricted);
    await flush();
    submit(form, {
        Name: 'Updated',
        bemgr__Amount__c: 999,
        bemgr__Expense_Date__c: '2026-10-02',
        bemgr__Original_Amount__c: 99,
        bemgr__Exchange_Rate_Source__c: 'Changed'
    });
    expect(form.submit).toHaveBeenCalledTimes(1);
    expect(form.submit.mock.calls[0][0]).toEqual({
        Name: 'Updated',
        bemgr__Category__c: 'category-1',
        bemgr__Transaction_Type__c: 'Cash',
        bemgr__Transaction_Time__c: null,
        bemgr__Bank_Assignment__c: null
    });
});
