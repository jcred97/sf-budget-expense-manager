@IsTest
private class AppAccessChecksTest {
    private static final List<String> ROLES = new List<String>{
        'Denied',
        'Allowed',
        'NoNotes',
        'NoNotesRead',
        'NoAmount',
        'NoActive',
        'NoExpenseDelete',
        'NoExpenseCreate',
        'NoExpenseAmount',
        'NoSourceNotes'
    };

    @TestSetup
    static void setupActorsAndData() {
        Profile minimumProfile = [SELECT Id FROM Profile WHERE Name = 'Minimum Access - Salesforce' LIMIT 1];
        // Existing orgs can have additive field grants even on Minimum Access.
        // Normalize this one automation-owned field only in the rolled-back test transaction.
        String pointerField =
            Recurring_Expense__c.SObjectType.getDescribe().getName() +
            '.' +
            Recurring_Expense__c.Next_Run_Date__c.getDescribe().getName();
        List<FieldPermissions> inheritedPointerGrants = [
            SELECT Id, PermissionsEdit
            FROM FieldPermissions
            WHERE Parent.ProfileId = :minimumProfile.Id AND Field = :pointerField AND PermissionsEdit = TRUE
        ];
        for (FieldPermissions inheritedGrant : inheritedPointerGrants) {
            inheritedGrant.PermissionsEdit = false;
        }
        update inheritedPointerGrants;
        PermissionSet source = [
            SELECT Id
            FROM PermissionSet
            WHERE Name = 'Budget_Expense_Manager_User' AND (NamespacePrefix = NULL OR NamespacePrefix = 'bemgr')
            ORDER BY NamespacePrefix DESC NULLS LAST
            LIMIT 1
        ];
        List<ObjectPermissions> objectGrants = [
            SELECT
                SObjectType,
                PermissionsRead,
                PermissionsCreate,
                PermissionsEdit,
                PermissionsDelete,
                PermissionsViewAllRecords,
                PermissionsModifyAllRecords
            FROM ObjectPermissions
            WHERE ParentId = :source.Id
        ];
        List<FieldPermissions> fieldGrants = [
            SELECT SObjectType, Field, PermissionsRead, PermissionsEdit
            FROM FieldPermissions
            WHERE ParentId = :source.Id
        ];
        for (String role : ROLES) {
            User actor = new User(
                Alias = 'accchk',
                Email = role + '@example.invalid',
                EmailEncodingKey = 'UTF-8',
                LastName = 'AccessChecks' + role,
                LanguageLocaleKey = 'en_US',
                LocaleSidKey = 'en_US',
                TimeZoneSidKey = 'Asia/Manila',
                ProfileId = minimumProfile.Id,
                Username = role + '.' + UserInfo.getOrganizationId() + '.' + System.now().getTime() + '@example.invalid'
            );
            insert actor;
            if (role == 'Denied') {
                continue;
            }
            PermissionSet grants = new PermissionSet(Name = 'AccessChecks' + role, Label = 'Access checks ' + role);
            insert grants;
            List<ObjectPermissions> objects = new List<ObjectPermissions>();
            for (ObjectPermissions original : objectGrants) {
                ObjectPermissions permission = original.clone(false, false, false, false);
                permission.ParentId = grants.Id;
                if (role == 'NoExpenseCreate' && permission.SObjectType == Expense__c.SObjectType.getDescribe().getName()) {
                    permission.PermissionsCreate = false;
                }
                if (role == 'NoExpenseDelete' && permission.SObjectType == Expense__c.SObjectType.getDescribe().getName()) {
                    permission.PermissionsDelete = false;
                    permission.PermissionsModifyAllRecords = false;
                }
                // Amount is schema-required and cannot have separate FLS; exercise denied Budget edit CRUD.
                if (role == 'NoAmount' && permission.SObjectType == Budget__c.SObjectType.getDescribe().getName()) {
                    permission.PermissionsCreate = false;
                    permission.PermissionsEdit = false;
                    permission.PermissionsDelete = false;
                }
                objects.add(permission);
            }
            insert objects;
            List<FieldPermissions> fields = new List<FieldPermissions>();
            for (FieldPermissions original : fieldGrants) {
                FieldPermissions permission = original.clone(false, false, false, false);
                permission.ParentId = grants.Id;
                if (
                    (role == 'NoNotes' && isField(permission, Budget__c.SObjectType, Budget__c.Description__c)) ||
                    (role == 'NoAmount' && isField(permission, Budget__c.SObjectType, Budget__c.Amount__c)) ||
                    (role == 'NoActive' && isField(permission, Recurring_Expense__c.SObjectType, Recurring_Expense__c.Active__c)) ||
                    (role == 'NoExpenseAmount' && isField(permission, Expense__c.SObjectType, Expense__c.Amount__c))
                ) {
                    permission.PermissionsEdit = false;
                }
                if (role == 'NoSourceNotes' && isField(permission, Recurring_Expense__c.SObjectType, Recurring_Expense__c.Description__c)) {
                    continue;
                }
                if (role == 'NoNotesRead' && isField(permission, Budget__c.SObjectType, Budget__c.Description__c)) {
                    continue;
                }
                fields.add(permission);
            }
            insert fields;
            if (role == 'NoExpenseCreate' || role == 'NoExpenseAmount' || role == 'NoSourceNotes') {
                grantAutomationReadAccess(grants.Id);
            }
            insert new PermissionSetAssignment(AssigneeId = actor.Id, PermissionSetId = grants.Id);
        }
        System.runAs(new User(Id = UserInfo.getUserId())) {
            insert new Budget_Expense_Manager_Setting__c(
                Name = 'Default',
                Base_Currency_Code__c = 'PHP',
                Recurring_Expenses_Enabled__c = true
            );
            Expense_Group__c groupRecord = new Expense_Group__c(Name = 'Access checks');
            insert groupRecord;
            Category__c category = new Category__c(Name = 'Access checks', Expense_Group__c = groupRecord.Id);
            insert category;
            insert new Budget__c(
                Expense_Group__c = groupRecord.Id,
                Budget_Month__c = Date.today().toStartOfMonth(),
                Amount__c = 100,
                Description__c = 'Keep notes'
            );
            insert new Recurring_Expense__c(
                Name = 'Access checks',
                Category__c = category.Id,
                Amount__c = 10,
                Active__c = true,
                Frequency__c = 'Daily',
                Start_Date__c = Date.today(),
                Transaction_Type__c = 'Cash'
            );
        }
    }

