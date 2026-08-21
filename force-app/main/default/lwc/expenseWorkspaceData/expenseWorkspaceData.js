import getAvailableExpenseGroupBanks from '@salesforce/apex/BankController.getAvailableExpenseGroupBanks';
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
    const [rows, trend] = await Promise.all([
        getExpensesByFilters({ filters }),
        getMonthlyTrend({ filters: trendFilters })
    ]);

    return {
        rows: rows.map(mapExpenseRow),
        trend: trend || []
    };
}

export async function fetchBankOptions(expenseGroupId) {
    const assignments = await getAvailableExpenseGroupBanks({ expenseGroupId });
    return assignments.map(assignment => ({
        label: assignment.bankName,
        value: assignment.assignmentId
    }));
}
