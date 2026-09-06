/** Normalizes optional foreign-currency details while keeping Amount__c canonical in PHP. */
public inherited sharing class ExpenseCurrencyService {
    private static final String TARGET_CURRENCY = 'PHP';

    /**
     * Validates complete foreign-currency snapshots and calculates their canonical PHP amount.
     * Ordinary PHP Expenses with no foreign-currency details remain unchanged.
     *
     * @param expenses Expense values from a before-insert or before-update trigger.
     */
    public static void normalizeAndValidate(List<Expense__c> expenses) {
        for (Expense__c expense : expenses) {
            normalizeText(expense);
            if (!hasForeignCurrencyDetails(expense)) {
                continue;
            }

            String validationError = validateForeignCurrencyDetails(expense);
            if (validationError != null) {
                expense.addError(validationError);
                continue;
            }

            expense.Amount__c = (expense.Original_Amount__c * expense.Exchange_Rate_To_PHP__c)
                .setScale(2, RoundingMode.HALF_UP);
        }
    }

    private static void normalizeText(Expense__c expense) {
        if (expense.Original_Currency_Code__c != null) {
            expense.Original_Currency_Code__c = expense.Original_Currency_Code__c
                .trim()
                .toUpperCase();
        }
        if (expense.Exchange_Rate_Source__c != null) {
            expense.Exchange_Rate_Source__c = expense.Exchange_Rate_Source__c.trim();
        }
    }

    private static Boolean hasForeignCurrencyDetails(Expense__c expense) {
        return expense.Original_Amount__c != null ||
            !String.isBlank(expense.Original_Currency_Code__c) ||
            expense.Exchange_Rate_To_PHP__c != null ||
            expense.Exchange_Rate_Date__c != null ||
            !String.isBlank(expense.Exchange_Rate_Source__c);
    }

    private static String validateForeignCurrencyDetails(Expense__c expense) {
        if (isIncompleteSnapshot(expense)) {
            return 'Complete all foreign-currency fields or clear them all.';
        }
        if (expense.Original_Amount__c <= 0) {
            return 'Original amount must be greater than zero.';
        }
        if (!Pattern.matches('[A-Z]{3}', expense.Original_Currency_Code__c)) {
            return 'Original currency must be a valid three-letter currency code.';
        }
        if (expense.Original_Currency_Code__c == TARGET_CURRENCY) {
            return 'Use the standard PHP amount field for PHP expenses.';
        }
        if (expense.Exchange_Rate_To_PHP__c <= 0) {
            return 'Exchange rate to PHP must be greater than zero.';
        }

        Date transactionDate = expense.Expense_Date__c == null
            ? Date.today()
            : expense.Expense_Date__c;
        if (expense.Exchange_Rate_Date__c > transactionDate) {
            return 'Exchange-rate date cannot be after the transaction date.';
        }
        if (expense.Exchange_Rate_Date__c > Date.today()) {
            return 'Exchange-rate date cannot be in the future.';
        }
        return null;
    }

    private static Boolean isIncompleteSnapshot(Expense__c expense) {
        return expense.Original_Amount__c == null ||
            String.isBlank(expense.Original_Currency_Code__c) ||
            expense.Exchange_Rate_To_PHP__c == null ||
            expense.Exchange_Rate_Date__c == null ||
            String.isBlank(expense.Exchange_Rate_Source__c);
    }
}
