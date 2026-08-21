import { LightningElement, api, wire } from 'lwc';
import { getFieldValue, getRecord, notifyRecordUpdateAvailable } from 'lightning/uiRecordApi';

import RECURRING_EXPENSE_OBJECT from '@salesforce/schema/Recurring_Expense__c';
import ACTIVE_FIELD from '@salesforce/schema/Recurring_Expense__c.Active__c';
import BANK_ASSIGNMENT_FIELD from '@salesforce/schema/Recurring_Expense__c.Bank_Assignment__c';
import LEGACY_BANK_FIELD from '@salesforce/schema/Recurring_Expense__c.Bank__c';
import CATEGORY_FIELD from '@salesforce/schema/Recurring_Expense__c.Category__c';
import NEXT_RUN_DATE_FIELD from '@salesforce/schema/Recurring_Expense__c.Next_Run_Date__c';

import { formatDate, formatDateISO } from 'c/expenseFormatters';

const NO_BANK_VALUE = '__NO_BANK__';
const RECORD_CONTEXT_FIELDS = [
    ACTIVE_FIELD,
    BANK_ASSIGNMENT_FIELD,
    LEGACY_BANK_FIELD,
    CATEGORY_FIELD,
    NEXT_RUN_DATE_FIELD
];

export default class RecurringExpenseModal extends LightningElement {
    @api categoryOptions = [];
    @api categoryOptionsLoading = false;
    @api categoryOptionsError = '';
    @api bankOptions = [];
    @api bankOptionsLoading = false;
    @api bankOptionsError = '';
    @api currentBankLabel = '';
    @api selectedExpenseGroupName = '';

    recurringExpenseObject = RECURRING_EXPENSE_OBJECT;
    categoryValue = '';
    bankAssignmentValue = '';
    legacyBankValue = '';
    originalActive = true;
    nextRunDate = '';
    bankSelectionTouched = false;
    isRecordContextLoading = false;
    recordContextError = '';
    isSaving = false;
    formError = '';
    dateError = '';
    isFormLoaded = false;

    _isOpen = false;
    _recordId = null;
    _modalEnvironmentReady = false;
    _previouslyFocusedElement;
    _previousBodyOverflow;
    _hasFocusedInitialField = false;
    _hasFocusedSavingStatus = false;
    _hasInitializedAddDefaults = false;
    _pendingFocusSelector;
    _latestRecordContextRetryId = 0;

    @api
    get isOpen() {
        return this._isOpen;
    }

    set isOpen(value) {
        const nextValue = Boolean(value);
        const isOpening = nextValue && !this._isOpen;
        const isClosingExternally = !nextValue && this._isOpen;
        this._isOpen = nextValue;

        if (isOpening) {
            this.resetForOpen();
        } else if (isClosingExternally) {
            this.teardownModalEnvironment({ restoreFocus: true });
        }
    }

    @api
    get recordId() {
        return this._recordId;
    }

    set recordId(value) {
        const nextValue = value || null;
        if (nextValue === this._recordId) {
            return;
        }

        this._recordId = nextValue;
        this.resetRecordContext();
        if (this._isOpen && nextValue) {
            this.isRecordContextLoading = true;
        }
    }

    get recordIdForWire() {
        return this.isOpen && this.recordId ? this.recordId : undefined;
    }

    @wire(getRecord, { recordId: '$recordIdForWire', fields: RECORD_CONTEXT_FIELDS })
    wiredRecordContext({ error, data }) {
        if (data && data.id === this.recordId) {
            this.categoryValue = getFieldValue(data, CATEGORY_FIELD) || '';
            this.bankAssignmentValue = getFieldValue(data, BANK_ASSIGNMENT_FIELD) || '';
            this.legacyBankValue = getFieldValue(data, LEGACY_BANK_FIELD) || '';
            this.originalActive = Boolean(getFieldValue(data, ACTIVE_FIELD));
            this.nextRunDate = getFieldValue(data, NEXT_RUN_DATE_FIELD) || '';
            this.bankSelectionTouched = false;
            this.recordContextError = '';
            this.isRecordContextLoading = false;
        } else if (error && this.recordIdForWire) {
            this.recordContextError = this.getErrorMessage(
                error,
                'Failed to load the current recurring expense details.'
            );
            this.isRecordContextLoading = false;
            this.focusAfterRender('[data-record-context-error]');
        }
    }

