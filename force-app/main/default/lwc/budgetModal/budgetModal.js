import { LightningElement, api, wire } from 'lwc';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';
import BUDGET_OBJECT from '@salesforce/schema/Budget__c';
import {
    canCreateObject,
    canUpdateObject,
    canReadField,
    canWriteField,
    hasWritableFields
} from 'c/appSchemaAccess';

import { formatMonthLabel, parseDateString } from 'c/expenseFormatters';
import { getFocusableElements, trapTabFocus } from 'c/modalFocusUtils';

export default class BudgetModal extends LightningElement {
    @wire(getObjectInfo, { objectApiName: BUDGET_OBJECT }) objectMetadata;

    get objectInfo() {
        return this.objectMetadata?.data;
    }

    get writeMode() {
        return this.isEditMode ? 'update' : 'create';
    }

    get canSave() {
        return this.isEditMode
            ? canUpdateObject(this.objectInfo) &&
                  canWriteField(this.objectInfo, 'Amount__c', 'update')
            : canCreateObject(this.objectInfo) &&
                  hasWritableFields(
                      this.objectInfo,
                      ['Amount__c', 'Budget_Month__c', 'Expense_Group__c'],
                      'create'
                  );
    }

    get isSaveDisabled() {
        return this.isSaving || !this.canSave;
    }

    get showAmount() {
        return (
            canReadField(this.objectInfo, 'Amount__c') ||
            canWriteField(this.objectInfo, 'Amount__c', this.writeMode)
        );
    }

    get canWriteDescription() {
        return canWriteField(this.objectInfo, 'Description__c', this.writeMode);
    }

    get showDescription() {
        return canReadField(this.objectInfo, 'Description__c') || this.canWriteDescription;
    }

    get isDescriptionDisabled() {
        return this.isSaving || !this.canWriteDescription;
    }
    @api budgetMonth = '';
    @api expenseGroupName = '';
    @api isSaving = false;

    amountValue = '';
    descriptionValue = '';

    _budget;
    _hasFocused = false;
    _hasFocusedSavingStatus = false;

    @api
    get budget() {
        return this._budget;
    }

    set budget(value) {
        if (value === this._budget) {
            return;
        }

        this._budget = value;
        this.amountValue = value?.amount ?? '';
        this.descriptionValue = value?.description || '';
    }

    renderedCallback() {
        if (this.isSaving) {
            if (!this._hasFocusedSavingStatus) {
                this.template.querySelector('[data-saving-status]')?.focus();
                this._hasFocusedSavingStatus = true;
                this._hasFocused = false;
            }
            return;
        }

        this._hasFocusedSavingStatus = false;
        if (this._hasFocused) {
            return;
        }

        const amountInput = this.template.querySelector('[data-field="amount"]');
        if (amountInput) {
            amountInput.focus();
            this._hasFocused = true;
        }
    }

    handleAmountChange(event) {
        if (!this.canSave || this.isSaving) return;
        this.amountValue = event.target.value;
        event.target.setCustomValidity('');
    }

    handleDescriptionChange(event) {
        if (!this.canWriteDescription || this.isSaving) return;
        this.descriptionValue = event.target.value;
    }

    handleClose() {
        if (!this.isSaving) {
            this.dispatchEvent(new CustomEvent('close'));
        }
    }

    handleKeyDown(event) {
        if (event.key === 'Escape') {
            this.handleClose();
            return;
        }

        const focusableElements = this.getFocusableElements();
        const activeElement = this.template.activeElement || document.activeElement;
        trapTabFocus(event, focusableElements, activeElement, { preventWhenEmpty: true });
    }

    getFocusableElements() {
        return getFocusableElements(
            this.template,
            'button, lightning-input, lightning-textarea, lightning-button'
        );
    }

    handleSubmit(event) {
        event.preventDefault();
        if (this.isSaveDisabled) return;

        const amountInput = this.template.querySelector('[data-field="amount"]');
        const amount = Number(this.amountValue);
        const isPositiveAmount = Number.isFinite(amount) && amount > 0;

        amountInput.setCustomValidity(
            isPositiveAmount ? '' : 'Enter a monthly budget greater than zero.'
        );
        if (!amountInput.reportValidity()) {
            return;
        }

        const description = this.descriptionValue.trim();
        this.dispatchEvent(
            new CustomEvent('save', {
                detail: {
                    amount,
                    ...(this.canWriteDescription ? { description: description || null } : {})
                }
            })
        );
    }

    get isEditMode() {
        return Boolean(this.budget?.id);
    }

    get modalTitle() {
        return this.isEditMode ? 'Edit Monthly Budget' : 'Set Monthly Budget';
    }

    get saveButtonLabel() {
        return this.isSaving ? 'Saving...' : 'Save Budget';
    }

    get monthLabel() {
        const monthDate = parseDateString(this.budgetMonth);
        return monthDate && !Number.isNaN(monthDate.getTime())
            ? formatMonthLabel(monthDate)
            : 'the selected month';
    }

    get modalDescription() {
        const groupName = this.expenseGroupName || 'this expense group';
        return `Set an optional spending target for ${groupName} in ${this.monthLabel}.`;
    }
}
