function normalizeMessage(message) {
    if (typeof message !== 'string') {
        return undefined;
    }

    const normalizedMessage = message.trim();
    return normalizedMessage || undefined;
}

function getEntryMessages(entries) {
    if (!Array.isArray(entries)) {
        return [];
    }

    return entries.map(entry => normalizeMessage(entry?.message)).filter(Boolean);
}

function getFieldErrorMessages(fieldErrors) {
    if (!fieldErrors || typeof fieldErrors !== 'object') {
        return [];
    }

    return Object.values(fieldErrors).flatMap(getEntryMessages);
}

function extractMessages(error) {
    if (!error) {
        return [];
    }

    const directMessage = normalizeMessage(error);
    if (directMessage) {
        return [directMessage];
    }

    const recordFormDetailMessage = !error.body ? normalizeMessage(error.detail) : undefined;
    if (recordFormDetailMessage) {
        return [recordFormDetailMessage];
    }

    const bodyMessage = normalizeMessage(error.body);
    if (bodyMessage) {
        return [bodyMessage];
    }

    if (Array.isArray(error.body)) {
        return getEntryMessages(error.body);
    }

    const body = error.body && typeof error.body === 'object' ? error.body : error;
    const structuredMessages = [
        ...getEntryMessages(body.pageErrors),
        ...getFieldErrorMessages(body.fieldErrors),
        ...getEntryMessages(body.output?.errors),
        ...getFieldErrorMessages(body.output?.fieldErrors)
    ];
    if (structuredMessages.length > 0) {
        return structuredMessages;
    }

    const fallbackCandidates = [body.message, error.message, error.statusText];
    const fallbackMessage = fallbackCandidates.map(normalizeMessage).find(Boolean);
    return fallbackMessage ? [fallbackMessage] : [];
}

/**
 * Reduces one or more Salesforce or JavaScript errors into user-facing messages.
 *
 * @param {object|object[]|string|null|undefined} errors Error value or values to normalize.
 * @returns {string[]} Deduplicated, non-empty error messages.
 */
export function reduceErrors(errors) {
    const errorList = Array.isArray(errors) ? errors : [errors];
    return [...new Set(errorList.flatMap(extractMessages))];
}

export function getErrorMessage(errors, fallback) {
    const messages = reduceErrors(errors);
    return messages.length > 0 ? messages.join('; ') : fallback;
}