    private static Boolean isField(FieldPermissions permission, Schema.SObjectType objectType, Schema.SObjectField field) {
        return permission.SObjectType == objectType.getDescribe().getName() &&
            permission.Field == objectType.getDescribe().getName() + '.' + field.getDescribe().getName();
    }

    private static void grantAutomationReadAccess(Id permissionSetId) {
        String settingsObject = Budget_Expense_Manager_Setting__c.SObjectType.getDescribe().getName();
        insert new ObjectPermissions(
            ParentId = permissionSetId,
            SObjectType = settingsObject,
            PermissionsRead = true,
            PermissionsViewAllRecords = true
        );
        List<FieldPermissions> fields = new List<FieldPermissions>();
        for (
            Schema.SObjectField field : new List<Schema.SObjectField>{
                Budget_Expense_Manager_Setting__c.Recurring_Expenses_Enabled__c,
                Budget_Expense_Manager_Setting__c.Global_Recurring_Run_Time__c,
                Budget_Expense_Manager_Setting__c.Last_Recurring_Run_DateTime__c,
                Budget_Expense_Manager_Setting__c.Last_Recurring_Run_Status__c,
                Budget_Expense_Manager_Setting__c.Last_Recurring_Run_Message__c
            }
        ) {
            fields.add(
                new FieldPermissions(
                    ParentId = permissionSetId,
                    SObjectType = settingsObject,
                    Field = settingsObject + '.' + field.getDescribe().getName(),
                    PermissionsRead = true
                )
            );
        }
        insert fields;
        CustomPermission automation = [
            SELECT Id
            FROM CustomPermission
            WHERE DeveloperName = 'Manage_Recurring_Expense_Automation' AND (NamespacePrefix = NULL OR NamespacePrefix = 'bemgr')
            ORDER BY NamespacePrefix DESC NULLS LAST
            LIMIT 1
        ];
        ApexClass controller = [
            SELECT Id
            FROM ApexClass
            WHERE Name = 'RecurringExpenseAutomationController' AND (NamespacePrefix = NULL OR NamespacePrefix = 'bemgr')
            ORDER BY NamespacePrefix DESC NULLS LAST
            LIMIT 1
        ];
        insert new List<SetupEntityAccess>{
            new SetupEntityAccess(ParentId = permissionSetId, SetupEntityId = automation.Id),
            new SetupEntityAccess(ParentId = permissionSetId, SetupEntityId = controller.Id)
        };
    }

