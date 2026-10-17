// UI capabilities improve feedback; LDS and Apex still authorize every request.
export function canReadObject(info) {
    return info?.queryable === true;
}

export function canCreateObject(info) {
    return info?.createable === true;
}

export function canUpdateObject(info) {
    return info?.updateable === true;
}

export function canDeleteObject(info) {
    return info?.deletable === true;
}

function fieldInfo(info, field) {
    const name = typeof field === 'string' ? field.split('.').pop() : field?.fieldApiName;
    if (!name) return undefined;
    if (info?.fields?.[name]) return info.fields[name];
    // Schema imports resolve namespaces; custom controls may also supply local field names.
    const parts = info?.apiName?.split('__') || [];
    const namespace = parts.length === 3 ? parts[0] : '';
    return namespace && name.endsWith('__c') && name.split('__').length === 2
        ? info?.fields?.[`${namespace}__${name}`]
        : undefined;
}

export function canReadField(info, field) {
    // UI API omits fields the user cannot read.
    return canReadObject(info) && Boolean(fieldInfo(info, field));
}

export function canCreateField(info, field) {
    return canCreateObject(info) && fieldInfo(info, field)?.createable === true;
}

export function canUpdateField(info, field) {
    return canUpdateObject(info) && fieldInfo(info, field)?.updateable === true;
}

export function canWriteField(info, field, mode) {
    if (mode === 'create') return canCreateField(info, field);
    if (mode === 'update') return canUpdateField(info, field);
    return false;
}

export function hasReadableFields(info, fields) {
    return canReadObject(info) && fields.every(field => canReadField(info, field));
}

export function hasWritableFields(info, fields, mode) {
    const allowed =
        mode === 'create' ? canCreateObject(info) : mode === 'update' && canUpdateObject(info);
    return Boolean(allowed) && fields.every(field => canWriteField(info, field, mode));
}

export function filterWritableFields(info, values, mode) {
    return Object.fromEntries(
        Object.entries(values || {}).filter(([field]) => canWriteField(info, field, mode))
    );
}
