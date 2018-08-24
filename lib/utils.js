const crypto = require('crypto')
    , algorithm = 'aes-256-ctr'
    ;

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
exports.render = (req, _obj) => {
    let obj = {};
    let msgObj;
    while (msgObj = req.session.flash.shift()) {
      obj[msgObj.type] = msgObj.message;
    }

    if (null == _obj || "object" != typeof _obj) return obj;
    for (let attr in _obj) {
      if (_obj.hasOwnProperty(attr)) obj[attr] = _obj[attr];
    }

    if (req.session.account) {
      for (let attr in req.session.account) {
        obj['acc_'+attr] = req.session.account[attr];
      }
    }

    return obj;
}

exports.getSMTPError = code => {
  return smtpErrors[code] ? smtpErrors[code] : "General failure";
}

exports.encrypt = text => {
  let cipher = crypto.createCipher(algorithm, process.env.AES_KEY)
  let crypted = cipher.update(text, 'utf8', 'hex')
  crypted += cipher.final('hex');
  return crypted;
}

exports.decrypt = text => {
  let decipher = crypto.createDecipher(algorithm, process.env.AES_KEY)
  let dec = '';
  try {
    dec = decipher.update(text, 'hex', 'utf8')
    dec += decipher.final('utf8');
  }
  catch(ex) {}

  return dec;
}
