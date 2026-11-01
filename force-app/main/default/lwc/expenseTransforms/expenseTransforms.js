import AMOUNT_FIELD from '@salesforce/schema/Expense__c.Amount__c';
import EXPENSE_DATE_FIELD from '@salesforce/schema/Expense__c.Expense_Date__c';
import TRANSACTION_TIME_FIELD from '@salesforce/schema/Expense__c.Transaction_Time__c';
import CATEGORY_ID_FIELD from '@salesforce/schema/Expense__c.Category__c';
import CATEGORY_NAME_FIELD from '@salesforce/schema/Expense__c.Category__r.Name';
import GROUP_NAME_FIELD from '@salesforce/schema/Expense__c.Category__r.Expense_Group__r.Name';
import ASSIGNMENT_ID_FIELD from '@salesforce/schema/Expense__c.Bank_Assignment__c';
import ASSIGNMENT_ACTIVE_FIELD from '@salesforce/schema/Expense__c.Bank_Assignment__r.Active__c';
import BANK_ID_FIELD from '@salesforce/schema/Expense__c.Bank_Assignment__r.Bank__c';
import BANK_NAME_FIELD from '@salesforce/schema/Expense__c.Bank_Assignment__r.Bank__r.Name';
import BANK_ACTIVE_FIELD from '@salesforce/schema/Expense__c.Bank_Assignment__r.Bank__r.Active__c';
import LEGACY_BANK_FIELD from '@salesforce/schema/Expense__c.Bank__c';
import TRANSACTION_TYPE_FIELD from '@salesforce/schema/Expense__c.Transaction_Type__c';
import ORIGINAL_AMOUNT_FIELD from '@salesforce/schema/Expense__c.Original_Amount__c';
import ORIGINAL_CURRENCY_FIELD from '@salesforce/schema/Expense__c.Original_Currency_Code__c';
import EXCHANGE_RATE_FIELD from '@salesforce/schema/Expense__c.Exchange_Rate_To_PHP__c';
import EXCHANGE_DATE_FIELD from '@salesforce/schema/Expense__c.Exchange_Rate_Date__c';
import EXCHANGE_SOURCE_FIELD from '@salesforce/schema/Expense__c.Exchange_Rate_Source__c';
import { getSObjectFieldValue } from 'c/appSchemaAccess';
import { formatCurrency, formatDate, formatPHP, formatTime } from 'c/expenseFormatters';

export const CHART_COLORS = ['#0070D2', '#04844B', '#FFB75D', '#E4A201', '#9E5BB5', '#E16032'];

export function groupByAmount(rows, field, fallbackLabel = 'Unknown') {
    const groupedAmounts = Object.create(null);
    rows.forEach(row => {
        const key = row[field] || fallbackLabel;
        groupedAmounts[key] = (groupedAmounts[key] || 0) + (row.amount || 0);
    });
    return Object.entries(groupedAmounts).sort((a, b) => b[1] - a[1]);
}

export function groupByCount(rows, field, fallbackLabel = 'Unknown') {
    const groupedCounts = Object.create(null);
    rows.forEach(row => {
        const key = row[field] || fallbackLabel;
        groupedCounts[key] = (groupedCounts[key] || 0) + 1;
    });
    return Object.entries(groupedCounts).sort((a, b) => b[1] - a[1]);
}

export function getTopAmountSummary(rows, field, fallbackLabel) {
    if (!rows.length) {
        return { name: '-', amount: 'PHP 0.00' };
    }
    const [name, total] = groupByAmount(rows, field, fallbackLabel)[0];
    return { name, amount: formatPHP(total) };
}

export function getTopCountSummary(rows, field, fallbackLabel) {
    if (!rows.length) {
        return { name: '-', count: 0 };
    }
    const [name, count] = groupByCount(rows, field, fallbackLabel)[0];
    return { name, count };
}

export function sumExpenseAmounts(rows) {
    return rows.reduce((sum, row) => sum + (row.amount || 0), 0);
}

export function formatExpenseCount(count) {
    return `${count} expense${count === 1 ? '' : 's'}`;
}

