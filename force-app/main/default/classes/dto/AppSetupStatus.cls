/** Sanitized setup state available to all app users without settings-object access. */
public class AppSetupStatus {
    @AuraEnabled
    public Boolean ready = false;
    @AuraEnabled
    public Boolean canManageSetup = false;
    @AuraEnabled
    public Boolean canCompleteSetup = false;
    @AuraEnabled
    public String organizationCurrencyCode;
    @AuraEnabled
    public String baseCurrencyCode;
    @AuraEnabled
    public String message;
}
