const dbo = require('../lib/db.js')
    , moment = require('moment')
    ;

exports.getAll = (domain, options, fn) => {
  if (!domain)
    return fn('Domain not specified');

  options = options || {};
  let limit = options.limit || 20;
  let skip = options.offset || 0;
  let sort = 'date'
      , order = -1
      , allowedSort = ['users', 'count', 'date']
      ;
  if (options.sort && allowedSort.indexOf(options.sort) != -1)
    sort = options.sort;
  if (options.dir && options.dir == 'asc')
    order = 1;
  let qs = {};
  qs[sort] = order;

  let p = new Promise((resolve, reject) => {
    dbo.db().collection('logs').aggregate([
      {$match: {domain: domain, event: 'clicked'}},
      {$group: {
        _id: {
          url: "$url",
        }
      }},
      {$group: {
        _id: null,
        count: {$sum: 1}
      }}
    ], (err, d) => {
      if (err || !d[0])
        return reject(err);

      return resolve(d[0].count);
    });
  })
  .then(total => {
    dbo.db().collection('logs').aggregate([
      {$match: {domain: domain, event: 'clicked'}},
      {$group: {
        _id: {
          url: '$url',
          email: '$email'
        },
        count: {$sum: 1},
        date: {$first: '$date'}
      }},
      {$group: {
        _id: '$_id.url',
        emails: {$push: {email: "$_id.email", count: "$count"}},
        users: {$sum: 1},
        count: {$sum: '$count'},
        date: {$first: '$date'}
      }},
      {$sort: qs},
      {$skip: parseInt(skip)},
      {$limit: limit}
    ]).toArray((err, docs) => {
      if (err) {
        return fn('Internal Error');
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

exports.get = (url, domain, fn) => {
  if (!url)
    return fn('URL not specified');
  if (!domain)
    return fn('Domain not specified');

  return dbo.db().collection('logs').aggregate([
    {$match: {domain: domain, event: 'clicked', url: decodeURIComponent(url)}},
    {$lookup: {
      from: 'mails',
      localField: 'msg_id',
      foreignField: 'msg_id',
      as: 'mail'
    }},
    {$unwind: '$mail'},
    {$project : {
      msg_id: 1,
      url: 1,
      email: 1,
      date: 1,
      'mail.subject': 1
    }},
    {$sort: {date: -1}}
  ]).toArray((err, logs) => {
    if (err)
      return fn(err);

    return fn(null, logs);
  });
}
