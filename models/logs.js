const dbo = require('../lib/db.js')
    , moment = require('moment')
    ;

exports.feed = function(domain, options, fn) {
  if (!domain)
    return fn('Domain not specified');

  options = options || {};
  let limit = options.limit || 20;
  let sort = 'date'
      , order = -1
      , allowedSort = ['date', 'email', 'event']
      ;
  if (options.sort && allowedSort.indexOf(options.sort) != -1)
    sort = options.sort;
  if (options.dir && options.dir == 'asc')
    order = 1;

  let qs = {};
  qs[sort] = order;

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