    private static User actor(String role) {
        String name = 'AccessChecks' + role;
        return [SELECT Id FROM User WHERE LastName = :name LIMIT 1];
    }

    @IsTest
    static void objectAndFieldChecksDenyMissingAccess() {
        System.runAs(actor('Denied')) {
            for (String operation : new List<String>{ 'create', 'read', 'edit', 'delete', 'readField', 'createField', 'editField' }) {
                Boolean denied = false;
                try {
                    invokeCheck(operation);
                } catch (AuraHandledException expected) {
                    denied = true;
                    System.assert(expected.getMessage().contains('permission'), 'Explain the permission failure.');
                }
                System.assert(denied, 'The minimum profile must fail ' + operation + '.');
            }
        }
        System.runAs(actor('Allowed')) {
            for (String operation : new List<String>{ 'create', 'read', 'edit', 'delete', 'readField', 'createField', 'editField' }) {
                invokeCheck(operation);
            }
        }
    }

    private static void invokeCheck(String operation) {
        if (operation == 'create') {
            AppAccessChecks.requireCreate(Budget__c.SObjectType);
        } else if (operation == 'read') {
            AppAccessChecks.requireRead(Budget__c.SObjectType);
        } else if (operation == 'edit') {
            AppAccessChecks.requireUpdate(Budget__c.SObjectType);
        } else if (operation == 'delete') {
            AppAccessChecks.requireDelete(Budget__c.SObjectType);
        } else if (operation == 'readField') {
            AppAccessChecks.requireReadable(new List<Schema.SObjectField>{ Budget__c.Description__c });
        } else if (operation == 'createField') {
            AppAccessChecks.requireCreateable(new List<Schema.SObjectField>{ Budget__c.Description__c });
        } else {
            AppAccessChecks.requireUpdateable(new List<Schema.SObjectField>{ Budget__c.Description__c });
        }
    }

    @IsTest
    static void budgetRejectsDeniedAmountAndExplicitNoteClear() {
        Budget__c budget = [SELECT Id, Expense_Group__c, Budget_Month__c FROM Budget__c LIMIT 1];
        BudgetSaveRequest request = budgetRequest(budget);
        System.runAs(actor('NoAmount')) {
            expectBudgetDenied(request);
        }
        request.description = null;
        request.descriptionProvided = true;
        System.runAs(actor('NoNotes')) {
            expectBudgetDenied(request);
            request.descriptionProvided = false;
            BudgetDto saved = BudgetService.saveMonthlyBudget(request);
            System.assertEquals(200, saved.amount, 'Amount-only updates work when notes are read-only.');
            System.assertEquals('Keep notes', saved.description, 'Omitted notes remain unchanged.');
        }
        System.assertEquals('Keep notes', [SELECT Description__c FROM Budget__c WHERE Id = :budget.Id].Description__c);
        System.runAs(actor('Allowed')) {
            request.descriptionProvided = true;
            System.assertEquals(null, BudgetService.saveMonthlyBudget(request).description, 'Editable notes can be explicitly cleared.');
        }
    }

    @IsTest
    static void deniedBudgetCreateAndDeleteDoNotMutate() {
        Budget__c budget = [SELECT Id, Expense_Group__c, Budget_Month__c FROM Budget__c LIMIT 1];
        System.runAs(actor('Denied')) {
            BudgetSaveRequest createRequest = budgetRequest(budget);
            createRequest.budgetId = null;
            expectBudgetDenied(createRequest);
            Boolean denied = false;
            try {
                BudgetService.deleteMonthlyBudget(budget.Id);
            } catch (AuraHandledException expected) {
                denied = true;
            }
            System.assert(denied, 'Delete requires object access.');
        }
        System.assertEquals(1, [SELECT COUNT() FROM Budget__c]);
    }

