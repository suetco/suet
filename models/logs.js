var dbo = require('../lib/db.js')
    , moment = require('moment')
    ;

exports.feed = function(fn) {
  dbo.db().collection('logs').find({}, {
    sort: {date: -1}
  }).toArray(function(err, docs) {
    if (err) {
      console.log(err);
      return fn('Internal Error');
    }

    fn(null, docs);
  });
}

exports.users = function(fn) {
  dbo.db().collection('users').find({}, {
    sort: {last_seen: -1}
  }).toArray(function(err, docs) {
    if (err) {
      console.log(err);
      return fn('Internal Error');
    }

    fn(null, docs);
  });
}
