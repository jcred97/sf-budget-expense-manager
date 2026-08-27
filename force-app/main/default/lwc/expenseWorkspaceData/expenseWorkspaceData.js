import getAvailableExpenseGroupBanks from '@salesforce/apex/BankController.getAvailableExpenseGroupBanks';
import getBudgetHistory from '@salesforce/apex/BudgetController.getBudgetHistory';
import getExpensesByFilters from '@salesforce/apex/ExpenseController.getExpensesByFilters';
import getMonthlyTrend from '@salesforce/apex/ExpenseController.getMonthlyTrend';

import { formatDateISO, parseDateString } from 'c/expenseFormatters';
import { mapExpenseRow } from 'c/expenseTransforms';

export async function fetchExpenseRows({ expenseGroupId, categoryId, startDate, endDate }) {
    const data = await getExpensesByFilters({
        filters: {
            expenseGroupId,
            categoryId: categoryId === 'All' ? null : categoryId,
            startDate,
            endDate
        }
    });
    return data.map(mapExpenseRow);
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
