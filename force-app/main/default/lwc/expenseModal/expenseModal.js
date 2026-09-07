import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

import { multiplyDecimalHalfUp } from 'c/expenseCurrencyMath';
import { fetchPhpExchangeRate } from 'c/expenseExchangeRateData';
import { getErrorMessage } from 'c/expenseErrorUtils';
import { formatCurrency, formatDate, formatDateISO, formatPHP } from 'c/expenseFormatters';
import {
    captureModalEnvironment,
    getFocusableElements,
    restoreModalEnvironment,
    trapTabFocus
} from 'c/modalFocusUtils';

const NO_BANK_VALUE = '__NO_BANK__';
const PHP_CURRENCY_CODE = 'PHP';

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
    isSubmitting = false;
    isForeignCurrency = false;
    isExchangeRateLoading = false;
    exchangeRateError = '';
    originalCurrencyCode = '';
    originalAmountValue = '';
    exchangeRateValue = '';
    exchangeRateDate = '';
    exchangeRateSource = '';
    expenseDateValue = '';

    _isOpen = false;
    _recordId = null;
    _duplicateData = null;
    _handleKeyDown;
    _modalEnvironment;
    _saveAndNew = false;
    _hasFocusedInitialField = false;
    _exchangeRateRequestId = 0;
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
            this.expenseDateValue = '';
            this.resetForeignCurrencyState();
        }
        if (isOpening) {
            this.isFormLoaded = false;
            this.formLoadError = '';
            this.isSubmitting = false;
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
            this.initializeCurrencyState(this._duplicateData);
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
            this.initializeCurrencyState(value);
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
        if (this.isClosing || this.isSubmitting) {
            return;
        }

        this.cancelExchangeRateRequest();
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
        this.isSubmitting = false;
        this.cancelExchangeRateRequest();
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
        Promise.resolve().then(() => {
            if (!this.isSubmitting) {
                this._saveAndNew = false;
            }
        });
    }

    handleSave() {
        this._saveAndNew = false;
    }

    handleLoad(event) {
        this.formLoadError = '';
        this.isSubmitting = false;
        if (this.isEditMode) {
            const record = event.detail.records?.[this.recordId];
            this.categoryValue = record?.fields?.Category__c?.value || '';
            this.bankAssignmentValue =
                record?.fields?.Bank_Assignment__c?.value || this.currentBank?.assignmentId || '';
            this.bankSelectionTouched = false;
            this.transactionTimeValue = this.normalizeTimeForInput(
                record?.fields?.Transaction_Time__c?.value
            );
            this.initializeCurrencyState({
                Expense_Date__c: record?.fields?.Expense_Date__c?.value,
                Original_Amount__c: record?.fields?.Original_Amount__c?.value,
                Original_Currency_Code__c: record?.fields?.Original_Currency_Code__c?.value,
                Exchange_Rate_To_PHP__c: record?.fields?.Exchange_Rate_To_PHP__c?.value,
                Exchange_Rate_Date__c: record?.fields?.Exchange_Rate_Date__c?.value,
                Exchange_Rate_Source__c: record?.fields?.Exchange_Rate_Source__c?.value
            });
        }
        this.isFormLoaded = true;
    }

    handleSubmit(event) {
        event.preventDefault();

        const saveAndNewRequested = this._saveAndNew;
        this._saveAndNew = false;

        if (this.isSubmitting) {
            return;
        }

        if (this.isExchangeRateLoading) {
            this.template.querySelector('[data-exchange-rate-status]')?.focus();
            return;
        }

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

        if (this.isForeignCurrency && !this.reportForeignCurrencyValidity()) {
            return;
        }

        const fields = { ...event.detail.fields };
        fields.Category__c = this.categoryValue;
        fields.Transaction_Time__c = this.normalizeTimeForSubmit(this.transactionTimeValue);

        if (this.isForeignCurrency) {
            fields.Amount__c = this.calculatedPhpAmount;
            fields.Original_Amount__c = String(this.originalAmountValue).trim();
            fields.Original_Currency_Code__c = this.normalizedOriginalCurrencyCode;
            fields.Exchange_Rate_To_PHP__c = String(this.exchangeRateValue).trim();
            fields.Exchange_Rate_Date__c = this.exchangeRateDate;
            fields.Exchange_Rate_Source__c = this.exchangeRateSource;
        } else {
            fields.Original_Amount__c = null;
            fields.Original_Currency_Code__c = null;
            fields.Exchange_Rate_To_PHP__c = null;
            fields.Exchange_Rate_Date__c = null;
            fields.Exchange_Rate_Source__c = null;
        }

        if (!this.hasUntouchedLegacyBank) {
            fields.Bank_Assignment__c = this.normalizedBankAssignmentValue;
        }
        if (this.bankSelectionTouched) {
            fields.Bank__c = null;
        }

        this._saveAndNew = saveAndNewRequested;
        this.isSubmitting = true;
        this.template.querySelector('lightning-record-edit-form').submit(fields);
    }

    handleCategoryChange(event) {
        this.categoryValue = event.detail.value;
    }

    handleTransactionTimeChange(event) {
        this.transactionTimeValue = event.detail.value;
    }

    handleExpenseDateChange(event) {
        const nextDate = event.detail?.value || event.target?.value || '';
        if (nextDate === this.expenseDateValue) {
            return;
        }

        this.expenseDateValue = nextDate;
        if (this.isForeignCurrency) {
            this.clearExchangeRateQuote();
        }
    }

    handleForeignCurrencyToggle(event) {
        const isEnabled = Boolean(event.target.checked);
        if (isEnabled === this.isForeignCurrency) {
            return;
        }

        if (!isEnabled) {
            const calculatedAmount = this.calculatedPhpAmount;
            if (calculatedAmount != null) {
                const amountField = this.template.querySelector('[data-field="phpAmount"]');
                if (amountField) {
                    amountField.value = calculatedAmount;
                }
            }
            this.resetForeignCurrencyState();
            return;
        }

        this.isForeignCurrency = true;
        this.exchangeRateError = '';
    }

    handleCurrencyCodeChange(event) {
        const nextCode = String(event.detail?.value || event.target?.value || '').toUpperCase();
        if (nextCode !== this.originalCurrencyCode) {
            this.originalCurrencyCode = nextCode;
            this.clearExchangeRateQuote();
        }
        this.setCurrencyInputValidity(event.target);
    }

    handleOriginalAmountChange(event) {
        const nextAmount = event.detail?.value ?? event.target?.value;
        this.originalAmountValue = nextAmount == null ? '' : String(nextAmount);
    }

    handleExchangeRateChange(event) {
        this.cancelExchangeRateRequest();
        const nextRate = event.detail?.value ?? event.target?.value;
        this.exchangeRateValue = nextRate == null ? '' : String(nextRate);
        this.exchangeRateError = '';

        if (this.isPositiveNumber(this.exchangeRateValue)) {
            this.exchangeRateDate = this.rateContextDate;
            this.exchangeRateSource = 'Manual';
        } else {
            this.exchangeRateDate = '';
            this.exchangeRateSource = '';
        }
    }

    async handleFetchExchangeRate() {
        const currencyInput = this.template.querySelector('[data-field="originalCurrency"]');
        this.setCurrencyInputValidity(currencyInput);
        if (!currencyInput?.reportValidity()) {
            return;
        }

        const sourceCurrency = this.normalizedOriginalCurrencyCode;
        const requestedDate = this.expenseDateValue || null;
        const requestId = ++this._exchangeRateRequestId;
        this.isExchangeRateLoading = true;
        this.exchangeRateError = '';

        try {
            const quote = await fetchPhpExchangeRate({ sourceCurrency, requestedDate });
            if (
                requestId !== this._exchangeRateRequestId ||
                sourceCurrency !== this.normalizedOriginalCurrencyCode ||
                requestedDate !== (this.expenseDateValue || null)
            ) {
                return;
            }

            if (!this.isPositiveNumber(quote?.rate) || !quote?.effectiveDate) {
                throw new Error('The exchange-rate service returned an incomplete quote.');
            }

            this.exchangeRateValue = String(quote.rate);
            this.exchangeRateDate = quote.effectiveDate;
            this.exchangeRateSource = quote.source || 'ECB via Frankfurter';
        } catch (error) {
            if (requestId === this._exchangeRateRequestId) {
                this.exchangeRateError = getErrorMessage(
                    error,
                    'Could not load a reference rate. Enter the rate manually or try again.'
                );
            }
        } finally {
            if (requestId === this._exchangeRateRequestId) {
                this.isExchangeRateLoading = false;
            }
        }
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
        this.isSubmitting = false;
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
            this.expenseDateValue = '';
            this.resetForeignCurrencyState();
            this._saveAndNew = false;
        } else {
            this.handleClose();
        }
    }

    handleError(event) {
        this.isSubmitting = false;
        this._saveAndNew = false;
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

    initializeCurrencyState(data) {
        this.cancelExchangeRateRequest();
        this.expenseDateValue = data?.Expense_Date__c || '';
        this.originalAmountValue =
            data?.Original_Amount__c == null ? '' : String(data.Original_Amount__c);
        this.originalCurrencyCode = String(data?.Original_Currency_Code__c || '').toUpperCase();
        this.exchangeRateValue =
            data?.Exchange_Rate_To_PHP__c == null ? '' : String(data.Exchange_Rate_To_PHP__c);
        this.exchangeRateDate = data?.Exchange_Rate_Date__c || '';
        this.exchangeRateSource = data?.Exchange_Rate_Source__c || '';
        this.exchangeRateError = '';
        this.isForeignCurrency = Boolean(
            this.originalCurrencyCode ||
            this.originalAmountValue !== '' ||
            this.exchangeRateValue !== '' ||
            this.exchangeRateDate ||
            this.exchangeRateSource
        );
    }

    resetForeignCurrencyState() {
        this.cancelExchangeRateRequest();
        this.isForeignCurrency = false;
        this.originalCurrencyCode = '';
        this.originalAmountValue = '';
        this.exchangeRateValue = '';
        this.exchangeRateDate = '';
        this.exchangeRateSource = '';
        this.exchangeRateError = '';
    }

    clearExchangeRateQuote() {
        this.cancelExchangeRateRequest();
        this.exchangeRateValue = '';
        this.exchangeRateDate = '';
        this.exchangeRateSource = '';
        this.exchangeRateError = '';
    }

    cancelExchangeRateRequest() {
        this._exchangeRateRequestId += 1;
        this.isExchangeRateLoading = false;
    }

    reportForeignCurrencyValidity() {
        const currencyInput = this.template.querySelector('[data-field="originalCurrency"]');
        this.setCurrencyInputValidity(currencyInput);

        let isValid = true;
        this.template.querySelectorAll('[data-fx-input]').forEach(input => {
            isValid = input.reportValidity() && isValid;
        });

        if (
            isValid &&
            (!this.exchangeRateDate || !this.exchangeRateSource || this.calculatedPhpAmount == null)
        ) {
            this.exchangeRateError =
                'Enter a valid exchange rate or get a reference rate before saving.';
            this.template.querySelector('[data-field="exchangeRate"]')?.focus();
            return false;
        }

        return isValid;
    }

    setCurrencyInputValidity(input) {
        if (!input) {
            return;
        }
        input.setCustomValidity(
            this.normalizedOriginalCurrencyCode === PHP_CURRENCY_CODE
                ? 'Turn off foreign currency to enter a PHP expense.'
                : ''
        );
    }

    isPositiveNumber(value) {
        const numberValue = Number(value);
        return Number.isFinite(numberValue) && numberValue > 0;
    }

    get normalizedOriginalCurrencyCode() {
        return this.originalCurrencyCode.trim().toUpperCase();
    }

    get calculatedPhpAmount() {
        if (
            !this.isPositiveNumber(this.originalAmountValue) ||
            !this.isPositiveNumber(this.exchangeRateValue)
        ) {
            return null;
        }

        return multiplyDecimalHalfUp(this.originalAmountValue, this.exchangeRateValue, 2);
    }

    get rateContextDate() {
        const today = formatDateISO(new Date());
        return this.expenseDateValue && this.expenseDateValue <= today
            ? this.expenseDateValue
            : today;
    }

    get phpAmountClass() {
        return this.isForeignCurrency ? 'slds-hide' : '';
    }

    get foreignCurrencyFieldsClass() {
        const baseClass = 'foreign-currency-fields slds-box slds-box_small slds-m-bottom_small';
        return this.isForeignCurrency ? baseClass : `${baseClass} slds-hide`;
    }

    get areForeignCurrencyFieldsHidden() {
        return !this.isForeignCurrency;
    }

    get isPhpAmountDisabled() {
        return this.isForeignCurrency || this.isSubmitting;
    }

    get areForeignCurrencyInputsDisabled() {
        return !this.isForeignCurrency || this.isExchangeRateLoading || this.isSubmitting;
    }

    get isExchangeRateActionDisabled() {
        return !this.isForeignCurrency || this.isExchangeRateLoading || this.isSubmitting;
    }

    get hasConversionPreview() {
        return this.isForeignCurrency && this.calculatedPhpAmount != null;
    }

    get formattedOriginalAmount() {
        return formatCurrency(this.originalAmountValue, this.normalizedOriginalCurrencyCode);
    }

    get formattedPhpAmount() {
        return this.calculatedPhpAmount == null ? '-' : formatPHP(this.calculatedPhpAmount);
    }

    get formattedExchangeRate() {
        if (!this.isPositiveNumber(this.exchangeRateValue)) {
            return '-';
        }
        return Number(this.exchangeRateValue).toLocaleString('en-PH', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 8
        });
    }

    get exchangeRateContext() {
        if (!this.exchangeRateSource || !this.exchangeRateDate) {
            return '';
        }
        return `${this.exchangeRateSource}, effective ${formatDate(this.exchangeRateDate)}.`;
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
            this.isSubmitting ||
            this.categoryOptionsLoading ||
            Boolean(this.categoryOptionsError) ||
            this.hasNoCategories
        );
    }

    get isBankInputDisabled() {
        return (
            Boolean(this.formLoadError) ||
            this.isSubmitting ||
            this.bankOptionsLoading ||
            Boolean(this.bankOptionsError)
        );
    }

    get isSaveBlocked() {
        return (
            Boolean(this.formLoadError) ||
            this.isModalContentLoading ||
            this.isSubmitting ||
            this.isExchangeRateLoading ||
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
