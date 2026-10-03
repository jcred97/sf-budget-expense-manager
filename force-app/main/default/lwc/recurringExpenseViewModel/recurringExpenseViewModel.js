import { formatActiveWindow, formatDate, formatPHP } from 'c/expenseFormatters';

export function buildRecurringViewModel({ rows = [], overview = {}, expenseGroupName, isLoading }) {
    const activeCount = overview.activeCount || 0;
    const totalCount = overview.totalCount ?? rows.length;
    const dueTodayCount = overview.dueTodayCount || 0;
    const monthlyTotal = formatPHP(overview.monthlyTotal || 0);
    const summaryCards = [
        {
            key: 'active',
            iconName: 'utility:check',
            label: 'Active templates',
            value: activeCount,
            detail: `${totalCount} total templates`
        },
        {
            key: 'due',
            iconName: 'utility:event',
            label: 'Due today',
            value: dueTodayCount,
            detail: 'Ready for the next batch run'
        },
        {
            key: 'monthly',
            iconName: 'utility:money',
            label: 'Monthly estimate',
            value: monthlyTotal,
            detail: 'Normalized active recurring total'
        }
    ].map(card => ({
        ...card,
        valueTitle: String(card.value),
        detailTitle: String(card.detail)
    }));

    return {
        summaryCards,
        expenseGroupName,
        countLabel:
            rows.length < totalCount
                ? `${rows.length} of ${totalCount} recurring expenses`
                : `${totalCount} recurring expense${totalCount === 1 ? '' : 's'}`,
        isLoading,
        rows: rows.map(buildRecurringRow)
    };
}

function buildRecurringRow(row) {
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
