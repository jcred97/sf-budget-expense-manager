/** Namespace-independent rows for the permanent workspace management screen. */
public class WorkspaceManagementRecord {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public Id parentId;
    @AuraEnabled
    public String parentName;
    @AuraEnabled
    public Boolean active;
    @AuraEnabled
    public Id bankId;
    @AuraEnabled
    public String bankName;
    @AuraEnabled
    public Boolean bankActive;
    @AuraEnabled
    public Boolean creditCard;
    @AuraEnabled
    public Boolean debitCard;
    @AuraEnabled
    public Boolean bankPayment;
    @AuraEnabled
    public Boolean bankTransfer;
}
