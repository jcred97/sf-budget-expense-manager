import { LightningElement, api, wire } from 'lwc';
import { getObjectInfos } from 'lightning/uiObjectInfoApi';
import BUDGET_OBJECT from '@salesforce/schema/Budget__c';
import EXPENSE_OBJECT from '@salesforce/schema/Expense__c';
import {
    canReadObject,
    canCreateObject,
    hasReadableFields,
    hasWritableFields
} from 'c/appSchemaAccess';
import { getErrorMessage } from 'c/expenseErrorUtils';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { fetchDashboardData } from 'c/expenseWorkspaceData';
import { getDashboardViewModel } from 'c/expenseWorkspaceViewModels';
import {
    formatMonthLabel,
    formatPeriodRange,
    getMonthBounds,
    parseDateString
} from 'c/expenseFormatters';

export default class ExpenseDashboard extends LightningElement {
    objectApiNames = [BUDGET_OBJECT, EXPENSE_OBJECT];
    objectInfos = {};
    budgetHistoryError = '';

    @wire(getObjectInfos, { objectApiNames: '$objectApiNames' })
    wiredObjectInfos({ data, error }) {
        if (!data && !error) return;
        this.objectInfos = data
            ? Object.fromEntries(
                  ['Budget__c', 'Expense__c'].map((kind, index) => [
                      kind,
                      data.results[index]?.result?.apiName ? data.results[index].result : undefined
                  ])
              )
            : {};
        this.dashboardBudgets = [];
        this.budgetHistoryError = '';
        if (this.isConnected) this.refresh();
    }

    get canReadBudgets() {
        return (
            canReadObject(this.objectInfos.Budget__c) &&
            hasReadableFields(this.objectInfos.Budget__c, [
                'Amount__c',
                'Budget_Month__c',
                'Expense_Group__c'
            ])
        );
    }

    get canAddExpense() {
        return (
            canCreateObject(this.objectInfos.Expense__c) &&
            hasWritableFields(
                this.objectInfos.Expense__c,
                ['Name', 'Amount__c', 'Expense_Date__c', 'Category__c', 'Transaction_Type__c'],
                'create'
            )
        );
    }
    @api expenseGroupName;
    _expenseGroupId = '';
    _active = false;
    _latestDashboardLoadRequestId = 0;
    dashboardRows = [];
    dashboardSummary = null;
    dashboardTrend = [];
    dashboardBudgets = [];
    isDashboardLoading = false;
    dashboardLoadError = '';
    dashboardStartDate = getMonthBounds(new Date()).startDate;
    dashboardEndDate = getMonthBounds(new Date()).endDate;

    @api
    get expenseGroupId() {
        return this._expenseGroupId;
    }
    set expenseGroupId(value) {
        const groupId = value || '';
        if (groupId === this._expenseGroupId) return;
        this._expenseGroupId = groupId;
        this.clearDashboardData();
        if (this.isConnected) this.refresh();
    }

    @api
    get active() {
        return this._active;
    }
    set active(value) {
        const becameActive = value && !this._active;
        this._active = value;
        if (becameActive && this.isConnected && !this.isDashboardLoading) this.refresh();
    }

    connectedCallback() {
        this.refresh();
    }
    disconnectedCallback() {
        this._latestDashboardLoadRequestId += 1;
    }

    get hasRecentRows() {
        return this.dashboardRows.length > 0;
    }
    get showHeroTotal() {
        return !this.isDashboardLoading && !this.dashboardLoadError;
    }
    handleViewExpenses() {
        this.dispatchEvent(new CustomEvent('viewexpenses'));
    }
    handleAddExpense() {
        if (!this.canAddExpense) return;
        this.dispatchEvent(new CustomEvent('addexpense'));
    }
    handleRetryDashboard() {
        this.refresh();
    }
    handleBudgetChange() {
        this.refresh();
    }
    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }

    @api
    async refresh() {
        if (!this.expenseGroupId) {
            this.clearDashboardData();
            return;
        }

        const requestId = ++this._latestDashboardLoadRequestId;
        this.isDashboardLoading = true;
        this.dashboardLoadError = '';

        try {
            const { summary, rows, trend, budgets, budgetError } = await fetchDashboardData({
                expenseGroupId: this.expenseGroupId,
                startDate: this.dashboardStartDate,
                endDate: this.dashboardEndDate,
                includeBudgets: this.canReadBudgets
            });

            if (requestId !== this._latestDashboardLoadRequestId) {
                return;
            }

            this.dashboardSummary = summary;
            this.dashboardRows = rows;
            this.dashboardTrend = trend;
            this.dashboardBudgets = budgets;
            this.budgetHistoryError = budgetError
                ? getErrorMessage(budgetError, 'Failed to load budget history.')
                : '';
        } catch {
            if (requestId !== this._latestDashboardLoadRequestId) {
                return;
            }
            this.dashboardSummary = null;
            this.dashboardRows = [];
            this.dashboardTrend = [];
            this.dashboardBudgets = [];
            this.budgetHistoryError = '';
            this.dashboardLoadError = 'Failed to load the dashboard.';
            this.showToast('Error', 'Failed to load dashboard.', 'error');
        } finally {
            if (requestId === this._latestDashboardLoadRequestId) {
                this.isDashboardLoading = false;
            }
        }
    }

    clearDashboardData() {
        this._latestDashboardLoadRequestId += 1;
        this.dashboardSummary = null;
        this.dashboardRows = [];
        this.dashboardTrend = [];
        this.dashboardBudgets = [];
        this.budgetHistoryError = '';
        this.dashboardLoadError = '';
        this.isDashboardLoading = false;
    }

    get viewModel() {
        const isLoading = this.isDashboardLoading;
        return getDashboardViewModel(this, {
            summary: this.dashboardSummary,
            rows: this.dashboardRows,
            trend: this.dashboardTrend,
            budgets: this.dashboardBudgets,
            endDate: this.dashboardEndDate,
            expenseGroupId: this.expenseGroupId,
            budgetMonth: this.dashboardStartDate,
            selectedMonthLabel: this.selectedMonthLabel,
            expenseGroupName: this.expenseGroupName,
            periodLabel: this.dashboardPeriodLabel,
            isLoading,
            loadError: this.dashboardLoadError,
            showEmptyState: !this.dashboardSummary?.expenseCount && !isLoading
        });
    }

    get dashboardPeriodLabel() {
        return formatPeriodRange(this.dashboardStartDate, this.dashboardEndDate);
    }

    get selectedMonthLabel() {
        const selectedDate = parseDateString(this.dashboardStartDate) || new Date();
        return formatMonthLabel(selectedDate);
    }

    handlePreviousMonth() {
        this.setSelectedMonth(-1);
    }

    handleNextMonth() {
        this.setSelectedMonth(1);
    }

    setSelectedMonth(monthOffset) {
        const selectedDate = parseDateString(this.dashboardStartDate) || new Date();
        const targetMonth = new Date(
            selectedDate.getFullYear(),
            selectedDate.getMonth() + monthOffset,
            1
        );
        const monthBounds = getMonthBounds(targetMonth);

        this.dashboardStartDate = monthBounds.startDate;
        this.dashboardEndDate = monthBounds.endDate;
        this.refresh();
    }
}