    renderedCallback() {
        if (!this.isOpen) {
            return;
        }

        if (!this._modalEnvironmentReady) {
            this._previousBodyOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            this._previouslyFocusedElement = document.activeElement;
            this._modalEnvironmentReady = true;
            this.template.querySelector('.slds-modal')?.focus();
        }

        if (this.isSaving) {
            if (!this._hasFocusedSavingStatus) {
                this.template.querySelector('[data-saving-status]')?.focus();
                this._hasFocusedSavingStatus = true;
            }
            return;
        }

        this._hasFocusedSavingStatus = false;
        if (this._pendingFocusSelector) {
            const pendingFocusTarget = this.template.querySelector(this._pendingFocusSelector);
            this._pendingFocusSelector = undefined;
            if (pendingFocusTarget) {
                pendingFocusTarget.focus();
                return;
            }
        }

        if (!this._hasFocusedInitialField && !this.isRecordContextLoading && this.isFormLoaded) {
            const initialField = this.template.querySelector('[data-initial-focus]');
            initialField?.focus();
            if (this.template.activeElement !== initialField) {
                this.template.querySelector('.slds-modal')?.focus();
            }
            this._hasFocusedInitialField = true;
        }
    }

    disconnectedCallback() {
        this.teardownModalEnvironment();
    }

    resetForOpen() {
        this.resetRecordContext();
        this.isRecordContextLoading = this.isEditMode;
        this.isSaving = false;
        this.formError = '';
        this.dateError = '';
        this.isFormLoaded = false;
        this._hasFocusedInitialField = false;
        this._hasFocusedSavingStatus = false;
        this._hasInitializedAddDefaults = false;
        this._pendingFocusSelector = undefined;
    }

    resetRecordContext() {
        this._latestRecordContextRetryId += 1;
        this.categoryValue = '';
        this.bankAssignmentValue = '';
        this.legacyBankValue = '';
        this.originalActive = true;
        this.nextRunDate = '';
        this.bankSelectionTouched = false;
        this.isRecordContextLoading = false;
        this.recordContextError = '';
    }

    teardownModalEnvironment({ restoreFocus = false } = {}) {
        this._latestRecordContextRetryId += 1;
        if (this._modalEnvironmentReady) {
            document.body.style.overflow = this._previousBodyOverflow || '';
        }

        const previousFocus = this._previouslyFocusedElement;
        this._previouslyFocusedElement = undefined;
        this._previousBodyOverflow = undefined;
        this._modalEnvironmentReady = false;
        this._hasFocusedInitialField = false;
        this._hasFocusedSavingStatus = false;
        this._pendingFocusSelector = undefined;

        if (restoreFocus && previousFocus && typeof previousFocus.focus === 'function') {
            previousFocus.focus();
        }
    }

    handleClose() {
        if (this.isSaving) {
            return;
        }

        this.teardownModalEnvironment({ restoreFocus: true });
        this.dispatchEvent(new CustomEvent('close'));
    }

