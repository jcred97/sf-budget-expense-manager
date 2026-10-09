/** Bounded management rows with an explicit continuation token. */
public class WorkspaceManagementPage {
    @AuraEnabled
    public List<WorkspaceManagementRecord> records = new List<WorkspaceManagementRecord>();
    @AuraEnabled
    public String nextPageToken;
    @AuraEnabled
    public Boolean hasMore = false;
}
