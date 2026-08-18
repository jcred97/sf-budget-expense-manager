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
    formatDate,
    formatDateISO,
    formatMonthLabel,
    formatPHP,
    getMonthBounds,
    parseDateString
} from 'c/expenseFormatters';
import { mapExpenseRow } from 'c/expenseTransforms';
import { buildDashboardViewModel } from 'c/expenseDashboardViewModel';
import { buildExpensesViewModel } from 'c/expenseListViewModel';
import { buildRecurringViewModel } from 'c/recurringExpenseViewModel';

const PAGE_SIZE = 20;
const LOAD_MORE_SIZE = 10;
const VIEW_CONFIG = [
    {
        key: 'dashboard',
        label: 'Dashboard',
        title: 'Dashboard',
        subtitle: 'Overview of monthly spending',
        iconName: 'utility:chart'
    },
    {
        key: 'transactions',
        label: 'Expenses',
        title: 'Expenses',
        subtitle: 'Review, filter, export, and maintain expenses',
        iconName: 'utility:table'
    },
    {
        key: 'recurring',
        label: 'Recurring',
        title: 'Recurring',
        subtitle: 'Monitor recurring expense templates',
        iconName: 'utility:sync'
    }
];

export default class BudgetExpenseManager extends LightningElement {
    _latestLoadRequestId = 0;
    _latestDashboardLoadRequestId = 0;

    activeView = 'dashboard';
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
    isExpenseGroupsLoaded = false;

    allRows = [];
    dashboardRows = [];
    selectedRows = [];
    dashboardTrendRaw = [];
    recurringRows = [];
    recurringOverview = {
        activeCount: 0,
        dueTodayCount: 0,
        monthlyTotal: 0
    };

    visibleCount = PAGE_SIZE;

    isLoading = false;
    isDashboardLoadingState = false;
    isLoadingMore = false;
    isRecurringLoading = false;
    isRunningRecurring = false;
    isModalOpen = false;
    editRecordId = null;
    duplicateData = null;
    dateError = '';

    get isDashboardView() {
        return this.activeView === 'dashboard';
    }

    get isTransactionsView() {
        return this.activeView === 'transactions';
    }

    get isRecurringView() {
        return this.activeView === 'recurring';
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
        return VIEW_CONFIG.map(view => ({
            ...view,
            className: this.getNavClass(view.key),
            ariaCurrent: this.activeView === view.key ? 'page' : null
        }));
    }

    get activeViewConfig() {
        return VIEW_CONFIG.find(view => view.key === this.activeView) || VIEW_CONFIG[0];
    }

    get viewTitle() {
        return this.activeViewConfig.title;
    }

