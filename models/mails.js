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

exports.get = function(msg_id, domain, fn) {
  if (!domain)
    return fn('Domain not specified');

  dbo.db().collection('mails').findOne({msg_id: msg_id, domain: domain}, function(err, doc) {
    if (err) {
      console.log(err);
      return fn('Internal Error');
    }
    if (!doc) {
      return fn('Mail not found');
    }

    dbo.db().collection('logs').find({msg_id: msg_id, domain: domain}, {
      sort: {date: -1},
    }).toArray(function(err, logs) {
      if (err) {
        console.log(err);
        return fn('Internal Error');
      }

      let deliveries = 0,
          opens = 0,
          opened_users = [],
          clicks = 0;

      for (let l of logs) {
        if (l.event == 'delivered')
          deliveries++;
        if (l.event == 'clicked')
          clicks++;
        if (l.event == 'opened') {
          if (opened_users.indexOf(l.email) == -1)
            opened_users.push(l.email);
          opens++;
        }
      }

      doc.opens = opens;
      doc.unique_opens = opened_users.length;
      doc.clicks = clicks;
      doc.deliveries = deliveries;

      doc.logs = logs;

      // Calculate opens, and unuque
      // Calculate clicks, and unique

      fn(null, doc);
    });

  });
}
