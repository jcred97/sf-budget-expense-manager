/** Lightning-facing controller for read-only PHP exchange-rate references. */
public with sharing class ExchangeRateController {
    /**
     * Retrieves a validated PHP reference rate without reading or mutating Salesforce records.
     *
     * @param request Source currency and transaction date.
     * @return A normalized PHP rate quote.
     */
    @AuraEnabled
    public static ExchangeRateQuoteDto getPhpRate(ExchangeRateRequest request) {
        try {
            return ExchangeRateService.getPhpRate(request);
        } catch (ExchangeRateService.ExchangeRateException exceptionToHandle) {
            throw handledException(exceptionToHandle.getMessage());
        }
    }

    private static AuraHandledException handledException(String message) {
        AuraHandledException exceptionToThrow = new AuraHandledException(message);
        exceptionToThrow.setMessage(message);
        return exceptionToThrow;
    }
}
