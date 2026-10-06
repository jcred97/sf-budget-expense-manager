import { LightningElement, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { loadStyle } from 'lightning/platformResourceLoader';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import removeDateFormatStyle from '@salesforce/resourceUrl/RemoveDateFormatStyle';

import getAllExpenseGroups from '@salesforce/apex/ExpenseController.getAllExpenseGroups';
import getCategoriesByExpenseGroup from '@salesforce/apex/ExpenseController.getCategoriesByExpenseGroup';
import { getErrorMessage } from 'c/expenseErrorUtils';
import { WORKSPACE_VIEWS, buildWorkspaceNavItems } from 'c/expenseWorkspaceConfig';
import { fetchBankOptions } from 'c/expenseWorkspaceData';

export default class BudgetExpenseManager extends LightningElement {
    // Request counters prevent stale responses from replacing newer view data.
    _latestBankOptionsRequestId = 0;
    _latestCategoryRefreshRequestId = 0;
    _activeCategoryRefreshRequestId = 0;
    _wiredCategoriesResult;
    _dateFormatStyleLoadPromise;
    _wiredGroupsResult;
    isSetupReady = false;
    async handleSetupReady(event) {
        this.isSetupReady = true;
        if (event.detail?.completed && this._wiredGroupsResult) {
            try {
                await refreshApex(this._wiredGroupsResult);
            } catch {
                // The existing group wire owns error presentation.
            }
        }
    }

    // Workspace and shared lookup state.
    activeView = WORKSPACE_VIEWS.DASHBOARD;
    isSidebarCollapsed = false;
    expenseGroupId = '';

    expenseGroups = [];
    expenseGroupOptions = [];
    categoryOptions = [{ label: 'All Categories', value: 'All' }];
    bankOptions = [];

    isCategoriesLoading = false;
    categoryOptionsError = '';
    isBankOptionsLoading = false;
    bankOptionsError = '';

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

    @wire(getAllExpenseGroups)
    wiredExpenseGroups(result) {
        this._wiredGroupsResult = result;
        const { error, data } = result;
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

    // Navigation and workspace context.

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

        this.invalidateCategoryRefresh();
        this._wiredCategoriesResult = undefined;
        this.expenseGroupId = expenseGroupId;
        this.clearBankOptions();
        this.categoryOptions = [{ label: 'All Categories', value: 'All' }];
        this.categoryOptionsError = '';
        this.isCategoriesLoading = true;
        this.activeView = WORKSPACE_VIEWS.DASHBOARD;
        this.loadBankOptions();
    }

    clearWorkspaceContext() {
        this.invalidateCategoryRefresh();
        this._wiredCategoriesResult = undefined;
        this.expenseGroupId = '';
        this.categoryOptions = [{ label: 'All Categories', value: 'All' }];
        this.categoryOptionsError = '';
        this.isCategoriesLoading = false;
        this.activeView = WORKSPACE_VIEWS.DASHBOARD;
        this.clearBankOptions();
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

    get isRecurringHidden() {
        return !this.isRecurringView;
    }

    handleRecurringOptionsRefresh() {
        this.refreshCategoryOptions();
        this.loadBankOptions();
    }

    handleRecurringGenerationCompleted() {
        this.refreshCategoryOptions();
        this.refreshDashboard();
        this.template.querySelector('c-expense-list')?.refresh();
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

    openExpenseModal() {
        this.template.querySelector('c-expense-list')?.openExpenseModal();
    }

    handleRetryBankOptions() {
        this.loadBankOptions();
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
