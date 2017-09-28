// Index collections

module.exports = function(dbo){
  // Accounts
  dbo.db().collection("accounts").ensureIndex("email");
  // Domains
  dbo.db().collection("domains").ensureIndex("domain");
  dbo.db().collection("domains").ensureIndex("accs");
  // Recover
  dbo.db().collection("recover").ensureIndex({uid:1, hash:1});
  // Logs
  dbo.db().collection("logs").ensureIndex("domain");
  dbo.db().collection("logs").ensureIndex({msg_id:1, domain:1});
  // Order not useful for sort by email
  //dbo.db().collection("logs").ensureIndex({email:1, domain:1});
  // So remove
  dbo.db().collection("logs").dropIndex({email:1, domain:1});
  // This covers sort and match by email and domain
  dbo.db().collection("logs").ensureIndex({domain:1, email:1});
  dbo.db().collection("logs").ensureIndex({domain:1, event:1});
  dbo.db().collection("logs").ensureIndex({domain:1, date:1});
  // Mails
  dbo.db().collection("mails").ensureIndex("domain");
  dbo.db().collection("mails").ensureIndex({msg_id:1, domain:1});
  // Users
  dbo.db().collection("users").ensureIndex("domain");
  // Signatures
  dbo.db().collection("signatures").ensureIndex({signature:1, domain:1});
}
