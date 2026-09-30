import { createElement } from 'lwc';
import ExpenseList from 'c/expenseList';
import { fetchExpensePage, fetchAllExpenseRows } from 'c/expenseWorkspaceData';
import { downloadExpensesCsv } from 'c/expenseCsvExport';
import LightningConfirm from 'lightning/confirm';
import deleteExpense from '@salesforce/apex/ExpenseController.deleteExpense';
import deleteExpenses from '@salesforce/apex/ExpenseController.deleteExpenses';
jest.mock('lightning/confirm', () => ({ open: jest.fn() }));
jest.mock('c/expenseWorkspaceData', () => ({
    fetchExpensePage: jest.fn(),
    fetchAllExpenseRows: jest.fn()
}));
jest.mock('c/expenseCsvExport', () => ({ downloadExpensesCsv: jest.fn() }));
jest.mock('@salesforce/apex/ExpenseController.deleteExpense', () => ({ default: jest.fn() }), {
    virtual: true
});
jest.mock('@salesforce/apex/ExpenseController.deleteExpenses', () => ({ default: jest.fn() }), {
    virtual: true
});
jest.mock('@salesforce/apex/ExchangeRateController.getPhpRate', () => ({ default: jest.fn() }), {
    virtual: true
});
const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};
const row = id => ({ id, name: id, amount: 10, expenseDate: '2026-09-01' });
const firstPage = () => ({
    rows: [row('1')],
    totalCount: 25,
    totalAmount: 250,
    hasMore: true,
    nextCursor: 'next'
});
const expenseButton = (element, label) =>
    [...element.shadowRoot.querySelectorAll('lightning-button')].find(
        button => button.label === label
    );
const rowIds = element =>
    [...element.shadowRoot.querySelectorAll('input[type="checkbox"]')].map(
        input => input.dataset.id
    );
const selectedRows = element =>
    [...element.shadowRoot.querySelectorAll('input[type="checkbox"]')].filter(
        input => input.checked
    );
const dispatch = (element, type, detail) => {
    const screen = element.shadowRoot;
    if (type === 'filterchange') {
        screen
            .querySelector(`[data-field="${detail.field}"]`)
            .dispatchEvent(new CustomEvent('change', { detail: { value: detail.value } }));
    } else if (type === 'selectionchange') {
        const input = screen.querySelector(`input[data-id="${detail.id}"]`);
        input.checked = detail.selected;
        input.dispatchEvent(new CustomEvent('change'));
    } else if (type === 'rowaction') {
        screen
            .querySelector(`lightning-button-menu[data-id="${detail.id}"]`)
            .dispatchEvent(new CustomEvent('select', { detail: { value: detail.action } }));
    } else {
        const labels = { bulkdelete: 'Delete Selected', loadmore: 'Load More', retry: 'Retry' };
        const button = expenseButton(element, labels[type]) || expenseButton(element, 'Loading...');
        button.click();
    }
};

