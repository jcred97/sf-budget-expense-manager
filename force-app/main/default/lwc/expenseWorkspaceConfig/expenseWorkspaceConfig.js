export const WORKSPACE_VIEWS = Object.freeze({
    DASHBOARD: 'dashboard',
    EXPENSES: 'expenses',
    RECURRING: 'recurring',
    GROUP_SETTINGS: 'group-settings',
    APP_MANAGEMENT: 'app-management'
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
        key: WORKSPACE_VIEWS.GROUP_SETTINGS,
        label: 'Group Settings',
        iconName: 'utility:settings'
    },
    {
        key: WORKSPACE_VIEWS.APP_MANAGEMENT,
        label: 'App Management',
        iconName: 'utility:apps'
    }
]);

export function buildWorkspaceNavItems(activeView) {
    return WORKSPACE_VIEW_CONFIG.map(view => ({
        ...view,
        className: `workspace-nav-item ${activeView === view.key ? 'is-active' : ''}`,
        ariaCurrent: activeView === view.key ? 'page' : null
    }));
}
