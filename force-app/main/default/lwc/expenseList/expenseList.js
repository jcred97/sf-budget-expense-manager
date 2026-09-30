import { LightningElement, api } from 'lwc';
import LightningConfirm from 'lightning/confirm';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import deleteExpense from '@salesforce/apex/ExpenseController.deleteExpense';
import deleteExpenses from '@salesforce/apex/ExpenseController.deleteExpenses';
import { formatMonthLabel, getMonthBounds, parseDateString } from 'c/expenseFormatters';
import { downloadExpensesCsv } from 'c/expenseCsvExport';
import { getErrorMessage } from 'c/expenseErrorUtils';
import { fetchExpensePage, fetchAllExpenseRows } from 'c/expenseWorkspaceData';
import { buildExpensesViewModel } from 'c/expenseListViewModel';
import { getExpensesViewModel } from 'c/expenseWorkspaceViewModels';

const PAGE_SIZE = 20;
const LOAD_MORE_SIZE = 10;

export default class ExpenseList extends LightningElement {
    @api active = false;
    @api expenseGroupName;
    @api categoryOptions = [];
    @api isCategoriesLoading = false;
    @api categoryOptionsError = '';
    @api isBankOptionsLoading = false;
    @api bankOptionsError = '';
    @api bankOptions = [];
    _expenseGroupId = '';
    _latestExpenseLoadRequestId = 0;
    startDate;
    endDate;
    categoryId = 'All';
    searchTerm = '';
    expenseRows = [];
    selectedExpenseIds = [];
    expenseSummary = { totalCount: 0, totalAmount: 0 };
    expenseNextCursor = null;
    expenseHasMore = false;
    expenseLoadError = '';
    isExpensesLoadingMore = false;
    isReportLoading = false;
    printViewModel;
    _expenseSearchTimer;
    isExpensesLoading = false;
    isExpenseModalOpen = false;
    editingExpenseId = null;
    duplicateExpenseFields = null;
    duplicateExpenseBankName = '';
    currentExpenseBank = null;
    expenseBankNotice = '';
    expenseDateError = '';

    @api
    get expenseGroupId() {
        return this._expenseGroupId;
    }
    set expenseGroupId(value) {
        const groupId = value || '';
        if (groupId === this._expenseGroupId) return;
        this._expenseGroupId = groupId;
        this.handleExpenseModalClose();
        this.categoryId = 'All';
        this.searchTerm = '';
        this.clearExpenseData();
        if (this.isConnected) this.loadExpenses();
    }

    renderedCallback() {
        // Wait for all lookup props before clearing a duplicated bank that is no longer available.
        // Reconciliation changes state only once, when a copied assignment needs to be cleared.
        if (!this.isBankOptionsLoading && !this.bankOptionsError) {
            this.reconcileDuplicateBankSelection();
        }
    }

    @api
    refresh() {
        return this.loadExpenses();
    }
    get isHidden() {
        return !this.active;
    }
    handleRetryBankOptions() {
        this.dispatchEvent(new CustomEvent('refreshbanks'));
    }
    handleRetryCategoryOptions() {
        this.dispatchEvent(new CustomEvent('retrycategories'));
    }

    connectedCallback() {
        const today = new Date();
        const monthBounds = getMonthBounds(today);

        this.startDate = monthBounds.startDate;
        this.endDate = monthBounds.endDate;
        this.loadExpenses();
    }

    async loadExpenses(append = false) {
        // Event handlers can pass an Event; only an explicit true appends a page.
        append = append === true;
        clearTimeout(this._expenseSearchTimer);
        if (!this.expenseGroupId) {
            this.clearExpenseData();
            return;
        }

        const requestId = ++this._latestExpenseLoadRequestId;
        this.isExpensesLoading = !append;
        this.isExpensesLoadingMore = append;
        this.expenseLoadError = '';
        this.printViewModel = undefined;
        if (!append) {
            this.expenseRows = [];
            this.expenseSummary = { totalCount: 0, totalAmount: 0 };
            this.expenseNextCursor = null;
            this.expenseHasMore = false;
            this.selectedExpenseIds = [];
        }

        try {
            const page = await fetchExpensePage({
                ...this.expenseFilters,
                pageSize: append ? LOAD_MORE_SIZE : PAGE_SIZE,
                cursor: append ? this.expenseNextCursor : null
            });

            if (requestId !== this._latestExpenseLoadRequestId) {
                return;
            }

            const rows = new Map((append ? this.expenseRows : []).map(row => [row.id, row]));
            page.rows.forEach(row => rows.set(row.id, row));
            this.expenseRows = [...rows.values()];
            this.expenseNextCursor = page.nextCursor;
            this.expenseHasMore = page.hasMore;
            if (!append) {
                this.expenseSummary = {
                    totalCount: page.totalCount,
                    totalAmount: page.totalAmount
                };
            }
        } catch (error) {
            if (requestId !== this._latestExpenseLoadRequestId) {
                return;
            }
            this.expenseLoadError = getErrorMessage(
                error,
                'Failed to load expenses. Please retry.'
            );
        } finally {
            if (requestId === this._latestExpenseLoadRequestId) {
                this.isExpensesLoading = false;
                this.isExpensesLoadingMore = false;
            }
        }
    }