async function mount() {
    const element = createElement('c-expense-list', { is: ExpenseList });
    element.expenseGroupId = 'group';
    element.active = true;
    document.body.appendChild(element);
    await flush();
    return element;
}
const changeGroup = element => {
    element.expenseGroupId = 'other-group';
};
describe('expense screen', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        LightningConfirm.open.mockResolvedValue(true);
        fetchExpensePage.mockResolvedValue(firstPage());
    });
    afterEach(() => {
        document.body.replaceChildren();
        jest.useRealTimers();
    });
    describe.each(['single', 'bulk'])('%s deletion rollback', mode => {
        const startDelete = async element => {
            if (mode === 'bulk') {
                dispatch(element, 'selectionchange', { id: '1', selected: true });
                dispatch(element, 'selectionchange', { id: '3', selected: true });
                await flush();
                dispatch(element, 'bulkdelete');
            } else {
                dispatch(element, 'rowaction', { action: 'delete', id: '1' });
            }
        };

        it.each(['unchanged', 'filter', 'group'])(
            'restores only the original list when context is %s',
            async context => {
                fetchExpensePage.mockResolvedValueOnce({
                    ...firstPage(),
                    rows: [row('1'), row('2'), row('3')]
                });
                const element = await mount();
                const deleteMock = mode === 'bulk' ? deleteExpenses : deleteExpense;
                let rejectDelete;
                deleteMock.mockImplementationOnce(
                    () =>
                        new Promise((resolve, reject) => {
                            rejectDelete = reject;
                        })
                );
                await startDelete(element);
                await flush();
                expect(deleteMock).toHaveBeenCalledTimes(1);
                expect(rowIds(element)).toEqual(mode === 'bulk' ? ['2'] : ['2', '3']);

                if (context !== 'unchanged') {
                    fetchExpensePage.mockResolvedValueOnce({
                        rows: [row('new')],
                        totalCount: 1,
                        totalAmount: 10,
                        hasMore: false
                    });
                    if (context === 'filter') {
                        dispatch(element, 'filterchange', {
                            field: 'categoryId',
                            value: 'another'
                        });
                    } else {
                        changeGroup(element);
                    }
                    await flush();
                    dispatch(element, 'selectionchange', { id: 'new', selected: true });
                }

                rejectDelete(new Error('Deletion rejected'));
                await flush();

                expect(rowIds(element)).toEqual(
                    context === 'unchanged' ? ['1', '2', '3'] : ['new']
                );
                expect(selectedRows(element).length).toBe(
                    context === 'unchanged' ? (mode === 'bulk' ? 2 : 0) : 1
                );
                expect(element.shadowRoot.querySelector('input[type="checkbox"]').checked).toBe(
                    context !== 'unchanged' || mode === 'bulk'
                );
            }
        );

        it('does not delete after the list changes while confirmation is pending', async () => {
            fetchExpensePage.mockResolvedValueOnce({ ...firstPage(), rows: [row('1'), row('3')] });
            const element = await mount();
            let confirmDelete;
            LightningConfirm.open.mockImplementationOnce(
                () =>
                    new Promise(resolve => {
                        confirmDelete = resolve;
                    })
            );
            await startDelete(element);
            dispatch(element, 'filterchange', { field: 'categoryId', value: 'another' });
            await flush();
            confirmDelete(true);
            await flush();
            expect(deleteExpense).not.toHaveBeenCalled();
            expect(deleteExpenses).not.toHaveBeenCalled();
        });
    });
    it('fetches a cursor page once, keeps selection and full-result totals, and ends pagination', async () => {
        const element = await mount();
        expect(fetchExpensePage).toHaveBeenCalledWith(
            expect.objectContaining({ pageSize: 20, cursor: null })
        );
        dispatch(element, 'selectionchange', { id: '1', selected: true });
        let resolvePage;
        fetchExpensePage.mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    resolvePage = resolve;
                })
        );
        dispatch(element, 'loadmore');
        dispatch(element, 'loadmore');
        expect(fetchExpensePage).toHaveBeenCalledTimes(2);
        expect(fetchExpensePage.mock.calls[1][0]).toEqual(
            expect.objectContaining({ pageSize: 10, cursor: 'next' })
        );
        resolvePage({ rows: [row('2')], hasMore: false });
        await flush();

        expect(element.shadowRoot.querySelector('.table-status').textContent).toBe(
            'Showing 2 of 25'
        );
        expect(element.shadowRoot.querySelector('.expenses-total strong').textContent).toContain(
            '250.00'
        );
        expect(selectedRows(element).length).toBe(1);
        expect(expenseButton(element, 'Load More')).toBeUndefined();
    });
    it('ignores a late page after a filter change and debounces server search', async () => {
        jest.useFakeTimers();
        const element = await mount();
        let resolveOld;
        fetchExpensePage.mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    resolveOld = resolve;
                })
        );
        dispatch(element, 'loadmore');
        dispatch(element, 'filterchange', { field: 'searchTerm', value: 'new' });
        dispatch(element, 'filterchange', { field: 'searchTerm', value: 'newer' });
        fetchExpensePage.mockResolvedValueOnce({
            rows: [row('newer')],
            totalCount: 1,
            totalAmount: 10,
            hasMore: false
        });
        jest.advanceTimersByTime(300);
        await flush();
        resolveOld({ rows: [row('stale')], hasMore: false });
        await flush();
        expect(fetchExpensePage).toHaveBeenCalledTimes(3);
        expect(fetchExpensePage.mock.calls[2][0]).toEqual(
            expect.objectContaining({ searchTerm: 'newer', cursor: null })
        );
        expect(rowIds(element)).toEqual(['newer']);
    });
    it('preserves loaded rows and retries the same cursor after a failed page', async () => {
        const element = await mount();
        fetchExpensePage.mockRejectedValueOnce(new Error('Connection lost'));
        dispatch(element, 'loadmore');
        await flush();
        expect(element.shadowRoot.querySelector('[role="alert"]').textContent).toContain(
            'Connection lost'
        );
        expect(rowIds(element)).toHaveLength(1);
        fetchExpensePage.mockResolvedValueOnce({ rows: [row('2')], hasMore: false });
        dispatch(element, 'retry');
        await flush();
        expect(fetchExpensePage.mock.calls[2][0].cursor).toBe('next');
        expect(element.shadowRoot.querySelector('[role="alert"]')).toBeNull();
    });
    it('does not print a report from a previous group', async () => {
        const element = await mount();
        let finishReport;
        fetchAllExpenseRows.mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    finishReport = resolve;
                })
        );
        const print = jest.spyOn(window, 'print').mockImplementation(() => {});
        expenseButton(element, 'Print / PDF').click();
        changeGroup(element);
        await flush();
        finishReport([row('old-group')]);
        await flush();
        expect(print).not.toHaveBeenCalled();
        expect(element.shadowRoot.querySelector('c-expense-print-report')).toBeNull();
        print.mockRestore();
    });
    it('renders every report row before opening print', async () => {
        const element = await mount();
        fetchAllExpenseRows.mockResolvedValue([row('1'), row('unloaded')]);
        const print = jest.spyOn(window, 'print').mockImplementation(() => {
            const report = element.shadowRoot.querySelector('c-expense-print-report');
            expect(report.viewModel.expenseCount).toBe(2);
            expect(report.shadowRoot.querySelectorAll('tbody tr')).toHaveLength(2);
        });
        [...element.shadowRoot.querySelectorAll('lightning-button')]
            .find(button => button.label === 'Print / PDF')
            .click();
        await flush();
        await flush();
        expect(print).toHaveBeenCalledTimes(1);
        print.mockRestore();
    });
    it('does not export after a filter change while the report is loading', async () => {
        const element = await mount();
        let resolveReport;
        fetchAllExpenseRows.mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    resolveReport = resolve;
                })
        );
        [...element.shadowRoot.querySelectorAll('lightning-button')]
            .find(button => button.label === 'Export CSV')
            .click();
        dispatch(element, 'filterchange', { field: 'categoryId', value: 'another' });
        resolveReport([row('stale')]);
        await flush();
        expect(downloadExpensesCsv).not.toHaveBeenCalled();
    });
    it('exports all matching rows, including rows not loaded in the list', async () => {
        const element = await mount();
        fetchAllExpenseRows.mockResolvedValue([row('1'), row('unloaded')]);
        [...element.shadowRoot.querySelectorAll('lightning-button')]
            .find(button => button.label === 'Export CSV')
            .click();
        await flush();
        expect(downloadExpensesCsv).toHaveBeenCalledWith(
            [row('1'), row('unloaded')],
            expect.any(String)
        );
        expect(rowIds(element)).toHaveLength(1);
    });
});
