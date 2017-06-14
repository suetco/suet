const dbo = require('../lib/db.js')
    , moment = require('moment')
    ;

exports.feed = function(domain, options, fn) {
  if (!domain)
    return fn('Domain not specified');

  options = options || {};
  let limit = options.limit || 20;
  let sort = 'date'
      , allowedSort = ['date', 'email', 'event']
      ;
  if (options.sort && allowedSort.indexOf(options.sort) != -1)
    sort = options.sort;

  let qs = {};
  qs[sort] = -1;

  let q = [
    {$match: {domain: domain}},
    {$lookup: {
      from: 'mails',
      localField: 'msg_id',
      foreignField: 'msg_id',
      as: 'mail'
    }},
    {$unwind: '$mail'},
    {$sort: qs},
    {$limit: limit}
  ];

  dbo.db().collection('logs').aggregate(q).toArray(function(err, docs){

    if (err) {
      console.log(err);
      return fn('Internal Error');
    }

    for (let d of docs) {
      d.subject = d.mail.subject;
      delete d.mail;
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
