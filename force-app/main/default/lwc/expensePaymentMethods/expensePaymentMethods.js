export const CASH = 'Cash';
const NONCASH_TYPES = ['Debit Card', 'Credit Card', 'Bank Transfer', 'Bank Payment'];

export function paymentMethodOptions(bankOptions, assignmentId, savedType, preserveSavedType) {
    const bank = bankOptions.find(option => option.value === assignmentId);
    const supported = bank?.supportedTransactionTypes || [];
    const methods = assignmentId ? NONCASH_TYPES.filter(type => supported.includes(type)) : [CASH];
    const options = methods.map(value => ({
        label: value,
        value
    }));
    if (preserveSavedType && savedType && !options.some(option => option.value === savedType)) {
        options.push({
            label: `${savedType} (Saved; unavailable for new payments)`,
            value: savedType
        });
    }
    return options;
}

export function normalizePaymentMethod(value, options, preserveBlank = false) {
    if (!value && preserveBlank) return '';
    return options.some(option => option.value === value) ? value : options[0]?.value || '';
}
