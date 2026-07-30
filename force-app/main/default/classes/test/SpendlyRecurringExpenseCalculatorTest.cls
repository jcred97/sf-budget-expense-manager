@IsTest
private class SpendlyRecurringExpenseCalculatorTest {
    @IsTest
    static void testGetNextRunDateUsesSimpleIntervals() {
        Date dueDate = Date.newInstance(2026, 5, 17);

        System.assertEquals(
            Date.newInstance(2026, 5, 18),
            SpendlyRecurringExpenseCalculator.getNextRunDate(dueDate, 'Daily', dueDate),
            'Daily recurrence should advance by one day.'
        );
        System.assertEquals(
            Date.newInstance(2026, 5, 24),
            SpendlyRecurringExpenseCalculator.getNextRunDate(dueDate, 'Weekly', dueDate),
            'Weekly recurrence should advance by seven days.'
        );
    }

    @IsTest
    static void testGetNextRunDateKeepsMonthlyAnchor() {
        Date anchorDate = Date.newInstance(2026, 1, 30);

        System.assertEquals(
            Date.newInstance(2026, 2, 28),
            SpendlyRecurringExpenseCalculator.getNextRunDate(anchorDate, 'Monthly', anchorDate),
            'Monthly recurrence should use the final day when the anchor day is unavailable.'
        );
        System.assertEquals(
            Date.newInstance(2026, 3, 30),
            SpendlyRecurringExpenseCalculator.getNextRunDate(
                Date.newInstance(2026, 2, 28),
                'Monthly',
                anchorDate
            ),
            'Monthly recurrence should return to the original anchor day when available.'
        );
    }

    @IsTest
    static void testGetNextRunDateKeepsYearlyAnchor() {
        Date anchorDate = Date.newInstance(2024, 2, 29);

        System.assertEquals(
            Date.newInstance(2025, 2, 28),
            SpendlyRecurringExpenseCalculator.getNextRunDate(anchorDate, 'Yearly', anchorDate),
            'Yearly recurrence should use February 28 after a leap-day anchor.'
        );
        System.assertEquals(
            Date.newInstance(2028, 2, 29),
            SpendlyRecurringExpenseCalculator.getNextRunDate(
                Date.newInstance(2027, 2, 28),
                'Yearly',
                anchorDate
            ),
            'Yearly recurrence should return to leap day when available.'
        );
    }

    @IsTest
    static void testShouldGenerateForDateRespectsRunDateAndEndDate() {
        Recurring_Expense__c recurringExpense = new Recurring_Expense__c(
            End_Date__c = Date.newInstance(2026, 5, 31)
        );

        System.assertEquals(
            true,
            SpendlyRecurringExpenseCalculator.shouldGenerateForDate(
                recurringExpense,
                Date.newInstance(2026, 5, 17),
                Date.newInstance(2026, 5, 17)
            ),
            'A recurrence due on the run date and before its end date should generate.'
        );
        System.assertEquals(
            false,
            SpendlyRecurringExpenseCalculator.shouldGenerateForDate(
                recurringExpense,
                Date.newInstance(2026, 6, 1),
                Date.newInstance(2026, 6, 1)
            ),
            'A recurrence after its end date should not generate.'
        );
        System.assertEquals(
            false,
            SpendlyRecurringExpenseCalculator.shouldGenerateForDate(
                recurringExpense,
                Date.newInstance(2026, 5, 18),
                Date.newInstance(2026, 5, 17)
            ),
            'A recurrence after the current run date should not generate.'
        );
    }

    @IsTest
    static void testGetNextRunDateRejectsUnsupportedFrequency() {
        Boolean exceptionThrown = false;

        try {
            SpendlyRecurringExpenseCalculator.getNextRunDate(
                Date.newInstance(2026, 5, 17),
                'Quarterly',
                Date.newInstance(2026, 5, 17)
            );
        } catch (AuraHandledException e) {
            exceptionThrown = true;
        }

        System.assertEquals(
            true,
            exceptionThrown,
            'Unsupported frequencies should throw a handled exception'
        );
    }
}
