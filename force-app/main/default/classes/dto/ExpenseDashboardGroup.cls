/** One dashboard display label, canonical PHP total and expense count. */
public class ExpenseDashboardGroup implements Comparable {
    @AuraEnabled
    public String name { get; set; }
    @AuraEnabled
    public Decimal total { get; set; }
    @AuraEnabled
    public Integer count { get; set; }

    public ExpenseDashboardGroup(String name, Decimal total, Integer count) {
        this.name = name;
        this.total = total == null ? 0 : total;
        this.count = count;
    }

    public Integer compareTo(Object other) {
        ExpenseDashboardGroup otherGroup = (ExpenseDashboardGroup) other;
        if (total != otherGroup.total) {
            return total > otherGroup.total ? -1 : 1;
        }
        return name.compareTo(otherGroup.name);
    }
}
