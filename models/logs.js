const dbo = require('../lib/db.js')
    , moment = require('moment')
    ;

exports.feed = function(domain, options, fn) {
  if (!domain)
    return fn('Domain not specified');

  options = options || {};
  let limit = options.limit || 20;
  let skip = options.offset || 0;
  let sort = 'date'
      , order = -1
      , allowedSort = ['date', 'email', 'event']
      , allowedEvents = ['delivered', 'opened', 'bounced', 'clicked']
      ;

  let qs = {}
      , qm = {domain: domain};

  // Sort
  if (options.sort && allowedSort.indexOf(options.sort) != -1)
    sort = options.sort;
  if (options.dir && options.dir == 'asc')
    order = 1;

  // Filter
  if (options.filter) {
    // Validate
    if (Array.isArray(options.filter)) {
      let i = 0;
      while (i--) {
        if (allowedEvents.indexOf(options.filter[i]) == -1)
          options.filter.splice(i, 1);
      }
      if (options.filter.length)
        qm.event = {$in: options.filter};
    }
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
    {$unwind: '$mail'}
  ];

  let p = new Promise(function(resolve, reject){
    dbo.db().collection('logs').count(qm, function(err, c){
      if (err)
        return reject(err);

      resolve(c);
    });
  })
  .then(function(total){
    dbo.db().collection('logs').aggregate(q).toArray(function(err, docs){

      if (err) {
        console.log(err);
        return fn('Internal Error');
      }

      for (let d of docs) {
        d.subject = d.mail.subject;
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
  .catch(function(err){
    fn(err);
  });
}
