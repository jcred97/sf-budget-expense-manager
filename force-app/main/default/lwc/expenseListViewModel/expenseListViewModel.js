import { formatDate, formatIsoDateRange, formatPeriodRange, formatPHP } from 'c/expenseFormatters';
import {
    formatExpenseCount,
    getTopAmountSummary,
    getTopCountSummary,
    sumExpenseAmounts
} from 'c/expenseTransforms';

export function buildExpensesViewModel({
    rows = [],
    searchTerm = '',
    summary,
    hasMore = false,
    isLoadingMore = false,
    loadError = '',
    selectedExpenseIds = [],
    categoryId,
    startDate,
    endDate,
    categoryOptions = [],
    dateError,
    isLoading
}) {
    const filteredRows = rows;
    const selectedIds = new Set(selectedExpenseIds);
    const dateGroups = groupRowsByDate(rows, selectedIds);
    const totalAmount = summary?.totalAmount ?? sumExpenseAmounts(rows);
    const expenseCount = summary?.totalCount ?? rows.length;
    const hasActiveFilters = Boolean(searchTerm) || categoryId !== 'All';
    const topCategory = getTopAmountSummary(filteredRows, 'category', 'Uncategorized');
    const topBank = getTopCountSummary(filteredRows, 'bank', 'No bank');
    const formattedTotal = formatPHP(totalAmount);
    const countLabel = formatExpenseCount(expenseCount);
    const hasNoRows = filteredRows.length === 0 && !isLoading && !loadError;

    return {
        filteredRows,
        totalAmount,
        formattedTotal,
        expenseCount,
        countLabel,
        averageExpense: expenseCount ? formatPHP(totalAmount / expenseCount) : 'PHP 0.00',
        topCategory,
        topBank,
        searchTerm,
        startDate,
        endDate,
        categoryId,
        categoryOptions,
        dateError,
        periodLabel: formatPeriodRange(startDate, endDate),
        isLoading,
        isLoadingMore,
        loadError,
        loadMoreLabel: isLoadingMore ? 'Loading...' : 'Load More',
        hasNoRows,
        emptyIcon: hasActiveFilters ? 'utility:filterList' : 'utility:table',
        emptyTitle: hasActiveFilters
            ? 'No expenses match your filters'
            : 'No expenses in this period',
        emptyMessage: hasActiveFilters
            ? 'Adjust or reset the filters to widen your expense results.'
            : 'Add an expense for this group and month to start tracking spending.',
        hasActiveFilters,
        hasSelectedRows: selectedExpenseIds.length > 0,
        selectedCount: selectedExpenseIds.length,
        dateGroups,
        visibleRowsSummary: `Showing ${rows.length} of ${expenseCount}`,
        hasMoreRows: hasMore,
        printDateRange: formatIsoDateRange(startDate, endDate),
        printRows: buildPrintRows(filteredRows)
    };
}

function groupRowsByDate(rows, selectedIds) {
    const groups = [];
    const groupMap = new Map();

    rows.forEach(row => {
        const key = row.expenseDate || 'no-date';
        if (!groupMap.has(key)) {
            const group = {
                key,
                label: row.expenseDateFormatted,
                rows: [],
                total: 0
            };
            groupMap.set(key, group);
            groups.push(group);
        }

        const group = groupMap.get(key);
        group.rows.push({ ...row, isSelected: selectedIds.has(row.id) });
        group.total += row.amount || 0;
    });

    return groups.map(group => ({
        ...group,
        countLabel: formatExpenseCount(group.rows.length),
        totalFormatted: formatPHP(group.total)
    }));
}

function buildPrintRows(rows) {
    return rows.map(row => ({
        ...row,
        expenseDateFormatted: formatDate(row.expenseDate),
        transactionTimeFormatted: row.transactionTimeDisplay,
        amountFormatted: row.amount != null ? formatPHP(row.amount) : '-',
        foreignCurrencySummary: row.hasForeignCurrency ? row.foreignCurrencySummary : ''
    }));
}