    get modalCategoryOptions() {
        return this.categoryOptions.filter(option => option.value !== 'All');
    }

    get modalBankOptions() {
        const options = [...this.bankOptions];
        const currentBank = this.currentExpenseBank;

        if (
            this.editingExpenseId &&
            currentBank?.assignmentId &&
            !this.isBankOptionsLoading &&
            !this.bankOptionsError &&
            !options.some(option => option.value === currentBank.assignmentId)
        ) {
            options.push({
                label: `${currentBank.label || 'Unavailable bank'} (Inactive)`,
                value: currentBank.assignmentId,
                inactive: true
            });
        }

        return options;
    }

    get viewModel() {
        const isLoading = this.isExpensesLoading;
        return getExpensesViewModel(this, {
            rows: this.expenseRows,
            searchTerm: this.searchTerm,
            summary: this.expenseSummary,
            hasMore: this.expenseHasMore,
            isLoadingMore: this.isExpensesLoadingMore,
            loadError: this.expenseLoadError,
            selectedExpenseIds: this.selectedExpenseIds,
            categoryId: this.categoryId,
            startDate: this.startDate,
            endDate: this.endDate,
            categoryOptions: this.categoryOptions,
            dateError: this.expenseDateError,
            isLoading
        });
    }

    get selectedMonthLabel() {
        const selectedDate = parseDateString(this.startDate) || new Date();
        return formatMonthLabel(selectedDate);
    }

    handleFilterChange(event) {
        const field = event.target.dataset.field;
        const value = event.detail.value;
        this[field] = value;
        this.clearExpenseData();
        this.validateDates();
        if (this.expenseDateError) {
            return;
        }

        if (field === 'searchTerm') {
            this.isExpensesLoading = true;
            // Debounce typing while immediately invalidating the previous page request.
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            this._expenseSearchTimer = setTimeout(() => this.loadExpenses(), 300);
            return;
        }

        this.loadExpenses();
    }

    handleResetFilters() {
        const today = new Date();
        const monthBounds = getMonthBounds(today);

        this.startDate = monthBounds.startDate;
        this.endDate = monthBounds.endDate;
        this.categoryId = 'All';
        this.searchTerm = '';
        this.expenseDateError = '';
        this.loadExpenses();
    }

    handlePreviousMonth() {
        this.setSelectedMonth(-1);
    }

    handleNextMonth() {
        this.setSelectedMonth(1);
    }

    setSelectedMonth(monthOffset) {
        const selectedDate = parseDateString(this.startDate) || new Date();
        const targetMonth = new Date(
            selectedDate.getFullYear(),
            selectedDate.getMonth() + monthOffset,
            1
        );
        const monthBounds = getMonthBounds(targetMonth);

        this.startDate = monthBounds.startDate;
        this.endDate = monthBounds.endDate;
        this.expenseDateError = '';
        this.loadExpenses();
    }

    validateDates() {
        if (this.startDate && this.endDate && this.startDate > this.endDate) {
            this.expenseDateError = 'End Date cannot be before Start Date.';
        } else {
            this.expenseDateError = '';
        }
    }

    clearExpenseData() {
        clearTimeout(this._expenseSearchTimer);
        this._latestExpenseLoadRequestId += 1;
        this.expenseRows = [];
        this.selectedExpenseIds = [];
        this.expenseSummary = { totalCount: 0, totalAmount: 0 };
        this.expenseNextCursor = null;
        this.expenseHasMore = false;
        this.expenseLoadError = '';
        this.isExpensesLoadingMore = false;
        this.printViewModel = undefined;
        this.isExpensesLoading = false;
    }

    handleLoadMore() {
        if (!this.expenseHasMore || this.isExpensesLoading || this.isExpensesLoadingMore) {
            return;
        }
        this.loadExpenses(true);
    }

    handleRetry() {
        this.loadExpenses(Boolean(this.expenseNextCursor));
    }

