import { createElement } from 'lwc';
import WorkspaceManage from 'c/workspaceManage';
import getRecordsPage from '@salesforce/apex/WorkspaceManagementController.getRecordsPage';
import { getObjectInfos } from 'lightning/uiObjectInfoApi';
import getSettings from '@salesforce/apex/SettingsController.getSettings';
jest.mock('@salesforce/apex/SettingsController.getSettings', () => ({ default: jest.fn() }), {
    virtual: true
});
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
    const scope = ['Categories', 'Assignments'].includes(kind) ? 'group' : 'app';
    if (element.scope !== scope) {
        element.scope = scope;
        await flush();
    }
    const tab = [...element.shadowRoot.querySelectorAll('lightning-tab')].find(
        item => item.value === kind
    );
    tab.dispatchEvent(new CustomEvent('active'));
    await flush();
};
const mount = async ({
    groupId = 'group-one',
    active = true,
    bankWrite = true,
    scope = 'app',
    canManageSettings = false
} = {}) => {
    const element = createElement('c-workspace-manage', { is: WorkspaceManage });
    element.expenseGroupId = groupId;
    element.expenseGroupName = 'Personal';
    element.scope = scope;
    element.canManageSettings = canManageSettings;
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
        getSettings.mockResolvedValue({
            recurringExpensesEnabled: false,
            globalRecurringRunTime: '08:00'
        });
    });
    afterEach(() => document.body.replaceChildren());
    it('labels Global Automation Settings before opening and only mounts it with permission', async () => {
        const element = await mount();
        expect(element.shadowRoot.querySelector('c-budget-expense-settings')).toBeNull();
        expect(getSettings).not.toHaveBeenCalled();
        expect(
            [...element.shadowRoot.querySelectorAll('lightning-tab')].some(
                tab => tab.value === 'Automation'
            )
        ).toBe(false);
        const tab = element.shadowRoot.querySelector('lightning-tab');
        tab.value = 'Automation';
        tab.dispatchEvent(new CustomEvent('active'));
        await flush();
        expect(element.shadowRoot.querySelector('c-budget-expense-settings')).toBeNull();
        tab.value = 'Groups';
        element.canManageSettings = true;
        await flush();
        expect(element.shadowRoot.querySelector('c-budget-expense-settings')).toBeNull();
        expect(
            [...element.shadowRoot.querySelectorAll('lightning-tab')].find(
                item => item.value === 'Automation'
            ).label
        ).toBe('Global Automation Settings');
        expect(element.shadowRoot.textContent).toContain('App-wide management');
        expect(element.shadowRoot.textContent).toContain('global recurring automation');
        getRecordsPage.mockClear();
        await select(element, 'Automation');
        const settings = element.shadowRoot.querySelector('c-budget-expense-settings');
        expect(settings.active).toBe(true);
        expect(settings.embedded).toBe(true);
        expect(settings.parentElement.hidden).toBe(false);
        expect(settings.parentElement.getAttribute('aria-label')).toBe(
            'Global Automation Settings'
        );
        expect(button(element, 'Search')).toBeUndefined();
        expect(button(element, 'New')).toBeUndefined();
        expect(getRecordsPage).not.toHaveBeenCalled();
        expect(getSettings).toHaveBeenCalledTimes(1);
        const changed = jest.fn();
        element.addEventListener('settingschange', changed);
        settings.dispatchEvent(new CustomEvent('settingschange', { detail: { saved: true } }));
        expect(changed).toHaveBeenCalledTimes(1);
        expect(changed.mock.calls[0][0].detail).toEqual({ saved: true });
    });
    it('retains one settings instance when switching tabs, scopes, or workspace activation', async () => {
        const element = await mount({ canManageSettings: true });
        await select(element, 'Automation');
        const settings = element.shadowRoot.querySelector('c-budget-expense-settings');
        const time = [...settings.shadowRoot.querySelectorAll('lightning-input')].find(
            input => input.type === 'time'
        );
        time.value = '11:15';
        time.dispatchEvent(new CustomEvent('change'));
        await flush();
        await select(element, 'Banks');
        expect(element.shadowRoot.querySelector('c-budget-expense-settings')).toBe(settings);
        expect(settings.active).toBe(false);
        expect(settings.parentElement.hidden).toBe(true);
        await select(element, 'Categories');
        expect(element.shadowRoot.querySelector('c-budget-expense-settings')).toBe(settings);
        await select(element, 'Automation');
        expect(settings.active).toBe(true);
        expect(
            [...settings.shadowRoot.querySelectorAll('lightning-input')].find(
                input => input.type === 'time'
            ).value
        ).toBe('11:15');
        element.active = false;
        await flush();
        expect(settings.active).toBe(false);
        element.active = true;
        await flush();
        expect(element.shadowRoot.querySelector('c-budget-expense-settings')).toBe(settings);
        expect(settings.active).toBe(true);
    });
    it('keeps a submitting record editor mounted when opening Automation and reloads records on return', async () => {
        const element = await mount({ canManageSettings: true });
        button(element, 'New').click();
        await flush();
        const form = formOf(element);
        submit(form, { Name: 'Family' });
        getRecordsPage.mockClear();
        await select(element, 'Automation');
        expect(formOf(element)).toBe(form);
        expect(form.parentElement.hidden).toBe(true);
        form.dispatchEvent(new CustomEvent('success', { detail: { id: 'saved-group' } }));
        await flush();
        expect(formOf(element)).toBeNull();
        expect(getRecordsPage).not.toHaveBeenCalled();
        getRecordsPage.mockResolvedValue(page([{ id: 'saved-group', name: 'Family' }]));
        await select(element, 'Groups');
        expect(element.shadowRoot.querySelector('lightning-datatable').data[0].id).toBe(
            'saved-group'
        );
    });
    it('ignores an old record response after opening Automation and falls back when permission is withdrawn', async () => {
        const element = await mount({ canManageSettings: true });
        let finishRead;
        getRecordsPage.mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    finishRead = resolve;
                })
        );
        await select(element, 'Banks');
        await select(element, 'Automation');
        finishRead(page([{ id: 'stale', name: 'Stale Bank' }]));
        await flush();
        expect(element.shadowRoot.querySelector('lightning-datatable')).toBeNull();
        element.canManageSettings = false;
        await flush();
        expect(element.shadowRoot.querySelector('c-budget-expense-settings')).toBeNull();
        expect(element.shadowRoot.querySelector('lightning-tabset').activeTabValue).toBe('Groups');
        expect(getRecordsPage.mock.calls.at(-1)[0].objectKind).toBe('Groups');
    });
    it('separates app-wide records from the selected group settings', async () => {
        const element = await mount();
        const labels = () =>
            [...element.shadowRoot.querySelectorAll('lightning-tab')].map(tab => tab.label);
        expect(labels()).toEqual(['Expense Groups', 'Bank Directory']);
        expect(element.shadowRoot.querySelector('lightning-card').title).toBe('App Management');
        expect(element.shadowRoot.textContent).toContain('App-wide management');
        expect(element.shadowRoot.textContent).not.toContain('global recurring automation');
        element.scope = 'group';
        await flush();
        expect(labels()).toEqual(['Categories', 'Banks & Payment Methods']);
        expect(element.shadowRoot.querySelector('lightning-card').title).toBe(
            'Settings for Personal'
        );
        expect(element.shadowRoot.textContent).toContain('Applies to: Personal');
        expect(element.shadowRoot.textContent).not.toContain('App-wide management');
        element.expenseGroupName = 'Family';
        await flush();
        expect(element.shadowRoot.textContent).toContain('Applies to: Family');
        expect(element.shadowRoot.textContent).not.toContain('Applies to: Personal');
        expect(element.shadowRoot.querySelector('lightning-tabset').activeTabValue).toBe(
            'Categories'
        );
        expect(getRecordsPage.mock.calls.at(-1)[0].objectKind).toBe('Categories');
        element.scope = 'app';
        await flush();
        expect(element.shadowRoot.querySelector('lightning-tabset').activeTabValue).toBe('Groups');
    });
    it('resets search and paging on scope changes and ignores an older response', async () => {
        getRecordsPage.mockResolvedValueOnce({
            records: [{ id: 'group', name: 'Family' }],
            hasMore: true,
            nextPageToken: 'app-token'
        });
        const element = await mount();
        const search = element.shadowRoot.querySelector('lightning-input');
        search.value = ' Family ';
        search.dispatchEvent(new CustomEvent('change'));
        let resolveOld;
        getRecordsPage.mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    resolveOld = resolve;
                })
        );
        button(element, 'Search').click();
        await flush();
        getRecordsPage.mockResolvedValueOnce(page([{ id: 'category', name: 'Food' }]));
        element.scope = 'group';
        await flush();
        expect(getRecordsPage.mock.calls.at(-1)[0]).toMatchObject({
            objectKind: 'Categories',
            searchTerm: '',
            pageToken: null
        });
        expect(button(element, 'Load more')).toBeUndefined();
        resolveOld(page([{ id: 'stale', name: 'Stale group' }]));
        await flush();
        expect(element.shadowRoot.querySelector('lightning-datatable').data[0].id).toBe('category');
    });
    it('offers manage-group navigation without update permission and ignores it during a save', async () => {
        getRecordsPage.mockResolvedValue(page([{ id: 'group-one', name: 'Personal' }]));
        const element = await mount();
        const readOnly = infos();
        readOnly.results[0].result.updateable = false;
        getObjectInfos.emit(readOnly);
        await flush();
        const table = element.shadowRoot.querySelector('lightning-datatable');
        expect(
            table.columns
                .filter(column => column.type === 'button')
                .map(column => column.typeAttributes.name)
        ).toEqual(['managegroup']);
        const managed = jest.fn();
        element.addEventListener('managegroup', managed);
        const navigate = () =>
            table.dispatchEvent(
                new CustomEvent('rowaction', {
                    detail: { action: { name: 'managegroup' }, row: table.data[0] }
                })
            );
        navigate();
        expect(managed.mock.calls[0][0].detail).toEqual({
            expenseGroupId: 'group-one',
            expenseGroupName: 'Personal'
        });
        button(element, 'New').click();
        await flush();
        submit(formOf(element), { Name: 'Other' });
        navigate();
        expect(managed).toHaveBeenCalledTimes(1);
    });
    it('keeps the submitted editor during scope changes and discards it on an error in another scope', async () => {
        const element = await mount({ scope: 'group' });
        button(element, 'New').click();
        await flush();
        const form = formOf(element);
        submit(form, { Name: 'Food' });
        element.scope = 'app';
        element.expenseGroupName = 'Other';
        await flush();
        expect(formOf(element)).toBe(form);
        expect(element.shadowRoot.textContent).toContain('Expense group: Personal');
        form.dispatchEvent(new CustomEvent('error', { detail: { message: 'Offline' } }));
        await flush();
        expect(formOf(element)).toBeNull();
        expect(element.shadowRoot.textContent).toContain('current view to retry');
    });
    it('loads only after activation, and gives Users a read-only Bank directory', async () => {
        const element = await mount({ active: false, bankWrite: false });
        expect(getRecordsPage).not.toHaveBeenCalled();
        element.active = true;
        await flush();
        expect(getRecordsPage).toHaveBeenCalledWith({
            objectKind: 'Groups',
            expenseGroupId: null,
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
