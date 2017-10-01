const smtpErrors = {
  421: "Recipient server not available.",
  450: "User's mailbox temporarily not available.",
  451: "Server error. Message failed.",
  452: "Insufficient system storage",
  550: "Mailbox is unavailable or recipient server rejected message.",
  551: "Mailbox does not exist on the recipient server.",
  552: "Mailbox does not have enough storage to accept message.",
  553: "Mailbox does not exist.",
  554: "General failure",
  // Mailgun specific. Non standard
  //498: "General failure",
  //605: "General failure",
  //499: "General failure (request timeout)"
}

// Inject some variables into template variables
exports.render = function(req, _obj) {
    var obj = {};
    var msgObj;
    while (msgObj = req.session.flash.shift()) {
      obj[msgObj.type] = msgObj.message;
    }

    if (null == _obj || "object" != typeof _obj) return obj;
    for (var attr in _obj) {
      if (_obj.hasOwnProperty(attr)) obj[attr] = _obj[attr];
    }

    if (req.session.account) {
      for (var attr in req.session.account) {
        obj['acc_'+attr] = req.session.account[attr];
      }
    }

    return obj;
};

exports.getSMTPError = function(code) {
  return smtpErrors[code] ? smtpErrors[code] : "General failure";
};