export function buildBarChartData(entries, prefix) {
    const max = entries[0]?.[1] || 1;
    return entries.map(([name, total], index) => ({
        key: `${prefix}-${name}-${index}`,
        name,
        formattedTotal: formatPHP(total),
        barStyle: `--bar-color:${CHART_COLORS[index % CHART_COLORS.length]};--bar-width:${Math.round((total / max) * 100)}%`
    }));
}

export function mapExpenseRow(row) {
    const bankName =
        getSObjectFieldValue(row, BANK_NAME_FIELD) ||
        getSObjectFieldValue(row, LEGACY_BANK_FIELD) ||
        '';
    const bankAssignmentActive = Boolean(
        getSObjectFieldValue(row, ASSIGNMENT_ID_FIELD) &&
        getSObjectFieldValue(row, ASSIGNMENT_ACTIVE_FIELD) &&
        getSObjectFieldValue(row, BANK_ACTIVE_FIELD)
    );
    const originalAmount = getSObjectFieldValue(row, ORIGINAL_AMOUNT_FIELD);
    const originalCurrencyCode = getSObjectFieldValue(row, ORIGINAL_CURRENCY_FIELD) || '';
    const exchangeRateToPhp = getSObjectFieldValue(row, EXCHANGE_RATE_FIELD);
    const hasForeignCurrency = Boolean(
        originalCurrencyCode && originalAmount != null && exchangeRateToPhp != null
    );
    const originalAmountFormatted = hasForeignCurrency
        ? formatCurrency(originalAmount, originalCurrencyCode)
        : '';
    const exchangeRateFormatted = hasForeignCurrency
        ? Number(exchangeRateToPhp).toLocaleString('en-PH', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 8
          })
        : '';

    return {
        id: row.Id,
        expenseDate: getSObjectFieldValue(row, EXPENSE_DATE_FIELD),
        expenseDateFormatted: formatDate(getSObjectFieldValue(row, EXPENSE_DATE_FIELD)),
        transactionTime: getSObjectFieldValue(row, TRANSACTION_TIME_FIELD),
        transactionTimeDisplay: formatTime(getSObjectFieldValue(row, TRANSACTION_TIME_FIELD)),
        name: row.Name,
        recordLink: `/${row.Id}`,
        category: getSObjectFieldValue(row, CATEGORY_NAME_FIELD),
        categoryId: getSObjectFieldValue(row, CATEGORY_ID_FIELD),
        categoryDisplay: getSObjectFieldValue(row, CATEGORY_NAME_FIELD) || 'Uncategorized',
        expenseGroup: getSObjectFieldValue(row, GROUP_NAME_FIELD),
        bank: bankName,
        bankDisplay: bankName || 'No bank',
        bankAssignmentId: getSObjectFieldValue(row, ASSIGNMENT_ID_FIELD),
        bankId: getSObjectFieldValue(row, BANK_ID_FIELD),
        bankAssignmentActive,
        legacyBank: getSObjectFieldValue(row, LEGACY_BANK_FIELD) || '',
        transactionType: getSObjectFieldValue(row, TRANSACTION_TYPE_FIELD),
        transactionTypeDisplay: getSObjectFieldValue(row, TRANSACTION_TYPE_FIELD) || 'No type',
        amount: getSObjectFieldValue(row, AMOUNT_FIELD),
        amountFormatted: formatPHP(getSObjectFieldValue(row, AMOUNT_FIELD) || 0),
        originalAmount,
        originalCurrencyCode,
        exchangeRateToPhp,
        exchangeRateDate: getSObjectFieldValue(row, EXCHANGE_DATE_FIELD),
        exchangeRateSource: getSObjectFieldValue(row, EXCHANGE_SOURCE_FIELD) || '',
        hasForeignCurrency,
        originalAmountFormatted,
        exchangeRateFormatted,
        foreignCurrencySummary: hasForeignCurrency
            ? `${originalAmountFormatted} · ${exchangeRateFormatted} PHP/${originalCurrencyCode}`
            : ''
    };
}
