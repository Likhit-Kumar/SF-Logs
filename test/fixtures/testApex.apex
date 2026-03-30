System.debug('=== SF Log MCP Test ===');
List<Account> accts = [SELECT Id, Name FROM Account LIMIT 5];
System.debug('Found ' + accts.size() + ' accounts');
Account testAcc = new Account(Name = 'Test_MCP_' + String.valueOf(System.now()));
insert testAcc;
System.debug('Inserted: ' + testAcc.Id);
delete testAcc;
System.debug('=== Test Complete ===');
