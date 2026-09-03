/** Boundary for resolving the Salesforce organization's accounting currency. */
public interface OrganizationCurrencyProvider {
    /**
     * Returns the organization currency as a three-letter ISO code.
     *
     * @return Salesforce organization currency code.
     */
    String getCurrencyCode();
}