    get viewSubtitle() {
        return this.activeViewConfig.subtitle;
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
        loadStyle(this, removeDateFormatStyle);
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
            this.isExpenseGroupsLoaded = true;
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
            this.isExpenseGroupsLoaded = true;
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

    async loadExpenses() {
        if (!this.expenseGroupId) {
            this.clearExpenseData();
            return;
        }

        const requestId = ++this._latestLoadRequestId;
        this.isLoading = true;
        this.selectedRows = [];

        try {
            const data = await getExpensesByFilters({
                filters: {
                    expenseGroupId: this.expenseGroupId,
                    categoryId: this.categoryId,
                    startDate: this.startDate,
                    endDate: this.endDate
                }
            });

            if (requestId !== this._latestLoadRequestId) {
                return;
            }

            this.allRows = data.map(mapExpenseRow);
            this.visibleCount = PAGE_SIZE;
        } catch {
            if (requestId !== this._latestLoadRequestId) {
                return;
            }
            this.showToast('Error', 'Failed to load expenses.', 'error');
        } finally {
            if (requestId === this._latestLoadRequestId) {
                this.isLoading = false;
            }
        }
    }

    async loadDashboard() {
        if (!this.expenseGroupId) {
            this.clearDashboardData();
            return;
        }

        const requestId = ++this._latestDashboardLoadRequestId;
        this.isDashboardLoadingState = true;

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
            this.dashboardTrendRaw = trendData || [];
        } catch {
            if (requestId !== this._latestDashboardLoadRequestId) {
                return;
            }
            this.showToast('Error', 'Failed to load dashboard.', 'error');
        } finally {
            if (requestId === this._latestDashboardLoadRequestId) {
                this.isDashboardLoadingState = false;
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
            this.recurringRows = (overview?.rows || []).map(row => ({
                ...row,
                recordLink: `/${row.id}`,
                categoryDisplay: row.categoryName || 'Uncategorized',
                expenseGroupDisplay: row.expenseGroupName || 'No group',
                bankDisplay: row.bank || 'No bank',
                transactionTypeDisplay: row.transactionType || 'No type',
                amountFormatted: formatPHP(row.amount || 0),
                monthlyAmountFormatted: formatPHP(row.monthlyAmount || 0),
                nextRunDateFormatted: formatDate(row.nextRunDate),
                activeWindowFormatted: row.endDate
                    ? `${formatDate(row.startDate)} – ${formatDate(row.endDate)}`
                    : `From ${formatDate(row.startDate)}`,
                statusLabel: row.active ? 'Active' : 'Inactive',
                statusClass: `recurring-status ${row.active ? 'is-active' : 'is-inactive'}`,
                deactivateDisabled: !row.active,
                rowClass: [
                    'recurring-row',
                    row.dueToday ? 'is-due' : '',
                    row.active ? '' : 'is-inactive'
                ]
                    .filter(Boolean)
                    .join(' ')
            }));
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

    get modalCategoryOptions() {
        return this.categoryOptions.filter(option => option.value !== 'All');
    }

    get expensesViewModel() {
        return buildExpensesViewModel({
            rows: this.allRows,
            searchTerm: this.searchTerm,
            visibleCount: this.visibleCount,
            selectedRows: this.selectedRows,
            categoryId: this.categoryId,
            startDate: this.startDate,
            endDate: this.endDate,
            categoryOptions: this.categoryOptions,
            dateError: this.dateError,
            isLoading: this.isTransactionsView && this.isLoading,
            isLoadingMore: this.isLoadingMore
        });
    }

    get dashboardViewModel() {
        const isLoading = this.isDashboardView && this.isDashboardLoadingState;
        return buildDashboardViewModel({
            rows: this.dashboardRows,
            trend: this.dashboardTrendRaw,
            endDate: this.dashboardEndDate,
            selectedMonthLabel: this.selectedMonthLabel,
            expenseGroupName: this.selectedExpenseGroupName,
            periodLabel: this.dashboardPeriodLabel,
            isLoading,
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

    get activeSummary() {
        return this.isDashboardView ? this.dashboardViewModel : this.expensesViewModel;
    }

    get filteredRows() {
        return this.expensesViewModel.filteredRows;
    }

    get hasNoRows() {
        return this.expensesViewModel.hasNoRows;
    }

    get formattedTotal() {
        return this.activeSummary.formattedTotal;
    }

    get expenseCount() {
        return this.activeSummary.expenseCount;
    }

    get averageExpense() {
        return this.activeSummary.averageExpense;
    }

    get topCategory() {
        return this.activeSummary.topCategory;
    }

    get topBank() {
        return this.activeSummary.topBank;
    }

    get printDateRange() {
        return this.expensesViewModel.printDateRange;
    }

    get printRows() {
        return this.expensesViewModel.printRows;
    }

    get runRecurringLabel() {
        return this.isRunningRecurring ? 'Running...' : 'Run Recurring';
    }

    get isRunRecurringDisabled() {
        return this.isRunningRecurring || this.isRecurringLoading;
    }

    get dashboardPeriodLabel() {
        const start = formatDate(this.dashboardStartDate);
        const end = formatDate(this.dashboardEndDate);
        return start === '-' && end === '-' ? 'All dates' : `${start} - ${end}`;
    }

    get selectedMonthLabel() {
        const selectedDate =
            parseDateString(this.isDashboardView ? this.dashboardStartDate : this.startDate) ||
            new Date();
        return formatMonthLabel(selectedDate);
    }

    handleExpenseFilterChange(event) {
        const { field, value } = event.detail;
        this[field] = value;
        this.visibleCount = PAGE_SIZE;

        if (field === 'searchTerm') {
            return;
        }

        if (field === 'startDate' || field === 'endDate') {
            this.validateDates();
            if (this.dateError) {
                return;
            }
        }

        this.loadExpenses();
    }

    handleReset() {
        const today = new Date();
        const monthBounds = getMonthBounds(today);

        this.startDate = monthBounds.startDate;
        this.endDate = monthBounds.endDate;
        this.categoryId = 'All';
        this.searchTerm = '';
        this.dateError = '';
        this.visibleCount = PAGE_SIZE;
        this.loadExpenses();
    }

    handlePreviousMonth() {
        this.setTransactionMonth(-1);
    }

    handleNextMonth() {
        this.setTransactionMonth(1);
    }

    setTransactionMonth(monthOffset) {
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
        this.dateError = '';
        this.visibleCount = PAGE_SIZE;
        this.loadExpenses();
    }

    validateDates() {
        if (this.startDate && this.endDate && this.startDate > this.endDate) {
            this.dateError = 'End Date cannot be before Start Date.';
        } else {
            this.dateError = '';
        }
    }

    handleViewChange(event) {
        this.activeView = event.currentTarget.dataset.view;

        if (this.isDashboardView) {
            this.loadDashboard();
        }

        if (this.isRecurringView) {
            this.loadRecurringExpenses();
        }
    }

    handleViewTransactions() {
        this.activeView = 'transactions';
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
        this.activeView = 'dashboard';
        this.loadDashboard();
        this.loadExpenses();
        this.loadRecurringExpenses();
    }

    clearWorkspaceContext() {
        this.expenseGroupId = '';
        this.categoryId = 'All';
        this.categoryOptions = [{ label: 'All Categories', value: 'All' }];
        this.searchTerm = '';
        this.activeView = 'dashboard';
        this.clearDashboardData();
        this.clearExpenseData();
        this.clearRecurringData();
    }

    clearExpenseData() {
        this._latestLoadRequestId += 1;
        this.allRows = [];
        this.selectedRows = [];
        this.visibleCount = PAGE_SIZE;
        this.isLoading = false;
        this.isLoadingMore = false;
    }

    clearDashboardData() {
        this._latestDashboardLoadRequestId += 1;
        this.dashboardRows = [];
        this.dashboardTrendRaw = [];
        this.isDashboardLoadingState = false;
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

    getNavClass(viewName) {
        return `workspace-nav-item ${this.activeView === viewName ? 'is-active' : ''}`;
    }

    handleLoadMore() {
        if (this.visibleCount >= this.filteredRows.length) {
            return;
        }

        this.visibleCount += LOAD_MORE_SIZE;
    }

    handleTransactionSelect(event) {
        const { id, selected } = event.detail;
        const selectedRows = new Set(this.selectedRows);

        if (selected) {
            selectedRows.add(id);
        } else {
            selectedRows.delete(id);
        }

        this.selectedRows = [...selectedRows];
    }

    async handleTransactionAction(event) {
        const { action, id } = event.detail;
        const row = this.allRows.find(item => item.id === id);
        await this.performRowAction(action, row);
    }

    async handleRecurringAction(event) {
        const { action, id } = event.detail;

        if (action === 'edit') {
            window.open(`/${id}`, '_blank', 'noopener');
            return;
        }

        if (action === 'deactivate') {
            await this.confirmAndDeactivateRecurring(id);
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

    async confirmAndDeactivateRecurring(recordId) {
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

    async performRowAction(actionName, row) {
        if (!row) {
            return;
        }

        const recordId = row.id;

        if (!recordId) {
            return;
        }

        if (actionName === 'edit') {
            this.duplicateData = null;
            this.editRecordId = recordId;
            this.isModalOpen = true;
            return;
        }

        if (actionName === 'duplicate') {
            this.editRecordId = null;
            this.duplicateData = {
                Name: `Copy of ${row.name}`,
                Amount__c: row.amount,
                Category__c: row.categoryId,
                Expense_Date__c: row.expenseDate,
                Transaction_Time__c: row.transactionTime,
                Transaction_Type__c: row.transactionType,
                Bank__c: row.bank
            };
            this.isModalOpen = true;
            return;
        }

        if (actionName === 'delete') {
            await this.confirmAndDeleteSingle(recordId);
        }
    }

    async confirmAndDeleteSingle(recordId) {
        const confirmed = await LightningConfirm.open({
            message: 'Are you sure you want to delete this expense?',
            variant: 'header',
            label: 'Confirm Deletion'
        });
        if (!confirmed) {
            return;
        }

        const index = this.allRows.findIndex(row => row.id === recordId);
        const removed = this.allRows[index];
        this.allRows = this.allRows.filter(row => row.id !== recordId);

        try {
            await deleteExpense({ expenseId: recordId });
            this.showToast('Deleted', 'Expense deleted successfully!', 'success');
            await Promise.all([this.loadDashboard(), this.loadExpenses()]);
        } catch (error) {
            this.allRows = [...this.allRows.slice(0, index), removed, ...this.allRows.slice(index)];
            this.showToast('Error', error?.body?.message || 'Failed to delete expense.', 'error');
        }
    }

    async handleBulkDelete() {
        const count = this.selectedRows.length;
        const confirmed = await LightningConfirm.open({
            message: `Are you sure you want to delete ${count} expense(s)?`,
            variant: 'header',
            label: 'Confirm Bulk Deletion'
        });
        if (!confirmed) {
            return;
        }

        const idsToDelete = [...this.selectedRows];
        const removedRows = this.allRows.filter(row => idsToDelete.includes(row.id));
        const removedIndexes = removedRows.map(row =>
            this.allRows.findIndex(item => item.id === row.id)
        );

        this.allRows = this.allRows.filter(row => !idsToDelete.includes(row.id));
        this.selectedRows = [];

        try {
            await deleteExpenses({ expenseIds: idsToDelete });
            this.showToast('Deleted', `${count} expense(s) deleted successfully!`, 'success');
            await Promise.all([this.loadDashboard(), this.loadExpenses()]);
        } catch (error) {
            const restored = [...this.allRows];
            removedRows.forEach((row, index) => {
                restored.splice(removedIndexes[index], 0, row);
            });
            this.allRows = restored;
            this.selectedRows = idsToDelete;
            this.showToast('Error', error?.body?.message || 'Failed to delete expenses.', 'error');
        }
    }

    openModal() {
        this.editRecordId = null;
        this.duplicateData = null;
        this.isModalOpen = true;
    }

    handleModalClose() {
        this.isModalOpen = false;
        this.editRecordId = null;
        this.duplicateData = null;
    }

    async handleSuccess() {
        this.showToast('Success', 'Expense saved successfully!', 'success');
        await Promise.all([this.loadDashboard(), this.loadExpenses()]);
    }

    handlePrint() {
        window.print();
    }

    handleExportCsv() {
        if (this.hasNoRows) {
            return;
        }

        const headers = [
            'Date',
            'Time',
            'Expense Name',
            'Category',
            'Expense Group',
            'Bank',
            'Type',
            'Amount (PHP)'
        ];
        const rows = this.filteredRows.map(row => [
            row.expenseDate || '',
            row.transactionTimeDisplay === '-' ? '' : row.transactionTimeDisplay,
            row.name || '',
            row.category || '',
            row.expenseGroup || '',
            row.bank || '',
            row.transactionType || '',
            row.amount != null ? row.amount : ''
        ]);

        const csvContent = [headers, ...rows]
            .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            .join('\n');

        const link = document.createElement('a');
        link.setAttribute('href', `data:text/csv;charset=utf-8,${encodeURIComponent(csvContent)}`);
        link.setAttribute('download', `budget-expenses-${this.endDate || 'export'}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }

    getErrorMessage(error, fallback) {
        return error?.body?.message || fallback;
    }
}
