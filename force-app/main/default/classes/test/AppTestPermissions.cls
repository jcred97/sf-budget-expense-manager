/** Explicit app access for test actors in development and package validation orgs. */
@IsTest
public class AppTestPermissions {
    public static void grantAdmin() {
        String objectName = Expense__c.SObjectType.getDescribe().getName();
        String localName = 'Expense__c';
        String namespacePrefix = objectName == localName ? null : objectName.substringBefore('__');
        PermissionSet adminPermission = [
            SELECT Id
            FROM PermissionSet
            WHERE Name = 'Budget_Expense_Manager_Admin' AND NamespacePrefix = :namespacePrefix
            LIMIT 1
        ];
        System.runAs(new User(Id = UserInfo.getUserId())) {
            if (
                [
                    SELECT COUNT()
                    FROM PermissionSetAssignment
                    WHERE AssigneeId = :UserInfo.getUserId() AND PermissionSetId = :adminPermission.Id
                ] == 0
            ) {
                insert new PermissionSetAssignment(AssigneeId = UserInfo.getUserId(), PermissionSetId = adminPermission.Id);
            }
            User actor = new User(
                Alias = 'bemtest',
                Email = 'bemgr-test-admin@example.invalid',
                EmailEncodingKey = 'UTF-8',
                LastName = 'BEMGR Package Test Admin',
                LanguageLocaleKey = 'en_US',
                LocaleSidKey = 'en_US',
                TimeZoneSidKey = 'Asia/Manila',
                ProfileId = UserInfo.getProfileId(),
                Username = 'bemgr.' +
                    UserInfo.getOrganizationId() +
                    '.' +
                    String.valueOf(Crypto.getRandomLong()).replace('-', '') +
                    '@example.invalid'
            );
            insert actor;
            insert new PermissionSetAssignment(AssigneeId = actor.Id, PermissionSetId = adminPermission.Id);
        }
    }

    public static User adminActor() {
        return [SELECT Id FROM User WHERE LastName = 'BEMGR Package Test Admin' LIMIT 1];
    }
}
