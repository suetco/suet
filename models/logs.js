const dbo = require('../lib/db.js')
    , moment = require('moment')
    ;

exports.feed = (domain, options, fn) => {
  if (!domain)
    return fn('Domain not specified');

  options = options || {};
  let limit = options.limit || 20;
  let skip = options.offset || 0;
  let sort = 'date'
      , order = -1
      , allowedSort = ['date', 'email', 'event']
      , allowedEvents = ['delivered', 'opened', 'bounced', 'complained', 'failed', 'clicked']
      ;

  let qs = {}
      , qm = {domain: domain};

  // Sort
  if (options.sort && allowedSort.indexOf(options.sort) != -1)
    sort = options.sort;
  if (options.dir && options.dir == 'asc')
    order = 1;

  // Filter
  if (options.action) {
    // Validate
    if (Array.isArray(options.action)) {
      let i = 0;
      while (i--) {
        if (allowedEvents.indexOf(options.action[i]) == -1)
          options.action.splice(i, 1);
      }
      if (options.action.length)
        qm.event = {$in: options.action};
    }
  }
  if (options.date) {
    let date = options.date.split(' to ');
    if (date.length == 2) {
      qm.date = {$gte: new Date(date[0]),
                  $lte: new Date(date[1])}
    }
  }

  if (options.tag) {
    qm.tags = options.tag;
  }

  qs[sort] = order;

  let q = [
    {$match: qm},
    {$sort: qs},
    {$skip: parseInt(skip)},
    {$limit: limit},
    {$lookup: {
      from: 'mails',
      localField: 'msg_id',
      foreignField: 'msg_id',
      as: 'mail'
    }},
    {$unwind: {
      path: '$mail',
      preserveNullAndEmptyArrays: true
    }}
  ];

  //console.log(q);

  let p = new Promise((resolve, reject) => {
    dbo.db().collection('logs').count(qm, (err, c) => {
      if (err)
        return reject(err);

      resolve(c);
    });
  })
  .then(total => {
    dbo.db().collection('logs').aggregate(q).toArray((err, docs) => {
      //console.log(JSON.stringify(docs[0].stages, null, 4));

      if (err) {
        return fn('Internal Error');
      }

      for (let d of docs) {
        d.subject = d.mail ? d.mail.subject : '';
        delete d.mail;
      }

      fn(null, {
        total: total,
        count: docs.length,
        offset: skip,
        limit: limit,
        data: docs
      });
    });
  })
  .catch(err => {
    fn(err);
  });
}
