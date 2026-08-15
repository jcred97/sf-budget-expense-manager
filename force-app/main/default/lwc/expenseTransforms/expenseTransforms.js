import { formatDate, formatPHP, formatTime } from 'c/expenseFormatters';

export const CHART_COLORS = ['#0070D2', '#04844B', '#FFB75D', '#E4A201', '#9E5BB5', '#E16032'];

export function groupByAmount(rows, field, fallbackLabel = 'Unknown') {
    const groupedAmounts = {};
    rows.forEach(row => {
        const key = row[field] || fallbackLabel;
        groupedAmounts[key] = (groupedAmounts[key] || 0) + (row.amount || 0);
    });
    return Object.entries(groupedAmounts).sort((a, b) => b[1] - a[1]);
}

export function groupByCount(rows, field, fallbackLabel = 'Unknown') {
    const groupedCounts = {};
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
    return {
        id: row.Id,
        expenseDate: row.Expense_Date__c,
        expenseDateFormatted: formatDate(row.Expense_Date__c),
        transactionTime: row.Transaction_Time__c,
        transactionTimeDisplay: formatTime(row.Transaction_Time__c),
        name: row.Name,
        recordLink: `/${row.Id}`,
        category: row.Category__r?.Name,
        categoryId: row.Category__c,
        categoryDisplay: row.Category__r?.Name || 'Uncategorized',
        expenseGroup: row.Category__r?.Expense_Group__r?.Name,
        bank: row.Bank__c,
        bankDisplay: row.Bank__c || 'No bank',
        transactionType: row.Transaction_Type__c,
        transactionTypeDisplay: row.Transaction_Type__c || 'No type',
        amount: row.Amount__c,
        amountFormatted: formatPHP(row.Amount__c || 0)
    };
}
