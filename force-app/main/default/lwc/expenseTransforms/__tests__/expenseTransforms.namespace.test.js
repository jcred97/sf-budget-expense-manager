import { formatCurrency, formatDate, formatPHP, formatTime } from 'c/expenseFormatters';

const fields = [
    'Amount__c',
    'Expense_Date__c',
    'Transaction_Time__c',
    'Category__c',
    'Category__r.Name',
    'Category__r.Expense_Group__r.Name',
    'Bank_Assignment__c',
    'Bank_Assignment__r.Active__c',
    'Bank_Assignment__r.Bank__c',
    'Bank_Assignment__r.Bank__r.Name',
    'Bank_Assignment__r.Bank__r.Active__c',
    'Bank__c',
    'Transaction_Type__c',
    'Original_Amount__c',
    'Original_Currency_Code__c',
    'Exchange_Rate_To_PHP__c',
    'Exchange_Rate_Date__c',
    'Exchange_Rate_Source__c'
];

function mapperForNamespace(namespace) {
    fields.forEach(field => {
        const qualifiedPath = field
            .split('.')
            .map(part => {
                return namespace && (part.endsWith('__c') || part.endsWith('__r'))
                    ? `${namespace}__${part}`
                    : part;
            })
            .join('.');
        jest.doMock(
            `@salesforce/schema/Expense__c.${field}`,
            () => ({
                default: {
                    objectApiName: namespace ? `${namespace}__Expense__c` : 'Expense__c',
                    fieldApiName: qualifiedPath
                }
            }),
            { virtual: true }
        );
    });
    let mapper;
    jest.isolateModules(() => {
        mapper = require('c/expenseTransforms').mapExpenseRow;
    });
    return mapper;
}

const namespacedExpense = {
    Id: 'expense',
    Name: 'Groceries',
    bemgr__Amount__c: 125,
    other__Amount__c: 999,
    bemgr__Expense_Date__c: '2026-10-21',
    bemgr__Transaction_Time__c: '12:30:00.000Z',
    bemgr__Category__c: 'category',
    bemgr__Category__r: { Name: 'Food', bemgr__Expense_Group__r: { Name: 'Home' } },
    bemgr__Bank_Assignment__c: 'assignment',
    bemgr__Bank_Assignment__r: {
        bemgr__Active__c: true,
        bemgr__Bank__c: 'bank',
        bemgr__Bank__r: { Name: 'BPI', bemgr__Active__c: true }
    },
    bemgr__Bank__c: 'Old bank',
    bemgr__Transaction_Type__c: 'Debit Card',
    bemgr__Original_Amount__c: 2.5,
    bemgr__Original_Currency_Code__c: 'USD',
    bemgr__Exchange_Rate_To_PHP__c: 50,
    bemgr__Exchange_Rate_Date__c: '2026-10-21',
    bemgr__Exchange_Rate_Source__c: 'Exchange Rates API'
};

describe('expense SObject mapping with package schema tokens', () => {
    it('reads actual qualified direct and relationship keys without taking another package field', () => {
        const map = mapperForNamespace('bemgr');
        const result = map(namespacedExpense);
        expect(result).toMatchObject({
            id: 'expense',
            name: 'Groceries',
            recordLink: '/expense',
            amount: 125,
            amountFormatted: formatPHP(125),
            expenseDate: '2026-10-21',
            expenseDateFormatted: formatDate('2026-10-21'),
            transactionTimeDisplay: formatTime('12:30:00.000Z'),
            category: 'Food',
            categoryId: 'category',
            expenseGroup: 'Home',
            bank: 'BPI',
            bankAssignmentId: 'assignment',
            bankId: 'bank',
            bankAssignmentActive: true,
            legacyBank: 'Old bank',
            transactionType: 'Debit Card',
            originalAmount: 2.5,
            originalCurrencyCode: 'USD',
            exchangeRateToPhp: 50,
            exchangeRateDate: '2026-10-21',
            exchangeRateSource: 'Exchange Rates API',
            hasForeignCurrency: true,
            originalAmountFormatted: formatCurrency(2.5, 'USD')
        });
    });

    it('preserves absent relationship and currency fallbacks in a packaged record', () => {
        const map = mapperForNamespace('bemgr');
        expect(
            map({ Id: 'cash', bemgr__Amount__c: 0, bemgr__Transaction_Type__c: 'Cash' })
        ).toMatchObject({
            amount: 0,
            amountFormatted: formatPHP(0),
            categoryDisplay: 'Uncategorized',
            bankDisplay: 'No bank',
            bankAssignmentActive: false,
            transactionType: 'Cash',
            hasForeignCurrency: false
        });
        expect(map({ bemgr__Bank__c: 'Legacy bank' }).bankDisplay).toBe('Legacy bank');
    });

    it('keeps the unnamespaced development-org payload working', () => {
        const map = mapperForNamespace('');
        expect(
            map({ Amount__c: 125, Category__r: { Name: 'Food' }, Transaction_Type__c: 'Cash' })
        ).toMatchObject({
            amount: 125,
            amountFormatted: formatPHP(125),
            category: 'Food',
            transactionType: 'Cash'
        });
    });
});
