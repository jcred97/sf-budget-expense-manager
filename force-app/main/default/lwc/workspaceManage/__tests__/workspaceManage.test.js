import { createElement } from 'lwc';
import WorkspaceManage from 'c/workspaceManage';
import getRecordsPage from '@salesforce/apex/WorkspaceManagementController.getRecordsPage';
import { getObjectInfos } from 'lightning/uiObjectInfoApi';
jest.mock(
    '@salesforce/apex/WorkspaceManagementController.getRecordsPage',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/schema/Category__c.Expense_Group__c',
    () => ({ default: { fieldApiName: 'bemgr__Expense_Group__c' } }),
    { virtual: true }
);
jest.mock(
    '@salesforce/schema/Expense_Group_Bank__c.Expense_Group__c',
    () => ({ default: { fieldApiName: 'bemgr__Expense_Group__c' } }),
    { virtual: true }
);
jest.mock(
    '@salesforce/schema/Expense_Group_Bank__c.Bank__c',
    () => ({ default: { fieldApiName: 'bemgr__Bank__c' } }),
    { virtual: true }
);
const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};
const page = records => ({ records, hasMore: false });
const fields = {
    Name: { createable: true, updateable: true },
    bemgr__Bank__c: { createable: true, updateable: true },
    Active__c: { createable: true, updateable: true },
    Supported_Credit_Card__c: { createable: true, updateable: true },
    Supported_Debit_Card__c: { createable: true, updateable: true },
    Supported_Bank_Payment__c: { createable: true, updateable: true },
    Supported_Bank_Transfer__c: { createable: true, updateable: true }
};
const infos = (bankWrite = true) => ({
    results: [true, true, bankWrite, true].map(write => ({
        statusCode: 200,
        result: { createable: write, updateable: write, fields }
    }))
});
const button = (element, label) =>
    [...element.shadowRoot.querySelectorAll('lightning-button')].find(item => item.label === label);
