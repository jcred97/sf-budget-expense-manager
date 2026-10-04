import getPhpRate from '@salesforce/apex/ExchangeRateController.getPhpRate';
import { fetchPhpExchangeRate } from 'c/expenseExchangeRateData';

jest.mock('@salesforce/apex/ExchangeRateController.getPhpRate', () => ({ default: jest.fn() }), {
    virtual: true
});

describe('PHP exchange-rate request', () => {
    beforeEach(() => jest.resetAllMocks());

    it('requests the original currency and transaction date and preserves the server rate result', async () => {
        const response = {
            sourceCurrency: 'USD',
            targetCurrency: 'PHP',
            requestedDate: '2026-10-03',
            effectiveDate: '2026-10-02',
            rate: '57.123456789'
        };
        getPhpRate.mockResolvedValue(response);
        const result = await fetchPhpExchangeRate({
            sourceCurrency: 'USD',
            requestedDate: '2026-10-03'
        });
        expect(getPhpRate).toHaveBeenCalledTimes(1);
        expect(getPhpRate).toHaveBeenCalledWith({
            request: { sourceCurrency: 'USD', requestedDate: '2026-10-03' }
        });
        expect(result).toBe(response);
    });

    it.each([undefined, null, ''])(
        'requests the current rate when the date is omitted (%s)',
        async requestedDate => {
            getPhpRate.mockResolvedValue({
                sourceCurrency: 'EUR',
                targetCurrency: 'PHP',
                rate: '61.00'
            });
            await fetchPhpExchangeRate({ sourceCurrency: 'EUR', requestedDate });
            expect(getPhpRate).toHaveBeenCalledWith({
                request: { sourceCurrency: 'EUR', requestedDate: null }
            });
        }
    );

    it('preserves Apex errors so the modal can show the actual rate failure', async () => {
        const error = {
            body: { message: 'Exchange rate is unavailable for this date.' },
            status: 503
        };
        getPhpRate.mockRejectedValue(error);
        await expect(
            fetchPhpExchangeRate({ sourceCurrency: 'USD', requestedDate: '2026-10-03' })
        ).rejects.toBe(error);
        expect(getPhpRate).toHaveBeenCalledTimes(1);
    });
});
