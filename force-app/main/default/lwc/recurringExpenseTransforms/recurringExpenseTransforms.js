import { formatActiveWindow, formatDate, formatPHP } from 'c/expenseFormatters';

export function mapRecurringExpenseRow(row) {
    return {
        ...row,
        recordLink: `/${row.id}`,
        categoryDisplay: row.categoryName || 'Uncategorized',
        expenseGroupDisplay: row.expenseGroupName || 'No group',
        bankDisplay: row.bank || 'No bank',
        transactionTypeDisplay: row.transactionType || 'No type',
        amountFormatted: formatPHP(row.amount || 0),
        monthlyAmountFormatted: formatPHP(row.monthlyAmount || 0),
        nextRunDateFormatted: formatDate(row.nextRunDate),
        activeWindowFormatted: formatActiveWindow(row.startDate, row.endDate),
        statusLabel: row.active ? 'Active' : 'Inactive',
        statusClass: `recurring-status ${row.active ? 'is-active' : 'is-inactive'}`,
        deactivateDisabled: !row.active,
        rowClass: ['recurring-row', row.dueToday ? 'is-due' : '', row.active ? '' : 'is-inactive']
            .filter(Boolean)
            .join(' ')
    };
}
