import { LightningElement, api, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import LightningConfirm from 'lightning/confirm';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getErrorMessage } from 'c/expenseErrorUtils';
import { buildRecurringViewModel } from 'c/recurringExpenseViewModel';
import getRecurringExpenseOverview from '@salesforce/apex/RecurringExpenseController.getRecurringExpenseOverview';
import deactivateRecurringExpense from '@salesforce/apex/RecurringExpenseController.deactivateRecurringExpense';
import runDueExpensesBatch from '@salesforce/apex/RecurringExpenseAutomationController.runDueExpensesBatch';

export default class RecurringExpenses extends LightningElement {
    @api expenseGroupName;
    @api categoryOptions = [];
    @api categoryOptionsLoading = false;
    @api categoryOptionsError = '';
    @api bankOptions = [];
    @api bankOptionsLoading = false;
    @api bankOptionsError = '';
    _expenseGroupId;
    _active = false;
    _contextVersion = 0;
    _wiredRecurringResult;
    recurringRows = [];
    recurringOverview = {};
    isRecurringLoading = false;
    isRunningRecurring = false;
    isRecurringExpenseModalOpen = false;
    editingRecurringExpenseId = null;
    currentRecurringBankLabel = '';

    @api
    get expenseGroupId() {
        return this._expenseGroupId;
    }
    set expenseGroupId(value) {
        const groupId = value || undefined;
        if (groupId === this._expenseGroupId) return;
        this._expenseGroupId = groupId;
        this._contextVersion += 1;
        this._wiredRecurringResult = undefined;
        this.recurringRows = [];
        this.recurringOverview = {};
        this.isRecurringLoading = Boolean(groupId);
        this.resetRecurringExpenseModal();
    }

    @api
    get active() {
        return this._active;
    }
    set active(value) {
        const becameActive = value && !this._active;
        this._active = value;
        if (becameActive) this.loadRecurringExpenses();
    }

    get viewModel() {
        return buildRecurringViewModel({
            rows: this.recurringRows,
            overview: this.recurringOverview,
            expenseGroupName: this.expenseGroupName,
            isLoading: this.isRecurringLoading
        });
    }
    get hasRows() {
        return this.recurringRows.length > 0;
    }
    handleRetryBankOptions() {
        this.dispatchEvent(new CustomEvent('retrybanks'));
    }
    handleRetryCategoryOptions() {
        this.dispatchEvent(new CustomEvent('retrycategories'));
    }
    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
    @wire(getRecurringExpenseOverview, { expenseGroupId: '$expenseGroupId' })
    wiredRecurringExpenseOverview(result) {
        this._wiredRecurringResult = result;
        const { error, data } = result;

        if (data) {
            this.applyRecurringOverview(data);
            this.isRecurringLoading = false;
        } else if (error && this.expenseGroupId) {
            this.recurringRows = [];
            this.recurringOverview = {
                activeCount: 0,
                dueTodayCount: 0,
                monthlyTotal: 0
            };
            this.isRecurringLoading = false;
            this.showToast(
                'Error',
                getErrorMessage(error, 'Failed to load recurring expenses.'),
                'error'
            );
        } else if (this.expenseGroupId) {
            this.isRecurringLoading = true;
        }
    }

    async loadRecurringExpenses() {
        if (!this.expenseGroupId) {
            this.recurringRows = [];
            this.recurringOverview = {};
            return;
        }

        const contextVersion = this._contextVersion;
        this.isRecurringLoading = true;
        if (!this._wiredRecurringResult) {
            return;
        }

        try {
            await refreshApex(this._wiredRecurringResult);
        } catch {
            // The wire handler owns recurring-load error presentation.
        } finally {
            if (contextVersion === this._contextVersion) {
                this.isRecurringLoading = false;
            }
        }
    }

    applyRecurringOverview(overview) {
        this.recurringOverview = {
            activeCount: overview?.activeCount || 0,
            dueTodayCount: overview?.dueTodayCount || 0,
            monthlyTotal: overview?.monthlyTotal || 0
        };
        this.recurringRows = overview?.rows || [];
    }

    get isAddRecurringDisabled() {
        return !this.expenseGroupId;
    }

    get runRecurringLabel() {
        return this.isRunningRecurring ? 'Running...' : 'Run Recurring';
    }

    get isRunRecurringDisabled() {
        return this.isRunningRecurring || this.isRecurringLoading;
    }

    async handleRunRecurringExpenses() {
        if (this.isRunRecurringDisabled) return;
        this.isRunningRecurring = true;
        try {
            await runDueExpensesBatch();
            this.showToast(
                'Recurring run started',
                'Due recurring expenses are being generated.',
                'success'
            );
            this.dispatchEvent(new CustomEvent('generationstarted'));
            await this.loadRecurringExpenses();
        } catch (error) {
            this.showToast(
                'Error',
                getErrorMessage(error, 'Failed to start recurring expense generation.'),
                'error'
            );
        } finally {
            this.isRunningRecurring = false;
        }
    }

    async confirmAndDeactivateRecurringExpense(recordId) {
        const contextVersion = this._contextVersion;
        const confirmed = await LightningConfirm.open({
            message: 'Deactivate this recurring expense template?',
            variant: 'header',
            label: 'Deactivate Recurring Expense'
        });
        if (!confirmed || contextVersion !== this._contextVersion || !this.isConnected) {
            return;
        }

        try {
            await deactivateRecurringExpense({ recurringExpenseId: recordId });
            if (contextVersion !== this._contextVersion || !this.isConnected) return;
            this.showToast('Deactivated', 'Recurring expense deactivated.', 'success');
            await this.loadRecurringExpenses();
        } catch (error) {
            if (contextVersion !== this._contextVersion || !this.isConnected) return;
            this.showToast(
                'Error',
                getErrorMessage(error, 'Failed to deactivate recurring expense.'),
                'error'
            );
        }
    }

    openRecurringExpenseModal() {
        if (!this.expenseGroupId) {
            return;
        }

        this.editingRecurringExpenseId = null;
        this.currentRecurringBankLabel = '';
        this.dispatchEvent(new CustomEvent('refreshoptions'));
        this.isRecurringExpenseModalOpen = true;
    }

    handleRecurringExpenseModalClose() {
        this.resetRecurringExpenseModal();
    }

    resetRecurringExpenseModal() {
        this.isRecurringExpenseModalOpen = false;
        this.editingRecurringExpenseId = null;
        this.currentRecurringBankLabel = '';
    }

    async handleRecurringExpenseSaveSuccess(event) {
        const action = event.detail?.mode === 'edit' ? 'updated' : 'created';
        this.showToast('Success', `Recurring expense ${action} successfully!`, 'success');
        await this.loadRecurringExpenses();
    }

    async handleRowAction(event) {
        const action = event.detail.value;
        const id = event.currentTarget.dataset.id;

        if (action === 'edit') {
            const row = this.recurringRows.find(item => item.id === id);
            if (!row) {
                return;
            }

            this.editingRecurringExpenseId = id;
            this.currentRecurringBankLabel = row.bank || '';
            this.dispatchEvent(new CustomEvent('refreshoptions'));
            this.isRecurringExpenseModalOpen = true;
            return;
        }

        if (action === 'deactivate') {
            await this.confirmAndDeactivateRecurringExpense(id);
        }
    }
}
