@IsTest
private class BankAssignmentValidatorTest {
    @TestSetup
    static void setupData() {
        Expense_Group__c household = new Expense_Group__c(Name = 'Household');
        Expense_Group__c travel = new Expense_Group__c(Name = 'Travel');
        insert new List<Expense_Group__c>{ household, travel };
        insert new List<Category__c>{
            new Category__c(Name = 'Bills', Expense_Group__c = household.Id),
            new Category__c(Name = 'Flights', Expense_Group__c = travel.Id)
        };

        Bank__c bpi = new Bank__c(Name = 'BPI', Active__c = true);
        Bank__c bdo = new Bank__c(Name = 'BDO', Active__c = true);
        insert new List<Bank__c>{ bpi, bdo };
        insert new List<Expense_Group_Bank__c>{
            new Expense_Group_Bank__c(
                Expense_Group__c = household.Id,
                Bank__c = bpi.Id,
                Active__c = true
            ),
            new Expense_Group_Bank__c(
                Expense_Group__c = household.Id,
                Bank__c = bdo.Id,
                Active__c = true
            ),
            new Expense_Group_Bank__c(
                Expense_Group__c = travel.Id,
                Bank__c = bpi.Id,
                Active__c = true
            )
        };
    }

    @IsTest
    static void testValidSelectionsPersistForExpenseAndRecurringTemplate() {
        Category__c category = categoryByName('Bills');
        Expense_Group_Bank__c assignment = assignmentByGroupAndBank('Household', 'BPI');
        Expense__c expense = expenseRecord('Electricity', category.Id, assignment.Id);
        Recurring_Expense__c recurringExpense = recurringRecord(
            'Internet',
            category.Id,
            assignment.Id
        );

        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            insert expense;
            insert recurringExpense;
        }
        Test.stopTest();

