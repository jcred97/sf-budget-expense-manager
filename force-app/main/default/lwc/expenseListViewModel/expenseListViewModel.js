import { formatDate, formatPHP } from 'c/expenseFormatters';
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
    selectedRows = [],
    categoryId,
    startDate,
    endDate,
    categoryOptions = [],
    dateError,
    isLoading,
    isLoadingMore
}) {
    const filteredRows = filterRows(rows, searchTerm);
    const displayedRows = filteredRows.slice(0, visibleCount);
    const selectedIds = new Set(selectedRows);
    const transactionGroups = groupRowsByDate(displayedRows, selectedIds);
    const totalAmount = sumExpenseAmounts(filteredRows);
    const expenseCount = filteredRows.length;
    const hasActiveFilters = Boolean(searchTerm) || categoryId !== 'All';
    const topCategory = getTopAmountSummary(filteredRows, 'category', 'Uncategorized');
    const topBank = getTopCountSummary(filteredRows, 'bank', 'No bank');

    const viewModel = {
        filteredRows,
        totalAmount,
        formattedTotal: formatPHP(totalAmount),
        expenseCount,
        countLabel: formatExpenseCount(expenseCount),
        averageExpense: expenseCount ? formatPHP(totalAmount / expenseCount) : 'PHP 0.00',
        topCategory,
        topBank,
        hasNoRows: filteredRows.length === 0 && !isLoading,
        hasMoreRows: visibleCount < filteredRows.length,
        printDateRange: `${startDate || ''} - ${endDate || ''}`,
        printRows: buildPrintRows(filteredRows)
    };

    Object.assign(viewModel, {
        searchTerm,
        startDate,
        endDate,
        categoryId,
        categoryOptions,
        dateError,
        periodLabel: formatPeriodLabel(startDate, endDate),
        countLabel: viewModel.countLabel,
        formattedTotal: viewModel.formattedTotal,
        isLoading,
        hasNoRows: viewModel.hasNoRows,
        emptyIcon: hasActiveFilters ? 'utility:filterList' : 'utility:table',
        emptyTitle: hasActiveFilters
            ? 'No expenses match your filters'
            : 'No expenses in this period',
        emptyMessage: hasActiveFilters
            ? 'Adjust or reset the filters to widen your expense results.'
            : 'Add an expense for this group and month to start tracking spending.',
        hasActiveFilters,
        hasSelectedRows: selectedRows.length > 0,
        selectedCount: selectedRows.length,
        transactionGroups,
        visibleRowsSummary: `Showing ${Math.min(visibleCount, filteredRows.length)} of ${filteredRows.length}`,
        hasMoreRows: viewModel.hasMoreRows,
        loadMoreLabel: isLoadingMore ? 'Loading...' : 'Load More',
        isLoadingMore
    });

    return viewModel;
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

function formatPeriodLabel(startDate, endDate) {
    const start = formatDate(startDate);
    const end = formatDate(endDate);
    return start === '-' && end === '-' ? 'All dates' : `${start} - ${end}`;
}
