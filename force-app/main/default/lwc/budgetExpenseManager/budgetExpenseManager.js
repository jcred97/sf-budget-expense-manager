import { LightningElement, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { loadStyle } from 'lightning/platformResourceLoader';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getRecord, getFieldValue, notifyRecordUpdateAvailable } from 'lightning/uiRecordApi';
import GROUP_NAME from '@salesforce/schema/Expense_Group__c.Name';
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
    _manageScope = 'group';
    isSidebarCollapsed = false;
    expenseGroupId = '';

    expenseGroups = [];
    _managedGroup;
    groupContextError = '';
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

    get isManageView() {
        return (
            this.activeView === WORKSPACE_VIEWS.GROUP_SETTINGS ||
            this.activeView === WORKSPACE_VIEWS.APP_MANAGEMENT
        );
    }

    get manageScope() {
        return this._manageScope;
    }

    get showGroupContext() {
        return this.activeView !== WORKSPACE_VIEWS.APP_MANAGEMENT;
    }

    get workspaceCaption() {
        return this.showGroupContext ? this.selectedExpenseGroupName : 'App Management';
    }

    get expenseGroupOptions() {
        const options = this.expenseGroups.map(group => ({ label: group.Name, value: group.Id }));
        if (this.managedGroupRecordId) {
            options.push({ label: this._managedGroup.Name, value: this._managedGroup.Id });
        }
        return options;
    }

    get managedGroupRecordId() {
        return this._managedGroup?.Id === this.expenseGroupId &&
            !this.expenseGroups.some(group => group.Id === this.expenseGroupId)
            ? this.expenseGroupId
            : undefined;
    }

    get isManageHidden() {
        return !this.isManageView;
    }

    get selectedExpenseGroupName() {
        return (
            this.expenseGroups.find(expenseGroup => expenseGroup.Id === this.expenseGroupId)
                ?.Name ||
            this._managedGroup?.Name ||
            ''
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
            if (
                this.expenseGroupId &&
                !data.some(expenseGroup => expenseGroup.Id === this.expenseGroupId) &&
                this._managedGroup?.Id !== this.expenseGroupId
            ) {
                this.clearWorkspaceContext();
            }
            if (data.some(group => group.Id === this.expenseGroupId)) {
                this._managedGroup = undefined;
                this.groupContextError = '';
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

    // Paginated management can select a group beyond the bounded sidebar list.
    @wire(getRecord, { recordId: '$managedGroupRecordId', fields: [GROUP_NAME] })
    wiredManagedGroup({ data, error }) {
        if (!this.managedGroupRecordId) return;
        if (data && data.id === this.expenseGroupId) {
            this._managedGroup = { Id: data.id, Name: getFieldValue(data, GROUP_NAME) };
            this.groupContextError = '';
        } else if (error) {
            if (Number(error.status) === 403 || Number(error.status) === 404) {
                this.clearWorkspaceContext();
                if (this.expenseGroups.length) {
                    this.setExpenseGroupContext(this.expenseGroups[0].Id);
                }
                this.showToast(
                    'Group unavailable',
                    'This expense group is no longer accessible.',
                    'warning'
                );
            } else {
                this.groupContextError = getErrorMessage(
                    error,
                    'Could not verify the selected expense group.'
                );
            }
        }
    }

    async handleRetryGroupContext() {
        const recordId = this.managedGroupRecordId;
        if (!recordId) return;
        this.groupContextError = '';
        try {
            await notifyRecordUpdateAvailable([{ recordId }]);
        } catch (error) {
            if (recordId === this.managedGroupRecordId) {
                this.groupContextError = getErrorMessage(
                    error,
                    'Could not verify the selected expense group.'
                );
            }
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
        if (viewName === WORKSPACE_VIEWS.APP_MANAGEMENT) this._manageScope = 'app';
        if (viewName === WORKSPACE_VIEWS.GROUP_SETTINGS) this._manageScope = 'group';
        this.activeView = viewName;
    }

    handleWorkspaceGroupChange(event) {
        this.setExpenseGroupContext(event.detail.value);
    }

    handleManageGroup(event) {
        const { expenseGroupId, expenseGroupName } = event.detail || {};
        if (!expenseGroupId || !expenseGroupName) return;
        this.activateView(WORKSPACE_VIEWS.GROUP_SETTINGS);
        this._managedGroup = this.expenseGroups.some(group => group.Id === expenseGroupId)
            ? undefined
            : { Id: expenseGroupId, Name: expenseGroupName };
        this.setExpenseGroupContext(expenseGroupId);
    }

    setExpenseGroupContext(expenseGroupId) {
        if (!expenseGroupId || expenseGroupId === this.expenseGroupId) {
            return;
        }

        this.invalidateCategoryRefresh();
        if (this._managedGroup?.Id !== expenseGroupId) this._managedGroup = undefined;
        this.groupContextError = '';
        this._wiredCategoriesResult = undefined;
        this.expenseGroupId = expenseGroupId;
        this.clearBankOptions();
        this.categoryOptions = [{ label: 'All Categories', value: 'All' }];
        this.categoryOptionsError = '';
        this.isCategoriesLoading = true;
        if (!this.isManageView) this.activeView = WORKSPACE_VIEWS.DASHBOARD;
        this.loadBankOptions();
    }

    clearWorkspaceContext() {
        this._managedGroup = undefined;
        this.groupContextError = '';
        this.invalidateCategoryRefresh();
        this._wiredCategoriesResult = undefined;
        this.expenseGroupId = '';
        this.categoryOptions = [{ label: 'All Categories', value: 'All' }];
        this.categoryOptionsError = '';
        this.isCategoriesLoading = false;
        if (!this.isManageView) this.activeView = WORKSPACE_VIEWS.DASHBOARD;
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

    async handleConfigurationChange(event) {
        const tasks = [this.refreshCategoryOptions(), this.loadBankOptions()];
        if (event.detail?.objectKind === 'groups' && this._wiredGroupsResult) {
            tasks.push(refreshApex(this._wiredGroupsResult));
        }
        const results = await Promise.allSettled(tasks);
        if (results.some(result => result.status === 'rejected')) {
            this.showToast(
                'Refresh needed',
                'The record was saved, but group choices could not refresh. Reload the app to update them.',
                'warning'
            );
        }
        this.refreshDashboard();
        this.template.querySelector('c-expense-list')?.refresh();
        // Recurring refreshes its saved overview when the user next activates that screen.
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
