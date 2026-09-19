import getAvailableExpenseGroupBanks from '@salesforce/apex/BankController.getAvailableExpenseGroupBanks';
import getBudgetHistory from '@salesforce/apex/BudgetController.getBudgetHistory';
import getExpensesByFilters from '@salesforce/apex/ExpenseController.getExpensesByFilters';
import getExpensePage from '@salesforce/apex/ExpenseController.getExpensePage';
import getMonthlyTrend from '@salesforce/apex/ExpenseController.getMonthlyTrend';

import { formatDateISO, parseDateString } from 'c/expenseFormatters';
import { mapExpenseRow } from 'c/expenseTransforms';

export async function fetchExpensePage({
    expenseGroupId,
    categoryId,
    startDate,
    endDate,
    searchTerm = '',
    pageSize = 20,
    cursor = null
}) {
    const data = await getExpensePage({
        filters: {
            expenseGroupId,
            categoryId: categoryId === 'All' ? null : categoryId,
            startDate,
            endDate
        },
        pagination: { searchTerm, pageSize, cursor }
    });
    return { ...data, rows: data.rows.map(mapExpenseRow) };
}

// Reports deliberately fetch every page. A failed or superseded request never exports partial data.
export async function fetchAllExpenseRows(filters, isCurrent = () => true) {
    const rows = new Map();
    const cursors = new Set();
    let cursor = null;
    do {
        if (!isCurrent()) {
            return null;
        }
        // Each request depends on the cursor returned by the preceding page.
        // eslint-disable-next-line no-await-in-loop
        const page = await fetchExpensePage({ ...filters, pageSize: 200, cursor });
        if (!isCurrent()) {
            return null;
        }
        page.rows.forEach(row => rows.set(row.id, row));
        cursor = page.hasMore ? page.nextCursor : null;
        if (page.hasMore && (!cursor || cursors.has(cursor))) {
            throw new Error('Unable to load the complete report. Please retry.');
        }
        cursors.add(cursor);
    } while (cursor);
    return [...rows.values()];
}

export async function fetchDashboardData({ expenseGroupId, startDate, endDate }) {
    const trendEndDate = parseDateString(endDate) || new Date();
    const trendStartDate = new Date(trendEndDate.getFullYear(), trendEndDate.getMonth() - 5, 1);
    const filters = {
        expenseGroupId,
        categoryId: null,
        startDate,
        endDate
    };
    const trendFilters = {
        ...filters,
        startDate: formatDateISO(trendStartDate)
    };
    const [rows, trend, budgets] = await Promise.all([
        getExpensesByFilters({ filters }),
        getMonthlyTrend({ filters: trendFilters }),
        getBudgetHistory({ expenseGroupId, endMonth: endDate })
    ]);

    return {
        rows: rows.map(mapExpenseRow),
        trend: trend || [],
        budgets: budgets || []
    };
}

export async function fetchBankOptions(expenseGroupId) {
    const assignments = await getAvailableExpenseGroupBanks({ expenseGroupId });
    return assignments.map(assignment => ({
        label: assignment.bankName,
        value: assignment.assignmentId
    }));
}
