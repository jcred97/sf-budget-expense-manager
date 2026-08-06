import { LightningElement, api } from 'lwc';

export default class SpendlyRecurringExpenses extends LightningElement {
    @api viewModel = {
        summaryCards: [],
        rows: []
    };

    get hasRows() {
        return this.viewModel.rows.length > 0;
    }

    handleRowAction(event) {
        this.dispatchEvent(
            new CustomEvent('rowaction', {
                detail: {
                    action: event.detail.value,
                    id: event.currentTarget.dataset.id
                }
            })
        );
    }
}
