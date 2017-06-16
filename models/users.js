const dbo = require('../lib/db.js')
    , moment = require('moment')
    ;


exports.getAll = function(domain, options, fn) {
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

exports.get = function(email, domain, fn) {
  if (!domain)
    return fn('Domain not specified');
  if (!email)
    return fn('User not specified');

  let q = [
    {$match: {email: email, domain: domain}},
    {$lookup: {
      from: 'mails',
      localField: 'msg_id',
      foreignField: 'msg_id',
      as: 'mail'
    }},
    {$unwind: '$mail'},
    {$sort: {date: -1}}
  ];

  dbo.db().collection('logs').aggregate(q).toArray(function(err, logs){
    if (err) {
      console.log(err);
      return fn('Internal Error');
    }

    let deliveries = 0,
        opens = 0,
        msg_ids = [],
        clicks = 0;

    for (let l of logs) {
      l.subject = l.mail.subject;
      delete l.mail.subject;
      if (l.event == 'delivered')
        deliveries++;
      if (l.event == 'clicked')
        clicks++;
      if (l.event == 'opened') {
        if (msg_ids.indexOf(l.msg_id) == -1)
          msg_ids.push(l.msg_id);
        opens++;
      }
    }

    fn(null, {
      email: email,
      opens: opens,
      unique_opens: msg_ids.length,
      clicks: clicks,
      deliveries: deliveries,
      logs: logs
    });

  });
}
