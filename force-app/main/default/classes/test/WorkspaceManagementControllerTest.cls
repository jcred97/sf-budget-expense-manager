@IsTest
private class WorkspaceManagementControllerTest {
    @TestSetup
    static void actors() {
        Id licenseId = [SELECT Profile.UserLicenseId FROM User WHERE Id = :UserInfo.getUserId()].Profile.UserLicenseId;
        List<Profile> profiles = [
            SELECT Id, Name
            FROM Profile
            WHERE UserLicenseId = :licenseId AND PermissionsModifyAllData = FALSE
            ORDER BY Name
        ];
        Id profileId = profiles[0].Id;
        for (Profile candidate : profiles) {
            if (candidate.Name == 'Minimum Access - Salesforce') {
                profileId = candidate.Id;
            }
        }
        List<User> users = new List<User>();
        for (String role : new List<String>{ 'ManageUser', 'ManageDenied' }) {
            users.add(
                new User(
                    Alias = role == 'ManageUser' ? 'mnguser' : 'mngdeny',
                    Email = role + '@example.invalid',
                    EmailEncodingKey = 'UTF-8',
                    LastName = role,
                    LanguageLocaleKey = 'en_US',
                    LocaleSidKey = 'en_US',
                    TimeZoneSidKey = 'Asia/Manila',
                    ProfileId = profileId,
                    Username = role + '.' + UserInfo.getOrganizationId() + '.' + DateTime.now().getTime() + '@example.invalid'
                )
            );
        }
        insert users;
        PermissionSet permission = [
            SELECT Id
            FROM PermissionSet
            WHERE Name = 'Budget_Expense_Manager_User' AND (NamespacePrefix = 'bemgr' OR NamespacePrefix = NULL)
            ORDER BY NamespacePrefix DESC NULLS LAST
            LIMIT 1
        ];
        insert new PermissionSetAssignment(AssigneeId = users[0].Id, PermissionSetId = permission.Id);
    }

    private static User actor(String name) {
        return [SELECT Id FROM User WHERE LastName = :name LIMIT 1];
    }
    private static WorkspaceManagementPage page(String kind, Id groupId, String search, String token) {
        return WorkspaceManagementController.getRecordsPage(kind, groupId, search, token);
    }

    @IsTest
    static void readsNormalizedRowsIncludingInactiveBankAndAssignments() {
        Expense_Group__c household = new Expense_Group__c(Name = 'Household');
        Expense_Group__c other = new Expense_Group__c(Name = 'Travel');
        insert new List<Expense_Group__c>{ household, other };
        insert new List<Category__c>{
            new Category__c(Name = 'Food', Expense_Group__c = household.Id),
            new Category__c(Name = 'Flights', Expense_Group__c = other.Id)
        };
        Bank__c activeBank = new Bank__c(Name = 'A Bank', Active__c = true);
        Bank__c inactiveBank = new Bank__c(Name = 'B Bank', Active__c = false);
        insert new List<Bank__c>{ activeBank, inactiveBank };
        Expense_Group_Bank__c active = new Expense_Group_Bank__c(
            Expense_Group__c = household.Id,
            Bank__c = activeBank.Id,
            Active__c = true,
            Supported_Credit_Card__c = true,
            Supported_Debit_Card__c = false,
            Supported_Bank_Payment__c = false,
            Supported_Bank_Transfer__c = true
        );
        Expense_Group_Bank__c inactive = new Expense_Group_Bank__c(
            Expense_Group__c = household.Id,
            Bank__c = inactiveBank.Id,
            Active__c = false
        );
        insert new List<Expense_Group_Bank__c>{ active, inactive };
        insert new Expense_Group_Bank__c(Expense_Group__c = other.Id, Bank__c = activeBank.Id, Active__c = true);
        System.runAs(actor('ManageUser')) {
            System.assertEquals(true, Bank__c.SObjectType.getDescribe().isAccessible());
            System.assertEquals(
                false,
                Bank__c.SObjectType.getDescribe().isCreateable(),
                'A management read does not expand global Bank writes.'
            );
            System.assertEquals(false, Bank__c.SObjectType.getDescribe().isUpdateable());
            WorkspaceManagementPage groups = page('Groups', null, null, null);
            System.assertEquals(2, groups.records.size());
            System.assertEquals(household.Id, groups.records[0].id);
            System.assertEquals('Household', groups.records[0].name);
            WorkspaceManagementPage categories = page('Categories', household.Id, null, null);
            System.assertEquals(1, categories.records.size(), 'Categories must be scoped to the selected group.');
            System.assertEquals('Food', categories.records[0].name);
            System.assertEquals(household.Id, categories.records[0].parentId);
            System.assertEquals('Household', categories.records[0].parentName);
            WorkspaceManagementPage banks = page('Banks', null, '', null);
            System.assertEquals(2, banks.records.size());
            System.assertEquals(false, banks.records[1].active, 'Inactive global Banks remain maintainable.');
            WorkspaceManagementPage assignments = page('Assignments', household.Id, null, null);
            System.assertEquals(2, assignments.records.size(), 'Assignments must be scoped and include inactive pairs.');
            WorkspaceManagementRecord first = assignments.records[0];
            System.assertEquals(active.Id, first.id);
            System.assertEquals(activeBank.Id, first.bankId);
            System.assertEquals('A Bank', first.bankName);
            System.assertEquals(household.Id, first.parentId);
            System.assertEquals('Household', first.parentName);
            System.assertEquals(true, first.active);
            System.assertEquals(true, first.bankActive);
            System.assertEquals(true, first.creditCard);
            System.assertEquals(false, first.debitCard);
            System.assertEquals(false, first.bankPayment);
            System.assertEquals(true, first.bankTransfer);
            System.assertEquals(false, assignments.records[1].active);
            System.assertEquals(false, assignments.records[1].bankActive);
            System.assertEquals(false, assignments.hasMore);
            System.assertEquals(null, assignments.nextPageToken);
        }
    }

