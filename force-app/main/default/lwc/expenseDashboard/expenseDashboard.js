import { LightningElement, api } from 'lwc';

export default class ExpenseDashboard extends LightningElement {
    @api viewModel = {
        summaryCards: [],
        categoryChartData: [],
        monthlyTrendData: [],
        budgetHistoryData: [],
        bankChartData: [],
        recentRows: [],
        insights: [],
        budgetContext: {},
        loadError: ''
    };

    get hasRecentRows() {
        return this.viewModel.recentRows.length > 0;
    }

    get showHeroTotal() {
        return !this.viewModel.isLoading && !this.viewModel.loadError;
    }

    handleViewExpenses() {
        this.dispatchEvent(new CustomEvent('viewexpenses'));
    }

    handleRetryDashboard() {
        this.dispatchEvent(new CustomEvent('retrydashboard'));
    }

    handleBudgetChange() {
        this.dispatchEvent(new CustomEvent('budgetchange'));
    }
}
