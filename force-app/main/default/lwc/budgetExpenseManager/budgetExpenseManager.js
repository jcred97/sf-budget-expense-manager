import { LightningElement, wire } from 'lwc';
import { loadStyle } from 'lightning/platformResourceLoader';
import LightningConfirm from 'lightning/confirm';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import removeDateFormatStyle from '@salesforce/resourceUrl/RemoveDateFormatStyle';

import getAllExpenseGroups from '@salesforce/apex/ExpenseController.getAllExpenseGroups';
import getCategoriesByExpenseGroup from '@salesforce/apex/ExpenseController.getCategoriesByExpenseGroup';
import getExpensesByFilters from '@salesforce/apex/ExpenseController.getExpensesByFilters';
import deleteExpense from '@salesforce/apex/ExpenseController.deleteExpense';
import deleteExpenses from '@salesforce/apex/ExpenseController.deleteExpenses';
import getMonthlyTrend from '@salesforce/apex/ExpenseController.getMonthlyTrend';
import getRecurringExpenseOverview from '@salesforce/apex/ExpenseController.getRecurringExpenseOverview';
import deactivateRecurringExpense from '@salesforce/apex/ExpenseController.deactivateRecurringExpense';
import runDueExpensesBatch from '@salesforce/apex/RecurringExpenseService.runDueExpensesBatch';
import {
    formatDateISO,
    formatMonthLabel,
    formatPeriodRange,
    getMonthBounds,
    parseDateString
} from 'c/expenseFormatters';
import { downloadExpensesCsv } from 'c/expenseCsvExport';
import { mapExpenseRow } from 'c/expenseTransforms';
import {
    WORKSPACE_VIEWS,
    buildWorkspaceNavItems,
    getWorkspaceViewConfig
} from 'c/expenseWorkspaceConfig';
import { buildDashboardViewModel } from 'c/expenseDashboardViewModel';
import { buildExpensesViewModel } from 'c/expenseListViewModel';
import { mapRecurringExpenseRow } from 'c/recurringExpenseTransforms';
import { buildRecurringViewModel } from 'c/recurringExpenseViewModel';

const PAGE_SIZE = 20;
const LOAD_MORE_SIZE = 10;

export default class BudgetExpenseManager extends LightningElement {
    // Request counters prevent stale responses from replacing newer view data.
    _latestExpenseLoadRequestId = 0;
    _latestDashboardLoadRequestId = 0;
    _dateFormatStyleLoadPromise;

    // Workspace and filter state.
    activeView = WORKSPACE_VIEWS.DASHBOARD;
    isSidebarCollapsed = false;
    startDate;
    endDate;
    dashboardStartDate;
    dashboardEndDate;
    expenseGroupId = '';
    categoryId = 'All';
    searchTerm = '';

    expenseGroups = [];
    expenseGroupOptions = [];
    categoryOptions = [{ label: 'All Categories', value: 'All' }];

    expenseRows = [];
    dashboardRows = [];
    selectedExpenseIds = [];
    dashboardTrend = [];
    recurringRows = [];
    recurringOverview = {
        activeCount: 0,
        dueTodayCount: 0,
        monthlyTotal: 0
    };

    visibleExpenseCount = PAGE_SIZE;

    isExpensesLoading = false;
    isDashboardLoading = false;
    dashboardLoadError = '';
    isRecurringLoading = false;
    isRunningRecurring = false;
    isExpenseModalOpen = false;
    editingExpenseId = null;
    duplicateExpenseFields = null;
    expenseDateError = '';

