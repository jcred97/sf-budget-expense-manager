import { formatCompactPHP, formatPHP, parseDateString } from 'c/expenseFormatters';
import {
    CHART_COLORS,
    buildBarChartData,
    formatExpenseCount,
    getTopAmountSummary,
    getTopCountSummary,
    groupByAmount,
    sumExpenseAmounts
} from 'c/expenseTransforms';

const MONTH_NAMES = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec'
];

export function buildDashboardViewModel({
    rows = [],
    trend = [],
    endDate,
    expenseGroupId,
    budgetMonth,
    selectedMonthLabel,
    expenseGroupName,
    periodLabel,
    isLoading,
    loadError,
    showEmptyState
}) {
    const totalAmount = sumExpenseAmounts(rows);
    const expenseCount = rows.length;
    const formattedTotal = formatPHP(totalAmount);
    const averageExpense = expenseCount ? formatPHP(totalAmount / expenseCount) : 'PHP 0.00';
    const topCategory = getTopAmountSummary(rows, 'category', 'Uncategorized');
    const topBank = getTopCountSummary(rows, 'bank', 'No bank');
    const largestExpense = getLargestExpense(rows);
    const topDay = getTopDay(rows);
    const dailyAverage = getDailyAverage(rows, totalAmount);

    return {
        totalAmount,
        formattedTotal,
        expenseCount,
        countLabel: formatExpenseCount(expenseCount),
        averageExpense,
        topCategory,
        topBank,
        budgetContext: {
            expenseGroupId,
            expenseGroupName,
            budgetMonth,
            spentAmount: totalAmount
        },
        title: `${selectedMonthLabel} spending`,
        subtitle: `${expenseGroupName || 'No group selected'} / ${periodLabel}`,
        isLoading,
        loadError,
        showEmptyState,
        summaryCards: buildSummaryCards({
            formattedTotal,
            expenseCount,
            averageExpense,
            topCategory,
            topBank
        }),
        categoryChartData: buildCategoryChartData(rows),
        monthlyTrendData: buildMonthlyTrendData(trend, endDate),
        bankChartData: buildBankChartData(rows),
        recentRows: rows.slice(0, 5).map(row => ({
            ...row,
            metaLine: `${row.categoryDisplay} / ${row.bankDisplay}`
        })),
        insights: buildInsights({ largestExpense, topDay, dailyAverage, topCategory })
    };
}

function buildSummaryCards({ formattedTotal, expenseCount, averageExpense, topCategory, topBank }) {
    return [
        {
            key: 'total-spent',
            label: 'Total Spent',
            value: formattedTotal,
            detail: `${expenseCount} expenses`,
            variant: 'amount'
        },
        {
            key: 'average-expense',
            label: 'Average',
            value: averageExpense,
            detail: 'per expense',
            variant: 'amount'
        },
        {
            key: 'top-category',
            label: 'Top Category',
            value: topCategory.name,
            detail: topCategory.amount,
            variant: 'name'
        },
        {
            key: 'top-bank',
            label: 'Top Bank',
            value: topBank.name,
            detail: `${topBank.count} expenses`,
            variant: 'name'
        }
    ];
}

function buildInsights({ largestExpense, topDay, dailyAverage, topCategory }) {
    return [
        {
            key: 'largest',
            iconName: 'utility:arrowup',
            label: 'Largest expense',
            value: largestExpense.amount,
            detail: largestExpense.name
        },
        {
            key: 'top-day',
            iconName: 'utility:event',
            label: 'Highest day',
            value: topDay.amount,
            detail: `${topDay.label} / ${topDay.countLabel}`
        },
        {
            key: 'daily-average',
            iconName: 'utility:metrics',
            label: 'Active-day average',
            value: dailyAverage,
            detail: 'Based on days with expenses'
        },
        {
            key: 'top-category',
            iconName: 'utility:topic',
            label: 'Top category',
            value: topCategory.name,
            detail: topCategory.amount
        }
    ];
}

function buildCategoryChartData(rows) {
    if (!rows.length) {
        return [];
    }
    const entries = groupByAmount(rows, 'category', 'Uncategorized').slice(0, 6);
    return buildBarChartData(entries, 'cat');
}

function buildBankChartData(rows) {
    if (!rows.length) {
        return [];
    }
    return buildBarChartData(groupByAmount(rows, 'bank', 'No bank'), 'bank');
}

function buildMonthlyTrendData(trend, endDate) {
    const end = parseDateString(endDate) || new Date();
    const last6Months = Array.from({ length: 6 }, (_, index) => {
        const date = new Date(end.getFullYear(), end.getMonth() - (5 - index), 1);
        return { year: date.getFullYear(), monthNum: date.getMonth() + 1 };
    });
    const totalsByMonth = Object.fromEntries(
        trend.map(month => [`${month.year}-${month.monthNum}`, month.total || 0])
    );
    const totals = last6Months.map(month => totalsByMonth[`${month.year}-${month.monthNum}`] || 0);
    const max = Math.max(...totals, 1);

    return last6Months.map((month, index) => ({
        key: `trend-${month.year}-${month.monthNum}`,
        label: MONTH_NAMES[month.monthNum - 1],
        formattedTotal: formatPHP(totals[index]),
        compactTotal: formatCompactPHP(totals[index]),
        barClass: `vbar-item ${month.year === end.getFullYear() && month.monthNum === end.getMonth() + 1 ? 'is-selected' : ''}`,
        barStyle: `--vbar-color:${CHART_COLORS[0]};--vbar-height:${totals[index] > 0 ? Math.max(10, Math.round((totals[index] / max) * 110)) : 2}px`,
        hasValue: totals[index] > 0
    }));
}

function getLargestExpense(rows) {
    if (!rows.length) {
        return { name: '-', amount: 'PHP 0.00' };
    }
    const row = [...rows].sort((a, b) => (b.amount || 0) - (a.amount || 0))[0];
    return { name: row.name || 'Untitled expense', amount: formatPHP(row.amount || 0) };
}

function getTopDay(rows) {
    if (!rows.length) {
        return { label: '-', amount: 'PHP 0.00', countLabel: 'No activity' };
    }

    const days = new Map();
    rows.forEach(row => {
        const key = row.expenseDate || 'no-date';
        const day = days.get(key) || { label: row.expenseDateFormatted, total: 0, count: 0 };
        day.total += row.amount || 0;
        day.count += 1;
        days.set(key, day);
    });
    const top = [...days.values()].sort((a, b) => b.total - a.total)[0];
    return {
        label: top.label,
        amount: formatPHP(top.total),
        countLabel: formatExpenseCount(top.count)
    };
}

function getDailyAverage(rows, totalAmount) {
    if (!rows.length) {
        return 'PHP 0.00';
    }
    const activeDays = new Set(rows.map(row => row.expenseDate || 'no-date')).size || 1;
    return formatPHP(totalAmount / activeDays);
}
