/** Always-on schema checks for app operations; database operations still enforce sharing and user mode. */
public inherited sharing class AppAccessChecks {
    public static void requireCreate(Schema.SObjectType objectType) {
        requireObject(objectType, 'create', objectType.getDescribe().isCreateable());
    }

    public static void requireRead(Schema.SObjectType objectType) {
        requireObject(objectType, 'read', objectType.getDescribe().isAccessible());
    }

    public static void requireUpdate(Schema.SObjectType objectType) {
        requireObject(objectType, 'edit', objectType.getDescribe().isUpdateable());
    }

    public static void requireDelete(Schema.SObjectType objectType) {
        requireObject(objectType, 'delete', objectType.getDescribe().isDeletable());
    }

    public static void requireReadable(List<Schema.SObjectField> fields) {
        requireFields(fields, 'read');
    }

    public static void requireCreateable(List<Schema.SObjectField> fields) {
        requireFields(fields, 'create');
    }

    public static void requireUpdateable(List<Schema.SObjectField> fields) {
        requireFields(fields, 'edit');
    }

    private static void requireObject(Schema.SObjectType objectType, String operation, Boolean allowed) {
        if (!allowed) {
            fail('You do not have permission to ' + operation + ' ' + objectType.getDescribe().getLabelPlural() + '.');
        }
    }

    private static void requireFields(List<Schema.SObjectField> fields, String operation) {
        for (Schema.SObjectField field : fields) {
            Schema.DescribeFieldResult description = field.getDescribe();
            Boolean allowed;
            if (operation == 'read') {
                allowed = description.isAccessible();
            } else if (operation == 'create') {
                allowed = description.isCreateable();
            } else {
                allowed = description.isUpdateable();
            }
            if (!allowed) {
                fail('You do not have permission to ' + operation + ' field ' + description.getLabel() + '.');
            }
        }
    }

    private static void fail(String message) {
        AuraHandledException failure = new AuraHandledException(message);
        failure.setMessage(message);
        throw failure;
    }
}
