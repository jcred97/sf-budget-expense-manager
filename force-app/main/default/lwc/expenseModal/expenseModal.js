import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

import { getErrorMessage } from 'c/expenseErrorUtils';
import {
    captureModalEnvironment,
    getFocusableElements,
    restoreModalEnvironment,
    trapTabFocus
} from 'c/modalFocusUtils';

const NO_BANK_VALUE = '__NO_BANK__';

export default class ExpenseModal extends LightningElement {
    @api categoryOptions = [];
    @api categoryOptionsLoading = false;
    @api categoryOptionsError = '';
    @api bankOptions = [];
    @api bankOptionsLoading = false;
    @api bankOptionsError = '';
    @api currentBank;
    @api bankSelectionNotice = '';
    @api selectedExpenseGroupName = '';

    @track isClosing = false;
    @track isRendered = false;
    isFormLoaded = false;
    formLoadError = '';

    _isOpen = false;
    _recordId = null;
    _duplicateData = null;
    _handleKeyDown;
    _modalEnvironment;
    _saveAndNew = false;
    _hasFocusedInitialField = false;
    categoryValue = '';
    bankAssignmentValue = '';
    bankSelectionTouched = false;
    transactionTimeValue = '';

    @api
    get isOpen() {
        return this._isOpen;
    }

    set isOpen(value) {
        const nextValue = Boolean(value);
        const isOpening = nextValue && !this._isOpen;
        const isClosingExternally = !nextValue && this._isOpen;
        this._isOpen = nextValue;

        if (isOpening && !this._recordId && !this._duplicateData) {
            this.categoryValue = '';
            this.bankAssignmentValue = '';
            this.bankSelectionTouched = false;
            this.transactionTimeValue = '';
        }
        if (isOpening) {
            this.isFormLoaded = false;
            this.formLoadError = '';
            this._hasFocusedInitialField = false;
        } else if (isClosingExternally) {
            this.teardownModalEnvironment({ restoreFocus: true });
        }
    }

    @api
    get recordId() {
        return this._recordId;
    }

    set recordId(value) {
        this._recordId = value;
        if (!value) {
            this.categoryValue = this._duplicateData?.Category__c || '';
            this.bankAssignmentValue = this._duplicateData?.Bank_Assignment__c || '';
            this.bankSelectionTouched = false;
            this.transactionTimeValue = this.normalizeTimeForInput(
                this._duplicateData?.Transaction_Time__c
            );
        }
    }

    @api
    get duplicateData() {
        return this._duplicateData;
    }

    set duplicateData(value) {
        this._duplicateData = value;
        if (!this._recordId) {
            this.categoryValue = value?.Category__c || '';
            this.bankAssignmentValue = value?.Bank_Assignment__c || '';
            this.bankSelectionTouched = false;
            this.transactionTimeValue = this.normalizeTimeForInput(value?.Transaction_Time__c);
        }
    }

