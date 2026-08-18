export const WORKSPACE_VIEWS = Object.freeze({
    DASHBOARD: 'dashboard',
    EXPENSES: 'expenses',
    RECURRING: 'recurring'
});

const WORKSPACE_VIEW_CONFIG = Object.freeze([
    {
        key: WORKSPACE_VIEWS.DASHBOARD,
        label: 'Dashboard',
        title: 'Dashboard',
        subtitle: 'Overview of monthly spending',
        iconName: 'utility:chart'
    },
    {
        key: WORKSPACE_VIEWS.EXPENSES,
        label: 'Expenses',
        title: 'Expenses',
        subtitle: 'Review, filter, export, and maintain expenses',
        iconName: 'utility:table'
    },
    {
        key: WORKSPACE_VIEWS.RECURRING,
        label: 'Recurring',
        title: 'Recurring',
        subtitle: 'Monitor recurring expense templates',
        iconName: 'utility:sync'
    }
]);

export function buildWorkspaceNavItems(activeView) {
    return WORKSPACE_VIEW_CONFIG.map(view => ({
        ...view,
        className: `workspace-nav-item ${activeView === view.key ? 'is-active' : ''}`,
        ariaCurrent: activeView === view.key ? 'page' : null
    }));
}

export function getWorkspaceViewConfig(activeView) {
    return WORKSPACE_VIEW_CONFIG.find(view => view.key === activeView) || WORKSPACE_VIEW_CONFIG[0];
}
