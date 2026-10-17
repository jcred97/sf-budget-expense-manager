import {
    canReadObject,
    canCreateObject,
    canUpdateObject,
    canDeleteObject,
    canReadField,
    canWriteField,
    hasReadableFields,
    hasWritableFields,
    filterWritableFields
} from 'c/appSchemaAccess';

const info = {
    queryable: true,
    createable: true,
    updateable: true,
    deletable: false,
    fields: {
        Name: { createable: true, updateable: true },
        Amount__c: { createable: true, updateable: false },
        Description__c: { createable: true, updateable: true }
    }
};

it('fails closed while metadata is pending or unavailable', () => {
    for (const value of [undefined, null, {}]) {
        expect(canReadObject(value)).toBe(false);
        expect(canCreateObject(value)).toBe(false);
        expect(canUpdateObject(value)).toBe(false);
        expect(canDeleteObject(value)).toBe(false);
        expect(hasReadableFields(value, ['Name'])).toBe(false);
        expect(hasWritableFields(value, ['Name'], 'create')).toBe(false);
        expect(filterWritableFields(value, { Name: 'Blocked' }, 'create')).toEqual({});
    }
});

it('distinguishes object permissions and create versus update field permissions', () => {
    expect(canReadField(info, { fieldApiName: 'Amount__c' })).toBe(true);
    expect(canReadField(info, 'Hidden__c')).toBe(false);
    expect(canWriteField(info, 'Amount__c', 'create')).toBe(true);
    expect(canWriteField(info, 'Amount__c', 'update')).toBe(false);
    expect(canWriteField(info, 'Name', 'delete')).toBe(false);
    expect(canDeleteObject(info)).toBe(false);
    expect(hasWritableFields(info, ['Name', 'Amount__c'], 'update')).toBe(false);
    expect(hasReadableFields(info, ['Name', 'Amount__c'])).toBe(true);
    expect(canWriteField({ ...info, updateable: false }, 'Name', 'update')).toBe(false);
});

it('retains permitted null clears and omits restricted fields without mutating the draft', () => {
    const draft = { Name: 'Changed', Amount__c: 25, Description__c: null, Hidden__c: null };
    expect(filterWritableFields(info, draft, 'update')).toEqual({
        Name: 'Changed',
        Description__c: null
    });
    expect(draft).toEqual({
        Name: 'Changed',
        Amount__c: 25,
        Description__c: null,
        Hidden__c: null
    });
});

it('resolves local custom field names against namespaced object metadata', () => {
    const packagedInfo = {
        ...info,
        apiName: 'bemgr__Expense__c',
        fields: {
            Name: info.fields.Name,
            bemgr__Description__c: info.fields.Description__c
        }
    };
    expect(canReadField(packagedInfo, 'Description__c')).toBe(true);
    expect(canWriteField(packagedInfo, { fieldApiName: 'bemgr__Description__c' }, 'update')).toBe(
        true
    );
    expect(filterWritableFields(packagedInfo, { Description__c: null }, 'update')).toEqual({
        Description__c: null
    });
    expect(canReadField(packagedInfo, 'Hidden__c')).toBe(false);
});
