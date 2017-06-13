const dbo = require('../lib/db.js')
    , moment = require('moment')
    ;

exports.feed = function(domain, options, fn) {
  if (!domain)
    return fn('Domain not specified');

  options = options || {};
  let limit = options.limit || 20;

  dbo.db().collection('logs').find({domain: domain}, {
    sort: {date: -1},
    limit: limit
  }).toArray(function(err, docs) {
    if (err) {
      console.log(err);
      return fn('Internal Error');
    }

    fn(null, docs);
  });
}

exports.users = function(domain, options, fn) {
  if (!domain)
    return fn('Domain not specified');

  options = options || {};
  let limit = options.limit || 20;

  dbo.db().collection('users').find({domain: domain}, {
    sort: {last_seen: -1},
    limit: limit
  }).toArray(function(err, docs) {
    if (err) {
      console.log(err);
      return fn('Internal Error');
    }

    fn(null, docs);
  });
}