const select = async (element, kind) => {
    const tab = [...element.shadowRoot.querySelectorAll('lightning-tab')].find(
        item => item.value === kind
    );
    tab.dispatchEvent(new CustomEvent('active'));
    await flush();
};
const mount = async ({ groupId = 'group-one', active = true, bankWrite = true } = {}) => {
    const element = createElement('c-workspace-manage', { is: WorkspaceManage });
    element.expenseGroupId = groupId;
    element.active = active;
    document.body.appendChild(element);
    getObjectInfos.emit(infos(bankWrite));
    await flush();
    return element;
};
const formOf = element => element.shadowRoot.querySelector('lightning-record-edit-form');
const submit = (form, values) => {
    form.submit = jest.fn();
    form.dispatchEvent(new CustomEvent('submit', { cancelable: true, detail: { fields: values } }));
    return form.submit;
};
describe('workspace management', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        getRecordsPage.mockResolvedValue(page([]));
    });
    afterEach(() => document.body.replaceChildren());
    it('loads only after activation, and gives Users a read-only Bank directory', async () => {
        const element = await mount({ active: false, bankWrite: false });
        expect(getRecordsPage).not.toHaveBeenCalled();
        element.active = true;
        await flush();
        expect(getRecordsPage).toHaveBeenCalledWith({
            objectKind: 'Groups',
            expenseGroupId: 'group-one',
            searchTerm: '',
            pageToken: null
        });
        getRecordsPage.mockResolvedValue(page([{ id: 'bank', name: 'BPI', active: true }]));
        await select(element, 'Banks');
        expect(button(element, 'New')).toBeUndefined();
        const table = element.shadowRoot.querySelector('lightning-datatable');
        expect(table.columns.some(column => column.type === 'button')).toBe(false);
        table.dispatchEvent(
            new CustomEvent('rowaction', {
                detail: { action: { name: 'edit' }, row: { id: 'bank' } }
            })
        );
        expect(formOf(element)).toBeNull();
    });
    it('does not fetch unscoped categories or allow creation without a group', async () => {
        const element = await mount({ groupId: '' });
        getRecordsPage.mockClear();
        await select(element, 'Categories');
        expect(getRecordsPage).not.toHaveBeenCalled();
        expect(button(element, 'New').disabled).toBe(true);
        expect(element.shadowRoot.textContent).toContain('Select an expense group');
    });
    it('injects the namespaced parent field and suppresses repeated submissions', async () => {
        const element = await mount();
        await select(element, 'Categories');
        button(element, 'New').click();
        await flush();
        const form = formOf(element);
        const send = submit(form, { Name: 'Food' });
        expect(send).toHaveBeenCalledWith({ Name: 'Food', bemgr__Expense_Group__c: 'group-one' });
        form.dispatchEvent(
            new CustomEvent('submit', { cancelable: true, detail: { fields: { Name: 'Food' } } })
        );
        expect(send).toHaveBeenCalledTimes(1);
        await flush();
        expect(button(element, 'Cancel').disabled).toBe(true);
        form.dispatchEvent(new CustomEvent('error', { detail: { message: 'Duplicate category' } }));
        await flush();
        expect(button(element, 'Save').disabled).toBe(false);
        expect(element.shadowRoot.textContent).toContain('Duplicate category');
    });
    it('publishes a single configuration change on save and reloads its list', async () => {
        const element = await mount();
        const changed = jest.fn();
        element.addEventListener('configurationchange', changed);
        button(element, 'New').click();
        await flush();
        const form = formOf(element);
        submit(form, { Name: 'Family' });
        form.dispatchEvent(new CustomEvent('success', { detail: { id: 'new-group' } }));
        form.dispatchEvent(new CustomEvent('success', { detail: { id: 'new-group' } }));
        await flush();
        expect(changed).toHaveBeenCalledTimes(1);
        expect(changed.mock.calls[0][0].detail).toEqual({
            objectKind: 'groups',
            objectApiName: 'Expense_Group__c',
            recordId: 'new-group'
        });
        expect(getRecordsPage).toHaveBeenCalledTimes(2);
        expect(formOf(element)).toBeNull();
        expect(element.shadowRoot.textContent).toContain('Record saved.');
    });
    it('uses bank filtering for active choices while retaining the existing inactive bank', async () => {
        getRecordsPage.mockResolvedValue(
            page([{ id: 'assignment', name: 'Old bank', bankId: 'inactive-bank', active: false }])
        );
        const element = await mount();
        await select(element, 'Assignments');
        element.shadowRoot.querySelector('lightning-datatable').dispatchEvent(
            new CustomEvent('rowaction', {
                detail: {
                    action: { name: 'edit' },
                    row: { id: 'assignment', bankId: 'inactive-bank' }
                }
            })
        );
        await flush();
        const picker = element.shadowRoot.querySelector('lightning-record-picker');
        expect(picker.filter).toEqual({
            criteria: [
                { fieldPath: 'Active__c', operator: 'eq', value: true },
                { fieldPath: 'Id', operator: 'eq', value: 'inactive-bank' }
            ],
            filterLogic: '1 OR 2'
        });
        picker.dispatchEvent(new CustomEvent('change', { detail: { recordId: 'active-bank' } }));
        const form = formOf(element);
        expect(submit(form, { Active__c: true })).toHaveBeenCalledWith({
            Active__c: true,
            bemgr__Bank__c: 'active-bank'
        });
    });
    it('requires a bank for new assignments and injects the current group', async () => {
        const element = await mount();
        await select(element, 'Assignments');
        button(element, 'New').click();
        await flush();
        expect(button(element, 'Save').disabled).toBe(true);
        const picker = element.shadowRoot.querySelector('lightning-record-picker');
        picker.dispatchEvent(new CustomEvent('change', { detail: { recordId: 'bank' } }));
        await flush();
        const send = submit(formOf(element), { Active__c: true, Supported_Credit_Card__c: true });
        expect(send).toHaveBeenCalledWith({
            Active__c: true,
            Supported_Credit_Card__c: true,
            bemgr__Expense_Group__c: 'group-one',
            bemgr__Bank__c: 'bank'
        });
    });
    it('loads subsequent pages without duplication and retains pages on a failed load-more retry', async () => {
        getRecordsPage
            .mockResolvedValueOnce({
                records: [{ id: 'one', name: 'A' }],
                hasMore: true,
                nextPageToken: 'token'
            })
            .mockRejectedValueOnce(new Error('Temporary failure'))
            .mockResolvedValueOnce(
                page([
                    { id: 'one', name: 'A' },
                    { id: 'two', name: 'B' }
                ])
            );
        const element = await mount();
        button(element, 'Load more').click();
        await flush();
        expect(element.shadowRoot.querySelector('lightning-datatable').data).toHaveLength(1);
        expect(element.shadowRoot.textContent).toContain('Temporary failure');
        button(element, 'Load more').click();
        await flush();
        expect(getRecordsPage.mock.calls[2][0].pageToken).toBe('token');
        expect(
            element.shadowRoot.querySelector('lightning-datatable').data.map(record => record.id)
        ).toEqual(['one', 'two']);
    });
    it('ignores an older group response and discards an unsaved editor when group changes', async () => {
        let oldResolve;
        const element = await mount();
        getRecordsPage
            .mockImplementationOnce(
                () =>
                    new Promise(resolve => {
                        oldResolve = resolve;
                    })
            )
            .mockResolvedValueOnce(page([{ id: 'new', name: 'New category' }]));
        await select(element, 'Categories');
        element.expenseGroupId = 'group-two';
        await flush();
        oldResolve(page([{ id: 'old', name: 'Old category' }]));
        await flush();
        expect(element.shadowRoot.querySelector('lightning-datatable').data[0].id).toBe('new');
        button(element, 'New').click();
        await flush();
        expect(formOf(element)).not.toBeNull();
        element.expenseGroupId = 'group-three';
        await flush();
        expect(formOf(element)).toBeNull();
    });
    it('keeps the submitting parent fixed when the selected group changes during save', async () => {
        const element = await mount();
        await select(element, 'Categories');
        button(element, 'New').click();
        await flush();
        const form = formOf(element);
        const send = submit(form, { Name: 'Food' });
        element.expenseGroupId = 'group-two';
        await flush();
        expect(send).toHaveBeenCalledWith({ Name: 'Food', bemgr__Expense_Group__c: 'group-one' });
        expect(formOf(element)).toBe(form);
        form.dispatchEvent(new CustomEvent('success', { detail: { id: 'new-category' } }));
        await flush();
        expect(getRecordsPage.mock.calls.at(-1)[0].expenseGroupId).toBe('group-two');
        expect(formOf(element)).toBeNull();
    });
    it('keeps the page cursor tied to its applied search until Search is pressed', async () => {
        getRecordsPage
            .mockResolvedValueOnce({
                records: [{ id: 'one', name: 'A' }],
                hasMore: true,
                nextPageToken: 'unfiltered-token'
            })
            .mockResolvedValueOnce(page([{ id: 'two', name: 'B' }]))
            .mockResolvedValueOnce(page([{ id: 'filtered', name: 'Food' }]));
        const element = await mount();
        const search = element.shadowRoot.querySelector('lightning-input');
        search.value = ' Food ';
        search.dispatchEvent(new CustomEvent('change'));
        button(element, 'Load more').click();
        await flush();
        expect(getRecordsPage.mock.calls[1][0]).toMatchObject({
            searchTerm: '',
            pageToken: 'unfiltered-token'
        });
        button(element, 'Search').click();
        await flush();
        expect(getRecordsPage.mock.calls[2][0]).toMatchObject({
            searchTerm: 'Food',
            pageToken: null
        });
        expect(
            element.shadowRoot.querySelector('lightning-datatable').data.map(record => record.id)
        ).toEqual(['filtered']);
    });
    it('reloads a saved record when returning after navigating away during its save', async () => {
        const element = await mount();
        button(element, 'New').click();
        await flush();
        const form = formOf(element);
        submit(form, { Name: 'New group' });
        element.active = false;
        form.dispatchEvent(new CustomEvent('success', { detail: { id: 'saved' } }));
        await flush();
        expect(getRecordsPage).toHaveBeenCalledTimes(1);
        getRecordsPage.mockResolvedValue(page([{ id: 'saved', name: 'New group' }]));
        element.active = true;
        await flush();
        expect(element.shadowRoot.querySelector('lightning-datatable').data[0].id).toBe('saved');
    });
    it('allows tab selection during save while retaining its original editor and parent', async () => {
        const element = await mount();
        element.expenseGroupName = 'Original group';
        await select(element, 'Categories');
        button(element, 'New').click();
        await flush();
        const form = formOf(element);
        const send = submit(form, { Name: 'Food' });
        await select(element, 'Banks');
        expect(element.shadowRoot.querySelector('lightning-tabset').activeTabValue).toBe('Banks');
        expect(formOf(element)).toBe(form);
        expect(element.shadowRoot.textContent).toContain('Original group');
        expect(send).toHaveBeenCalledWith({ Name: 'Food', bemgr__Expense_Group__c: 'group-one' });
        form.dispatchEvent(new CustomEvent('success', { detail: { id: 'saved' } }));
        await flush();
        expect(getRecordsPage.mock.calls.at(-1)[0].objectKind).toBe('Banks');
    });
    it('ignores a pre-save tab read that resolves after saving while inactive', async () => {
        const element = await mount();
        button(element, 'New').click();
        await flush();
        const form = formOf(element);
        submit(form, { Name: 'New group' });
        let oldResolve;
        getRecordsPage.mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    oldResolve = resolve;
                })
        );
        await select(element, 'Banks');
        element.active = false;
        form.dispatchEvent(new CustomEvent('success', { detail: { id: 'saved' } }));
        oldResolve(page([{ id: 'old', name: 'Old Bank' }]));
        await flush();
        getRecordsPage.mockResolvedValue(page([{ id: 'fresh', name: 'Fresh Bank' }]));
        element.active = true;
        await flush();
        expect(getRecordsPage).toHaveBeenCalledTimes(3);
        expect(element.shadowRoot.querySelector('lightning-datatable').data[0].id).toBe('fresh');
    });
    it('retains old rows on refresh failure and recovers with Refresh', async () => {
        getRecordsPage
            .mockResolvedValueOnce(page([{ id: 'one', name: 'Existing' }]))
            .mockRejectedValueOnce(new Error('Offline'))
            .mockResolvedValueOnce(page([{ id: 'two', name: 'Updated' }]));
        const element = await mount();
        button(element, 'Refresh').click();
        await flush();
        expect(element.shadowRoot.textContent).toContain('Offline');
        expect(element.shadowRoot.querySelector('lightning-datatable').data[0].id).toBe('one');
        button(element, 'Refresh').click();
        await flush();
        expect(element.shadowRoot.querySelector('lightning-datatable').data[0].id).toBe('two');
    });
});