    @IsTest
    static void traversesEveryPageIncludingDuplicateNames() {
        List<Expense_Group__c> groups = new List<Expense_Group__c>();
        for (Integer index = 0; index < 107; index++) {
            groups.add(new Expense_Group__c(Name = 'Same name'));
        }
        insert groups;
        Set<Id> seen = new Set<Id>();
        System.runAs(actor('ManageUser')) {
            WorkspaceManagementPage first = page('Groups', null, '', null);
            System.assertEquals(50, first.records.size());
            System.assertEquals(true, first.hasMore);
            System.assertNotEquals(null, first.nextPageToken);
            WorkspaceManagementPage second = page('Groups', null, '', first.nextPageToken);
            System.assertEquals(50, second.records.size());
            System.assertEquals(true, second.hasMore);
            WorkspaceManagementPage third = page('Groups', null, '', second.nextPageToken);
            System.assertEquals(7, third.records.size());
            System.assertEquals(false, third.hasMore);
            System.assertEquals(null, third.nextPageToken);
            for (WorkspaceManagementPage result : new List<WorkspaceManagementPage>{ first, second, third }) {
                for (WorkspaceManagementRecord row : result.records) {
                    System.assert(seen.add(row.id), 'Traversal must never duplicate a row sharing the last name.');
                }
            }
        }
        System.assertEquals(107, seen.size(), 'Every available record must be reachable beyond the first-page bound.');
    }

    @IsTest
    static void searchesLiteralCharactersAndTrimsWhitespace() {
        insert new List<Bank__c>{ new Bank__c(Name = 'A_100% Bank'), new Bank__c(Name = 'A1100X Bank') };
        WorkspaceManagementPage result = page('Banks', null, '  _100%  ', null);
        System.assertEquals(1, result.records.size(), 'LIKE wildcard characters in search are literal.');
        System.assertEquals('A_100% Bank', result.records[0].name);
        insert new Expense_Group__c(Name = 'Household');
        System.assertEquals(1, page('Groups', null, ' HOUSE ', null).records.size(), 'Name search is case insensitive.');
    }

    @IsTest
    static void missingGroupReturnsEmptyAndInvalidRequestsFailClearly() {
        System.assertEquals(0, page('Categories', null, null, null).records.size());
        System.assertEquals(0, page('Assignments', null, null, null).records.size());
        assertRejected('Expenses', null, null, null, 'supported management');
        assertRejected(null, null, null, null, 'supported management');
        assertRejected('Banks', null, 'x'.repeat(201), null, '200 characters');
        assertRejected('Categories', UserInfo.getUserId(), null, null, 'Expense Group');
        assertRejected('Banks', null, null, 'invalid token', 'Refresh the list');
        assertRejected('Banks', null, null, 'x'.repeat(3001), 'Refresh the list');
        assertRejected('Banks', null, null, EncodingUtil.base64Encode(Blob.valueOf('null')), 'Refresh the list');
    }

