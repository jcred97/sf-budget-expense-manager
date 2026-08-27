import { LightningElement, api } from 'lwc';

export default class BudgetHistory extends LightningElement {
    @api historyData = [];

    get hasRows() {
        return this.historyData.length > 0;
    }
}
