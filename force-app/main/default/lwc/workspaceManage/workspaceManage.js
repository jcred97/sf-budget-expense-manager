import { LightningElement, api, wire } from 'lwc';
import FORM_FACTOR from '@salesforce/client/formFactor';
import { getObjectInfos } from 'lightning/uiObjectInfoApi';
import getRecordsPage from '@salesforce/apex/WorkspaceManagementController.getRecordsPage';
import GROUP from '@salesforce/schema/Expense_Group__c';
import CATEGORY from '@salesforce/schema/Category__c';
import BANK from '@salesforce/schema/Bank__c';
import ASSIGNMENT from '@salesforce/schema/Expense_Group_Bank__c';
import CATEGORY_GROUP from '@salesforce/schema/Category__c.Expense_Group__c';
import ASSIGNMENT_GROUP from '@salesforce/schema/Expense_Group_Bank__c.Expense_Group__c';
import ASSIGNMENT_BANK from '@salesforce/schema/Expense_Group_Bank__c.Bank__c';
import BANK_ACTIVE from '@salesforce/schema/Bank__c.Active__c';
import ASSIGNMENT_ACTIVE from '@salesforce/schema/Expense_Group_Bank__c.Active__c';
import CREDIT from '@salesforce/schema/Expense_Group_Bank__c.Supported_Credit_Card__c';
import DEBIT from '@salesforce/schema/Expense_Group_Bank__c.Supported_Debit_Card__c';
import PAYMENT from '@salesforce/schema/Expense_Group_Bank__c.Supported_Bank_Payment__c';
import TRANSFER from '@salesforce/schema/Expense_Group_Bank__c.Supported_Bank_Transfer__c';
import { getErrorMessage } from 'c/expenseErrorUtils';

const OBJECTS = { Groups: GROUP, Categories: CATEGORY, Banks: BANK, Assignments: ASSIGNMENT };
const KINDS = Object.keys(OBJECTS);
const fieldName = field => field.fieldApiName || String(field).split('.').pop();
const objectName = object => object.objectApiName || String(object);
export default class WorkspaceManage extends LightningElement {
    objectApiNames = Object.values(OBJECTS);
    kind = 'Groups';
    records = [];
    nextPageToken;
    hasMore = false;
    isLoading = false;
    isSaving = false;
    error = '';
    recordError = '';
    message = '';
    searchTerm = '';
    appliedSearchTerm = '';
    @api expenseGroupName = '';
    objectInfos = {};
    metadataError = '';
    editor;
    selectedBankId;
    bankObject = objectName(BANK);
    bankActiveField = BANK_ACTIVE;
    assignmentActiveField = ASSIGNMENT_ACTIVE;
    creditField = CREDIT;
    debitField = DEBIT;
    paymentField = PAYMENT;
    transferField = TRANSFER;
    _groupId = '';
    _active = false;
    _requestVersion = 0;
    _loaded = false;