    @IsTest
    static void budgetNotesReadAccessIsOptional() {
        Budget__c budget = [SELECT Id, Expense_Group__c, Budget_Month__c FROM Budget__c LIMIT 1];
        System.runAs(actor('NoNotesRead')) {
            System.assertEquals(false, Budget__c.Description__c.getDescribe().isAccessible());
            BudgetDto monthly = BudgetService.getMonthlyBudget(budget.Expense_Group__c, budget.Budget_Month__c);
            System.assertEquals(null, monthly.description, 'Unreadable notes are not queried or exposed.');
            System.assertEquals(100, monthly.amount, 'Optional notes do not block the budget.');
            System.assertEquals(1, BudgetService.getBudgetHistory(budget.Expense_Group__c, budget.Budget_Month__c).size());
            BudgetSaveRequest request = budgetRequest(budget);
            request.descriptionProvided = false;
            System.assertEquals(200, BudgetService.saveMonthlyBudget(request).amount);
        }
        System.assertEquals('Keep notes', [SELECT Description__c FROM Budget__c WHERE Id = :budget.Id].Description__c);
    }

    private static BudgetSaveRequest budgetRequest(Budget__c budget) {
        BudgetSaveRequest request = new BudgetSaveRequest();
        request.budgetId = budget.Id;
        request.expenseGroupId = budget.Expense_Group__c;
        request.budgetMonth = budget.Budget_Month__c;
        request.amount = 200;
        return request;
    }

    private static void expectBudgetDenied(BudgetSaveRequest request) {
        Boolean denied = false;
        try {
            BudgetService.saveMonthlyBudget(request);
        } catch (AuraHandledException expected) {
            denied = true;
            System.assert(expected.getMessage().contains('permission'));
        }
        System.assert(denied, 'Denied fields cannot be silently stripped from a successful save.');
    }

    @IsTest
    static void expenseDeletionRequiresDeleteAccessForSingleAndBulkCommands() {
        Category__c category = [SELECT Id FROM Category__c LIMIT 1];
        List<Expense__c> expenses = new List<Expense__c>{
            new Expense__c(
                Name = 'Keep single expense',
                Category__c = category.Id,
                Amount__c = 10,
                Expense_Date__c = Date.today(),
                Transaction_Type__c = 'Cash'
            ),
            new Expense__c(
                Name = 'Keep bulk expense',
                Category__c = category.Id,
                Amount__c = 20,
                Expense_Date__c = Date.today(),
                Transaction_Type__c = 'Cash'
            )
        };
        insert expenses;
        Set<Id> expenseIds = new Map<Id, Expense__c>(expenses).keySet();
        System.runAs(actor('NoExpenseDelete')) {
            System.assertEquals(false, Expense__c.SObjectType.getDescribe().isDeletable(), 'The actor must lack delete CRUD.');
            System.assertEquals(
                2,
                [SELECT COUNT() FROM Expense__c WHERE Id IN :expenseIds WITH USER_MODE],
                'Both records must be readable so permission denial is not a missing-record failure.'
            );
            Test.startTest();
            for (Boolean bulkDelete : new List<Boolean>{ false, true }) {
                Boolean denied = false;
                try {
                    if (bulkDelete) {
                        ExpenseController.deleteExpenses(new List<Id>(expenseIds));
                    } else {
                        ExpenseController.deleteExpense(expenses[0].Id);
                    }
                } catch (AuraHandledException expected) {
                    denied = true;
                    System.assert(expected.getMessage().contains('permission'), 'Explain the denied delete permission.');
                }
                System.assert(denied, 'Single and bulk deletes must reject missing delete access.');
            }
            Test.stopTest();
        }
        System.assertEquals(
            2,
            [SELECT COUNT() FROM Expense__c WHERE Id IN :expenseIds],
            'Denied deletes must preserve every requested record.'
        );
    }

    @IsTest
    static void deactivateRejectsReadOnlyActiveField() {
        Recurring_Expense__c template = [SELECT Id FROM Recurring_Expense__c LIMIT 1];
        System.runAs(actor('NoActive')) {
            Boolean denied = false;
            try {
                ExpenseCommandService.deactivateRecurringExpense(template.Id);
            } catch (AuraHandledException expected) {
                denied = true;
            }
            System.assert(denied, 'Read-only Active cannot report successful deactivation.');
        }
        System.assertEquals(true, [SELECT Active__c FROM Recurring_Expense__c WHERE Id = :template.Id].Active__c);
    }

