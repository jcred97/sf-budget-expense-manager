import { LightningElement, api } from 'lwc';
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
    @api expenseGroupName;
    _expenseGroupId = '';
    _active = false;
    _latestDashboardLoadRequestId = 0;
    dashboardRows = [];
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
            const { rows, trend, budgets } = await fetchDashboardData({
                expenseGroupId: this.expenseGroupId,
                startDate: this.dashboardStartDate,
                endDate: this.dashboardEndDate
            });

            if (requestId !== this._latestDashboardLoadRequestId) {
                return;
            }

            this.dashboardRows = rows;
            this.dashboardTrend = trend;
            this.dashboardBudgets = budgets;
        } catch {
            if (requestId !== this._latestDashboardLoadRequestId) {
                return;
            }
            this.dashboardRows = [];
            this.dashboardTrend = [];
            this.dashboardBudgets = [];
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
        this.dashboardRows = [];
        this.dashboardTrend = [];
        this.dashboardBudgets = [];
        this.dashboardLoadError = '';
        this.isDashboardLoading = false;
    }

    get viewModel() {
        const isLoading = this.isDashboardLoading;
        return getDashboardViewModel(this, {
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
            showEmptyState: this.dashboardRows.length === 0 && !isLoading
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
