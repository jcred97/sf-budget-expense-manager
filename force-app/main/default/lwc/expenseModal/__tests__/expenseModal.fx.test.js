import { createElement } from 'lwc';
import ExpenseModal from 'c/expenseModal';
import getPhpRate from '@salesforce/apex/ExchangeRateController.getPhpRate';

jest.mock('@salesforce/apex/ExchangeRateController.getPhpRate', () => ({ default: jest.fn() }), {
    virtual: true
});

const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};
const field = (element, name) => element.shadowRoot.querySelector(`[data-field="${name}"]`);
const button = (element, label) =>
    [...element.shadowRoot.querySelectorAll('lightning-button')].find(item => item.label === label);
const dateField = element =>
    [...element.shadowRoot.querySelectorAll('lightning-input-field')].find(
        item => item.fieldName === 'Expense_Date__c'
    );
const change = (input, value) => {
    input.value = value;
    input.dispatchEvent(new CustomEvent('change', { detail: { value } }));
};
const toggle = (element, checked) => {
    const input = [...element.shadowRoot.querySelectorAll('lightning-input')].find(
        item => item.type === 'toggle'
    );
    input.checked = checked;
    input.dispatchEvent(new CustomEvent('change'));
};
const quote = { rate: 56.25, effectiveDate: '2026-09-01', source: 'Reference test source' };
const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((accept, fail) => {
        resolve = accept;
        reject = fail;
    });
    return { promise, resolve, reject };
};
const loadForm = async element => {
    const form = element.shadowRoot.querySelector('lightning-record-edit-form');
    form.dispatchEvent(new CustomEvent('load', { detail: {} }));
    await flush();
    for (const input of element.shadowRoot.querySelectorAll('[data-fx-input]')) {
        input.reportValidity = jest.fn().mockReturnValue(true);
        input.setCustomValidity = jest.fn();
    }
    for (const name of ['category', 'bank']) {
        field(element, name).reportValidity = jest.fn().mockReturnValue(true);
    }
    form.submit = jest.fn();
    return form;
};
const mount = async () => {
    const element = createElement('c-expense-modal', { is: ExpenseModal });
    element.categoryOptions = [{ label: 'Groceries', value: 'category' }];
    element.isOpen = true;
    document.body.appendChild(element);
    await flush();
    const form = await loadForm(element);
    toggle(element, true);
    change(field(element, 'category'), 'category');
    change(field(element, 'originalCurrency'), 'USD');
    change(field(element, 'originalAmount'), '2');
    change(dateField(element), '2026-09-01');
    await flush();
    return { element, form };
};
const submit = form =>
    form.dispatchEvent(
        new CustomEvent('submit', {
            cancelable: true,
            detail: { fields: { Name: 'Foreign purchase', Expense_Date__c: '2026-09-01' } }
        })
    );