    @IsTest
    static void generationChecksSourceAndDestinationBeforePrivilegedWrites() {
        Recurring_Expense__c template = [SELECT Id FROM Recurring_Expense__c LIMIT 1];
        for (String role : new List<String>{ 'Denied', 'NoExpenseCreate', 'NoExpenseAmount', 'NoSourceNotes' }) {
            System.runAs(actor(role)) {
                Boolean denied = false;
                try {
                    RecurringExpenseService.generateDueExpenses(new List<Recurring_Expense__c>{ template }, Date.today());
                } catch (AuraHandledException expected) {
                    denied = true;
                }
                System.assert(denied, 'Generation must respect source/destination permissions for ' + role + '.');
                denied = false;
                try {
                    new RecurringExpenseBatch().start(null);
                } catch (AuraHandledException expected) {
                    denied = true;
                }
                System.assert(denied, 'Scheduled batch start must apply the same checks for ' + role + '.');
            }
        }
        System.assertEquals(0, [SELECT COUNT() FROM Expense__c]);
        System.assertEquals(Date.today(), [SELECT Next_Run_Date__c FROM Recurring_Expense__c WHERE Id = :template.Id].Next_Run_Date__c);
    }

    @IsTest
    static void generationAllowsOnlyManagedFieldExceptions() {
        Recurring_Expense__c template = [SELECT Id FROM Recurring_Expense__c LIMIT 1];
        System.runAs(actor('Allowed')) {
            System.assertEquals(false, Expense__c.Recurring_Expense__c.getDescribe().isCreateable(), 'The generated link stays read-only.');
            System.assertEquals(false, Recurring_Expense__c.Next_Run_Date__c.getDescribe().isUpdateable(), 'The pointer stays read-only.');
            RecurringExpenseGenerationResult result = RecurringExpenseService.generateDueExpenses(
                new List<Recurring_Expense__c>{ template },
                Date.today()
            );
            System.assertEquals(1, result.expensesCreated);
        }
        System.assertEquals(template.Id, [SELECT Recurring_Expense__c FROM Expense__c LIMIT 1].Recurring_Expense__c);
        System.assertEquals(
            Date.today().addDays(1),
            [SELECT Next_Run_Date__c FROM Recurring_Expense__c WHERE Id = :template.Id].Next_Run_Date__c
        );
    }

    @IsTest
    static void manualPreflightRejectsMissingGenerationAccessWithoutQueuing() {
        Budget_Expense_Manager_Setting__c beforeSettings = [
            SELECT Last_Recurring_Run_Status__c, Last_Recurring_Run_Message__c, Last_Recurring_Run_DateTime__c
            FROM Budget_Expense_Manager_Setting__c
            LIMIT 1
        ];
        Integer originalJobCount = [SELECT COUNT() FROM AsyncApexJob WHERE ApexClass.Name = 'RecurringExpenseBatch'];
        for (String role : new List<String>{ 'NoExpenseCreate', 'NoExpenseAmount', 'NoSourceNotes' }) {
            System.runAs(actor(role)) {
                System.assertEquals(true, FeatureManagement.checkPermission('Manage_Recurring_Expense_Automation'));
                System.assertEquals(
                    true,
                    BudgetExpenseSettingsService.areRecurringExpensesEnabled(),
                    'Test the generation preflight after valid configuration access.'
                );
                Boolean denied = false;
                try {
                    RecurringExpenseAutomationController.runDueExpensesBatch();
                } catch (AuraHandledException expected) {
                    denied = true;
                    System.assert(expected.getMessage().contains('permission'));
                }
                System.assert(denied, 'Manual generation cannot enqueue denied CRUD/FLS for ' + role + '.');
            }
        }
        System.assertEquals(originalJobCount, [SELECT COUNT() FROM AsyncApexJob WHERE ApexClass.Name = 'RecurringExpenseBatch']);
        Budget_Expense_Manager_Setting__c afterSettings = [
            SELECT Last_Recurring_Run_Status__c, Last_Recurring_Run_Message__c, Last_Recurring_Run_DateTime__c
            FROM Budget_Expense_Manager_Setting__c
            LIMIT 1
        ];
        System.assertEquals(beforeSettings.Last_Recurring_Run_Status__c, afterSettings.Last_Recurring_Run_Status__c);
        System.assertEquals(beforeSettings.Last_Recurring_Run_Message__c, afterSettings.Last_Recurring_Run_Message__c);
        System.assertEquals(beforeSettings.Last_Recurring_Run_DateTime__c, afterSettings.Last_Recurring_Run_DateTime__c);
    }
}