    // Workspace presentation.
    get isDashboardView() {
        return this.activeView === WORKSPACE_VIEWS.DASHBOARD;
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
        this.dashboardStartDate = monthBounds.startDate;
        this.dashboardEndDate = monthBounds.endDate;
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
            this.showToast('Error', 'Failed to load expense groups.', 'error');
        }
    }

    @wire(getCategoriesByExpenseGroup, { expenseGroupId: '$categoryExpenseGroupId' })
    wiredCategories({ error, data }) {
        if (data) {
            this.categoryOptions = [
                { label: 'All Categories', value: 'All' },
                ...data.map(category => ({ label: category.Name, value: category.Id }))
            ];
        } else if (error) {
            this.showToast('Error', 'Failed to load categories.', 'error');
        }
    }

    // View data loading.
    async loadExpenses() {
        if (!this.expenseGroupId) {
            this.clearExpenseData();
            return;
        }

        const requestId = ++this._latestExpenseLoadRequestId;
        this.isExpensesLoading = true;
        this.selectedExpenseIds = [];

        try {
            const data = await getExpensesByFilters({
                filters: {
                    expenseGroupId: this.expenseGroupId,
                    categoryId: this.categoryId,
                    startDate: this.startDate,
                    endDate: this.endDate
                }
            });

            if (requestId !== this._latestExpenseLoadRequestId) {
                return;
            }

            this.expenseRows = data.map(mapExpenseRow);
            this.visibleExpenseCount = PAGE_SIZE;
        } catch {
            if (requestId !== this._latestExpenseLoadRequestId) {
                return;
            }
            this.showToast('Error', 'Failed to load expenses.', 'error');
        } finally {
            if (requestId === this._latestExpenseLoadRequestId) {
                this.isExpensesLoading = false;
            }
        }
    }

    async loadDashboard() {
        if (!this.expenseGroupId) {
            this.clearDashboardData();
            return;
        }

        const requestId = ++this._latestDashboardLoadRequestId;
        this.isDashboardLoading = true;
        this.dashboardLoadError = '';

        try {
            const trendEndDate = parseDateString(this.dashboardEndDate) || new Date();
            const trendStartDate = new Date(
                trendEndDate.getFullYear(),
                trendEndDate.getMonth() - 5,
                1
            );

            const [data, trendData] = await Promise.all([
                getExpensesByFilters({
                    filters: {
                        expenseGroupId: this.expenseGroupId,
                        categoryId: 'All',
                        startDate: this.dashboardStartDate,
                        endDate: this.dashboardEndDate
                    }
                }),
                getMonthlyTrend({
                    filters: {
                        expenseGroupId: this.expenseGroupId,
                        categoryId: 'All',
                        startDate: formatDateISO(trendStartDate),
                        endDate: this.dashboardEndDate
                    }
                })
            ]);

            if (requestId !== this._latestDashboardLoadRequestId) {
                return;
            }

            this.dashboardRows = data.map(mapExpenseRow);
            this.dashboardTrend = trendData || [];
        } catch {
            if (requestId !== this._latestDashboardLoadRequestId) {
                return;
            }
            this.dashboardRows = [];
            this.dashboardTrend = [];
            this.dashboardLoadError = 'Failed to load the dashboard.';
            this.showToast('Error', 'Failed to load dashboard.', 'error');
        } finally {
            if (requestId === this._latestDashboardLoadRequestId) {
                this.isDashboardLoading = false;
            }
        }
    }

    async loadRecurringExpenses() {
        if (!this.expenseGroupId) {
            this.clearRecurringData();
            return;
        }

        this.isRecurringLoading = true;

        try {
            const overview = await getRecurringExpenseOverview({
                expenseGroupId: this.expenseGroupId
            });
            this.recurringOverview = {
                activeCount: overview?.activeCount || 0,
                dueTodayCount: overview?.dueTodayCount || 0,
                monthlyTotal: overview?.monthlyTotal || 0
            };
            this.recurringRows = (overview?.rows || []).map(mapRecurringExpenseRow);
        } catch (error) {
            this.showToast(
                'Error',
                this.getErrorMessage(error, 'Failed to load recurring expenses.'),
                'error'
            );
        } finally {
            this.isRecurringLoading = false;
        }
    }

    // View models and derived presentation state.
    get modalCategoryOptions() {
        return this.categoryOptions.filter(option => option.value !== 'All');
    }

    get expensesViewModel() {
        return buildExpensesViewModel({
            rows: this.expenseRows,
            searchTerm: this.searchTerm,
            visibleCount: this.visibleExpenseCount,
            selectedExpenseIds: this.selectedExpenseIds,
            categoryId: this.categoryId,
            startDate: this.startDate,
            endDate: this.endDate,
            categoryOptions: this.categoryOptions,
            dateError: this.expenseDateError,
            isLoading: this.isExpensesView && this.isExpensesLoading
        });
    }

    get dashboardViewModel() {
        const isLoading = this.isDashboardView && this.isDashboardLoading;
        return buildDashboardViewModel({
            rows: this.dashboardRows,
            trend: this.dashboardTrend,
            endDate: this.dashboardEndDate,
            expenseGroupId: this.expenseGroupId,
            budgetMonth: this.dashboardStartDate,
            selectedMonthLabel: this.selectedMonthLabel,
            expenseGroupName: this.selectedExpenseGroupName,
            periodLabel: this.dashboardPeriodLabel,
            isLoading,
            loadError: this.dashboardLoadError,
            showEmptyState: this.isDashboardView && this.dashboardRows.length === 0 && !isLoading
        });
    }

    get recurringExpensesViewModel() {
        return buildRecurringViewModel({
            rows: this.recurringRows,
            overview: this.recurringOverview,
            expenseGroupName: this.selectedExpenseGroupName,
            isLoading: this.isRecurringLoading
        });
    }

    get runRecurringLabel() {
        return this.isRunningRecurring ? 'Running...' : 'Run Recurring';
    }

    get isRunRecurringDisabled() {
        return this.isRunningRecurring || this.isRecurringLoading;
    }

    get dashboardPeriodLabel() {
        return formatPeriodRange(this.dashboardStartDate, this.dashboardEndDate);
    }

    get selectedMonthLabel() {
        const selectedDate =
            parseDateString(this.isDashboardView ? this.dashboardStartDate : this.startDate) ||
            new Date();
        return formatMonthLabel(selectedDate);
    }

    // Filters, period navigation, and workspace context.
    handleExpenseFilterChange(event) {
        const { field, value } = event.detail;
        this[field] = value;
        this.visibleExpenseCount = PAGE_SIZE;

        if (field === 'searchTerm') {
            return;
        }

        if (field === 'startDate' || field === 'endDate') {
            this.validateDates();
            if (this.expenseDateError) {
                return;
            }
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
        this.visibleExpenseCount = PAGE_SIZE;
        this.loadExpenses();
    }

    handlePreviousMonth() {
        this.setSelectedMonth(-1);
    }

    handleNextMonth() {
        this.setSelectedMonth(1);
    }

    setSelectedMonth(monthOffset) {
        const selectedDate =
            parseDateString(this.isDashboardView ? this.dashboardStartDate : this.startDate) ||
            new Date();
        const targetMonth = new Date(
            selectedDate.getFullYear(),
            selectedDate.getMonth() + monthOffset,
            1
        );
        const monthBounds = getMonthBounds(targetMonth);

        if (this.isDashboardView) {
            this.dashboardStartDate = monthBounds.startDate;
            this.dashboardEndDate = monthBounds.endDate;
            this.loadDashboard();
            return;
        }

        this.startDate = monthBounds.startDate;
        this.endDate = monthBounds.endDate;
        this.expenseDateError = '';
        this.visibleExpenseCount = PAGE_SIZE;
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

        if (viewName === WORKSPACE_VIEWS.DASHBOARD) {
            this.loadDashboard();
        }

        if (viewName === WORKSPACE_VIEWS.RECURRING) {
            this.loadRecurringExpenses();
        }
    }

    handleWorkspaceGroupChange(event) {
        this.setExpenseGroupContext(event.detail.value);
    }

    setExpenseGroupContext(expenseGroupId) {
        if (!expenseGroupId || expenseGroupId === this.expenseGroupId) {
            return;
        }

        this.expenseGroupId = expenseGroupId;
        this.categoryId = 'All';
        this.searchTerm = '';
        this.activeView = WORKSPACE_VIEWS.DASHBOARD;
        this.loadDashboard();
        this.loadExpenses();
        this.loadRecurringExpenses();
    }

    clearWorkspaceContext() {
        this.expenseGroupId = '';
        this.categoryId = 'All';
        this.categoryOptions = [{ label: 'All Categories', value: 'All' }];
        this.searchTerm = '';
        this.activeView = WORKSPACE_VIEWS.DASHBOARD;
        this.clearDashboardData();
        this.clearExpenseData();
        this.clearRecurringData();
    }

    clearExpenseData() {
        this._latestExpenseLoadRequestId += 1;
        this.expenseRows = [];
        this.selectedExpenseIds = [];
        this.visibleExpenseCount = PAGE_SIZE;
        this.isExpensesLoading = false;
    }

    clearDashboardData() {
        this._latestDashboardLoadRequestId += 1;
        this.dashboardRows = [];
        this.dashboardTrend = [];
        this.dashboardLoadError = '';
        this.isDashboardLoading = false;
    }

    clearRecurringData() {
        this.recurringRows = [];
        this.recurringOverview = {
            activeCount: 0,
            dueTodayCount: 0,
            monthlyTotal: 0
        };
        this.isRecurringLoading = false;
    }

    handleSidebarToggle() {
        this.isSidebarCollapsed = !this.isSidebarCollapsed;
    }

    // Expense selection and row actions.
    handleLoadMore() {
        const { filteredRows } = this.expensesViewModel;
        if (this.visibleExpenseCount >= filteredRows.length) {
            return;
        }

        this.visibleExpenseCount += LOAD_MORE_SIZE;
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

    // Recurring-expense actions.
    async handleRecurringExpenseAction(event) {
        const { action, id } = event.detail;

        if (action === 'edit') {
            window.open(`/${id}`, '_blank', 'noopener');
            return;
        }

        if (action === 'deactivate') {
            await this.confirmAndDeactivateRecurringExpense(id);
        }
    }

    async handleRunRecurringExpenses() {
        this.isRunningRecurring = true;
        try {
            await runDueExpensesBatch();
            this.showToast(
                'Recurring run started',
                'Due recurring expenses are being generated.',
                'success'
            );
            await Promise.all([
                this.loadRecurringExpenses(),
                this.loadDashboard(),
                this.loadExpenses()
            ]);
        } catch (error) {
            this.showToast(
                'Error',
                this.getErrorMessage(error, 'Failed to start recurring expense generation.'),
                'error'
            );
        } finally {
            this.isRunningRecurring = false;
        }
    }

    async confirmAndDeactivateRecurringExpense(recordId) {
        const confirmed = await LightningConfirm.open({
            message: 'Deactivate this recurring expense template?',
            variant: 'header',
            label: 'Deactivate Recurring Expense'
        });
        if (!confirmed) {
            return;
        }

        try {
            await deactivateRecurringExpense({ recurringExpenseId: recordId });
            this.showToast('Deactivated', 'Recurring expense deactivated.', 'success');
            await this.loadRecurringExpenses();
        } catch (error) {
            this.showToast(
                'Error',
                this.getErrorMessage(error, 'Failed to deactivate recurring expense.'),
                'error'
            );
        }
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
            this.editingExpenseId = recordId;
            this.isExpenseModalOpen = true;
            return;
        }

        if (actionName === 'duplicate') {
            this.editingExpenseId = null;
            this.duplicateExpenseFields = {
                Name: `Copy of ${row.name}`,
                Amount__c: row.amount,
                Category__c: row.categoryId,
                Expense_Date__c: row.expenseDate,
                Transaction_Time__c: row.transactionTime,
                Transaction_Type__c: row.transactionType,
                Bank__c: row.bank
            };
            this.isExpenseModalOpen = true;
            return;
        }

        if (actionName === 'delete') {
            await this.confirmAndDeleteExpense(recordId);
        }
    }

    async confirmAndDeleteExpense(recordId) {
        const confirmed = await LightningConfirm.open({
            message: 'Are you sure you want to delete this expense?',
            variant: 'header',
            label: 'Confirm Deletion'
        });
        if (!confirmed) {
            return;
        }

        const index = this.expenseRows.findIndex(row => row.id === recordId);
        const removed = this.expenseRows[index];
        this.expenseRows = this.expenseRows.filter(row => row.id !== recordId);

        try {
            await deleteExpense({ expenseId: recordId });
            this.showToast('Deleted', 'Expense deleted successfully!', 'success');
            await Promise.all([this.loadDashboard(), this.loadExpenses()]);
        } catch (error) {
            this.expenseRows = [
                ...this.expenseRows.slice(0, index),
                removed,
                ...this.expenseRows.slice(index)
            ];
            this.showToast('Error', error?.body?.message || 'Failed to delete expense.', 'error');
        }
    }

    async handleBulkExpenseDelete() {
        const count = this.selectedExpenseIds.length;
        const confirmed = await LightningConfirm.open({
            message: `Are you sure you want to delete ${count} expense(s)?`,
            variant: 'header',
            label: 'Confirm Bulk Deletion'
        });
        if (!confirmed) {
            return;
        }

        const idsToDelete = [...this.selectedExpenseIds];
        const removedRows = this.expenseRows.filter(row => idsToDelete.includes(row.id));
        const removedIndexes = removedRows.map(row =>
            this.expenseRows.findIndex(item => item.id === row.id)
        );

        this.expenseRows = this.expenseRows.filter(row => !idsToDelete.includes(row.id));
        this.selectedExpenseIds = [];

        try {
            await deleteExpenses({ expenseIds: idsToDelete });
            this.showToast('Deleted', `${count} expense(s) deleted successfully!`, 'success');
            await Promise.all([this.loadDashboard(), this.loadExpenses()]);
        } catch (error) {
            const restored = [...this.expenseRows];
            removedRows.forEach((row, index) => {
                restored.splice(removedIndexes[index], 0, row);
            });
            this.expenseRows = restored;
            this.selectedExpenseIds = idsToDelete;
            this.showToast('Error', error?.body?.message || 'Failed to delete expenses.', 'error');
        }
    }

    openExpenseModal() {
        this.editingExpenseId = null;
        this.duplicateExpenseFields = null;
        this.isExpenseModalOpen = true;
    }

    handleExpenseModalClose() {
        this.isExpenseModalOpen = false;
        this.editingExpenseId = null;
        this.duplicateExpenseFields = null;
    }

    async handleExpenseSaveSuccess() {
        this.showToast('Success', 'Expense saved successfully!', 'success');
        await Promise.all([this.loadDashboard(), this.loadExpenses()]);
    }

    // Report output and user feedback.
    handlePrint() {
        window.print();
    }

    handleExportCsv() {
        const { filteredRows, hasNoRows } = this.expensesViewModel;
        if (hasNoRows) {
            return;
        }

        downloadExpensesCsv(filteredRows, this.endDate);
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }

    getErrorMessage(error, fallback) {
        return error?.body?.message || fallback;
    }
}
