import { paymentBankFields } from 'c/expensePaymentMethods';

const fieldKeys = {
    assignment: 'bemgr__Bank_Assignment__c',
    legacy: 'bemgr__Bank__c'
};

it('writes a changed bank using qualified keys without stale local aliases', () => {
    const fields = {
        Name: 'Lunch',
        Bank_Assignment__c: 'stale',
        bemgr__Bank_Assignment__c: 'previous',
        Bank__c: 'Old bank',
        bemgr__Bank__c: 'Old bank'
    };
    expect(paymentBankFields(fields, { assignmentId: 'new', touched: true, fieldKeys })).toEqual({
        Name: 'Lunch',
        bemgr__Bank_Assignment__c: 'new',
        bemgr__Bank__c: null
    });
    expect(fields.Bank_Assignment__c).toBe('stale');
});

it('omits both qualified and local bank fields when the untouched bank is read-only', () => {
    expect(
        paymentBankFields(
            {
                Name: 'Allowed description',
                Bank_Assignment__c: 'local',
                bemgr__Bank_Assignment__c: 'saved',
                Bank__c: 'local bank',
                bemgr__Bank__c: 'saved bank'
            },
            { assignmentId: 'saved', disabled: true, touched: false, fieldKeys }
        )
    ).toEqual({ Name: 'Allowed description' });
});

it('does not manufacture a replacement assignment for an untouched legacy bank', () => {
    expect(
        paymentBankFields(
            { Name: 'Historical expense' },
            { assignmentId: null, legacyBank: true, touched: false, fieldKeys }
        )
    ).toEqual({ Name: 'Historical expense' });
});
