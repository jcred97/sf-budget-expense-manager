import { LightningElement, api } from 'lwc';

export default class ExpenseMonthNavigator extends LightningElement {
    @api label = '';
    @api navigationLabel = 'Selected month';

    handlePrevious() {
        this.dispatchEvent(new CustomEvent('previous'));
    }

    handleNext() {
        this.dispatchEvent(new CustomEvent('next'));
    }
}
