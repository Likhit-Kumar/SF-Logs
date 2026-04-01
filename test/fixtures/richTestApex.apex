// Rich test script to generate a debug log with multiple section types
// Generates: SOQL, DML, exceptions, debug messages, governor limit usage

// 1. SOQL queries - including one that returns 0 rows (silent failure pattern)
List<Account> accounts = [SELECT Id, Name FROM Account LIMIT 5];
System.debug('Found ' + accounts.size() + ' accounts');

List<Contact> noResults = [SELECT Id FROM Contact WHERE LastName = 'ZZZZ_NONEXISTENT_ZZZZZ'];
System.debug('Zero-row query returned: ' + noResults.size() + ' records — this is a silent data issue');

// 2. DML operations
Account testAcc = new Account(Name = 'SF-Log-MCP Test Account ' + DateTime.now().format());
insert testAcc;
System.debug('Inserted test account: ' + testAcc.Id);

testAcc.Description = 'Updated by sf-log-mcp integration test';
update testAcc;

// 3. Handled exception (swallowed error - silent failure pattern)
try {
    Account badAcc = new Account(); // Name is required
    insert badAcc;
} catch (DmlException e) {
    System.debug(LoggingLevel.ERROR, 'Caught DML exception: ' + e.getMessage());
    // Swallowed! No re-throw. This is a silent failure.
}

// 4. Multiple debug messages at different levels
System.debug(LoggingLevel.INFO, 'Integration sync starting...');
System.debug(LoggingLevel.WARN, 'Warning: retry count exceeded for external system');
System.debug(LoggingLevel.ERROR, 'Error: data mismatch detected but continuing execution');
System.debug(LoggingLevel.DEBUG, 'Payload: {"status":"error","message":"rate_limit_exceeded"}');

// 5. More SOQL to increase governor usage
List<User> users = [SELECT Id, Name, Profile.Name FROM User WHERE IsActive = true LIMIT 10];
System.debug('Active users found: ' + users.size());

List<Organization> orgInfo = [SELECT Id, Name, OrganizationType FROM Organization];
System.debug('Org: ' + orgInfo[0].Name + ' (' + orgInfo[0].OrganizationType + ')');

// 6. Clean up test data
delete testAcc;
System.debug('Cleanup complete. Test finished successfully.');
System.debug('Governor limits - SOQL queries used: ' + Limits.getQueries() + '/' + Limits.getLimitQueries());
System.debug('Governor limits - DML statements used: ' + Limits.getDmlStatements() + '/' + Limits.getLimitDmlStatements());
