const CSV_HEADERS = [
    'Date',
    'Time',
    'Expense Name',
    'Category',
    'Expense Group',
    'Bank',
    'Type',
    'Amount (PHP)',
    'Original Amount',
    'Original Currency',
    'Exchange Rate to PHP',
    'Exchange Rate Date',
    'Exchange Rate Source'
];

export function downloadExpensesCsv(rows, endDate) {
    const csvContent = buildExpensesCsv(rows);
    const link = document.createElement('a');

    link.setAttribute('href', `data:text/csv;charset=utf-8,${encodeURIComponent(csvContent)}`);
    link.setAttribute('download', `budget-expenses-${endDate || 'export'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export function buildExpensesCsv(rows = []) {
    const expenseRows = rows.map(row => [
        row.expenseDate || '',
        row.transactionTimeDisplay === '-' ? '' : row.transactionTimeDisplay,
        row.name || '',
        row.category || '',
        row.expenseGroup || '',
        row.bank || '',
        row.transactionType || '',
        row.amount != null ? row.amount : '',
        row.originalAmount != null ? row.originalAmount : '',
        row.originalCurrencyCode || '',
        row.exchangeRateToPhp != null ? row.exchangeRateToPhp : '',
        row.exchangeRateDate || '',
        row.exchangeRateSource || ''
    ]);

    return [CSV_HEADERS, ...expenseRows].map(row => row.map(escapeCsvCell).join(',')).join('\n');
}

function escapeCsvCell(value) {
    return `"${String(value).replace(/"/g, '""')}"`;
}
