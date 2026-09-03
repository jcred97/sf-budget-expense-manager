/** Lightning-facing controller for the app's stable reporting currency. */
public with sharing class CurrencyContextController {
    /**
     * Returns the initialized reporting currency without mutating settings.
     *
     * @return Stable app currency context.
     */
    @AuraEnabled(cacheable=true)
    public static CurrencyContextDto getCurrencyContext() {
        try {
            return CurrencyContextService.getCurrencyContext();
        } catch (CurrencyContextService.CurrencyContextException exceptionToHandle) {
            throw handledException(exceptionToHandle.getMessage());
        }
    }

    private static AuraHandledException handledException(String message) {
        AuraHandledException exceptionToThrow = new AuraHandledException(message);
        exceptionToThrow.setMessage(message);
        return exceptionToThrow;
    }
}