    @IsTest
    static void rejectsCrossScopeCursorAndMissingCursorIdentity() {
        List<Expense_Group__c> groups = new List<Expense_Group__c>();
        for (Integer index = 0; index < 51; index++) {
            groups.add(new Expense_Group__c(Name = 'Same'));
        }
        insert groups;
        String token = page('Groups', null, null, null).nextPageToken;
        assertRejected('Banks', null, null, token, 'Refresh the list');
        assertRejected('Groups', null, 'Same', token, 'Refresh the list');
        Map<String, Object> cursor = (Map<String, Object>) JSON.deserializeUntyped(EncodingUtil.base64Decode(token).toString());
        cursor.put('recordId', UserInfo.getUserId());
        assertRejected('Groups', null, null, EncodingUtil.base64Encode(Blob.valueOf(JSON.serialize(cursor))), 'Refresh the list');
        cursor.remove('recordId');
        assertRejected('Groups', null, null, EncodingUtil.base64Encode(Blob.valueOf(JSON.serialize(cursor))), 'Refresh the list');
    }

    @IsTest
    static void rejectsReadWithoutObjectPermission() {
        System.runAs(actor('ManageDenied')) {
            System.assertEquals(
                false,
                Bank__c.SObjectType.getDescribe().isAccessible(),
                'The denied actor must actually lack object read.'
            );
            Boolean denied = false;
            try {
                page('Banks', null, null, null);
            } catch (QueryException expected) {
                denied = true;
            }
            System.assertEquals(true, denied, 'USER_MODE must enforce permission rather than returning privileged records.');
        }
    }

    @IsTest
    static void traversesScopedAndBankPagesWithUserPermissions() {
        Expense_Group__c groupRecord = new Expense_Group__c(Name = 'Paged group');
        Expense_Group__c otherGroup = new Expense_Group__c(Name = 'Other group');
        insert new List<Expense_Group__c>{ groupRecord, otherGroup };
        List<Category__c> categories = new List<Category__c>();
        List<Bank__c> banks = new List<Bank__c>();
        for (Integer index = 0; index < 51; index++) {
            categories.add(new Category__c(Name = 'Same category', Expense_Group__c = groupRecord.Id));
            banks.add(new Bank__c(Name = 'Bank ' + index, Active__c = true));
        }
        insert categories;
        insert banks;
        List<Expense_Group_Bank__c> assignments = new List<Expense_Group_Bank__c>();
        for (Bank__c bank : banks) {
            assignments.add(new Expense_Group_Bank__c(Expense_Group__c = groupRecord.Id, Bank__c = bank.Id, Active__c = true));
        }
        insert assignments;
        System.runAs(actor('ManageUser')) {
            for (String kind : new List<String>{ 'Categories', 'Banks', 'Assignments' }) {
                WorkspaceManagementPage first = page(kind, groupRecord.Id, null, null);
                System.assertEquals(50, first.records.size(), kind);
                System.assertEquals(true, first.hasMore, kind);
                WorkspaceManagementPage last = page(kind, groupRecord.Id, null, first.nextPageToken);
                System.assertEquals(1, last.records.size(), kind);
                System.assertEquals(false, last.hasMore, kind);
                Set<Id> seen = new Set<Id>();
                for (WorkspaceManagementRecord row : first.records) {
                    seen.add(row.id);
                }
                System.assert(!seen.contains(last.records[0].id), 'Final page must continue beyond the previous name/Id boundary: ' + kind);
                if (kind != 'Banks') {
                    System.assertEquals(groupRecord.Id, last.records[0].parentId);
                    assertRejected(kind, otherGroup.Id, null, first.nextPageToken, 'Refresh the list');
                }
            }
        }
    }
    private static void assertRejected(String kind, Id groupId, String search, String token, String expectedMessage) {
        try {
            page(kind, groupId, search, token);
            System.assert(false, 'Expected invalid request to fail.');
        } catch (AuraHandledException expected) {
            System.assert(expected.getMessage().contains(expectedMessage), expected.getMessage());
        }
    }
}
