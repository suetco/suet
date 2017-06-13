const dbo = require('../lib/db.js')
    , moment = require('moment')
    ;

exports.getAll = function(domain, options, fn) {
  if (!domain)
    return fn('Domain not specified');

  options = options || {};
  let limit = options.limit || 20;

  dbo.db().collection('mails').find({domain: domain}, {
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