    handleExpenseSelect(event) {
        const id = event.target.dataset.id;
        const selected = event.target.checked;
        const selectedExpenseIds = new Set(this.selectedExpenseIds);

        if (selected) {
            selectedExpenseIds.add(id);
        } else {
            selectedExpenseIds.delete(id);
        }

        this.selectedExpenseIds = [...selectedExpenseIds];
    }

    async handleRowAction(event) {
        const action = event.detail.value;
        const id = event.currentTarget.dataset.id;
        const row = this.expenseRows.find(item => item.id === id);
        await this.performExpenseRowAction(action, row);
    }

    async performExpenseRowAction(actionName, row) {
        if (!row) {
            return;
        }

        const recordId = row.id;

        if (!recordId) {
            return;
        }

        if (actionName === 'edit') {
            this.duplicateExpenseFields = null;
            this.duplicateExpenseBankName = '';
            this.currentExpenseBank = this.buildCurrentExpenseBank(row);
            this.expenseBankNotice = '';
            this.editingExpenseId = recordId;
            this.dispatchEvent(new CustomEvent('refreshbanks'));
            this.isExpenseModalOpen = true;
            return;
        }

        if (actionName === 'duplicate') {
            this.editingExpenseId = null;
            const canCopyBank = row.bankAssignmentId && row.bankAssignmentActive;
            this.duplicateExpenseFields = {
                Name: `Copy of ${row.name}`,
                Amount__c: row.amount,
                Category__c: row.categoryId,
                Expense_Date__c: row.expenseDate,
                Transaction_Time__c: row.transactionTime,
                Transaction_Type__c: row.transactionType,
                Bank_Assignment__c: canCopyBank ? row.bankAssignmentId : null,
                Original_Amount__c: row.originalAmount,
                Original_Currency_Code__c: row.originalCurrencyCode || null,
                Exchange_Rate_To_PHP__c: row.exchangeRateToPhp,
                Exchange_Rate_Date__c: row.exchangeRateDate || null,
                Exchange_Rate_Source__c: row.exchangeRateSource || null
            };
            this.duplicateExpenseBankName = row.bank || '';
            this.currentExpenseBank = null;
            this.expenseBankNotice =
                row.bank && !canCopyBank
                    ? `${row.bank} is not currently available for new expenses and was not copied.`
                    : '';
            this.dispatchEvent(new CustomEvent('refreshbanks'));
            this.isExpenseModalOpen = true;
            return;
        }

        if (actionName === 'delete') {
            await this.confirmAndDeleteExpense(recordId);
        }
    }

    async confirmAndDeleteExpense(recordId) {
        // A filter change or reload invalidates this snapshot, including while confirming.
        const originalListVersion = this._latestExpenseLoadRequestId;
        const confirmed = await LightningConfirm.open({
            message: 'Are you sure you want to delete this expense?',
            variant: 'header',
            label: 'Confirm Deletion'
        });
        if (!confirmed || originalListVersion !== this._latestExpenseLoadRequestId) {
            return;
        }

        const removedIndex = this.expenseRows.findIndex(row => row.id === recordId);
        if (removedIndex < 0) {
            return;
        }
        const removedRow = this.expenseRows[removedIndex];
        this.expenseRows = this.expenseRows.filter(row => row.id !== recordId);

        try {
            await deleteExpense({ expenseId: recordId });
            this.showToast('Deleted', 'Expense deleted successfully!', 'success');
            this.dispatchEvent(new CustomEvent('expenseschanged'));
            await this.loadExpenses();
        } catch (error) {
            if (originalListVersion === this._latestExpenseLoadRequestId) {
                this.expenseRows = [
                    ...this.expenseRows.slice(0, removedIndex),
                    removedRow,
                    ...this.expenseRows.slice(removedIndex)
                ];
            }
            this.showToast('Error', getErrorMessage(error, 'Failed to delete expense.'), 'error');
        }
    }

