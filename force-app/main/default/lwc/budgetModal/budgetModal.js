import { LightningElement, api } from 'lwc';

import { formatMonthLabel, parseDateString } from 'c/expenseFormatters';

export default class BudgetModal extends LightningElement {
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
        this.amountValue = event.target.value;
        event.target.setCustomValidity('');
    }

    handleDescriptionChange(event) {
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

        if (event.shiftKey && activeElement === firstElement) {
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
                'button, lightning-input, lightning-textarea, lightning-button'
            )
        ).filter(element => !element.disabled);
    }

    handleSubmit(event) {
        event.preventDefault();

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
                    description: description || null
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