describe('foreign-currency quote lifecycle', () => {
    beforeEach(() => jest.resetAllMocks());
    afterEach(() => document.body.replaceChildren());

    it('blocks Save while fetching and submits the accepted quote after completion', async () => {
        const pending = deferred();
        getPhpRate.mockReturnValueOnce(pending.promise);
        const { element, form } = await mount();
        button(element, 'Get reference rate').click();
        await flush();
        expect(getPhpRate).toHaveBeenCalledWith({
            request: { sourceCurrency: 'USD', requestedDate: '2026-09-01' }
        });
        expect(button(element, 'Save').disabled).toBe(true);
        expect(field(element, 'exchangeRate').disabled).toBe(true);
        submit(form);
        expect(form.submit).not.toHaveBeenCalled();
        pending.resolve(quote);
        await flush();
        expect(button(element, 'Save').disabled).toBe(false);
        expect(field(element, 'exchangeRate').value).toBe('56.25');
        submit(form);
        expect(form.submit).toHaveBeenCalledWith(
            expect.objectContaining({
                Amount__c: '112.50',
                Exchange_Rate_Date__c: '2026-09-01',
                Exchange_Rate_Source__c: 'Reference test source'
            })
        );
    });

    it.each([
        ['date', 'resolves'],
        ['date', 'rejects'],
        ['currency', 'resolves'],
        ['currency', 'rejects']
    ])(
        'ignores an earlier quote that %s context change invalidates when it %s',
        async (context, outcome) => {
            const oldRequest = deferred();
            const newRequest = deferred();
            getPhpRate
                .mockReturnValueOnce(oldRequest.promise)
                .mockReturnValueOnce(newRequest.promise);
            const { element } = await mount();
            button(element, 'Get reference rate').click();
            await flush();
            // Currency input is disabled during fetching; this also exercises a queued change event.
            change(
                context === 'date' ? dateField(element) : field(element, 'originalCurrency'),
                context === 'date' ? '2026-09-10' : 'EUR'
            );
            await flush();
            expect(field(element, 'exchangeRate').value).toBe('');
            button(element, 'Get reference rate').click();
            await flush();
            if (outcome === 'resolves') oldRequest.resolve(quote);
            else oldRequest.reject(new Error('Old quote failed'));
            await flush();
            expect(field(element, 'exchangeRate').value).toBe('');
            expect(button(element, 'Save').disabled).toBe(true);
            expect(element.shadowRoot.textContent).not.toContain('Old quote failed');
            expect(element.shadowRoot.querySelector('[data-exchange-rate-status]')).not.toBeNull();
            newRequest.resolve({ ...quote, rate: 60, effectiveDate: '2026-09-10' });
            await flush();
            expect(field(element, 'exchangeRate').value).toBe('60');
            expect(button(element, 'Save').disabled).toBe(false);
            expect(getPhpRate).toHaveBeenLastCalledWith({
                request: {
                    sourceCurrency: context === 'currency' ? 'EUR' : 'USD',
                    requestedDate: context === 'date' ? '2026-09-10' : '2026-09-01'
                }
            });
        }
    );

    it.each(['resolves', 'rejects'])(
        'retains a manual rate when an older quote %s',
        async outcome => {
            const pending = deferred();
            getPhpRate.mockReturnValueOnce(pending.promise);
            const { element, form } = await mount();
            button(element, 'Get reference rate').click();
            await flush();
            // Covers a queued manual change arriving while the fetch disables the input.
            change(field(element, 'exchangeRate'), '57.5');
            await flush();
            if (outcome === 'resolves') pending.resolve(quote);
            else pending.reject(new Error('Old quote failed'));
            await flush();
            expect(field(element, 'exchangeRate').value).toBe('57.5');
            expect(element.shadowRoot.textContent).not.toContain('Old quote failed');
            submit(form);
            expect(form.submit).toHaveBeenCalledWith(
                expect.objectContaining({
                    Amount__c: '115.00',
                    Exchange_Rate_Source__c: 'Manual',
                    Exchange_Rate_Date__c: '2026-09-01'
                })
            );
        }
    );

    it('discards a pending quote after closing and reopening for a new expense', async () => {
        const pending = deferred();
        getPhpRate.mockReturnValueOnce(pending.promise);
        const { element } = await mount();
        button(element, 'Get reference rate').click();
        await flush();
        element.isOpen = false;
        await flush();
        element.isOpen = true;
        await flush();
        await loadForm(element);
        toggle(element, true);
        change(field(element, 'originalCurrency'), 'EUR');
        await flush();
        pending.resolve(quote);
        await flush();
        expect(field(element, 'originalCurrency').value).toBe('EUR');
        expect(field(element, 'exchangeRate').value).toBe('');
        expect(element.shadowRoot.querySelector('[data-exchange-rate-status]')).toBeNull();
    });

    it('ignores a disconnected request rejection after reconnecting', async () => {
        const pending = deferred();
        getPhpRate.mockReturnValueOnce(pending.promise);
        const { element } = await mount();
        button(element, 'Get reference rate').click();
        await flush();
        element.remove();
        pending.reject(new Error('Old request failed'));
        await flush();
        document.body.appendChild(element);
        await flush();
        await loadForm(element);
        expect(element.shadowRoot.textContent).not.toContain('Old request failed');
        expect(field(element, 'exchangeRate').value).toBe('');
        expect(element.shadowRoot.querySelector('[data-exchange-rate-status]')).toBeNull();
    });

    it('does not resurrect a quote after foreign currency is switched off', async () => {
        const pending = deferred();
        getPhpRate.mockReturnValueOnce(pending.promise);
        const { element, form } = await mount();
        button(element, 'Get reference rate').click();
        await flush();
        toggle(element, false);
        await flush();
        pending.resolve(quote);
        await flush();
        expect(field(element, 'exchangeRate').value).toBe('');
        expect(field(element, 'phpAmount').disabled).toBe(false);
        submit(form);
        expect(form.submit).toHaveBeenCalledWith(
            expect.objectContaining({
                Original_Amount__c: null,
                Original_Currency_Code__c: null,
                Exchange_Rate_To_PHP__c: null,
                Exchange_Rate_Date__c: null,
                Exchange_Rate_Source__c: null
            })
        );
    });

    it.each(['unavailable', 'incomplete'])(
        'recovers from an %s quote through an explicit retry',
        async failure => {
            if (failure === 'unavailable')
                getPhpRate.mockRejectedValueOnce(new Error('Rate service unavailable'));
            else getPhpRate.mockResolvedValueOnce({ rate: 56.25 });
            getPhpRate.mockResolvedValueOnce(quote);
            const { element, form } = await mount();
            button(element, 'Get reference rate').click();
            await flush();
            expect(element.shadowRoot.textContent).toContain(
                failure === 'unavailable' ? 'Rate service unavailable' : 'incomplete quote'
            );
            expect(button(element, 'Get reference rate').disabled).toBe(false);
            submit(form);
            expect(form.submit).not.toHaveBeenCalled();
            button(element, 'Get reference rate').click();
            await flush();
            expect(element.shadowRoot.textContent).not.toContain('incomplete quote');
            expect(element.shadowRoot.textContent).not.toContain('Rate service unavailable');
            expect(field(element, 'exchangeRate').value).toBe('56.25');
            submit(form);
            expect(form.submit).toHaveBeenCalledTimes(1);
        }
    );
});