        System.assertNotEquals(null, expense.Id, 'A valid Expense selection should save.');
        System.assertNotEquals(
            null,
            recurringExpense.Id,
            'A valid Recurring selection should save.'
        );
    }

    @IsTest
    static void testMismatchedExpenseGroupRejectedForBothRecordTypes() {
        Category__c travelCategory = categoryByName('Flights');
        Expense_Group_Bank__c householdAssignment = assignmentByGroupAndBank('Household', 'BPI');

        Database.SaveResult expenseResult;
        Database.SaveResult recurringResult;
        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            expenseResult = Database.insert(
                expenseRecord('Hotel', travelCategory.Id, householdAssignment.Id),
                false
            );
            recurringResult = Database.insert(
                recurringRecord('Travel Plan', travelCategory.Id, householdAssignment.Id),
                false
            );
        }
        Test.stopTest();

        System.assertEquals(false, expenseResult.isSuccess(), 'The Expense should be rejected.');
        System.assertEquals(
            false,
            recurringResult.isSuccess(),
            'The Recurring Expense should be rejected.'
        );
        assertGroupMismatch(expenseResult);
        assertGroupMismatch(recurringResult);
    }

    @IsTest
    static void testNewInactiveAssignmentSelectionRejected() {
        Category__c category = categoryByName('Bills');
        Expense_Group_Bank__c assignment = assignmentByGroupAndBank('Household', 'BPI');
        assignment.Active__c = false;
        update assignment;

        Database.SaveResult expenseResult;
        Database.SaveResult recurringResult;
        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            expenseResult = Database.insert(
                expenseRecord('Electricity', category.Id, assignment.Id),
                false
            );
            recurringResult = Database.insert(
                recurringRecord('Internet', category.Id, assignment.Id),
                false
            );
        }
        Test.stopTest();

        System.assertEquals(false, expenseResult.isSuccess(), 'The Expense should be rejected.');
        System.assertEquals(
            false,
            recurringResult.isSuccess(),
            'The Recurring Expense should be rejected.'
        );
        assertInactiveSelection(expenseResult);
        assertInactiveSelection(recurringResult);
    }

    @IsTest
    static void testHistoricalInactiveExpenseRemainsEditable() {
        Category__c category = categoryByName('Bills');
        Expense_Group_Bank__c assignment = assignmentByGroupAndBank('Household', 'BPI');
        Expense__c expense = expenseRecord('Electricity', category.Id, assignment.Id);
        insert expense;
        assignment.Active__c = false;
        update assignment;

        expense.Name = 'Electricity corrected';
        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            update expense;
        }
        Test.stopTest();

        System.assertEquals(
            'Electricity corrected',
            [SELECT Name FROM Expense__c WHERE Id = :expense.Id].Name,
            'Unrelated historical edits should not revalidate inactive assignments.'
        );
    }

    @IsTest
    static void testInactiveRecurringTemplateCanBeEditedButNotReactivated() {
        Category__c category = categoryByName('Bills');
        Expense_Group_Bank__c assignment = assignmentByGroupAndBank('Household', 'BPI');
        Recurring_Expense__c recurringExpense = recurringRecord(
            'Internet',
            category.Id,
            assignment.Id
        );
        recurringExpense.Active__c = false;
        insert recurringExpense;
        assignment.Active__c = false;
        update assignment;

        recurringExpense.Name = 'Internet corrected';
        update recurringExpense;
        recurringExpense.Active__c = true;

        Database.SaveResult reactivationResult;
        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            reactivationResult = Database.update(recurringExpense, false);
        }
        Test.stopTest();

        assertInactiveSelection(reactivationResult);
        System.assertEquals(
            'Internet corrected',
            [SELECT Name FROM Recurring_Expense__c WHERE Id = :recurringExpense.Id].Name,
            'An unrelated edit to an inactive template should persist.'
        );
    }

    @IsTest
    static void testActiveAssignmentCanChangeWithinSameExpenseGroup() {
        Category__c category = categoryByName('Bills');
        Expense_Group_Bank__c bpiAssignment = assignmentByGroupAndBank('Household', 'BPI');
        Expense_Group_Bank__c bdoAssignment = assignmentByGroupAndBank('Household', 'BDO');
        Expense__c expense = expenseRecord('Electricity', category.Id, bpiAssignment.Id);
        insert expense;

        expense.Bank_Assignment__c = bdoAssignment.Id;
        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            update expense;
        }
        Test.stopTest();

        System.assertEquals(
            bdoAssignment.Id,
            [SELECT Bank_Assignment__c FROM Expense__c WHERE Id = :expense.Id].Bank_Assignment__c,
            'A user may switch to another active assignment in the same group.'
        );
    }

    @IsTest
    static void testLegacyOnlyBankRemainsCompatible() {
        Category__c category = categoryByName('Bills');
        Expense__c expense = new Expense__c(
            Name = 'Legacy Expense',
            Amount__c = 100,
            Bank__c = 'BPI',
            Transaction_Type__c = 'Debit Card',
            Category__c = category.Id,
            Expense_Date__c = Date.today()
        );

        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            insert expense;
        }
        Test.stopTest();

        System.assertEquals(
            'BPI',
            [SELECT Bank__c FROM Expense__c WHERE Id = :expense.Id].Bank__c,
            'Legacy-only writes should remain valid during migration.'
        );
    }

    @IsTest
    static void testBulkValidationSupportsMultipleExpenseGroups() {
        Category__c householdCategory = categoryByName('Bills');
        Category__c travelCategory = categoryByName('Flights');
        Expense_Group_Bank__c householdAssignment = assignmentByGroupAndBank('Household', 'BPI');
        Expense_Group_Bank__c travelAssignment = assignmentByGroupAndBank('Travel', 'BPI');
        List<Expense__c> expenses = new List<Expense__c>{
            expenseRecord('Power', householdCategory.Id, householdAssignment.Id),
            expenseRecord('Airfare', travelCategory.Id, travelAssignment.Id)
        };

        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            insert expenses;
        }
        Test.stopTest();

        System.assertEquals(2, expenses.size(), 'Both bulk records should remain in the request.');
        System.assertNotEquals(null, expenses[0].Id, 'The household Expense should save.');
        System.assertNotEquals(null, expenses[1].Id, 'The travel Expense should save.');
    }

    @IsTest
    static void testMethodsAreScopedToAssignmentAndBulkRowsAreIndependent() {
        Expense_Group_Bank__c household = assignmentByGroupAndBank('Household', 'BPI');
        Expense_Group_Bank__c travel = assignmentByGroupAndBank('Travel', 'BPI');
        household.Supported_Credit_Card__c = false;
        update household;
        Expense__c blocked = expenseRecord('Blocked card', categoryByName('Bills').Id, household.Id);
        blocked.Transaction_Type__c = 'Credit Card';
        Expense__c permitted = expenseRecord('Travel card', categoryByName('Flights').Id, travel.Id);
        permitted.Transaction_Type__c = 'Credit Card';
        Expense__c cash = expenseRecord('Cash', categoryByName('Bills').Id, household.Id);
        cash.Transaction_Type__c = 'Cash';
        Test.startTest();
        Database.SaveResult[] results = Database.insert(new List<Expense__c>{ blocked, permitted, cash }, false);
        Test.stopTest();
        assertUnsupported(results[0]);
        System.assertEquals(true, results[1].isSuccess(), 'The same global Bank may support Credit Card in another group.');
        System.assertEquals(false, results[2].isSuccess(), 'Cash requires No bank.');
    }

    @IsTest
    static void testHistoricalDisabledMethodEditsAndSelectionChanges() {
        Category__c category = categoryByName('Bills');
        Expense_Group_Bank__c bankAssignment = assignmentByGroupAndBank('Household', 'BPI');
        Expense__c expense = expenseRecord('Card expense', category.Id, bankAssignment.Id);
        expense.Transaction_Type__c = 'Credit Card';
        Recurring_Expense__c template = recurringRecord('Card template', category.Id, bankAssignment.Id);
        template.Transaction_Type__c = 'Credit Card';
        template.Active__c = false;
        insert expense;
        insert template;
        bankAssignment.Supported_Credit_Card__c = false;
        bankAssignment.Supported_Debit_Card__c = false;
        update bankAssignment;
        expense.Name = 'Corrected card expense';
        template.Name = 'Corrected card template';
        template.Next_Run_Date__c = Date.today().addDays(1);
        update expense;
        update template;
        Expense_Group_Bank__c otherAssignment = assignmentByGroupAndBank('Household', 'BDO');
        otherAssignment.Supported_Credit_Card__c = false;
        update otherAssignment;
        expense.Bank_Assignment__c = otherAssignment.Id;
        template.Active__c = true;
        Test.startTest();
        Database.SaveResult changedBank = Database.update(expense, false);
        Database.SaveResult reactivated = Database.update(template, false);
        expense.Bank_Assignment__c = bankAssignment.Id;
        expense.Transaction_Type__c = 'Debit Card';
        Database.SaveResult changedType = Database.update(expense, false);
        expense.Transaction_Type__c = 'Credit Card';
        Category__c otherCategory = new Category__c(Name = 'Other Bills', Expense_Group__c = groupId('Household'));
        insert otherCategory;
        expense.Category__c = otherCategory.Id;
        Database.SaveResult changedCategory = Database.update(expense, false);
        Test.stopTest();
        assertUnsupported(changedBank);
        assertUnsupported(reactivated);
        assertUnsupported(changedType);
        assertUnsupported(changedCategory);
        System.assertEquals('Corrected card expense', [SELECT Name FROM Expense__c WHERE Id = :expense.Id].Name, 'Historical edits must persist.');
        System.assertEquals(false, [SELECT Active__c FROM Recurring_Expense__c WHERE Id = :template.Id].Active__c, 'Failed reactivation must stay inactive.');
    }

    @IsTest
    static void testNoAssignmentRequiresCashOrLegacyBankAndRemovalIsValidated() {
        Id categoryId = categoryByName('Bills').Id;
        Expense__c noncash = expenseRecord('No bank card', categoryId, null);
        noncash.Transaction_Type__c = 'Credit Card';
        Expense__c cash = expenseRecord('No bank cash', categoryId, null);
        cash.Transaction_Type__c = 'Cash';
        Expense__c legacy = expenseRecord('Legacy card', categoryId, null);
        legacy.Transaction_Type__c = 'Credit Card';
        legacy.Bank__c = 'BPI';
        Recurring_Expense__c template = recurringRecord('No bank template', categoryId, null);
        template.Transaction_Type__c = 'Bank Transfer';
        Expense__c assigned = expenseRecord('Assigned card', categoryId, assignmentByGroupAndBank('Household', 'BPI').Id);
        assigned.Transaction_Type__c = 'Credit Card';
        Recurring_Expense__c assignedTemplate = recurringRecord('Assigned template', categoryId, assigned.Bank_Assignment__c);
        assignedTemplate.Transaction_Type__c = 'Debit Card';
        insert assigned;
        insert assignedTemplate;
        assigned.Bank_Assignment__c = null;
        assignedTemplate.Bank_Assignment__c = null;
        Test.startTest();
        Database.SaveResult[] results = Database.insert(new List<Expense__c>{ noncash, cash, legacy }, false);
        Database.SaveResult recurringResult = Database.insert(template, false);
        Database.SaveResult removal = Database.update(assigned, false);
        Database.SaveResult templateRemoval = Database.update(assignedTemplate, false);
        Test.stopTest();
        System.assertEquals(false, results[0].isSuccess(), 'Noncash requires a Bank.');
        System.assertEquals(true, results[1].isSuccess(), 'Cash does not require a Bank.');
        System.assertEquals(true, results[2].isSuccess(), 'Legacy Bank remains a compatible fallback.');
        System.assertEquals(false, recurringResult.isSuccess(), 'Noncash recurring templates require a Bank.');
        System.assertEquals(false, removal.isSuccess(), 'Removing an assignment must revalidate the noncash method.');
        System.assertEquals(false, templateRemoval.isSuccess(), 'Removing a template assignment must revalidate its noncash method.');
        legacy.Bank__c = null;
        Database.SaveResult legacyRemoval = Database.update(legacy, false);
        System.assertEquals(false, legacyRemoval.isSuccess(), 'Removing the legacy fallback must also be validated.');
        assigned.Transaction_Type__c = 'Cash';
        update assigned;
    }

    @IsTest
    static void testHistoricalNoBankNoncashUnrelatedEditsRemainValid() {
        Expense__c prior = expenseRecord('Historical', categoryByName('Bills').Id, null);
        insert prior;
        prior.Transaction_Type__c = 'Credit Card';
        // Handler-level old/new snapshots model data that predates the new invariant.
        Expense__c edited = prior.clone(true, false, false, false);
        edited.Name = 'Historical corrected';
        Recurring_Expense__c oldTemplate = recurringRecord('Historical template', prior.Category__c, null);
        insert oldTemplate;
        oldTemplate.Transaction_Type__c = 'Bank Transfer';
        Recurring_Expense__c editedTemplate = oldTemplate.clone(true, false, false, false);
        editedTemplate.Next_Run_Date__c = Date.today().addDays(1);
        Test.startTest();
        BankAssignmentValidator.validateExpenses(new List<Expense__c>{ edited }, new Map<Id, Expense__c>{ prior.Id => prior });
        BankAssignmentValidator.validateRecurringExpenses(new List<Recurring_Expense__c>{ editedTemplate }, new Map<Id, Recurring_Expense__c>{ oldTemplate.Id => oldTemplate });
        Test.stopTest();
        System.assertEquals(false, edited.hasErrors(), 'Historical no-bank noncash unrelated edits should remain valid.');
        System.assertEquals(false, editedTemplate.hasErrors(), 'Generator pointer updates should preserve historical templates.');
    }

    @IsTest
    static void testEachDisabledMethodRejectsNewTemplate() {
        Expense_Group_Bank__c bankAssignment = assignmentByGroupAndBank('Household', 'BPI');
        bankAssignment.Supported_Credit_Card__c = false;
        bankAssignment.Supported_Debit_Card__c = false;
        bankAssignment.Supported_Bank_Payment__c = false;
        bankAssignment.Supported_Bank_Transfer__c = false;
        update bankAssignment;
        List<Recurring_Expense__c> templates = new List<Recurring_Expense__c>();
        Id categoryId = categoryByName('Bills').Id;
        for (String method : new List<String>{ 'Credit Card', 'Debit Card', 'Bank Payment', 'Bank Transfer', 'Cash' }) {
            Recurring_Expense__c template = recurringRecord(method, categoryId, bankAssignment.Id);
            template.Transaction_Type__c = method;
            templates.add(template);
        }
        Test.startTest();
        Database.SaveResult[] results = Database.insert(templates, false);
        Test.stopTest();
        for (Integer index = 0; index < 4; index++) {
            assertUnsupported(results[index]);
        }
        System.assertEquals(false, results[4].isSuccess(), 'Cash cannot supply a selection when a Bank has no enabled methods.');
    }

    @IsTest
    static void testHistoricalGenerationMatcherRequiresExactActiveSourceAndNewExpense() {
        Id categoryId = categoryByName('Bills').Id;
        Recurring_Expense__c source = recurringRecord('Historical source', categoryId, null);
        insert source;
        // Only the pure matcher receives this historical snapshot; persisted state remains valid.
        source.Transaction_Type__c = 'Credit Card';
        Expense__c generated = expenseRecord('Generated historical card', categoryId, null);
        generated.Transaction_Type__c = 'Credit Card';
        generated.Recurring_Expense__c = source.Id;
        System.assertEquals(true, BankAssignmentValidator.matchesHistoricalGenerationSource(generated, source), 'An exact active historical source should be compatible.');
        System.assertEquals(false, BankAssignmentValidator.matchesHistoricalGenerationSource(generated, null), 'A missing source must not bypass validation.');
        Recurring_Expense__c changed = source.clone(true, false, false, false);
        changed.Active__c = false;
        System.assertEquals(false, BankAssignmentValidator.matchesHistoricalGenerationSource(generated, changed), 'Inactive sources cannot supply compatibility.');
        changed.Active__c = true;
        changed.Category__c = categoryByName('Flights').Id;
        System.assertEquals(false, BankAssignmentValidator.matchesHistoricalGenerationSource(generated, changed), 'The category must match.');
        changed.Category__c = categoryId;
        changed.Transaction_Type__c = 'Debit Card';
        System.assertEquals(false, BankAssignmentValidator.matchesHistoricalGenerationSource(generated, changed), 'The payment method must match.');
        changed.Transaction_Type__c = source.Transaction_Type__c;
        changed.Bank__c = 'BPI';
        System.assertEquals(false, BankAssignmentValidator.matchesHistoricalGenerationSource(generated, changed), 'Legacy Bank sources cannot authorize a no-bank expense.');
        changed.Bank__c = null;
        changed.Bank_Assignment__c = assignmentByGroupAndBank('Household', 'BPI').Id;
        System.assertEquals(false, BankAssignmentValidator.matchesHistoricalGenerationSource(generated, changed), 'Assigned sources cannot authorize a no-bank expense.');
        generated.Recurring_Expense__c = null;
        System.assertEquals(false, BankAssignmentValidator.matchesHistoricalGenerationSource(generated, source), 'The linked source ID must match.');
        generated.Recurring_Expense__c = source.Id;
        Expense__c existing = expenseRecord('Existing', categoryId, null);
        insert existing;
        generated.Id = existing.Id;
        System.assertEquals(false, BankAssignmentValidator.matchesHistoricalGenerationSource(generated, source), 'Compatibility is restricted to new generated expenses.');
    }

    @IsTest
    static void testPersistedSourceLinksCannotBypassNoBankOrUnsupportedMethodValidation() {
        Id categoryId = categoryByName('Bills').Id;
        Expense_Group_Bank__c bankAssignment = assignmentByGroupAndBank('Household', 'BPI');
        Recurring_Expense__c blankSource = recurringRecord('Blank source', categoryId, null);
        Recurring_Expense__c legacySource = recurringRecord('Legacy source', categoryId, null);
        legacySource.Transaction_Type__c = 'Credit Card';
        legacySource.Bank__c = 'BPI';
        Recurring_Expense__c assignedSource = recurringRecord('Assigned source', categoryId, bankAssignment.Id);
        assignedSource.Transaction_Type__c = 'Debit Card';
        Recurring_Expense__c deletedSource = recurringRecord('Deleted source', categoryId, null);
        insert new List<Recurring_Expense__c>{ blankSource, legacySource, assignedSource, deletedSource };
        delete deletedSource;
        bankAssignment.Supported_Credit_Card__c = false;
        update bankAssignment;
        List<Expense__c> expenses = new List<Expense__c>();
        for (Id sourceId : new List<Id>{ blankSource.Id, legacySource.Id, assignedSource.Id, deletedSource.Id }) {
            Expense__c expense = expenseRecord('Invalid source card', categoryId, null);
            expense.Transaction_Type__c = 'Credit Card';
            expense.Recurring_Expense__c = sourceId;
            expenses.add(expense);
        }
        Expense__c assigned = expenseRecord('Unsupported generated card', categoryId, bankAssignment.Id);
        assigned.Transaction_Type__c = 'Credit Card';
        assigned.Recurring_Expense__c = assignedSource.Id;
        Test.startTest();
        Database.SaveResult[] results = Database.insert(expenses, false);
        Database.SaveResult assignedResult = Database.insert(assigned, false);
        Test.stopTest();
        for (Integer index = 0; index < 3; index++) {
            System.assertEquals(false, results[index].isSuccess(), 'A persisted mismatched source must not bypass the no-bank rule.');
            System.assert(results[index].getErrors()[0].getMessage().contains('Select a Bank assignment'), 'The error should require a Bank selection.');
        }
        System.assertEquals(false, results[3].isSuccess(), 'A deleted source cannot authorize a generated expense.');
        assertUnsupported(assignedResult);
    }

    @IsTest
    static void testCashRequiresNoBankAndSelectedBankRequiresConfiguredMethod() {
        Id categoryId = categoryByName('Bills').Id;
        Id assignmentId = assignmentByGroupAndBank('Household', 'BPI').Id;
        Expense__c bankCash = expenseRecord('Bank Cash', categoryId, assignmentId);
        bankCash.Transaction_Type__c = 'Cash';
        Expense__c bankBlank = expenseRecord('Bank blank', categoryId, assignmentId);
        bankBlank.Transaction_Type__c = null;
        Expense__c legacyCash = expenseRecord('Legacy Cash', categoryId, null);
        legacyCash.Bank__c = 'BPI';
        Expense__c noBankCash = expenseRecord('No bank Cash', categoryId, null);
        Recurring_Expense__c templateCash = recurringRecord('Bank Cash template', categoryId, assignmentId);
        templateCash.Transaction_Type__c = 'Cash';
        Recurring_Expense__c templateBlank = recurringRecord('Bank blank template', categoryId, assignmentId);
        templateBlank.Transaction_Type__c = null;
        Test.startTest();
        Database.SaveResult[] expenses = Database.insert(new List<Expense__c>{ bankCash, bankBlank, legacyCash, noBankCash }, false);
        Database.SaveResult[] templates = Database.insert(new List<Recurring_Expense__c>{ templateCash, templateBlank }, false);
        Test.stopTest();
        System.assertEquals(false, expenses[0].isSuccess(), 'Cash with an assignment must fail.');
        System.assertEquals(false, expenses[1].isSuccess(), 'Blank payment method with an assignment must fail.');
        System.assertEquals(false, expenses[2].isSuccess(), 'Cash with a legacy Bank must fail.');
        System.assertEquals(true, expenses[3].isSuccess(), 'Cash with No bank must remain valid.');
        System.assertEquals(false, templates[0].isSuccess(), 'New Cash templates with assignments must fail.');
        System.assertEquals(false, templates[1].isSuccess(), 'New blank templates with assignments must fail.');
    }

    @IsTest
    static void testHistoricalBankCashAndBlankPreservedOnlyForUnrelatedEditsAndExactGeneration() {
        Id categoryId = categoryByName('Bills').Id;
        Id assignmentId = assignmentByGroupAndBank('Household', 'BPI').Id;
        Expense__c persisted = expenseRecord('Existing card', categoryId, assignmentId);
        Id otherAssignmentId = assignmentByGroupAndBank('Household', 'BDO').Id;
        Recurring_Expense__c source = recurringRecord('Existing card source', categoryId, assignmentId);
        insert persisted;
        insert source;
        for (String historicMethod : new List<String>{ 'Cash', null }) {
            // Exact snapshots model records created before the Cash/No bank invariant.
            Expense__c oldExpense = persisted.clone(true, false, false, false);
            oldExpense.Transaction_Type__c = historicMethod;
            Expense__c edited = oldExpense.clone(true, false, false, false);
            edited.Name = 'Historical corrected';
            BankAssignmentValidator.validateExpenses(new List<Expense__c>{ edited }, new Map<Id, Expense__c>{ oldExpense.Id => oldExpense });
            System.assertEquals(false, edited.hasErrors(), 'Unrelated edits must preserve historical Cash/blank bank records.');
            Recurring_Expense__c historicalSource = source.clone(true, false, false, false);
            historicalSource.Transaction_Type__c = historicMethod;
            Recurring_Expense__c pointerUpdate = historicalSource.clone(true, false, false, false);
            pointerUpdate.Next_Run_Date__c = Date.today().addDays(1);
            BankAssignmentValidator.validateRecurringExpenses(new List<Recurring_Expense__c>{ pointerUpdate }, new Map<Id, Recurring_Expense__c>{ historicalSource.Id => historicalSource });
            System.assertEquals(false, pointerUpdate.hasErrors(), 'Generator pointer changes must preserve historical templates.');
            Expense__c generated = expenseRecord('Historical generated', categoryId, assignmentId);
            generated.Transaction_Type__c = historicMethod;
            generated.Recurring_Expense__c = source.Id;
            System.assertEquals(true, BankAssignmentValidator.matchesHistoricalGenerationSource(generated, historicalSource), 'Exact historical bank Cash/blank generation must remain compatible.');
            generated.Bank_Assignment__c = otherAssignmentId;
            System.assertEquals(false, BankAssignmentValidator.matchesHistoricalGenerationSource(generated, historicalSource), 'A different Bank must not receive the historical exemption.');
            Expense__c changed = oldExpense.clone(true, false, false, false);
            changed.Bank_Assignment__c = generated.Bank_Assignment__c;
            BankAssignmentValidator.validateExpenses(new List<Expense__c>{ changed }, new Map<Id, Expense__c>{ oldExpense.Id => oldExpense });
            System.assertEquals(true, changed.hasErrors(), 'Changing Bank must enforce the current Cash/blank rules.');
            historicalSource.Active__c = false;
            Recurring_Expense__c reactivated = historicalSource.clone(true, false, false, false);
            reactivated.Active__c = true;
            BankAssignmentValidator.validateRecurringExpenses(new List<Recurring_Expense__c>{ reactivated }, new Map<Id, Recurring_Expense__c>{ historicalSource.Id => historicalSource });
            System.assertEquals(true, reactivated.hasErrors(), 'Reactivation must enforce the current Cash/blank rules.');
        }
    }

    private static Id groupId(String name) {
        return [SELECT Id FROM Expense_Group__c WHERE Name = :name LIMIT 1].Id;
    }

    private static void assertUnsupported(Database.SaveResult result) {
        System.assertEquals(false, result.isSuccess(), 'An unsupported payment method should fail.');
        System.assert(result.getErrors()[0].getMessage().contains('does not support'), 'The error should explain the unsupported method.');
    }

    private static void assertGroupMismatch(Database.SaveResult result) {
        System.assertEquals(false, result.isSuccess(), 'A cross-group selection should fail.');
        System.assert(
            result.getErrors()[0].getMessage().contains('Category\'s Expense Group'),
            'The error should identify the group mismatch.'
        );
    }

    private static void assertInactiveSelection(Database.SaveResult result) {
        System.assertEquals(false, result.isSuccess(), 'An inactive new selection should fail.');
        System.assert(
            result.getErrors()[0].getMessage().contains('active Bank assignment'),
            'The error should require an active assignment.'
        );
    }

    private static Expense__c expenseRecord(String name, Id categoryId, Id assignmentId) {
        return new Expense__c(
            Name = name,
            Amount__c = 100,
            Bank_Assignment__c = assignmentId,
            Transaction_Type__c = assignmentId == null ? 'Cash' : 'Debit Card',
            Category__c = categoryId,
            Expense_Date__c = Date.today()
        );
    }

    private static Recurring_Expense__c recurringRecord(
        String name,
        Id categoryId,
        Id assignmentId
    ) {
        return new Recurring_Expense__c(
            Name = name,
            Active__c = true,
            Amount__c = 100,
            Bank_Assignment__c = assignmentId,
            Transaction_Type__c = assignmentId == null ? 'Cash' : 'Debit Card',
            Category__c = categoryId,
            Frequency__c = 'Monthly',
            Start_Date__c = Date.today()
        );
    }

    private static Category__c categoryByName(String name) {
        return [SELECT Id FROM Category__c WHERE Name = :name LIMIT 1];
    }

    private static Expense_Group_Bank__c assignmentByGroupAndBank(
        String expenseGroupName,
        String bankName
    ) {
        return [
            SELECT Id, Active__c
            FROM Expense_Group_Bank__c
            WHERE Expense_Group__r.Name = :expenseGroupName AND Bank__r.Name = :bankName
            LIMIT 1
        ];
    }
}