    renderedCallback() {
        if (this.isOpen && !this.isRendered) {
            this.isRendered = true;

            this._modalEnvironment = captureModalEnvironment();

            this._handleKeyDown = this.handleKeyDown.bind(this);
            document.addEventListener('keydown', this._handleKeyDown);

            this.template.querySelector('.slds-modal')?.focus();
        }

        if (!this.isOpen) {
            return;
        }

        if (this.isModalContentLoading) {
            this._hasFocusedInitialField = false;
            return;
        }

        if (!this._hasFocusedInitialField) {
            const initialField = this.template.querySelector(this.initialFocusSelector);
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

    handleClose() {
        if (this.isClosing) {
            return;
        }

        this.isClosing = true;

        const modal = this.template.querySelector('.slds-modal');
        if (!modal) {
            this.completeClose();
            return;
        }

        modal.addEventListener(
            'animationend',
            () => {
                this.completeClose();
            },
            { once: true }
        );
    }

    completeClose() {
        this.isClosing = false;
        this.teardownModalEnvironment({ restoreFocus: true });
        this.dispatchEvent(new CustomEvent('close'));
    }

    teardownModalEnvironment({ restoreFocus = false } = {}) {
        restoreModalEnvironment(this._modalEnvironment, { restoreFocus });

        if (this._handleKeyDown) {
            document.removeEventListener('keydown', this._handleKeyDown);
        }

        this._handleKeyDown = undefined;
        this._modalEnvironment = undefined;
        this.isClosing = false;
        this.isRendered = false;
        this.isFormLoaded = false;
        this.formLoadError = '';
        this._hasFocusedInitialField = false;
    }

    handleKeyDown(event) {
        // Escape closes the modal.
        if (event.key === 'Escape') {
            this.handleClose();
            return;
        }

        const activeElement = this.template.activeElement || document.activeElement;
        trapTabFocus(event, this.getFocusableElements(), activeElement, {
            preventWhenEmpty: true,
            recoverExternalFocus: true
        });
    }

    getFocusableElements() {
        if (this.isFormUnavailable) {
            return getFocusableElements(
                this.template,
                '[data-modal-close], [data-form-load-close]'
            );
        }
        return getFocusableElements(this.template);
    }

    handleSaveAndNew() {
        this._saveAndNew = true;
    }

    handleSave() {
        this._saveAndNew = false;
    }

    handleLoad(event) {
        this.formLoadError = '';
        if (this.isEditMode) {
            const record = event.detail.records?.[this.recordId];
            this.categoryValue = record?.fields?.Category__c?.value || '';
            this.bankAssignmentValue =
                record?.fields?.Bank_Assignment__c?.value || this.currentBank?.assignmentId || '';
            this.bankSelectionTouched = false;
            this.transactionTimeValue = this.normalizeTimeForInput(
                record?.fields?.Transaction_Time__c?.value
            );
        }
        this.isFormLoaded = true;
    }

    handleSubmit(event) {
        event.preventDefault();

        if (this.isSaveBlocked) {
            const selector = this.formLoadError
                ? '[data-form-load-error]'
                : this.categoryOptionsError
                  ? '[data-category-options-error]'
                  : this.hasNoCategories
                    ? '[data-category-empty]'
                    : '[data-bank-options-error]';
            this.template.querySelector(selector)?.focus();
            return;
        }

        const categoryInput = this.template.querySelector('[data-field="category"]');
        if (categoryInput && !categoryInput.reportValidity()) {
            return;
        }

        const bankInput = this.template.querySelector('[data-field="bank"]');
        if (bankInput && !bankInput.reportValidity()) {
            return;
        }

        const fields = { ...event.detail.fields };
        fields.Category__c = this.categoryValue;
        fields.Transaction_Time__c = this.normalizeTimeForSubmit(this.transactionTimeValue);

        if (!this.hasUntouchedLegacyBank) {
            fields.Bank_Assignment__c = this.normalizedBankAssignmentValue;
        }
        if (this.bankSelectionTouched) {
            fields.Bank__c = null;
        }

        this.template.querySelector('lightning-record-edit-form').submit(fields);
    }

    handleCategoryChange(event) {
        this.categoryValue = event.detail.value;
    }

    handleTransactionTimeChange(event) {
        this.transactionTimeValue = event.detail.value;
    }

    handleBankChange(event) {
        this.bankAssignmentValue = event.detail.value;
        this.bankSelectionTouched = true;
    }

    handleRetryBanks() {
        this.dispatchEvent(new CustomEvent('retrybanks'));
    }

    handleRetryCategories() {
        this.dispatchEvent(new CustomEvent('retrycategories'));
    }

    handleSuccess() {
        this.dispatchEvent(new CustomEvent('success'));

        if (this._saveAndNew) {
            this.template.querySelectorAll('lightning-input-field').forEach(field => {
                if (field && 'value' in field) {
                    field.value = null;
                }
            });
            this.categoryValue = '';
            this.bankAssignmentValue = '';
            this.bankSelectionTouched = false;
            this.transactionTimeValue = '';
            this._saveAndNew = false;
        } else {
            this.handleClose();
        }
    }

    handleError(event) {
        if (!this.isFormLoaded) {
            this.formLoadError = getErrorMessage(
                event.detail,
                'Failed to load the expense form. Close this dialog and try again.'
            );
            this._hasFocusedInitialField = false;
            return;
        }

        const message = getErrorMessage(event.detail, 'Failed to save expense.');
        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Error',
                message,
                variant: 'error'
            })
        );
    }

    get fieldValue() {
        return this.duplicateData || {};
    }

    get categoryPlaceholder() {
        return this.selectedExpenseGroupName
            ? `Select a ${this.selectedExpenseGroupName} category`
            : 'Select a category';
    }

    get bankComboboxOptions() {
        return [{ label: 'No bank', value: NO_BANK_VALUE }, ...this.bankOptions];
    }

    get bankPlaceholder() {
        return this.selectedExpenseGroupName
            ? `Select a bank assigned to ${this.selectedExpenseGroupName}`
            : 'Select a bank';
    }

    get normalizedBankAssignmentValue() {
        return this.bankAssignmentValue && this.bankAssignmentValue !== NO_BANK_VALUE
            ? this.bankAssignmentValue
            : null;
    }

    get hasUntouchedLegacyBank() {
        return Boolean(
            this.isEditMode &&
            !this.currentBank?.assignmentId &&
            this.currentBank?.legacyBank &&
            !this.bankSelectionTouched
        );
    }

    get hasNoAvailableBanks() {
        return (
            !this.bankOptionsLoading &&
            !this.bankOptionsError &&
            !this.bankOptions.some(option => !option.inactive)
        );
    }

    get hasNoCategories() {
        return (
            !this.categoryOptionsLoading &&
            !this.categoryOptionsError &&
            this.categoryOptions.length === 0
        );
    }

    get isCategoryInputDisabled() {
        return (
            Boolean(this.formLoadError) ||
            this.categoryOptionsLoading ||
            Boolean(this.categoryOptionsError) ||
            this.hasNoCategories
        );
    }

    get isBankInputDisabled() {
        return (
            Boolean(this.formLoadError) || this.bankOptionsLoading || Boolean(this.bankOptionsError)
        );
    }

    get isSaveBlocked() {
        return (
            Boolean(this.formLoadError) ||
            this.isModalContentLoading ||
            Boolean(this.categoryOptionsError) ||
            this.hasNoCategories ||
            Boolean(this.bankOptionsError)
        );
    }

    get bankContextNotice() {
        if (this.bankSelectionNotice) {
            return this.bankSelectionNotice;
        }

        if (this.hasUntouchedLegacyBank) {
            return `Legacy bank: ${this.currentBank.legacyBank}. Leave it unchanged to preserve it, or choose an assigned bank.`;
        }

        if (this.isEditMode && this.isCurrentBankInactive) {
            return `${this.currentBank.label || 'This bank'} is inactive. You can keep it on this expense or choose another bank.`;
        }

        return '';
    }

    get isCurrentBankInactive() {
        const assignmentId = this.currentBank?.assignmentId;
        if (!assignmentId) {
            return false;
        }

        const currentOption = this.bankOptions.find(option => option.value === assignmentId);
        if (currentOption) {
            return Boolean(currentOption.inactive || currentOption.disabled);
        }

        return !this.bankOptionsLoading && !this.bankOptionsError;
    }

    get noAvailableBanksMessage() {
        const groupName = this.selectedExpenseGroupName || 'this expense group';
        return `No active banks are assigned to ${groupName}. You can save this expense without a bank.`;
    }

    get noCategoriesMessage() {
        const groupName = this.selectedExpenseGroupName || 'this expense group';
        return `Create a category for ${groupName} before adding an expense.`;
    }

    get isModalContentLoading() {
        if (this.formLoadError) {
            return false;
        }
        return !this.isFormLoaded || this.categoryOptionsLoading || this.bankOptionsLoading;
    }

    get isFormUnavailable() {
        return this.isModalContentLoading || Boolean(this.formLoadError);
    }

    get formFieldsClass() {
        return `slds-form slds-form_stacked ${this.isFormUnavailable ? 'slds-hide' : ''}`;
    }

    get formFooterClass() {
        return `slds-modal__footer ${this.isFormUnavailable ? 'slds-hide' : ''}`;
    }

    get initialFocusSelector() {
        if (this.formLoadError) {
            return '[data-form-load-error]';
        }
        if (this.categoryOptionsError) {
            return '[data-category-options-error]';
        }
        if (this.bankOptionsError) {
            return '[data-bank-options-error]';
        }
        if (this.hasNoCategories) {
            return '[data-category-empty]';
        }
        return '[data-initial-focus]';
    }

    normalizeTimeForInput(value) {
        if (!value) {
            return '';
        }

        if (typeof value === 'number') {
            const totalMinutes = Math.floor(value / 60000);
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        }

        return String(value).slice(0, 5);
    }

    normalizeTimeForSubmit(value) {
        if (!value) {
            return null;
        }

        const [hour, minute] = value.split(':');
        return `${hour}:${minute}:00.000Z`;
    }

    get isEditMode() {
        return this.recordId != null;
    }

    get isAddMode() {
        return this.recordId == null;
    }

    get modalTitle() {
        if (this.duplicateData) return 'Duplicate Expense';
        return this.isEditMode ? 'Edit Expense' : 'Add Expense';
    }

    get modalClass() {
        return `slds-modal slds-fade-in-open ${this.isClosing ? 'fade-out' : 'fade-in'}`;
    }

    get backdropClass() {
        return `slds-backdrop ${this.isClosing ? '' : 'slds-backdrop_open'}`;
    }
}
