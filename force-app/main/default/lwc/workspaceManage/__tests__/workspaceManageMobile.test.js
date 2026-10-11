import { createElement } from 'lwc';
import WorkspaceManage from 'c/workspaceManage';
import getRecordsPage from '@salesforce/apex/WorkspaceManagementController.getRecordsPage';
import { getObjectInfos } from 'lightning/uiObjectInfoApi';
jest.mock('@salesforce/client/formFactor', () => ({ default: 'Small' }), { virtual: true });
jest.mock(
    '@salesforce/apex/WorkspaceManagementController.getRecordsPage',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};
describe('mobile workspace management', () => {
    afterEach(() => {
        document.body.replaceChildren();
        jest.resetAllMocks();
    });
    it('uses SLDS record cards with permitted editing instead of an unsupported mobile datatable', async () => {
        getRecordsPage.mockResolvedValue({
            records: [{ id: 'group', name: 'Personal' }],
            hasMore: false
        });
        const element = createElement('c-workspace-manage', { is: WorkspaceManage });
        element.active = true;
        document.body.appendChild(element);
        getObjectInfos.emit({
            results: [0, 1, 2, 3].map(() => ({
                statusCode: 200,
                result: {
                    createable: true,
                    updateable: true,
                    fields: { Name: { createable: true, updateable: true } }
                }
            }))
        });
        await flush();
        expect(element.shadowRoot.querySelector('lightning-datatable')).toBeNull();
        expect(element.shadowRoot.querySelector('li').textContent).toContain('Personal');
        [...element.shadowRoot.querySelectorAll('lightning-button')]
            .find(item => item.label === 'Edit')
            .click();
        await flush();
        expect(element.shadowRoot.querySelector('lightning-record-edit-form').recordId).toBe(
            'group'
        );
    });
    it('lets a read-only user manage an accessible group from its mobile row', async () => {
        getRecordsPage.mockResolvedValue({
            records: [{ id: 'group', name: 'Family' }],
            hasMore: false
        });
        const element = createElement('c-workspace-manage', { is: WorkspaceManage });
        element.active = true;
        document.body.appendChild(element);
        getObjectInfos.emit({
            results: [0, 1, 2, 3].map(() => ({
                statusCode: 200,
                result: { createable: false, updateable: false, fields: {} }
            }))
        });
        const managed = jest.fn();
        element.addEventListener('managegroup', managed);
        await flush();
        expect(element.shadowRoot.querySelector('lightning-datatable')).toBeNull();
        const buttons = [...element.shadowRoot.querySelectorAll('lightning-button')];
        expect(buttons.some(button => button.label === 'Edit')).toBe(false);
        const manage = buttons.find(button => button.label === 'Manage this group');
        manage.click();
        expect(managed.mock.calls[0][0].detail).toEqual({
            expenseGroupId: 'group',
            expenseGroupName: 'Family'
        });
        let finishRead;
        getRecordsPage.mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    finishRead = resolve;
                })
        );
        buttons.find(button => button.label === 'Refresh').click();
        await flush();
        expect(manage.disabled).toBe(true);
        manage.click();
        expect(managed).toHaveBeenCalledTimes(1);
        finishRead({ records: [], hasMore: false });
        await flush();
    });
});
