const DEFAULT_FOCUSABLE_SELECTOR =
    'button, [href], input, select, textarea, lightning-button, lightning-input, lightning-input-field, lightning-textarea, lightning-combobox, [tabindex]:not([tabindex="-1"])';

export function captureModalEnvironment() {
    const environment = {
        bodyOverflow: document.body.style.overflow,
        previouslyFocusedElement: document.activeElement
    };
    document.body.style.overflow = 'hidden';
    return environment;
}

export function restoreModalEnvironment(environment, { restoreFocus = false } = {}) {
    if (!environment) {
        return;
    }

    document.body.style.overflow = environment.bodyOverflow || '';
    const previousFocus = environment.previouslyFocusedElement;
    if (restoreFocus && previousFocus && typeof previousFocus.focus === 'function') {
        previousFocus.focus();
    }
}

export function getFocusableElements(template, selector = DEFAULT_FOCUSABLE_SELECTOR) {
    return Array.from(template.querySelectorAll(selector)).filter(element => !element.disabled);
}

export function trapTabFocus(
    event,
    focusableElements,
    activeElement,
    { preventWhenEmpty = false, recoverExternalFocus = false } = {}
) {
    if (event.key !== 'Tab') {
        return false;
    }

    if (focusableElements.length === 0) {
        if (preventWhenEmpty) {
            event.preventDefault();
        }
        return true;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (recoverExternalFocus && !focusableElements.includes(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus();
    } else if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
    } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
    }

    return true;
}
