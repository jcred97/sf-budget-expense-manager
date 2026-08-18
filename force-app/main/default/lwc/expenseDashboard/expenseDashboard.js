import { LightningElement, api } from 'lwc';

export default class ExpenseDashboard extends LightningElement {
    @api viewModel = {
        summaryCards: [],
        categoryChartData: [],
        monthlyTrendData: [],
        bankChartData: [],
        recentRows: [],
        insights: []
    };

    get hasRecentRows() {
        return this.viewModel.recentRows.length > 0;
    }

    handleViewExpenses() {
        this.dispatchEvent(new CustomEvent('viewexpenses'));
    }
}
