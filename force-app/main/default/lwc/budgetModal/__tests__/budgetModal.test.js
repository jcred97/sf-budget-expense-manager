import { createElement } from 'lwc';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';
import BudgetModal from 'c/budgetModal';

const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};
const info = {
    apiName: 'Budget__c',
    queryable: true,
    createable: true,
    updateable: true,
    fields: Object.fromEntries(
        ['Amount__c', 'Budget_Month__c', 'Expense_Group__c', 'Description__c'].map(name => [
            name,
            { createable: true, updateable: true }
        ])
    )
};
const saveButton = element =>
    [...element.shadowRoot.querySelectorAll('lightning-button')].find(
        button => button.label === 'Save Budget'
    );
async function mount(metadata = info) {
    const element = createElement('c-budget-modal', { is: BudgetModal });
    element.budget = { id: 'budget', amount: 500, description: 'Existing note' };
    document.body.appendChild(element);
    await flush();
    if (metadata) getObjectInfo.emit(metadata);
    await flush();
    return element;
}
describe('budget modal schema access', () => {
    afterEach(() => document.body.replaceChildren());

    it('disables saves while metadata is unavailable and after an error', async () => {
        const element = await mount(null);
        const save = jest.fn();
        element.addEventListener('save', save);
        expect(saveButton(element).disabled).toBe(true);
        getObjectInfo.error();
        await flush();
        element.shadowRoot
            .querySelector('form')
            .dispatchEvent(new CustomEvent('submit', { cancelable: true }));
        expect(save).not.toHaveBeenCalled();
        expect(saveButton(element).disabled).toBe(true);
    });

    it('allows an amount edit while preserving a read-only description', async () => {
        const element = await mount({
            ...info,
            fields: { ...info.fields, Description__c: { createable: false, updateable: false } }
        });
        const save = jest.fn();
        element.addEventListener('save', save);
        const amount = element.shadowRoot.querySelector('lightning-input');
        amount.reportValidity = jest.fn(() => true);
        amount.value = '750';
        amount.dispatchEvent(new CustomEvent('change'));
        expect(element.shadowRoot.querySelector('lightning-textarea').disabled).toBe(true);
        element.shadowRoot
            .querySelector('form')
            .dispatchEvent(new CustomEvent('submit', { cancelable: true }));
        expect(save).toHaveBeenCalledTimes(1);
        expect(save.mock.calls[0][0].detail).toEqual({ amount: 750 });
    });

    it('hides unreadable descriptions and prevents read-only amount changes', async () => {
        const fields = { ...info.fields };
        delete fields.Description__c;
        const element = await mount({
            ...info,
            fields: { ...fields, Amount__c: { createable: true, updateable: false } }
        });
        const save = jest.fn();
        element.addEventListener('save', save);
        expect(element.shadowRoot.querySelector('lightning-textarea')).toBeNull();
        expect(saveButton(element).disabled).toBe(true);
        element.shadowRoot
            .querySelector('form')
            .dispatchEvent(new CustomEvent('submit', { cancelable: true }));
        expect(save).not.toHaveBeenCalled();
    });
});
