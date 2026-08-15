import { LightningElement, api } from 'lwc';

export default class ExpenseSummaryCards extends LightningElement {
    @api cards = [];

    get cardItems() {
        return this.cards.map(card => ({
            ...card,
            valueClass: `stat-value stat-value_${card.variant || 'name'}`
        }));
    }
}
