const dbo = require('../lib/db.js')
    , moment = require('moment')
    ;

exports.getAll = function(domain, options, fn) {
  if (!domain)
    return fn('Domain not specified');

  options = options || {};
  let limit = options.limit || 20;

  let q = [
    {$match: {domain: domain}},
    {$group: {
      _id: {msg_id: '$msg_id', event: '$event'},
      count: {'$sum': 1}
    }},
    {$group: {
      _id: '$_id.msg_id',
      event: {$push: {event: "$_id.event", count: "$count"}}
    }},
    {$lookup: {
      from: 'mails',
      localField: '_id',
      foreignField: 'msg_id',
      as: 'mail'
    }},
    {$unwind: '$mail'},
    {$project: {event: 1, 'mail.subject': 1, 'mail.date': 1}},
    {$sort: {'mail.date' : -1}},
    {$limit: limit}
  ];

  dbo.db().collection('logs').aggregate(q).toArray(function(err, docs){
    if (err) {
      console.log(err);
      return fn('Internal Error');
    }

    for (let d of docs) {
      d.subject = d.mail.subject;
      d.date = d.mail.date;
      delete d.mail;
      if (d.event.length > 0) {
        for (let e of d.event) {
          d[e.event] = e.count;
        }
        delete d.event;
      }
    }

    return fn(null, docs);
  });//* /

  /*dbo.db().collection('mails').find({domain: domain}, {
    sort: {date: -1},
    limit: limit
  }).toArray(function(err, docs) {
    if (err) {
      console.log(err);
      return fn('Internal Error');
    }

    fn(null, docs);
  });*/
}
