import { LightningElement, api, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import LightningConfirm from 'lightning/confirm';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

import deleteMonthlyBudget from '@salesforce/apex/BudgetController.deleteMonthlyBudget';
import getMonthlyBudget from '@salesforce/apex/BudgetController.getMonthlyBudget';
import saveMonthlyBudget from '@salesforce/apex/BudgetController.saveMonthlyBudget';

import { getErrorMessage } from 'c/expenseErrorUtils';
import { formatMonthLabel, formatPHP, parseDateString } from 'c/expenseFormatters';

const PERCENT_FORMAT = new Intl.NumberFormat('en-PH', {
    maximumFractionDigits: 2
});

export default class BudgetPanel extends LightningElement {
    @api expenseGroupName = '';

    budget;
    loadError = '';
    isLoading = false;
    isSaving = false;
    isDeleting = false;
    isModalOpen = false;

    _expenseGroupId;
    _budgetMonth;
    _budgetWireResult;
    _restoreFocusSelector;

    @api
    get expenseGroupId() {
        return this._expenseGroupId;
    }

    set expenseGroupId(value) {
        const normalizedValue = value || undefined;
        if (normalizedValue !== this._expenseGroupId) {
            this._expenseGroupId = normalizedValue;
            this.prepareForContextChange();
        }
    }

    @api
    get budgetMonth() {
        return this._budgetMonth;
    }

    set budgetMonth(value) {
        const normalizedValue = value || undefined;
        if (normalizedValue !== this._budgetMonth) {
            this._budgetMonth = normalizedValue;
            this.prepareForContextChange();
        }
    }

    @api spentAmount = 0;

    @wire(getMonthlyBudget, {
        expenseGroupId: '$_expenseGroupId',
        budgetMonth: '$_budgetMonth'
    })
    wiredBudget(result) {
        this._budgetWireResult = result;

        if (!this.hasContext) {
            this.budget = undefined;
            this.loadError = '';
            this.isLoading = false;
            return;
        }

        const { data, error } = result;
        if (data !== undefined) {
            this.budget = data;
            this.loadError = '';
            this.isLoading = false;
        } else if (error) {
            this.budget = undefined;
            this.loadError = getErrorMessage(error, 'Failed to load the monthly budget.');
            this.isLoading = false;
        }
    }

    prepareForContextChange() {
        this.budget = undefined;
        this.loadError = '';
        this.isLoading = this.hasContext;
        this.isModalOpen = false;
        this._restoreFocusSelector = undefined;
    }

    handleSetBudget() {
        this._restoreFocusSelector = undefined;
        this.isModalOpen = true;
    }

    handleEditBudget() {
        this._restoreFocusSelector = undefined;
        this.isModalOpen = true;
    }

    handleModalClose() {
        this.isModalOpen = false;
        this._restoreFocusSelector = '[data-budget-opener]';
    }

    async handleModalSave(event) {
        const { amount, description } = event.detail;
        const mutationContext = this.createMutationContext();
        this.isSaving = true;

        try {
            const savedBudget = await saveMonthlyBudget({
                request: {
                    budgetId: mutationContext.budgetId,
                    expenseGroupId: mutationContext.expenseGroupId,
                    budgetMonth: mutationContext.budgetMonth,
                    amount,
                    description
                }
            });
            if (this.isCurrentMutationContext(mutationContext)) {
                this.budget = savedBudget;
                this.loadError = '';
            }
            await this.refreshBudgetAfterMutation(savedBudget, mutationContext);
            if (this.isCurrentMutationContext(mutationContext)) {
                this.isSaving = false;
                this.isModalOpen = false;
                this._restoreFocusSelector = '[data-budget-opener]';
            }
            this.showToast(
                'Budget saved',
                `Budget set for ${mutationContext.monthLabel}.`,
                'success'
            );
            this.notifyBudgetChange(mutationContext);
        } catch (error) {
            this.showToast(
                'Unable to save budget',
                getErrorMessage(error, 'Failed to save the monthly budget.'),
                'error'
            );
        } finally {
            this.isSaving = false;
        }
    }

    async handleRemoveBudget() {
        const mutationContext = this.createMutationContext();
        const confirmed = await LightningConfirm.open({
            label: 'Remove Monthly Budget',
            message: `Remove the budget for ${mutationContext.monthLabel}? Existing expenses will not be deleted.`,
            variant: 'header'
        });
        if (
            !confirmed ||
            !this.isCurrentMutationContext(mutationContext) ||
            this.budget?.id !== mutationContext.budgetId
        ) {
            return;
        }

        this.isDeleting = true;
        let restoreFocusSelector;
        try {
            await deleteMonthlyBudget({ budgetId: mutationContext.budgetId });
            if (this.isCurrentMutationContext(mutationContext)) {
                this.budget = null;
                this.loadError = '';
                restoreFocusSelector = '[data-budget-opener]';
            }
            await this.refreshBudgetAfterMutation(null, mutationContext);
            this.showToast(
                'Budget removed',
                `Budget removed for ${mutationContext.monthLabel}.`,
                'success'
            );
            this.notifyBudgetChange(mutationContext);
        } catch (error) {
            if (this.isCurrentMutationContext(mutationContext)) {
                restoreFocusSelector = '[data-budget-remove]';
            }
            this.showToast(
                'Unable to remove budget',
                getErrorMessage(error, 'Failed to remove the monthly budget.'),
                'error'
            );
        } finally {
            this.isDeleting = false;
            if (restoreFocusSelector && this.isCurrentMutationContext(mutationContext)) {
                this._restoreFocusSelector = restoreFocusSelector;
            }
        }
    }

    async handleRetry() {
        this.isLoading = true;
        this.loadError = '';

        try {
            await this.refreshBudget();
        } catch (error) {
            this.loadError = getErrorMessage(error, 'Failed to load the monthly budget.');
        } finally {
            this.isLoading = false;
        }
    }

    async refreshBudget() {
        if (this._budgetWireResult) {
            await refreshApex(this._budgetWireResult);
        }
    }

    async refreshBudgetAfterMutation(localBudget, mutationContext) {
        try {
            if (mutationContext.wireResult) {
                await refreshApex(mutationContext.wireResult);
            }
            return true;
        } catch {
            if (this.isCurrentMutationContext(mutationContext)) {
                // Keep the authoritative mutation result if the background refresh fails.
                this.budget = localBudget;
                this.loadError = '';
                this.isLoading = false;
            }
            return false;
        }
    }

    renderedCallback() {
        if (!this._restoreFocusSelector || this.isModalOpen) {
            return;
        }

        const focusTarget = this.template.querySelector(this._restoreFocusSelector);
        if (focusTarget && !focusTarget.disabled) {
            focusTarget.focus();
        }
        this._restoreFocusSelector = undefined;
    }

    createMutationContext() {
        return {
            expenseGroupId: this.expenseGroupId,
            budgetMonth: this.budgetMonth,
            budgetId: this.budget?.id || null,
            monthLabel: this.monthLabel,
            wireResult: this._budgetWireResult
        };
    }

    isCurrentMutationContext({ expenseGroupId, budgetMonth }) {
        return this.expenseGroupId === expenseGroupId && this.budgetMonth === budgetMonth;
    }

    get hasContext() {
        return Boolean(this.expenseGroupId && this.budgetMonth);
    }

    get hasBudget() {
        return Boolean(this.budget?.id);
    }

    get hasDescription() {
        return Boolean(this.budget?.description);
    }

    get isBusy() {
        return this.isSaving || this.isDeleting;
    }

    get monthLabel() {
        const monthDate = parseDateString(this.budgetMonth);
        return monthDate && !Number.isNaN(monthDate.getTime())
            ? formatMonthLabel(monthDate)
            : 'the selected month';
    }

    get contextLabel() {
        return this.expenseGroupName || 'This expense group';
    }

    get emptyStateMessage() {
        return `${this.contextLabel} has no budget for ${this.monthLabel}. Expenses continue to work normally.`;
    }

    get normalizedBudgetAmount() {
        return this.normalizeAmount(this.budget?.amount);
    }

    get normalizedSpentAmount() {
        return this.normalizeAmount(this.spentAmount);
    }

    get varianceAmount() {
        return this.normalizedBudgetAmount - this.normalizedSpentAmount;
    }

    get isOverBudget() {
        return this.varianceAmount < 0;
    }

    get budgetAmountFormatted() {
        return formatPHP(this.normalizedBudgetAmount);
    }

    get spentAmountFormatted() {
        return formatPHP(this.normalizedSpentAmount);
    }

    get varianceAmountFormatted() {
        return formatPHP(Math.abs(this.varianceAmount));
    }

    get varianceLabel() {
        return this.isOverBudget ? 'Over by' : 'Remaining';
    }

    get varianceValueClass() {
        return this.isOverBudget
            ? 'slds-text-heading_small slds-text-color_error'
            : 'slds-text-heading_small';
    }

    get percentageUsed() {
        if (this.normalizedBudgetAmount <= 0) {
            return 0;
        }

        return (this.normalizedSpentAmount / this.normalizedBudgetAmount) * 100;
    }

    get percentageLabel() {
        return `${PERCENT_FORMAT.format(this.percentageUsed)}% used`;
    }

    get progressValue() {
        return Math.min(100, Math.max(0, this.percentageUsed));
    }

    get progressAssistiveText() {
        return `${this.percentageLabel}. ${this.varianceLabel} ${this.varianceAmountFormatted}.`;
    }

    get budgetStatusLabel() {
        return this.isOverBudget ? 'Over budget' : 'Within budget';
    }

    get budgetStatusClass() {
        return this.isOverBudget ? 'slds-text-color_error' : 'slds-text-color_success';
    }

    normalizeAmount(value) {
        const amount = Number(value);
        return Number.isFinite(amount) ? amount : 0;
    }

    notifyBudgetChange(mutationContext) {
        if (this.isCurrentMutationContext(mutationContext)) {
            this.dispatchEvent(new CustomEvent('budgetchange'));
        }
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
