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
});
