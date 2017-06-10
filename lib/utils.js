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
