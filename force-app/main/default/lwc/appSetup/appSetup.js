import { LightningElement, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import getSetupStatus from '@salesforce/apex/AppSetupController.getSetupStatus';
import completeSetup from '@salesforce/apex/AppSetupController.completeSetup';
import getAllExpenseGroups from '@salesforce/apex/ExpenseController.getAllExpenseGroups';
import EXPENSE_GROUP from '@salesforce/schema/Expense_Group__c';
import CATEGORY from '@salesforce/schema/Category__c';
import CATEGORY_GROUP from '@salesforce/schema/Category__c.Expense_Group__c';
import { getErrorMessage } from 'c/expenseErrorUtils';

export default class AppSetup extends LightningElement {
    expenseGroupObject = EXPENSE_GROUP;
    categoryObject = CATEGORY;
    categoryGroupField = CATEGORY_GROUP;
    status;
    isLoading = true;
    isCompleting = false;
    isSavingRecord = false;
    error = '';
    recordError = '';
    confirmed = false;
    groupOptions = [];
    selectedGroupId = '';
    recordMessage = '';
    groupsError = '';
    isRefreshingGroups = false;
    _groupsRequestVersion = 0;
    _groupsWire;
    _requestVersion = 0;

    connectedCallback() {
        this.refreshStatus();
    }
    disconnectedCallback() {
        this._requestVersion += 1;
        this._groupsRequestVersion += 1;
    }
    @wire(getAllExpenseGroups)
    groupsReceived(result) {
        this._groupsWire = result;
        if (result.data) {
            this.groupOptions = result.data.map(group => ({ label: group.Name, value: group.Id }));
            this.groupsError = '';
        } else if (result.error) {
            this.groupsError = getErrorMessage(
                result.error,
                'Unable to load existing expense groups.'
            );
        }
    }
    get canManageSetup() {
        return this.status?.canManageSetup === true;
    }
    get canCreateRecords() {
        return this.canManageSetup && this.status?.canCompleteSetup === true;
    }
    get statusMessage() {
        return this.status?.message;
    }
    get organizationCurrencyCode() {
        return this.status?.organizationCurrencyCode || 'Unavailable';
    }
    get isBusy() {
        return this.isLoading || this.isCompleting || this.isSavingRecord;
    }
    get isFinishDisabled() {
        return this.isBusy || !this.confirmed || this.status?.canCompleteSetup !== true;
    }
    get isCategorySaveDisabled() {
        return this.isBusy || !this.canCreateRecords || !this.selectedGroupId;
    }
    async refreshStatus() {
        const version = ++this._requestVersion;
        this.isLoading = true;
        this.error = '';
        try {
            const status = await getSetupStatus();
            if (!this.isConnected || version !== this._requestVersion) return;
            if (!status) throw new Error('Setup status is unavailable.');
            this.applyStatus(status);
        } catch (error) {
            if (this.isConnected && version === this._requestVersion) {
                this.error = getErrorMessage(error, 'Unable to check app setup.');
            }
        } finally {
            if (this.isConnected && version === this._requestVersion) this.isLoading = false;
        }
    }
    applyStatus(status, completed = false) {
        this.status = status;
        if (status.ready === true)
            this.dispatchEvent(new CustomEvent('ready', { detail: { completed } }));
    }
    handleConfirmation(event) {
        this.confirmed = event.target.checked;
    }
    async handleFinish() {
        if (this.isFinishDisabled) return;
        const version = ++this._requestVersion;
        this.isCompleting = true;
        this.error = '';
        try {
            const status = await completeSetup({ confirmed: true });
            if (!this.isConnected || version !== this._requestVersion) return;
            if (!status) throw new Error('Setup did not return a status. Refresh to check again.');
            this.applyStatus(status, true);
            if (status.ready !== true) {
                this.error = status.message || 'Setup is not complete. Refresh to check again.';
            }
        } catch (error) {
            if (this.isConnected && version === this._requestVersion) {
                this.error = getErrorMessage(error, 'Unable to complete app setup.');
            }
        } finally {
            if (this.isConnected && version === this._requestVersion) this.isCompleting = false;
        }
    }
    handleGroupSelection(event) {
        this.selectedGroupId = event.detail.value;
    }
    handleRecordSubmit(event) {
        if (this.isBusy || !this.canCreateRecords) {
            event.preventDefault();
            return;
        }
        this.isSavingRecord = true;
    }
    handleCategorySubmit(event) {
        event.preventDefault();
        if (this.isCategorySaveDisabled) return;
        this.isSavingRecord = true;
        const apiName = CATEGORY_GROUP.fieldApiName || String(CATEGORY_GROUP).split('.').pop();
        event.target.submit({ ...event.detail.fields, [apiName]: this.selectedGroupId });
    }
    async handleGroupCreated(event) {
        this.isSavingRecord = false;
        this.selectedGroupId = event.detail.id;
        if (!this.groupOptions.some(option => option.value === this.selectedGroupId)) {
            this.groupOptions = [
                ...this.groupOptions,
                {
                    label: event.detail.fields?.Name?.value || 'New expense group',
                    value: this.selectedGroupId
                }
            ];
        }
        this.recordError = '';
        this.recordMessage = 'Expense group created. You can now add its first category.';
        if (this._groupsWire) {
            try {
                await refreshApex(this._groupsWire);
            } catch {
                this.groupsError =
                    'Expense group saved, but existing group choices could not refresh. Retry loading groups.';
            }
        }
    }
    handleCategoryCreated() {
        this.isSavingRecord = false;
        this.recordError = '';
        this.recordMessage = 'Category created. You can finish setup or add another category.';
    }
    async handleRefreshGroups() {
        if (this.isRefreshingGroups || !this._groupsWire) return;
        const version = ++this._groupsRequestVersion;
        this.isRefreshingGroups = true;
        this.groupsError = '';
        try {
            await refreshApex(this._groupsWire);
        } catch (error) {
            if (this.isConnected && version === this._groupsRequestVersion)
                this.groupsError = getErrorMessage(error, 'Unable to reload expense groups.');
        } finally {
            if (this.isConnected && version === this._groupsRequestVersion)
                this.isRefreshingGroups = false;
        }
    }
    handleRecordError(event) {
        this.isSavingRecord = false;
        this.recordError = getErrorMessage(event.detail, 'Unable to save the setup record.');
    }
}
