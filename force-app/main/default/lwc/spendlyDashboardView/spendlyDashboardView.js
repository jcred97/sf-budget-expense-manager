import { LightningElement, api } from 'lwc';

export default class SpendlyDashboardView extends LightningElement {
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

    handleViewTransactions() {
        this.dispatchEvent(new CustomEvent('viewtransactions'));
    }
}
