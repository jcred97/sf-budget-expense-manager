import getPhpRate from '@salesforce/apex/ExchangeRateController.getPhpRate';

export function fetchPhpExchangeRate({ sourceCurrency, requestedDate }) {
    return getPhpRate({
        request: {
            sourceCurrency,
            requestedDate: requestedDate || null
        }
    });
}
