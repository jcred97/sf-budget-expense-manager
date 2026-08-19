import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

const NO_BANK_VALUE = '__NO_BANK__';

export default class ExpenseModal extends LightningElement {
    @api categoryOptions = [];
    @api bankOptions = [];
    @api bankOptionsLoading = false;
    @api bankOptionsError = '';
    @api currentBank;
    @api bankSelectionNotice = '';
    @api selectedExpenseGroupName = '';

    @track isClosing = false;
    @track isRendered = false;

    _isOpen = false;
    _recordId = null;
    _duplicateData = null;
    _handleKeyDown;
    _previouslyFocusedElement;
    _previousBodyOverflow;
    _saveAndNew = false;
    categoryValue = '';
    bankAssignmentValue = '';
    bankSelectionTouched = false;
    transactionTimeValue = '';

    @api
    get isOpen() {
        return this._isOpen;
    }

    set isOpen(value) {
        const isOpening = value && !this._isOpen;
        this._isOpen = value;

        if (isOpening && !this._recordId && !this._duplicateData) {
            this.categoryValue = '';
            this.bankAssignmentValue = '';
            this.bankSelectionTouched = false;
            this.transactionTimeValue = '';
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

            // Preserve the page state before applying modal behavior.
            this._previousBodyOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            this._previouslyFocusedElement = document.activeElement;

            this._handleKeyDown = this.handleKeyDown.bind(this);
            document.addEventListener('keydown', this._handleKeyDown);

            const focusable = this.getFocusableElements();
            if (focusable.length > 0) {
                focusable[0].focus();
            }
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
        if (this.isRendered) {
            document.body.style.overflow = this._previousBodyOverflow || '';
        }

        if (this._handleKeyDown) {
            document.removeEventListener('keydown', this._handleKeyDown);
        }

        const previousFocus = this._previouslyFocusedElement;
        this._handleKeyDown = undefined;
        this._previouslyFocusedElement = undefined;
        this._previousBodyOverflow = undefined;
        this.isRendered = false;

        if (restoreFocus && previousFocus && typeof previousFocus.focus === 'function') {
            previousFocus.focus();
        }
    }

    handleKeyDown(event) {
        // Escape closes the modal.
        if (event.key === 'Escape') {
            this.handleClose();
            return;
        }

        // Keep keyboard focus inside the modal.
        if (event.key === 'Tab') {
            const focusable = this.getFocusableElements();

            if (focusable.length === 0) {
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    }

    getFocusableElements() {
        return Array.from(
            this.template.querySelectorAll(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            )
        );
    }

    handleSaveAndNew() {
        this._saveAndNew = true;
    }

    handleSave() {
        this._saveAndNew = false;
    }

    handleLoad(event) {
        if (!this.isEditMode) {
            return;
        }

        const record = event.detail.records?.[this.recordId];
        this.categoryValue = record?.fields?.Category__c?.value || '';
        this.bankAssignmentValue =
            record?.fields?.Bank_Assignment__c?.value || this.currentBank?.assignmentId || '';
        this.bankSelectionTouched = false;
        this.transactionTimeValue = this.normalizeTimeForInput(
            record?.fields?.Transaction_Time__c?.value
        );
    }

    handleSubmit(event) {
        event.preventDefault();

        if (this.isBankSaveBlocked) {
            this.template.querySelector('[data-bank-options-error]')?.focus();
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
        const message = event.detail?.detail || 'Failed to save expense.';
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

    get isBankInputDisabled() {
        return this.bankOptionsLoading || Boolean(this.bankOptionsError);
    }

    get isBankSaveBlocked() {
        return this.bankOptionsLoading || Boolean(this.bankOptionsError);
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
