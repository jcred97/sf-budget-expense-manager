import { buildDashboardViewModel } from 'c/expenseDashboardViewModel';
import { buildExpensesViewModel } from 'c/expenseListViewModel';
import { buildRecurringViewModel } from 'c/recurringExpenseViewModel';

const VIEW_MODEL_CACHES = new WeakMap();

function resolveCachedViewModel(owner, cacheKey, inputs, buildViewModel) {
    let ownerCaches = VIEW_MODEL_CACHES.get(owner);
    if (!ownerCaches) {
        ownerCaches = {};
        VIEW_MODEL_CACHES.set(owner, ownerCaches);
    }

    const cache = ownerCaches[cacheKey] || { inputs: [], value: undefined };
    const matches =
        cache.inputs.length === inputs.length &&
        inputs.every((input, index) => Object.is(input, cache.inputs[index]));
    if (!matches) {
        ownerCaches[cacheKey] = { inputs, value: buildViewModel() };
    }
    return ownerCaches[cacheKey]?.value;
}

function resolveParams(owner, cacheKey, params, builder) {
    return resolveCachedViewModel(owner, cacheKey, Object.values(params), () => builder(params));
}

export function getExpensesViewModel(owner, params) {
    return resolveParams(owner, 'expenses', params, buildExpensesViewModel);
}

export function getDashboardViewModel(owner, params) {
    return resolveParams(owner, 'dashboard', params, buildDashboardViewModel);
}

export function getRecurringViewModel(owner, params) {
    return resolveParams(owner, 'recurring', params, buildRecurringViewModel);
}
