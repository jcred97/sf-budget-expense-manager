import { LightningElement, api, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import LightningConfirm from 'lightning/confirm';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getErrorMessage } from 'c/expenseErrorUtils';
import { buildRecurringViewModel } from 'c/recurringExpenseViewModel';
import getRecurringExpenseOverview from '@salesforce/apex/RecurringExpenseController.getRecurringExpenseOverview';
import getRecurringExpensePage from '@salesforce/apex/RecurringExpenseController.getRecurringExpensePage';
import deactivateRecurringExpense from '@salesforce/apex/RecurringExpenseController.deactivateRecurringExpense';
import { subscribeRecurringRun, startRecurringRun, retryRecurringRun } from 'c/recurringRunMonitor';
import hasRecurringAutomationPermission from '@salesforce/customPermission/Manage_Recurring_Expense_Automation';

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
    _pageVersion = 0;
    _refreshVersion = 0;
    _firstPageOverview;
    _seenCursors = new Set();
    nextCursor;
    hasMore = false;
    isLoadingMore = false;
    pageError = '';
    overviewError = '';
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
        this._firstPageOverview = undefined;
        this.resetPagination();
        this.recurringRows = [];
        this.recurringOverview = {};
        this.overviewError = '';
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
    connectedCallback() {
        let initialState = true;
        this._unsubscribeRun = subscribeRecurringRun(state => {
            this.runState = state;
            this.isRunningRecurring = state.busy;
            if (initialState && state.terminal) this._refreshAfterWire = true;
            if (state.busy && state.jobId) this._observedRunId = state.jobId;
            if (
                !initialState &&
                state.terminal &&
                this._observedRunId === state.jobId &&
                this._completedRunId !== state.jobId
            ) {
                this._completedRunId = state.jobId;
                this.onRecurringRunCompleted(state);
            }
            initialState = false;
        });
        if (this._refreshAfterWire && this._wiredRecurringResult) {
            this._refreshAfterWire = false;
            this.loadRecurringExpenses();
        } else if (this._firstPageOverview && this._active) this.loadRecurringExpenses();
    }
    disconnectedCallback() {
        this._unsubscribeRun?.();
        this._contextVersion += 1;
        this.resetPagination();
    }
    resetPagination() {
        this._pageVersion += 1;
        this._seenCursors = new Set();
        this.nextCursor = undefined;
        this.hasMore = false;
        this.isLoadingMore = false;
        this.pageError = '';
    }
    get loadMoreLabel() {
        return this.isLoadingMore
            ? 'Loading...'
            : this.pageError
              ? 'Retry loading more'
              : 'Load more';
    }
    get isLoadMoreDisabled() {
        return this.isLoadingMore || this.isRecurringLoading || this.isRunningRecurring;
    }
    async handleLoadMore() {
        if (!this.hasMore || this.isLoadMoreDisabled || !this.nextCursor) return;
        const contextVersion = this._contextVersion;
        const pageVersion = this._pageVersion;
        const cursor = this.nextCursor;
        this.isLoadingMore = true;
        this.pageError = '';
        const isCurrent = () =>
            this.isConnected &&
            contextVersion === this._contextVersion &&
            pageVersion === this._pageVersion;
        try {
            const page = await getRecurringExpensePage({
                expenseGroupId: this.expenseGroupId,
                pageSize: 50,
                cursor
            });
            if (!isCurrent()) return;
            if (page.expenseGroupId && page.expenseGroupId !== this.expenseGroupId) {
                throw new Error('The recurring page belongs to a different expense group.');
            }
            if (
                page.hasMore &&
                (!page.nextCursor ||
                    page.nextCursor === cursor ||
                    this._seenCursors.has(page.nextCursor))
            ) {
                throw new Error(
                    'Unable to advance recurring expenses. Refresh the overview and try again.'
                );
            }
            const loadedIds = new Set(this.recurringRows.map(row => row.id));
            const newRows = (page.rows || []).filter(row => {
                if (loadedIds.has(row.id)) return false;
                loadedIds.add(row.id);
                return true;
            });
            this.recurringRows = [...this.recurringRows, ...newRows];
            this._seenCursors.add(cursor);
            this.hasMore = Boolean(page.hasMore);
            this.nextCursor = page.nextCursor;
        } catch (error) {
            if (isCurrent()) {
                this.pageError = getErrorMessage(error, 'Failed to load more recurring expenses.');
            }
        } finally {
            if (isCurrent()) this.isLoadingMore = false;
        }
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
        if (result.data?.expenseGroupId && result.data.expenseGroupId !== this.expenseGroupId)
            return;
        if (!this.expenseGroupId) return;
        this._wiredRecurringResult = result;
        const { error, data } = result;

        if (data) {
            this.applyRecurringOverview(data);
            this.isRecurringLoading = false;
        } else if (error && this.expenseGroupId) {
            this.resetPagination();
            this._firstPageOverview = undefined;
            this.overviewError = getErrorMessage(error, 'Failed to load recurring expenses.');
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
        if (this._refreshAfterWire && (data || error)) {
            this._refreshAfterWire = false;
            this.loadRecurringExpenses();
        }
    }

    async loadRecurringExpenses() {
        if (!this.expenseGroupId) {
            this.recurringRows = [];
            this.recurringOverview = {};
            return;
        }

        const contextVersion = this._contextVersion;
        if (this._firstPageOverview) this.applyRecurringOverview(this._firstPageOverview);
        else this.resetPagination();
        const refreshVersion = ++this._refreshVersion;
        this.isRecurringLoading = true;
        if (!this._wiredRecurringResult) {
            return;
        }

        try {
            await refreshApex(this._wiredRecurringResult);
        } catch {
            // The wire handler owns recurring-load error presentation.
        } finally {
            if (
                contextVersion === this._contextVersion &&
                refreshVersion === this._refreshVersion
            ) {
                this.isRecurringLoading = false;
            }
        }
    }

    applyRecurringOverview(overview) {
        this.resetPagination();
        this.overviewError = '';
        this._firstPageOverview = overview;
        this.recurringOverview = {
            totalCount: overview?.totalCount ?? overview?.rows?.length ?? 0,
            activeCount: overview?.activeCount || 0,
            dueTodayCount: overview?.dueTodayCount || 0,
            monthlyTotal: overview?.monthlyTotal || 0
        };
        this.recurringRows = overview?.rows || [];
        this.hasMore = Boolean(overview?.hasMore);
        this.nextCursor = overview?.nextCursor;
    }

    get isAddRecurringDisabled() {
        return !this.expenseGroupId;
    }

    get runRecurringLabel() {
        return this.isRunningRecurring
            ? 'Running...'
            : this.runState.hasCatchUpRemaining
              ? 'Run again'
              : 'Run Recurring';
    }

    get isRunRecurringDisabled() {
        return !this.canRunRecurringAutomation || this.isRecurringBusy;
    }

    get canRunRecurringAutomation() {
        return Boolean(hasRecurringAutomationPermission);
    }

    get isRecurringBusy() {
        return this.isRunningRecurring || this.isRecurringLoading;
    }

    runState = {};
    _unsubscribeRun;
    _completedRunId;
    _observedRunId;
    _refreshAfterWire = false;
    get runStatusLabel() {
        return this.runState.label;
    }
    get runStatusMessage() {
        return this.runState.message;
    }
    get runStatusClass() {
        return this.runState.hasCatchUpRemaining
            ? 'slds-box slds-theme_warning slds-m-bottom_medium'
            : 'slds-box slds-theme_default slds-m-bottom_medium';
    }
    get runStatusError() {
        return this.runState.error;
    }
    get showRunRetry() {
        return this.runState.retry;
    }
    handleRetryRunStatus() {
        retryRecurringRun();
    }

    async onRecurringRunCompleted(state) {
        this.showToast(
            state.label === 'Completed'
                ? 'Recurring run completed'
                : 'Recurring run needs attention',
            state.label === 'Completed'
                ? 'Recurring expenses have finished generating.'
                : state.message ||
                      `Run status: ${state.label}. Some expenses may have been generated.`,
            state.label === 'Completed' ? 'success' : 'warning'
        );
        this.dispatchEvent(
            new CustomEvent('generationcompleted', {
                detail: { jobId: state.jobId, status: state.label }
            })
        );
        await this.loadRecurringExpenses();
    }

    async handleRunRecurringExpenses() {
        if (this.isRunRecurringDisabled) return;
        try {
            await startRecurringRun();
        } catch (error) {
            this.showToast(
                'Error',
                getErrorMessage(error, 'Failed to start recurring expense generation.'),
                'error'
            );
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
