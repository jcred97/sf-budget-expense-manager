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
    visibleCount,
    selectedExpenseIds = [],
    categoryId,
    startDate,
    endDate,
    categoryOptions = [],
    dateError,
    isLoading
}) {
    const filteredRows = filterRows(rows, searchTerm);
    const displayedRows = filteredRows.slice(0, visibleCount);
    const selectedIds = new Set(selectedExpenseIds);
    const dateGroups = groupRowsByDate(displayedRows, selectedIds);
    const totalAmount = sumExpenseAmounts(filteredRows);
    const expenseCount = filteredRows.length;
    const hasActiveFilters = Boolean(searchTerm) || categoryId !== 'All';
    const topCategory = getTopAmountSummary(filteredRows, 'category', 'Uncategorized');
    const topBank = getTopCountSummary(filteredRows, 'bank', 'No bank');
    const formattedTotal = formatPHP(totalAmount);
    const countLabel = formatExpenseCount(expenseCount);
    const hasNoRows = filteredRows.length === 0 && !isLoading;
    const hasMoreRows = visibleCount < filteredRows.length;

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
        visibleRowsSummary: `Showing ${Math.min(visibleCount, filteredRows.length)} of ${filteredRows.length}`,
        hasMoreRows,
        printDateRange: formatIsoDateRange(startDate, endDate),
        printRows: buildPrintRows(filteredRows)
    };
}

function filterRows(rows, searchTerm) {
    if (!searchTerm) {
        return rows;
    }

    const term = searchTerm.toLowerCase();
    return rows.filter(
        row =>
            (row.name || '').toLowerCase().includes(term) ||
            (row.category || '').toLowerCase().includes(term) ||
            (row.expenseGroup || '').toLowerCase().includes(term) ||
            (row.bank || '').toLowerCase().includes(term) ||
            (row.transactionType || '').toLowerCase().includes(term)
    );
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
        amountFormatted: row.amount != null ? formatPHP(row.amount) : '-'
    }));
}
