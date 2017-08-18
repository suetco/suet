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
  dbo.db().collection("logs").ensureIndex({email:1, domain:1});
  // Mails
  dbo.db().collection("mails").ensureIndex("domain");
  dbo.db().collection("mails").ensureIndex({msg_id:1, domain:1});
  // Users
  dbo.db().collection("users").ensureIndex("domain");
  // Signatures
  dbo.db().collection("signatures").dropIndex("signature");
  dbo.db().collection("signatures").ensureIndex({signature:1, domain:1});
}
