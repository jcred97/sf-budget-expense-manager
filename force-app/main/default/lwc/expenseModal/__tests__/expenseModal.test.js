import { getObjectInfo } from 'lightning/uiObjectInfoApi';
import { createElement } from 'lwc';
import ExpenseModal from 'c/expenseModal';

jest.mock('@salesforce/apex/ExchangeRateController.getPhpRate', () => ({ default: jest.fn() }), {
    virtual: true
});

const writableMetadata = () => ({
    queryable: true,
    createable: true,
    updateable: true,
    deletable: true,
    fields: Object.fromEntries(
        [
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
            'Exchange_Rate_Source__c',
            'Active__c',
            'Frequency__c',
            'Start_Date__c',
            'End_Date__c',
            'Notes__c',
            'Next_Run_Date__c'
        ].map(name => [name, { apiName: name, createable: true, updateable: true }])
    )
});

const flush = () => Promise.resolve();

async function openModal() {
    const element = createElement('c-expense-modal', { is: ExpenseModal });
    element.categoryOptions = [{ label: 'Groceries', value: 'groceries' }];
    element.isOpen = true;
    document.body.appendChild(element);
    getObjectInfo.emit(writableMetadata());
    await flush();
    const form = element.shadowRoot.querySelector('lightning-record-edit-form');
    form.dispatchEvent(new CustomEvent('load', { detail: {} }));
    await flush();
    for (const selector of ['category', 'bank']) {
        element.shadowRoot.querySelector(`[data-field="${selector}"]`).reportValidity = jest
            .fn()
            .mockReturnValue(true);
    }
    form.submit = jest.fn();
    const close = jest.fn();
    element.addEventListener('close', close);
    return { element, form, close };
}

function clickAction(element, label) {
    [...element.shadowRoot.querySelectorAll('lightning-button')]
        .find(button => button.label === label)
        .click();
}

function submit(form) {
    form.dispatchEvent(
        new CustomEvent('submit', { cancelable: true, detail: { fields: { Name: 'Lunch' } } })
    );
}

async function succeed(element, form) {
    form.dispatchEvent(new CustomEvent('success'));
    await flush();
    element.shadowRoot.querySelector('.slds-modal').dispatchEvent(new CustomEvent('animationend'));
    await flush();
}

describe('Save & New', () => {
    afterEach(() => {
        document.body.replaceChildren();
        jest.clearAllMocks();
    });

    it('keeps the modal open and clears fields when submit arrives after the click microtask', async () => {
        const { element, form, close } = await openModal();
        const name = element.shadowRoot.querySelector('[data-initial-focus]');
        name.value = 'Lunch';
        clickAction(element, 'Save & New');
        await flush();
        submit(form);
        expect(form.submit).toHaveBeenCalledTimes(1);
        await succeed(element, form);
        expect(close).not.toHaveBeenCalled();
        expect(name.value).toBeNull();
        expect(element.shadowRoot.querySelector('[data-field="category"]').value).toBe('');

        clickAction(element, 'Save');
        submit(form);
        await succeed(element, form);
        expect(close).toHaveBeenCalledTimes(1);
    });

    it('preserves the in-flight action when another submit is received', async () => {
        const { element, form, close } = await openModal();
        clickAction(element, 'Save & New');
        await flush();
        submit(form);
        submit(form);
        expect(form.submit).toHaveBeenCalledTimes(1);
        await succeed(element, form);
        expect(close).not.toHaveBeenCalled();
    });

    it('allows regular Save after a validation-blocked Save & New click', async () => {
        const { element, form, close } = await openModal();
        clickAction(element, 'Save & New');
        await flush();
        // LDS validation can prevent submit entirely on the first click.
        clickAction(element, 'Save');
        submit(form);
        await succeed(element, form);
        expect(close).toHaveBeenCalledTimes(1);
    });
});
