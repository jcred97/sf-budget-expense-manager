export const WORKSPACE_VIEWS = Object.freeze({
    DASHBOARD: 'dashboard',
    EXPENSES: 'expenses',
    RECURRING: 'recurring',
    MANAGE: 'manage'
});

const WORKSPACE_VIEW_CONFIG = Object.freeze([
    {
        key: WORKSPACE_VIEWS.DASHBOARD,
        label: 'Dashboard',
        iconName: 'utility:chart'
    },
    {
        key: WORKSPACE_VIEWS.EXPENSES,
        label: 'Expenses',
        iconName: 'utility:table'
    },
    {
        key: WORKSPACE_VIEWS.RECURRING,
        label: 'Recurring',
        iconName: 'utility:sync'
    },
    {
        key: WORKSPACE_VIEWS.MANAGE,
        label: 'Manage',
        iconName: 'utility:settings'
    }
]);

export function buildWorkspaceNavItems(activeView) {
    return WORKSPACE_VIEW_CONFIG.map(view => ({
        ...view,
        className: `workspace-nav-item ${activeView === view.key ? 'is-active' : ''}`,
        ariaCurrent: activeView === view.key ? 'page' : null
    }));
}
