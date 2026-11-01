export const CASH = 'Cash';
export const NO_BANK_VALUE = '__NO_BANK__';
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

// An unchanged historical payment may keep a method that is no longer offered.
// New records (including duplicates) and explicit bank changes use today's methods.
export function paymentSelection({
    bankOptions,
    bankAssignmentValue,
    legacyBank,
    isEditMode,
    bankSelectionTouched,
    savedType,
    value
}) {
    const assignmentId =
        bankAssignmentValue && bankAssignmentValue !== NO_BANK_VALUE ? bankAssignmentValue : null;
    const preserveSaved = isEditMode && !bankSelectionTouched;
    const preserveBlank = preserveSaved && !savedType;
    const options = paymentMethodOptions(
        bankOptions,
        legacyBank ? '__LEGACY_BANK__' : assignmentId,
        savedType,
        preserveSaved
    );
    return {
        assignmentId,
        options,
        value: normalizePaymentMethod(value, options, preserveBlank),
        unavailable: !options.length && !preserveBlank
    };
}

// Preserve untouched legacy/read-only bank values; an explicit change clears the
// old text bank. The caller still filters the result against field permissions.
export function paymentBankFields(
    fields,
    { assignmentId, legacyBank, touched, disabled, fieldKeys = {} }
) {
    const result = { ...fields };
    const assignment = fieldKeys.assignment || 'Bank_Assignment__c';
    const legacy = fieldKeys.legacy || 'Bank__c';
    if (assignment !== 'Bank_Assignment__c') delete result.Bank_Assignment__c;
    if (legacy !== 'Bank__c') delete result.Bank__c;
    if (!legacyBank) result[assignment] = assignmentId;
    if (touched) result[legacy] = null;
    if (disabled && !touched) {
        delete result[assignment];
        delete result[legacy];
    }
    return result;
}
