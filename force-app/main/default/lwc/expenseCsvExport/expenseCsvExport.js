// Keep each header, value and numeric policy together so column order cannot drift.
const CSV_COLUMNS = [
    { header: 'Date', value: row => row.expenseDate || '' },
    {
        header: 'Time',
        value: row => (row.transactionTimeDisplay === '-' ? '' : row.transactionTimeDisplay)
    },
    { header: 'Expense Name', value: row => row.name || '' },
    { header: 'Category', value: row => row.category || '' },
    { header: 'Expense Group', value: row => row.expenseGroup || '' },
    { header: 'Bank', value: row => row.bank || '' },
    { header: 'Type', value: row => row.transactionType || '' },
    { header: 'Amount (PHP)', value: row => row.amount ?? '', numeric: true },
    { header: 'Original Amount', value: row => row.originalAmount ?? '', numeric: true },
    { header: 'Original Currency', value: row => row.originalCurrencyCode || '' },
    { header: 'Exchange Rate to PHP', value: row => row.exchangeRateToPhp ?? '', numeric: true },
    { header: 'Exchange Rate Date', value: row => row.exchangeRateDate || '' },
    { header: 'Exchange Rate Source', value: row => row.exchangeRateSource || '' }
];

const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const FORMULA_PREFIX_PATTERN = /^\s*[=+@-]/;
const CONTROL_PREFIX_PATTERN = /^[\t\r\n]/;

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
    const header = CSV_COLUMNS.map(column => escapeCsvCell(column.header)).join(',');
    const expenseLines = rows.map(row =>
        CSV_COLUMNS.map(column => escapeCsvCell(column.value(row), column.numeric)).join(',')
    );
    return [header, ...expenseLines].join('\n');
}

function escapeCsvCell(value, isNumericColumn = false) {
    let text = String(value);
    const isNumericValue = isNumericColumn && NUMBER_PATTERN.test(text);
    const hasUnsafePrefix = FORMULA_PREFIX_PATTERN.test(text) || CONTROL_PREFIX_PATTERN.test(text);
    // Quoting alone does not prevent spreadsheets from evaluating a cell as a formula.
    if (!isNumericValue && hasUnsafePrefix) {
        text = `'${text}`;
    }
    return `"${text.replace(/"/g, '""')}"`;
}
