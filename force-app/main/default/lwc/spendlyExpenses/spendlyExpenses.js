import { LightningElement, api } from 'lwc';

export default class SpendlyExpenses extends LightningElement {
    @api viewModel = {
        categoryOptions: [],
        transactionGroups: []
    };

    handleFilterChange(event) {
        this.dispatchEvent(
            new CustomEvent('filterchange', {
                detail: {
                    field: event.target.dataset.field,
                    value: event.detail.value
                }
            })
        );
    }

    handleResetFilters() {
        this.dispatchEvent(new CustomEvent('resetfilters'));
    }

    handleAddExpense() {
        this.dispatchEvent(new CustomEvent('addexpense'));
    }

    handleTransactionSelect(event) {
        this.dispatchEvent(
            new CustomEvent('selectionchange', {
                detail: {
                    id: event.target.dataset.id,
                    selected: event.target.checked
                }
            })
        );
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

    handleBulkDelete() {
        this.dispatchEvent(new CustomEvent('bulkdelete'));
    }

    handleLoadMore() {
        this.dispatchEvent(new CustomEvent('loadmore'));
    }
}
