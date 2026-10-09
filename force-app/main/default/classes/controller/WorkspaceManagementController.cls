/** Read-only, permission-enforced management lists. Record forms perform writes through LDS. */
public with sharing class WorkspaceManagementController {
    private static final Integer PAGE_SIZE = 50;
    private static final Integer QUERY_LIMIT = PAGE_SIZE + 1;
    private static final Set<String> KINDS = new Set<String>{ 'Groups', 'Categories', 'Banks', 'Assignments' };

    private class Cursor {
        public String objectKind;
        public Id expenseGroupId;
        public String searchTerm;
        public String name;
        public Id recordId;
    }

    /** Returns a name-ordered page, including inactive records so they can be maintained. */
    @AuraEnabled
    public static WorkspaceManagementPage getRecordsPage(String objectKind, Id expenseGroupId, String searchTerm, String pageToken) {
        if (!KINDS.contains(objectKind)) {
            throw invalidRequest('Choose a supported management record type.');
        }
        String search = String.isBlank(searchTerm) ? '' : searchTerm.trim();
        if (search.length() > 200) {
            throw invalidRequest('Use a search of 200 characters or fewer.');
        }
        Boolean scoped = objectKind == 'Categories' || objectKind == 'Assignments';
        Id groupId = scoped ? expenseGroupId : null;
        if (groupId != null && groupId.getSObjectType() != Expense_Group__c.SObjectType) {
            throw invalidRequest('Choose an Expense Group.');
        }
        WorkspaceManagementPage page = new WorkspaceManagementPage();
        if (scoped && groupId == null) {
            return page;
        }
        Cursor after = decodeCursor(pageToken, objectKind, groupId, search);
        Boolean firstPage = after == null;
        String afterName = firstPage ? '' : after.name;
        Id afterId = firstPage ? null : after.recordId;
        String pattern = '%' + search.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%';
        if (objectKind == 'Groups') {
            List<Expense_Group__c> rows = firstPage
                ? [
                      SELECT Id, Name
                      FROM Expense_Group__c
                      WHERE Name LIKE :pattern
                      WITH USER_MODE
                      ORDER BY Name, Id
                      LIMIT :QUERY_LIMIT
                  ]
                : [
                      SELECT Id, Name
                      FROM Expense_Group__c
                      WHERE Name LIKE :pattern AND (Name > :afterName OR (Name = :afterName AND Id > :afterId))
                      WITH USER_MODE
                      ORDER BY Name, Id
                      LIMIT :QUERY_LIMIT
                  ];
            for (Expense_Group__c record : rows) {
                WorkspaceManagementRecord row = base(record.Id, record.Name);
                page.records.add(row);
            }
        } else if (objectKind == 'Categories') {
            List<Category__c> rows = firstPage
                ? [
                      SELECT Id, Name, Expense_Group__c, Expense_Group__r.Name
                      FROM Category__c
                      WHERE Expense_Group__c = :groupId AND Name LIKE :pattern
                      WITH USER_MODE
                      ORDER BY Name, Id
                      LIMIT :QUERY_LIMIT
                  ]
                : [
                      SELECT Id, Name, Expense_Group__c, Expense_Group__r.Name
                      FROM Category__c
                      WHERE
                          Expense_Group__c = :groupId
                          AND Name LIKE :pattern
                          AND (Name > :afterName
                          OR (Name = :afterName
                          AND Id > :afterId))
                      WITH USER_MODE
                      ORDER BY Name, Id
                      LIMIT :QUERY_LIMIT
                  ];
            for (Category__c record : rows) {
                WorkspaceManagementRecord row = base(record.Id, record.Name);
                row.parentId = record.Expense_Group__c;
                row.parentName = record.Expense_Group__r.Name;
                page.records.add(row);
            }
        } else if (objectKind == 'Banks') {
            List<Bank__c> rows = firstPage
                ? [
                      SELECT Id, Name, Active__c
                      FROM Bank__c
                      WHERE Name LIKE :pattern
                      WITH USER_MODE
                      ORDER BY Name, Id
                      LIMIT :QUERY_LIMIT
                  ]
                : [
                      SELECT Id, Name, Active__c
                      FROM Bank__c
                      WHERE Name LIKE :pattern AND (Name > :afterName OR (Name = :afterName AND Id > :afterId))
                      WITH USER_MODE
                      ORDER BY Name, Id
                      LIMIT :QUERY_LIMIT
                  ];
            for (Bank__c record : rows) {
                WorkspaceManagementRecord row = base(record.Id, record.Name);
                row.active = record.Active__c;
                page.records.add(row);
            }
        } else {
            List<Expense_Group_Bank__c> rows = firstPage
                ? [
                      SELECT
                          Id,
                          Expense_Group__c,
                          Expense_Group__r.Name,
                          Bank__c,
                          Bank__r.Name,
                          Bank__r.Active__c,
                          Active__c,
                          Supported_Credit_Card__c,
                          Supported_Debit_Card__c,
                          Supported_Bank_Payment__c,
                          Supported_Bank_Transfer__c
                      FROM Expense_Group_Bank__c
                      WHERE Expense_Group__c = :groupId AND Bank__r.Name LIKE :pattern
                      WITH USER_MODE
                      ORDER BY Bank__r.Name, Id
                      LIMIT :QUERY_LIMIT
                  ]
                : [
                      SELECT
                          Id,
                          Expense_Group__c,
                          Expense_Group__r.Name,
                          Bank__c,
                          Bank__r.Name,
                          Bank__r.Active__c,
                          Active__c,
                          Supported_Credit_Card__c,
                          Supported_Debit_Card__c,
                          Supported_Bank_Payment__c,
                          Supported_Bank_Transfer__c
                      FROM Expense_Group_Bank__c
                      WHERE
                          Expense_Group__c = :groupId
                          AND Bank__r.Name LIKE :pattern
                          AND (Bank__r.Name > :afterName
                          OR (Bank__r.Name = :afterName
                          AND Id > :afterId))
                      WITH USER_MODE
                      ORDER BY Bank__r.Name, Id
                      LIMIT :QUERY_LIMIT
                  ];
            for (Expense_Group_Bank__c record : rows) {
                WorkspaceManagementRecord row = base(record.Id, record.Bank__r.Name);
                row.parentId = record.Expense_Group__c;
                row.parentName = record.Expense_Group__r.Name;
                row.bankId = record.Bank__c;
                row.bankName = record.Bank__r.Name;
                row.bankActive = record.Bank__r.Active__c;
                row.active = record.Active__c;
                row.creditCard = record.Supported_Credit_Card__c;
                row.debitCard = record.Supported_Debit_Card__c;
                row.bankPayment = record.Supported_Bank_Payment__c;
                row.bankTransfer = record.Supported_Bank_Transfer__c;
                page.records.add(row);
            }
        }
        if (page.records.size() > PAGE_SIZE) {
            page.records.remove(PAGE_SIZE);
            page.hasMore = true;
            WorkspaceManagementRecord last = page.records[PAGE_SIZE - 1];
            Cursor next = new Cursor();
            next.objectKind = objectKind;
            next.expenseGroupId = groupId;
            next.searchTerm = search;
            next.name = last.name;
            next.recordId = last.id;
            page.nextPageToken = EncodingUtil.base64Encode(Blob.valueOf(JSON.serialize(next)));
        }
        return page;
    }

    private static WorkspaceManagementRecord base(Id recordId, String name) {
        WorkspaceManagementRecord row = new WorkspaceManagementRecord();
        row.id = recordId;
        row.name = name;
        return row;
    }

    private static Cursor decodeCursor(String token, String kind, Id groupId, String search) {
        if (String.isBlank(token)) {
            return null;
        }
        try {
            if (token.length() > 3000) {
                throw new IllegalArgumentException();
            }
            Cursor result = (Cursor) JSON.deserialize(EncodingUtil.base64Decode(token).toString(), Cursor.class);
            Schema.SObjectType expected = kind == 'Groups'
                ? Expense_Group__c.SObjectType
                : kind == 'Categories'
                      ? Category__c.SObjectType
                      : kind == 'Banks' ? Bank__c.SObjectType : Expense_Group_Bank__c.SObjectType;
            if (
                result == null ||
                result.objectKind != kind ||
                result.expenseGroupId != groupId ||
                result.searchTerm != search ||
                result.name == null ||
                result.recordId == null ||
                result.recordId.getSObjectType() != expected
            ) {
                throw new IllegalArgumentException();
            }
            return result;
        } catch (Exception error) {
            throw invalidRequest('The management page expired. Refresh the list.');
        }
    }

    private static AuraHandledException invalidRequest(String message) {
        AuraHandledException error = new AuraHandledException(message);
        error.setMessage(message);
        return error;
    }
}
