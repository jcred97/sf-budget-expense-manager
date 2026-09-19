/** User-mode keyset pagination; no OFFSET limit or client-supplied query fragments. */
public with sharing class ExpensePageService {
    private static final String PAGE_ORDER = 'ORDER BY Expense_Date__c DESC NULLS LAST, Transaction_Time__c DESC NULLS LAST, CreatedDate DESC, Id DESC ';

    /**
     * Returns a bounded page; totals describe all matches, not only this page.
     * @param filters Expense group, category and date constraints.
     * @param pagination Search, bounded page size and optional continuation cursor.
     * @return One ordered page and a cursor when more records exist.
     */
    public static ExpensePageDto getPage(
        ExpenseFilterRequest filters,
        ExpensePageRequest pagination
    ) {
        ExpensePageRequest options = pagination == null ? new ExpensePageRequest() : pagination;
        Integer size = options.pageSize == null ? 20 : Math.max(1, Math.min(200, options.pageSize));
        Map<String, Object> binds = new Map<String, Object>();
        String predicate =
            ExpenseQueryService.expenseWhere(filters, binds) +
            searchWhere(options.searchTerm, binds);
        String scope = EncodingUtil.convertToHex(
            Crypto.generateDigest('SHA-256', Blob.valueOf(JSON.serialize(binds)))
        );
        ExpensePageDto page = new ExpensePageDto();
        String after = '';
        if (String.isBlank(options.cursor)) {
            List<AggregateResult> totals = Database.queryWithBinds(
                'SELECT COUNT(Id) qty, SUM(Amount__c) total FROM Expense__c ' + predicate,
                binds,
                AccessLevel.USER_MODE
            );
            page.totalCount = (Integer) totals[0].get('qty');
            page.totalAmount = (Decimal) totals[0].get('total');
            if (page.totalAmount == null) {
                page.totalAmount = 0;
            }
        } else {
            after = afterWhere(readCursor(options.cursor, scope), binds);
        }
        binds.put('rowLimit', size + 1);
        page.rows = Database.queryWithBinds(
            ExpenseQueryService.expenseSelect() +
                predicate +
                after +
                PAGE_ORDER +
                'LIMIT :rowLimit',
            binds,
            AccessLevel.USER_MODE
        );
        page.hasMore = page.rows.size() > size;
        if (page.hasMore) {
            page.rows.remove(size);
            PageCursor next = new PageCursor();
            Expense__c last = page.rows[page.rows.size() - 1];
            next.expenseDate = last.Expense_Date__c;
            next.transactionTime = last.Transaction_Time__c;
            next.created = last.CreatedDate;
            next.recordId = last.Id;
            next.scope = scope;
            page.nextCursor = EncodingUtil.base64Encode(Blob.valueOf(JSON.serialize(next)));
        }
        return page;
    }

    private static PageCursor readCursor(String cursor, String scope) {
        try {
            PageCursor parsed = (PageCursor) JSON.deserializeStrict(
                EncodingUtil.base64Decode(cursor).toString(),
                PageCursor.class
            );
            if (
                parsed == null ||
                parsed.scope != scope ||
                parsed.created == null ||
                parsed.recordId == null ||
                parsed.recordId.getSObjectType() != Expense__c.SObjectType
            ) {
                throw new IllegalArgumentException('Invalid page cursor');
            }
            return parsed;
        } catch (Exception error) {
            throw new AuraHandledException(
                'This expense page is no longer valid. Refresh the expense list.'
            );
        }
    }

    private static String afterWhere(PageCursor cursor, Map<String, Object> binds) {
        binds.put('cursorDate', cursor.expenseDate);
        binds.put('cursorTime', cursor.transactionTime);
        binds.put('cursorCreated', cursor.created);
        binds.put('cursorId', cursor.recordId);
        String older = '(CreatedDate < :cursorCreated OR (CreatedDate = :cursorCreated AND Id < :cursorId))';
        older = '(Transaction_Time__c = :cursorTime AND ' + older + ')';
        if (cursor.transactionTime != null) {
            older =
                '(Transaction_Time__c < :cursorTime OR Transaction_Time__c = null OR ' +
                older +
                ')';
        }
        older = '(Expense_Date__c = :cursorDate AND ' + older + ')';
        if (cursor.expenseDate != null) {
            older = '(Expense_Date__c < :cursorDate OR Expense_Date__c = null OR ' + older + ')';
        }
        return 'AND ' + older + ' ';
    }

    private static String searchWhere(String searchTerm, Map<String, Object> binds) {
        if (String.isBlank(searchTerm)) {
            return '';
        }
        String term = searchTerm.trim().toLowerCase();
        binds.put(
            'search',
            '%' + term.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
        );
        binds.put('bankValues', matchingValues(Expense__c.Bank__c, term));
        binds.put('typeValues', matchingValues(Expense__c.Transaction_Type__c, term));
        return 'AND (Name LIKE :search OR Category__r.Name LIKE :search OR Category__r.Expense_Group__r.Name LIKE :search ' +
            'OR Bank_Assignment__r.Bank__r.Name LIKE :search ' +
            'OR (Bank_Assignment__r.Bank__r.Name = null AND Bank__c IN :bankValues) ' +
            'OR Transaction_Type__c IN :typeValues OR Original_Currency_Code__c LIKE :search) ';
    }

    private static List<String> matchingValues(Schema.SObjectField field, String term) {
        List<String> matches = new List<String>();
        for (Schema.PicklistEntry entry : field.getDescribe().getPicklistValues()) {
            if (entry.getValue().toLowerCase().contains(term)) {
                matches.add(entry.getValue());
            }
        }
        return matches;
    }

    private class PageCursor {
        public Date expenseDate;
        public Time transactionTime;
        public Datetime created;
        public Id recordId;
        public String scope;
    }
}
