import { LightningElement, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { loadStyle } from 'lightning/platformResourceLoader';
import LightningConfirm from 'lightning/confirm';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import removeDateFormatStyle from '@salesforce/resourceUrl/RemoveDateFormatStyle';

import getAllExpenseGroups from '@salesforce/apex/ExpenseController.getAllExpenseGroups';
import getCategoriesByExpenseGroup from '@salesforce/apex/ExpenseController.getCategoriesByExpenseGroup';
import deleteExpense from '@salesforce/apex/ExpenseController.deleteExpense';
import deleteExpenses from '@salesforce/apex/ExpenseController.deleteExpenses';
import { formatMonthLabel, getMonthBounds, parseDateString } from 'c/expenseFormatters';
import { downloadExpensesCsv } from 'c/expenseCsvExport';
import { getErrorMessage } from 'c/expenseErrorUtils';
import {
    WORKSPACE_VIEWS,
    buildWorkspaceNavItems,
    getWorkspaceViewConfig
} from 'c/expenseWorkspaceConfig';
import { fetchBankOptions, fetchExpensePage, fetchAllExpenseRows } from 'c/expenseWorkspaceData';
import { buildExpensesViewModel } from 'c/expenseListViewModel';
import { getExpensesViewModel } from 'c/expenseWorkspaceViewModels';

const PAGE_SIZE = 20;
const LOAD_MORE_SIZE = 10;

export default class BudgetExpenseManager extends LightningElement {
    // Request counters prevent stale responses from replacing newer view data.
    _latestExpenseLoadRequestId = 0;
    _latestBankOptionsRequestId = 0;
    _latestCategoryRefreshRequestId = 0;
    _activeCategoryRefreshRequestId = 0;
    _wiredCategoriesResult;
    _dateFormatStyleLoadPromise;

    // Workspace and filter state.
    activeView = WORKSPACE_VIEWS.DASHBOARD;
    isSidebarCollapsed = false;
    startDate;
    endDate;
    expenseGroupId = '';
    categoryId = 'All';
    searchTerm = '';

    expenseGroups = [];
    expenseGroupOptions = [];
    categoryOptions = [{ label: 'All Categories', value: 'All' }];
    bankOptions = [];

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
    isCategoriesLoading = false;
    categoryOptionsError = '';
    isBankOptionsLoading = false;
    bankOptionsError = '';
    isExpenseModalOpen = false;
    editingExpenseId = null;
    duplicateExpenseFields = null;
    duplicateExpenseBankName = '';
    currentExpenseBank = null;
    expenseBankNotice = '';
    expenseDateError = '';

    // Workspace presentation.
    get isDashboardView() {
        return this.activeView === WORKSPACE_VIEWS.DASHBOARD;
    }

    get isDashboardHidden() {
        return !this.isDashboardView;
    }

    refreshDashboard() {
        return this.template.querySelector('c-expense-dashboard')?.refresh();
    }

    get isExpensesView() {
        return this.activeView === WORKSPACE_VIEWS.EXPENSES;
    }

    get isRecurringView() {
        return this.activeView === WORKSPACE_VIEWS.RECURRING;
    }

    get selectedExpenseGroupName() {
        return (
            this.expenseGroups.find(expenseGroup => expenseGroup.Id === this.expenseGroupId)
                ?.Name || ''
        );
    }

    get categoryExpenseGroupId() {
        return this.expenseGroupId || undefined;
    }

    get workspaceNavItems() {
        return buildWorkspaceNavItems(this.activeView);
    }

    get activeViewConfig() {
        return getWorkspaceViewConfig(this.activeView);
    }

    get workspaceShellClass() {
        return `workspace-shell ${this.isSidebarCollapsed ? 'is-sidebar-collapsed' : ''}`;
    }

    get sidebarToggleTitle() {
        return this.isSidebarCollapsed ? 'Expand navigation' : 'Collapse navigation';
    }

    get sidebarToggleIcon() {
        return this.isSidebarCollapsed ? 'utility:chevronright' : 'utility:chevronleft';
    }

    get sidebarAriaExpanded() {
        return String(!this.isSidebarCollapsed);
    }

    renderedCallback() {
        if (this._dateFormatStyleLoadPromise) {
            return;
        }

        this._dateFormatStyleLoadPromise = loadStyle(this, removeDateFormatStyle).catch(() => {
            // Allow a later render to retry after a transient resource failure.
            this._dateFormatStyleLoadPromise = undefined;
        });
    }

    connectedCallback() {
        const today = new Date();
        const monthBounds = getMonthBounds(today);

        this.startDate = monthBounds.startDate;
        this.endDate = monthBounds.endDate;
    }

    @wire(getAllExpenseGroups)
    wiredExpenseGroups({ error, data }) {
        if (data) {
            this.expenseGroups = data;
            this.expenseGroupOptions = data.map(expenseGroup => ({
                label: expenseGroup.Name,
                value: expenseGroup.Id
            }));

            if (
                this.expenseGroupId &&
                !data.some(expenseGroup => expenseGroup.Id === this.expenseGroupId)
            ) {
                this.clearWorkspaceContext();
            }

            if (!this.expenseGroupId && data.length > 0) {
                this.setExpenseGroupContext(data[0].Id);
            }
        } else if (error) {
            this.showToast(
                'Error',
                getErrorMessage(error, 'Failed to load expense groups.'),
                'error'
            );
        }
    }

    @wire(getCategoriesByExpenseGroup, { expenseGroupId: '$categoryExpenseGroupId' })
    wiredCategories(result) {
        this._wiredCategoriesResult = result;
        const { error, data } = result;

        if (data) {
            this.categoryOptions = [
                { label: 'All Categories', value: 'All' },
                ...data.map(category => ({ label: category.Name, value: category.Id }))
            ];
            this.categoryOptionsError = '';
            if (!this._activeCategoryRefreshRequestId) {
                this.isCategoriesLoading = false;
            }
        } else if (error) {
            this.categoryOptions = [{ label: 'All Categories', value: 'All' }];
            this.categoryOptionsError = getErrorMessage(
                error,
                'Failed to load categories for this expense group.'
            );
            if (!this._activeCategoryRefreshRequestId) {
                this.isCategoriesLoading = false;
            }
            this.showToast('Error', this.categoryOptionsError, 'error');
        }
    }

    // View data loading.
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

    async loadBankOptions() {
        if (!this.expenseGroupId) {
            this.clearBankOptions();
            return;
        }

        const expenseGroupId = this.expenseGroupId;
        const requestId = ++this._latestBankOptionsRequestId;
        this.isBankOptionsLoading = true;
        this.bankOptionsError = '';

        try {
            const options = await fetchBankOptions(expenseGroupId);
            if (
                requestId !== this._latestBankOptionsRequestId ||
                expenseGroupId !== this.expenseGroupId
            ) {
                return;
            }

            this.bankOptions = options;
            this.reconcileDuplicateBankSelection();
        } catch (error) {
            if (
                requestId !== this._latestBankOptionsRequestId ||
                expenseGroupId !== this.expenseGroupId
            ) {
                return;
            }

            this.bankOptions = [];
            this.bankOptionsError = getErrorMessage(
                error,
                'Failed to load banks for this expense group.'
            );
        } finally {
            if (
                requestId === this._latestBankOptionsRequestId &&
                expenseGroupId === this.expenseGroupId
            ) {
                this.isBankOptionsLoading = false;
            }
        }
    }

    // View models and derived presentation state.
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

    get expensesViewModel() {
        const isLoading = this.isExpensesView && this.isExpensesLoading;
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

    // Filters, period navigation, and workspace context.
    handleExpenseFilterChange(event) {
        const { field, value } = event.detail;
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

    handleResetExpenseFilters() {
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

    handleViewChange(event) {
        this.activateView(event.currentTarget.dataset.view);
    }

    handleViewExpenses() {
        this.activateView(WORKSPACE_VIEWS.EXPENSES);
    }

    activateView(viewName) {
        this.activeView = viewName;
    }

    handleWorkspaceGroupChange(event) {
        this.setExpenseGroupContext(event.detail.value);
    }

    setExpenseGroupContext(expenseGroupId) {
        if (!expenseGroupId || expenseGroupId === this.expenseGroupId) {
            return;
        }

        this.handleExpenseModalClose();
        this.invalidateCategoryRefresh();
        this._wiredCategoriesResult = undefined;
        this.expenseGroupId = expenseGroupId;
        this.clearBankOptions();
        this.categoryId = 'All';
        this.categoryOptions = [{ label: 'All Categories', value: 'All' }];
        this.categoryOptionsError = '';
        this.isCategoriesLoading = true;
        this.searchTerm = '';
        this.activeView = WORKSPACE_VIEWS.DASHBOARD;
        this.loadBankOptions();
        this.loadExpenses();
    }

    clearWorkspaceContext() {
        this.handleExpenseModalClose();
        this.invalidateCategoryRefresh();
        this._wiredCategoriesResult = undefined;
        this.expenseGroupId = '';
        this.categoryId = 'All';
        this.categoryOptions = [{ label: 'All Categories', value: 'All' }];
        this.categoryOptionsError = '';
        this.isCategoriesLoading = false;
        this.searchTerm = '';
        this.activeView = WORKSPACE_VIEWS.DASHBOARD;
        this.clearBankOptions();
        this.clearExpenseData();
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

    clearBankOptions() {
        this._latestBankOptionsRequestId += 1;
        this.bankOptions = [];
        this.bankOptionsError = '';
        this.isBankOptionsLoading = false;
    }

    handleSidebarToggle() {
        this.isSidebarCollapsed = !this.isSidebarCollapsed;
    }

    // Expense selection and row actions.
    handleLoadMore() {
        if (!this.expenseHasMore || this.isExpensesLoading || this.isExpensesLoadingMore) {
            return;
        }
        this.loadExpenses(true);
    }

    handleRetryExpenses() {
        this.loadExpenses(Boolean(this.expenseNextCursor));
    }

    handleExpenseSelect(event) {
        const { id, selected } = event.detail;
        const selectedExpenseIds = new Set(this.selectedExpenseIds);

        if (selected) {
            selectedExpenseIds.add(id);
        } else {
            selectedExpenseIds.delete(id);
        }

        this.selectedExpenseIds = [...selectedExpenseIds];
    }

    async handleExpenseAction(event) {
        const { action, id } = event.detail;
        const row = this.expenseRows.find(item => item.id === id);
        await this.performExpenseRowAction(action, row);
    }

    get isRecurringHidden() {
        return !this.isRecurringView;
    }

    handleRecurringOptionsRefresh() {
        this.refreshCategoryOptions();
        this.loadBankOptions();
    }

    handleRecurringGenerationStarted() {
        this.refreshDashboard();
        this.loadExpenses();
    }

    handleRetryCategoryOptions() {
        this.refreshCategoryOptions();
    }

    async refreshCategoryOptions() {
        if (!this._wiredCategoriesResult) {
            return;
        }

        const expenseGroupId = this.expenseGroupId;
        const requestId = ++this._latestCategoryRefreshRequestId;
        this._activeCategoryRefreshRequestId = requestId;
        this.isCategoriesLoading = true;
        this.categoryOptionsError = '';
        try {
            await refreshApex(this._wiredCategoriesResult);
        } catch (error) {
            if (!this.isCurrentCategoryRefresh(requestId, expenseGroupId)) {
                return;
            }

            this.categoryOptionsError = getErrorMessage(
                error,
                'Failed to load categories for this expense group.'
            );
        } finally {
            if (this.isCurrentCategoryRefresh(requestId, expenseGroupId)) {
                this._activeCategoryRefreshRequestId = 0;
                this.isCategoriesLoading = false;
            }
        }
    }

    isCurrentCategoryRefresh(requestId, expenseGroupId) {
        return (
            requestId === this._latestCategoryRefreshRequestId &&
            expenseGroupId === this.expenseGroupId
        );
    }

    invalidateCategoryRefresh() {
        this._latestCategoryRefreshRequestId += 1;
        this._activeCategoryRefreshRequestId = 0;
    }

    // Expense modal and mutation workflows.
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
            this.loadBankOptions();
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
            this.loadBankOptions();
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
            await Promise.all([this.refreshDashboard(), this.loadExpenses()]);
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
            await Promise.all([this.refreshDashboard(), this.loadExpenses()]);
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

    openExpenseModal() {
        this.editingExpenseId = null;
        this.duplicateExpenseFields = null;
        this.duplicateExpenseBankName = '';
        this.currentExpenseBank = null;
        this.expenseBankNotice = '';
        this.loadBankOptions();
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

    handleRetryBankOptions() {
        this.loadBankOptions();
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
        await Promise.all([this.refreshDashboard(), this.loadExpenses()]);
    }

    // Report output and user feedback.
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
                // Let both the parent and report component render the complete report.
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