    async handleBulkExpenseDelete() {
        const originalListVersion = this._latestExpenseLoadRequestId;
        const idsToDelete = [...this.selectedExpenseIds];
        const count = idsToDelete.length;
        if (!count) {
            return;
        }
        const confirmed = await LightningConfirm.open({
            message: `Are you sure you want to delete ${count} expense(s)?`,
            variant: 'header',
            label: 'Confirm Bulk Deletion'
        });
        if (!confirmed || originalListVersion !== this._latestExpenseLoadRequestId) {
            return;
        }

        const removedRows = this.expenseRows.filter(row => idsToDelete.includes(row.id));
        const removedIndexes = removedRows.map(row =>
            this.expenseRows.findIndex(item => item.id === row.id)
        );

        this.expenseRows = this.expenseRows.filter(row => !idsToDelete.includes(row.id));
        this.selectedExpenseIds = [];

        try {
            await deleteExpenses({ expenseIds: idsToDelete });
            this.showToast('Deleted', `${count} expense(s) deleted successfully!`, 'success');
            this.dispatchEvent(new CustomEvent('expenseschanged'));
            await this.loadExpenses();
        } catch (error) {
            if (originalListVersion === this._latestExpenseLoadRequestId) {
                const restoredRows = [...this.expenseRows];
                removedRows.forEach((row, index) => {
                    restoredRows.splice(removedIndexes[index], 0, row);
                });
                this.expenseRows = restoredRows;
                this.selectedExpenseIds = idsToDelete;
            }
            this.showToast('Error', getErrorMessage(error, 'Failed to delete expenses.'), 'error');
        }
    }

    @api
    openExpenseModal() {
        this.editingExpenseId = null;
        this.duplicateExpenseFields = null;
        this.duplicateExpenseBankName = '';
        this.currentExpenseBank = null;
        this.expenseBankNotice = '';
        this.dispatchEvent(new CustomEvent('refreshbanks'));
        this.isExpenseModalOpen = true;
    }

    handleExpenseModalClose() {
        this.isExpenseModalOpen = false;
        this.editingExpenseId = null;
        this.duplicateExpenseFields = null;
        this.duplicateExpenseBankName = '';
        this.currentExpenseBank = null;
        this.expenseBankNotice = '';
    }

    buildCurrentExpenseBank(row) {
        if (!row.bankAssignmentId && !row.legacyBank) {
            return null;
        }

        return {
            assignmentId: row.bankAssignmentId || '',
            label: row.bank || '',
            active: row.bankAssignmentActive,
            legacyBank: row.legacyBank || ''
        };
    }

    reconcileDuplicateBankSelection() {
        const assignmentId = this.duplicateExpenseFields?.Bank_Assignment__c;
        if (
            !this.isExpenseModalOpen ||
            this.editingExpenseId ||
            !assignmentId ||
            this.bankOptions.some(option => option.value === assignmentId)
        ) {
            return;
        }

        this.duplicateExpenseFields = {
            ...this.duplicateExpenseFields,
            Bank_Assignment__c: null
        };
        const bankName = this.duplicateExpenseBankName || 'The selected bank';
        this.expenseBankNotice = `${bankName} is not currently available for new expenses and was not copied.`;
    }

    async handleExpenseSaveSuccess() {
        this.showToast('Success', 'Expense saved successfully!', 'success');
        this.dispatchEvent(new CustomEvent('expenseschanged'));
        await this.loadExpenses();
    }

    get expenseFilters() {
        return {
            expenseGroupId: this.expenseGroupId,
            categoryId: this.categoryId,
            startDate: this.startDate,
            endDate: this.endDate,
            searchTerm: this.searchTerm
        };
    }

    get isReportDisabled() {
        return (
            this.isReportLoading ||
            this.isExpensesLoading ||
            this.isExpensesLoadingMore ||
            Boolean(this.expenseLoadError) ||
            !this.expenseSummary.totalCount
        );
    }

    handlePrint() {
        this.prepareReport(true);
    }

    handleExportCsv() {
        this.prepareReport(false);
    }

    async prepareReport(print) {
        if (this.isReportDisabled) {
            return;
        }
        this.isReportLoading = true;
        const filters = this.expenseFilters;
        const requestId = this._latestExpenseLoadRequestId;
        const isCurrent = () => this.isConnected && requestId === this._latestExpenseLoadRequestId;
        try {
            const rows = await fetchAllExpenseRows(filters, isCurrent);
            if (!rows || !isCurrent()) {
                return;
            }
            if (print) {
                this.printViewModel = buildExpensesViewModel({ ...filters, rows });
                // Let this screen and its report component render all rows before printing.
                await Promise.resolve();
                await Promise.resolve();
                if (isCurrent()) {
                    window.print();
                }
            } else {
                downloadExpensesCsv(rows, filters.endDate);
            }
        } catch (error) {
            if (isCurrent()) {
                this.showToast(
                    'Error',
                    getErrorMessage(error, 'Failed to prepare the complete report.'),
                    'error'
                );
            }
        } finally {
            this.isReportLoading = false;
        }
    }

    disconnectedCallback() {
        clearTimeout(this._expenseSearchTimer);
        this._latestExpenseLoadRequestId += 1;
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