    handleKeyDown(event) {
        if (event.key === 'Escape') {
            if (!this.isSaving) {
                event.preventDefault();
                this.handleClose();
            }
            return;
        }

        if (event.key !== 'Tab') {
            return;
        }

        const focusableElements = this.getFocusableElements();
        if (focusableElements.length === 0) {
            event.preventDefault();
            return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        const activeElement = this.template.activeElement || document.activeElement;

        if (!focusableElements.includes(activeElement)) {
            event.preventDefault();
            (event.shiftKey ? lastElement : firstElement).focus();
        } else if (event.shiftKey && activeElement === firstElement) {
            event.preventDefault();
            lastElement.focus();
        } else if (!event.shiftKey && activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
        }
    }

    getFocusableElements() {
        return Array.from(
            this.template.querySelectorAll(
                'button, lightning-button, lightning-input-field, lightning-combobox, [tabindex="0"]'
            )
        ).filter(element => !element.disabled);
    }

    handleFormLoad() {
        this.isFormLoaded = true;
        if (this.isEditMode || this._hasInitializedAddDefaults) {
            return;
        }

        const startDateField = this.template.querySelector('[data-field="start-date"]');
        if (startDateField && !startDateField.value) {
            startDateField.value = formatDateISO(new Date());
        }
        this._hasInitializedAddDefaults = true;
    }

    handleSubmit(event) {
        event.preventDefault();
        this.formError = '';
        this.dateError = '';

        if (this.isSaveBlocked) {
            this.focusFirstBlockingMessage();
            return;
        }

        const inputFieldsValid = Array.from(
            this.template.querySelectorAll('lightning-input-field')
        ).reduce((isValid, field) => field.reportValidity() && isValid, true);
        const categoryInput = this.template.querySelector('[data-field="category"]');
        const bankInput = this.template.querySelector('[data-field="bank"]');
        const categoryValid = categoryInput?.reportValidity() ?? true;
        const bankValid = bankInput?.reportValidity() ?? true;
        if (!inputFieldsValid || !categoryValid || !bankValid) {
            return;
        }

        const fields = { ...event.detail.fields };
        if (
            fields.Start_Date__c &&
            fields.End_Date__c &&
            fields.End_Date__c < fields.Start_Date__c
        ) {
            this.dateError = 'End Date cannot be before Start Date.';
            this.focusAfterRender('[data-date-error]');
            return;
        }

        if (
            this.isEditMode &&
            !this.originalActive &&
            fields.Active__c &&
            this.isSelectedBankInactive
        ) {
            this.formError =
                'Choose an active bank or No bank before reactivating this recurring expense.';
            this.focusAfterRender('[data-form-error]');
            return;
        }

        fields.Category__c = this.categoryValue;
        if (!this.hasUntouchedLegacyBank) {
            fields.Bank_Assignment__c = this.normalizedBankAssignmentValue;
        }
        if (this.bankSelectionTouched) {
            fields.Bank__c = null;
        }

        this.isSaving = true;
        this._hasFocusedSavingStatus = false;
        this.template.querySelector('lightning-record-edit-form').submit(fields);
    }

    handleSuccess(event) {
        const mode = this.isEditMode ? 'edit' : 'create';
        this.isSaving = false;
        this.dispatchEvent(
            new CustomEvent('success', {
                detail: {
                    recordId: event.detail.id,
                    mode
                }
            })
        );
        this.handleClose();
    }

    handleError(event) {
        this.isSaving = false;
        this.formError =
            event.detail?.detail || event.detail?.message || 'Failed to save recurring expense.';
        this.focusAfterRender('[data-form-error]');
    }

    handleCategoryChange(event) {
        this.categoryValue = event.detail.value;
        this.formError = '';
    }

    handleBankChange(event) {
        this.bankAssignmentValue = event.detail.value;
        this.bankSelectionTouched = true;
        this.formError = '';
    }

    handleDateChange() {
        this.dateError = '';
    }

    handleRetryBanks() {
        this.dispatchEvent(new CustomEvent('retrybanks'));
    }

    handleRetryCategories() {
        this.dispatchEvent(new CustomEvent('retrycategories'));
    }

    async handleRetryRecordContext() {
        if (!this.recordId) {
            return;
        }

        const recordId = this.recordId;
        const retryId = ++this._latestRecordContextRetryId;
        this.recordContextError = '';
        this.isRecordContextLoading = true;
        try {
            await notifyRecordUpdateAvailable([{ recordId }]);
            if (!this.isCurrentRecordContextRetry(retryId, recordId)) {
                return;
            }

            if (this.isRecordContextLoading) {
                this.recordContextError =
                    'The recurring expense did not reload. Close this dialog and try again.';
                this.isRecordContextLoading = false;
                this.focusAfterRender('[data-record-context-error]');
            }
        } catch (error) {
            if (!this.isCurrentRecordContextRetry(retryId, recordId)) {
                return;
            }

            this.recordContextError = this.getErrorMessage(
                error,
                'Failed to reload the current recurring expense details.'
            );
            this.isRecordContextLoading = false;
            this.focusAfterRender('[data-record-context-error]');
        }
    }

    isCurrentRecordContextRetry(retryId, recordId) {
        return (
            this.isOpen &&
            retryId === this._latestRecordContextRetryId &&
            recordId === this.recordId
        );
    }

    focusFirstBlockingMessage() {
        const selector = this.recordContextError
            ? '[data-record-context-error]'
            : this.categoryOptionsError
              ? '[data-category-options-error]'
              : this.bankOptionsError
                ? '[data-bank-options-error]'
                : '[data-category-empty]';
        this.template.querySelector(selector)?.focus();
    }

    focusAfterRender(selector) {
        this._pendingFocusSelector = selector;
    }

    get isEditMode() {
        return Boolean(this.recordId);
    }

    get modalTitle() {
        return this.isEditMode ? 'Edit Recurring Expense' : 'Add Recurring Expense';
    }

    get modalDescription() {
        const groupName = this.selectedExpenseGroupName || 'this expense group';
        return `${this.isEditMode ? 'Update' : 'Create'} a recurring expense template for ${groupName}.`;
    }

    get categoryPlaceholder() {
        return this.selectedExpenseGroupName
            ? `Select a ${this.selectedExpenseGroupName} category`
            : 'Select a category';
    }

    get bankPlaceholder() {
        return this.selectedExpenseGroupName
            ? `Select a bank assigned to ${this.selectedExpenseGroupName}`
            : 'Select a bank';
    }

    get bankComboboxOptions() {
        const options = [...this.bankOptions];
        if (
            this.isEditMode &&
            this.bankAssignmentValue &&
            !this.bankOptionsLoading &&
            !this.bankOptionsError &&
            !options.some(option => option.value === this.bankAssignmentValue)
        ) {
            options.push({
                label: `${this.currentBankLabel || 'Unavailable bank'} (Inactive)`,
                value: this.bankAssignmentValue,
                inactive: true
            });
        }

        return [{ label: 'No bank', value: NO_BANK_VALUE }, ...options];
    }

    get normalizedBankAssignmentValue() {
        return this.bankAssignmentValue && this.bankAssignmentValue !== NO_BANK_VALUE
            ? this.bankAssignmentValue
            : null;
    }

    get hasUntouchedLegacyBank() {
        return Boolean(
            this.isEditMode &&
            !this.bankAssignmentValue &&
            this.legacyBankValue &&
            !this.bankSelectionTouched
        );
    }

    get isCurrentBankInactive() {
        if (!this.isEditMode || !this.bankAssignmentValue) {
            return false;
        }

        return (
            !this.bankOptionsLoading &&
            !this.bankOptionsError &&
            !this.bankOptions.some(option => option.value === this.bankAssignmentValue)
        );
    }

    get isSelectedBankInactive() {
        const assignmentId = this.normalizedBankAssignmentValue;
        if (!assignmentId) {
            return false;
        }

        const option = this.bankComboboxOptions.find(item => item.value === assignmentId);
        return Boolean(option?.inactive || option?.disabled);
    }

    get bankContextNotice() {
        if (this.hasUntouchedLegacyBank) {
            return `Legacy bank: ${this.legacyBankValue}. Leave it unchanged to preserve it, or choose an assigned bank.`;
        }

        if (this.isCurrentBankInactive) {
            return `${this.currentBankLabel || 'This bank'} is inactive. You can keep it for historical edits, but choose an active bank or No bank before reactivating this template.`;
        }

        return '';
    }

    get hasNoCategories() {
        return (
            !this.categoryOptionsLoading &&
            !this.categoryOptionsError &&
            this.categoryOptions.length === 0
        );
    }

    get hasNoAvailableBanks() {
        return !this.bankOptionsLoading && !this.bankOptionsError && this.bankOptions.length === 0;
    }

    get noCategoriesMessage() {
        const groupName = this.selectedExpenseGroupName || 'this expense group';
        return `Create a category for ${groupName} before adding a recurring expense.`;
    }

    get noAvailableBanksMessage() {
        const groupName = this.selectedExpenseGroupName || 'this expense group';
        return `No active banks are assigned to ${groupName}. You can save this recurring expense without a bank.`;
    }

    get isCategoryInputDisabled() {
        return (
            this.isSaving ||
            this.isRecordContextLoading ||
            Boolean(this.recordContextError) ||
            this.categoryOptionsLoading ||
            Boolean(this.categoryOptionsError) ||
            this.hasNoCategories
        );
    }

    get isBankInputDisabled() {
        return (
            this.isSaving ||
            this.isRecordContextLoading ||
            Boolean(this.recordContextError) ||
            this.bankOptionsLoading ||
            Boolean(this.bankOptionsError)
        );
    }

    get areRecordFieldsDisabled() {
        return this.isSaving || this.isRecordContextLoading || Boolean(this.recordContextError);
    }

    get isSaveBlocked() {
        return (
            this.isSaving ||
            this.isRecordContextLoading ||
            Boolean(this.recordContextError) ||
            this.categoryOptionsLoading ||
            Boolean(this.categoryOptionsError) ||
            this.hasNoCategories ||
            this.bankOptionsLoading ||
            Boolean(this.bankOptionsError)
        );
    }

    get saveButtonLabel() {
        return this.isSaving ? 'Saving...' : 'Save';
    }

    get nextRunDateDisplay() {
        return this.nextRunDate ? formatDate(this.nextRunDate) : 'Set automatically after save';
    }

    getErrorMessage(error, fallback) {
        return error?.body?.message || fallback;
    }
}