    @api
    get expenseGroupId() {
        return this._groupId;
    }
    set expenseGroupId(value) {
        const groupId = value || '';
        if (groupId === this._groupId) return;
        this._groupId = groupId;
        if (!this.isSaving) this.closeEditor();
        if (this.isScoped) this.resetAndLoad();
    }
    @api
    get active() {
        return this._active;
    }
    set active(value) {
        this._active = value === true || value === 'true';
        if (this._active && this.isConnected && !this._loaded) this.loadRecords();
    }
    connectedCallback() {
        if (this._active) this.loadRecords();
    }
    disconnectedCallback() {
        this._requestVersion += 1;
    }
    @wire(getObjectInfos, { objectApiNames: '$objectApiNames' })
    receiveObjectInfos({ data, error }) {
        if (data) {
            this.objectInfos = Object.fromEntries(
                KINDS.map((kind, index) => [
                    kind,
                    data.results?.[index]?.statusCode === 200
                        ? data.results[index].result
                        : undefined
                ])
            );
            this.metadataError = '';
        } else if (error) {
            this.objectInfos = {};
            this.metadataError = getErrorMessage(error, 'Unable to load record permissions.');
        }
    }
    get isScoped() {
        return this.kind === 'Categories' || this.kind === 'Assignments';
    }
    get needsGroup() {
        return this.isScoped && !this._groupId;
    }
    get info() {
        return this.objectInfos[this.kind];
    }
    get isBusy() {
        return this.isLoading || this.isSaving;
    }
    get canCreate() {
        return this.info?.createable === true;
    }
    get canUpdate() {
        return this.info?.updateable === true;
    }
    get newDisabled() {
        return this.isBusy || !this.canCreate || this.needsGroup;
    }
    get hasRecords() {
        return this.records.length > 0;
    }
    get showEmpty() {
        return (
            this._loaded && !this.isLoading && !this.error && !this.hasRecords && !this.needsGroup
        );
    }
    get showEditor() {
        return Boolean(this.editor);
    }
    get editorObject() {
        return this.editor?.object;
    }
    get editorId() {
        return this.editor?.id;
    }
    get editorTitle() {
        return this.editor?.id ? 'Edit record' : 'Create record';
    }
    get editingBank() {
        return this.editor?.kind === 'Banks';
    }
    get editingAssignment() {
        return this.editor?.kind === 'Assignments';
    }
    get editingNamedRecord() {
        return this.editor?.kind !== 'Assignments';
    }
    get editorIsScoped() {
        return this.editor?.kind === 'Categories' || this.editingAssignment;
    }
    get groupContext() {
        return this.editor?.groupName || 'Current expense group';
    }
    get editDisabled() {
        return this.isSaving;
    }
    get saveDisabled() {
        return this.isSaving || (this.editingAssignment && !this.selectedBankId);
    }
    get bankPickerDisabled() {
        return this.isSaving || !this.editorFieldWritable(ASSIGNMENT_BANK);
    }
    get bankFilter() {
        const criteria = [{ fieldPath: fieldName(BANK_ACTIVE), operator: 'eq', value: true }];
        if (this.editor?.bankId) {
            criteria.push({ fieldPath: 'Id', operator: 'eq', value: this.editor.bankId });
            return { criteria, filterLogic: '1 OR 2' };
        }
        return { criteria };
    }
    get nameDisabled() {
        return this.isSaving || !this.editorFieldWritable('Name');
    }
    get activeDisabled() {
        return (
            this.isSaving ||
            !this.editorFieldWritable(this.editingBank ? BANK_ACTIVE : ASSIGNMENT_ACTIVE)
        );
    }
    get creditDisabled() {
        return this.isSaving || !this.editorFieldWritable(CREDIT);
    }
    get debitDisabled() {
        return this.isSaving || !this.editorFieldWritable(DEBIT);
    }
    get paymentDisabled() {
        return this.isSaving || !this.editorFieldWritable(PAYMENT);
    }
    get transferDisabled() {
        return this.isSaving || !this.editorFieldWritable(TRANSFER);
    }
    editorFieldWritable(field) {
        const info = this.objectInfos[this.editor?.kind];
        const metadata = info?.fields?.[typeof field === 'string' ? field : fieldName(field)];
        return this.editor?.id ? metadata?.updateable === true : metadata?.createable === true;
    }
    get isSmallScreen() {
        return FORM_FACTOR === 'Small';
    }
    get mobileRecords() {
        return this.records.map(record => ({
            ...record,
            showActive: this.kind === 'Banks' || this.kind === 'Assignments',
            activeLabel: record.active ? 'Active' : 'Inactive',
            methods:
                this.kind === 'Assignments'
                    ? [
                          record.creditCard && 'Credit Card',
                          record.debitCard && 'Debit Card',
                          record.bankPayment && 'Bank Payment',
                          record.bankTransfer && 'Bank Transfer'
                      ]
                          .filter(Boolean)
                          .join(', ') || 'No payment methods enabled'
                    : ''
        }));
    }
    handleMobileEdit(event) {
        const row = this.records.find(record => record.id === event.target.dataset.id);
        if (row) this.handleRowAction({ detail: { action: { name: 'edit' }, row } });
    }
    get columns() {
        const columns = [{ label: 'Name', fieldName: 'name', type: 'text' }];
        if (this.kind === 'Banks' || this.kind === 'Assignments')
            columns.push({ label: 'Active', fieldName: 'active', type: 'boolean' });
        if (this.kind === 'Assignments')
            columns.push(
                { label: 'Credit Card', fieldName: 'creditCard', type: 'boolean' },
                { label: 'Debit Card', fieldName: 'debitCard', type: 'boolean' },
                { label: 'Bank Payment', fieldName: 'bankPayment', type: 'boolean' },
                { label: 'Bank Transfer', fieldName: 'bankTransfer', type: 'boolean' }
            );
        if (this.canUpdate)
            columns.push({
                type: 'button',
                typeAttributes: { label: 'Edit', name: 'edit', disabled: this.isBusy }
            });
        return columns;
    }
    handleTab(event) {
        const kind = event.target.value;
        if (!KINDS.includes(kind) || kind === this.kind) return;
        this.kind = kind;
        this.searchTerm = '';
        this.appliedSearchTerm = '';
        if (!this.isSaving) this.closeEditor();
        this.resetAndLoad();
    }
    handleSearch(event) {
        this.searchTerm = event.target.value || '';
    }
    handleSearchSubmit() {
        if (this.isSaving) return;
        this.appliedSearchTerm = this.searchTerm.trim();
        this.closeEditor();
        this.resetAndLoad();
    }
    handleRefresh() {
        if (this.isBusy) return;
        this.loadRecords();
    }
    handleMore() {
        if (!this.isBusy && this.hasMore) this.loadRecords(true);
    }
    resetAndLoad() {
        this._requestVersion += 1;
        this.records = [];
        this.nextPageToken = undefined;
        this.hasMore = false;
        this._loaded = false;
        this.isLoading = false;
        this.error = '';
        if (this._active && this.isConnected) this.loadRecords();
    }
    async loadRecords(append = false) {
        if (!this._active || !this.isConnected) return;
        const version = ++this._requestVersion;
        if (this.needsGroup) {
            this.records = [];
            this.hasMore = false;
            this._loaded = true;
            this.isLoading = false;
            return;
        }
        const kind = this.kind;
        const groupId = this._groupId;
        this.isLoading = true;
        this.error = '';
        try {
            const result = await getRecordsPage({
                objectKind: kind,
                expenseGroupId: groupId || null,
                searchTerm: this.appliedSearchTerm,
                pageToken: append ? this.nextPageToken : null
            });
            if (!this.isConnected || version !== this._requestVersion) return;
            if (!result || !Array.isArray(result.records))
                throw new Error('Unable to load records.');
            const rows = append ? [...this.records, ...result.records] : result.records;
            this.records = [...new Map(rows.map(record => [record.id, record])).values()];
            this.nextPageToken = result.nextPageToken;
            this.hasMore = result.hasMore === true;
            this._loaded = true;
        } catch (error) {
            if (this.isConnected && version === this._requestVersion)
                this.error = getErrorMessage(error, 'Unable to load records. Refresh to retry.');
        } finally {
            if (this.isConnected && version === this._requestVersion) this.isLoading = false;
        }
    }
    handleNew() {
        if (this.newDisabled) return;
        this.openEditor();
    }
    handleRowAction(event) {
        if (this.isBusy || !this.canUpdate || event.detail.action.name !== 'edit') return;
        this.openEditor(event.detail.row);
    }
    openEditor(row) {
        this.editor = {
            kind: this.kind,
            object: OBJECTS[this.kind],
            id: row?.id,
            groupId: this._groupId,
            groupName: this.expenseGroupName,
            bankId: row?.bankId
        };
        this.selectedBankId = row?.bankId;
        this.recordError = '';
        this.message = '';
    }
    closeEditor() {
        this.editor = undefined;
        this.selectedBankId = undefined;
        this.recordError = '';
    }
    handleCancel() {
        if (!this.isSaving) this.closeEditor();
    }
    handleBankChange(event) {
        this.selectedBankId = event.detail.recordId;
    }
    handleSubmit(event) {
        event.preventDefault();
        if (!this.editor || this.saveDisabled) return;
        const metadata = this.objectInfos[this.editor.kind];
        if (this.editor.id ? !metadata?.updateable : !metadata?.createable) return;
        const fields = { ...event.detail.fields };
        if (!this.editor.id && this.editor.kind === 'Categories')
            fields[fieldName(CATEGORY_GROUP)] = this.editor.groupId;
        if (!this.editor.id && this.editingAssignment)
            fields[fieldName(ASSIGNMENT_GROUP)] = this.editor.groupId;
        if (this.editingAssignment && this.editorFieldWritable(ASSIGNMENT_BANK))
            fields[fieldName(ASSIGNMENT_BANK)] = this.selectedBankId;
        this.isSaving = true;
        this.recordError = '';
        try {
            event.target.submit(fields);
        } catch (error) {
            this.isSaving = false;
            this.recordError = getErrorMessage(error, 'Unable to save record.');
        }
    }
    handleSuccess(event) {
        if (!this.isSaving || !this.editor) return;
        const editor = this.editor;
        this.isSaving = false;
        this.closeEditor();
        this.message = 'Record saved.';
        this._requestVersion += 1;
        this.isLoading = false;
        this._loaded = false;
        this.dispatchEvent(
            new CustomEvent('configurationchange', {
                detail: {
                    objectKind: editor.kind.toLowerCase(),
                    objectApiName: objectName(editor.object),
                    recordId: event.detail.id
                }
            })
        );
        this.loadRecords();
    }
    handleError(event) {
        this.isSaving = false;
        this.recordError = getErrorMessage(event.detail, 'Unable to save record.');
        if (this.editorIsScoped && this.editor.groupId !== this._groupId) {
            this.closeEditor();
            this.error =
                'The record could not save. Select New or Edit in the current expense group to retry.';
        }
    }
}
