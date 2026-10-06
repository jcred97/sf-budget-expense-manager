/** Lightning entry points for explicit administrator setup. */
public with sharing class AppSetupController {
    @AuraEnabled
    public static AppSetupStatus getSetupStatus() {
        return AppSetupService.getSetupStatus();
    }
    @AuraEnabled
    public static AppSetupStatus completeSetup(Boolean confirmed) {
        return AppSetupService.completeSetup(confirmed);
    }
}
