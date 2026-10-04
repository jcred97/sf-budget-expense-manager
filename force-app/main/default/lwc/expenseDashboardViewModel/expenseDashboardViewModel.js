import { formatCompactPHP, formatDate, formatPHP, parseDateString } from 'c/expenseFormatters';
import { CHART_COLORS, buildBarChartData, formatExpenseCount } from 'c/expenseTransforms';

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
    summary,
    rows = [],
    trend = [],
    budgets = [],
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
    const totalAmount = Number(summary?.totalAmount) || 0;
    const expenseCount = summary?.expenseCount || 0;
    const formattedTotal = formatPHP(totalAmount);
    const averageExpense = expenseCount ? formatPHP(totalAmount / expenseCount) : 'PHP 0.00';
    const category = summary?.categoryTotals?.[0];
    const topCategory = { name: category?.name || '-', amount: formatPHP(category?.total || 0) };
    const topBank = { name: summary?.topBank?.name || '-', count: summary?.topBank?.count || 0 };
    const largestExpense = {
        name: summary?.largestExpense?.name || (expenseCount ? 'Untitled expense' : '-'),
        amount: formatPHP(summary?.largestExpense?.amount || 0)
    };
    const topDay = {
        label: formatDate(summary?.topDay?.expenseDate),
        amount: formatPHP(summary?.topDay?.total || 0),
        countLabel: summary?.topDay ? formatExpenseCount(summary.topDay.count) : 'No activity'
    };
    const dailyAverage = summary?.activeDayCount
        ? formatPHP(totalAmount / summary.activeDayCount)
        : 'PHP 0.00';

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
        categoryChartData: buildBarChartData(
            (summary?.categoryTotals || []).map(({ name, total }) => [name, total]),
            'cat'
        ),
        monthlyTrendData: buildMonthlyTrendData(trend, endDate),
        budgetHistoryData: buildBudgetHistoryData(trend, budgets, endDate),
        bankChartData: buildBarChartData(
            (summary?.bankTotals || []).map(({ name, total }) => [name, total]),
            'bank'
        ),
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

function buildMonthlyTrendData(trend, endDate) {
    const end = parseDateString(endDate) || new Date();
    const last6Months = buildLast6Months(end);
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

function buildBudgetHistoryData(trend, budgets, endDate) {
    const end = parseDateString(endDate) || new Date();
    const totalsByMonth = Object.fromEntries(
        trend.map(month => [`${month.year}-${month.monthNum}`, Number(month.total) || 0])
    );
    const budgetsByMonth = Object.fromEntries(
        budgets.map(budget => {
            const month = parseDateString(budget.budgetMonth);
            return [`${month.getFullYear()}-${month.getMonth() + 1}`, budget];
        })
    );

    return buildLast6Months(end)
        .reverse()
        .map(month => {
            const monthKey = `${month.year}-${month.monthNum}`;
            const budget = budgetsByMonth[monthKey];
            const hasBudget = Boolean(budget);
            const budgetAmount = Number(budget?.amount) || 0;
            const spentAmount = totalsByMonth[monthKey] || 0;
            const varianceAmount = budgetAmount - spentAmount;
            const isOverBudget = hasBudget && varianceAmount < 0;
            const percentageUsed = budgetAmount > 0 ? (spentAmount / budgetAmount) * 100 : 0;

            return {
                key: `budget-history-${monthKey}`,
                monthLabel: `${MONTH_NAMES[month.monthNum - 1]} ${month.year}`,
                hasBudget,
                budgetDisplay: hasBudget ? formatPHP(budgetAmount) : 'No budget',
                spentDisplay: formatPHP(spentAmount),
                varianceDisplay: getVarianceDisplay(hasBudget, varianceAmount),
                varianceClass: isOverBudget
                    ? 'slds-text-color_error'
                    : hasBudget
                      ? 'slds-text-color_success'
                      : 'slds-text-color_weak',
                percentageLabel: hasBudget
                    ? `${formatPercentage(percentageUsed)}% used`
                    : 'Not set',
                progressValue: Math.min(100, Math.max(0, percentageUsed))
            };
        });
}

function buildLast6Months(end) {
    return Array.from({ length: 6 }, (_, index) => {
        const date = new Date(end.getFullYear(), end.getMonth() - (5 - index), 1);
        return { year: date.getFullYear(), monthNum: date.getMonth() + 1 };
    });
}

function getVarianceDisplay(hasBudget, varianceAmount) {
    if (!hasBudget) {
        return 'Not applicable';
    }
    if (varianceAmount < 0) {
        return `${formatPHP(Math.abs(varianceAmount))} over`;
    }
    if (varianceAmount === 0) {
        return 'On budget';
    }
    return `${formatPHP(varianceAmount)} remaining`;
}

function formatPercentage(value) {
    return new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 }).format(value);
}
