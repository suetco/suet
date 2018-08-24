const dbo = require('../lib/db.js')
    , decrypt = require('../lib/utils.js').decrypt
    , moment = require('moment')
    , request = require('request')
    , elasticsearch = require('elasticsearch')
    , esc = new elasticsearch.Client({
      host: process.env.ES_HOST,
      httpAuth: process.env.ES_AUTH,
      log: 'error'
    })
    ;

exports.search = (domain, q, fn) => {
  esc.search({
    index: 'suet',
    type: 'mails',
    body: {
      query: {
        bool: {
          must: {
            multi_match: {
              query: q,
              fields : ['subject^2', 'body', 'to'],
              operator: 'and'
            }
          },
          filter: {
            term: {domain: domain}
          }
        }
      }
    }
  }, function (error, response) {
    if (error)
      return fn(error);

    //console.log(response.hits.hits);
    let data = response.hits.hits.map(h => {
      h._source.id = h._id;
      return h._source;
    });

    fn(null, data);
  });
}

exports.getAll = (domain, options, fn) => {
  if (!domain)
    return fn('Domain not specified');

  options = options || {};
  let limit = options.limit || 20;
  let skip = options.offset || 0;
  let sort = 'date'
      , order = -1
      , allowedSort = ['clicked', 'opened', 'date']
      ;
  if (options.sort && allowedSort.indexOf(options.sort) != -1)
    sort = options.sort;
  if (options.dir && options.dir == 'asc')
    order = 1;

  let q = {domain: domain};
  if (options.tag)
    q.tags = options.tag;

  let qs = {limit: limit, skip: parseInt(skip), sort: {}};
  qs.sort[sort] = order;

  let p = new Promise((resolve, reject) => {
    dbo.db().collection('mails').count(q, (err, c) => {
      if (err)
        return reject(err);

      resolve(c);
    });
  })
  .then(total => {
    dbo.db().collection('mails').find(q, qs).toArray((err, docs) => {
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

exports.get = (msg_id, domain, fn) => {
  if (!msg_id)
    return fn('Mail not specified');
  if (!domain)
    return fn('Domain not specified');

  dbo.db().collection('mails').findOne({msg_id: msg_id, domain: domain}, (err, doc) => {
    if (err) {
      console.log(err);
      return fn('Internal Error');
    }
    if (!doc) {
      return fn('Mail not found');
    }

    dbo.db().collection('logs').find({msg_id: msg_id, domain: domain}, {
      sort: {date: -1},
    }).toArray((err, logs) => {
      if (err) {
        console.log(err);
        return fn('Internal Error');
      }

      let deliveries = 0,
          opens = 0,
          opened_users = [],
          clicked_users = [],
          clicks = 0;

      for (let l of logs) {
        if (l.event == 'delivered')
          deliveries++;
        if (l.event == 'clicked') {
          if (clicked_users.indexOf(l.email) == -1)
            clicked_users.push(l.email);
          clicks++;
        }
        if (l.event == 'opened') {
          if (opened_users.indexOf(l.email) == -1)
            opened_users.push(l.email);
          opens++;
        }
      }

      doc.opens = opens;
      doc.unique_opens = opened_users.length;
      doc.unique_clicks = clicked_users.length;
      doc.clicks = clicks;
      doc.deliveries = deliveries;

      doc.logs = logs;

      fn(null, doc);
    });

  });
}

exports.send = (to, domain, data, fn) => {
  console.log(data);
  if (!to || !data.name || !data.from || !data.subject || !data.body)
    return fn('Some fields empty');

  let mailOptions = {
    from: `"${data.name}" <${data.from}>`,
    to: to,
    subject: data.subject,
    text: data.body,
    //html: '<b>Hello world</b>'
  };
  request.post({
    'url': `https://api.mailgun.net/v3/${domain.domain}/messages`,
    'auth': {
      'user': 'api',
      'pass': decrypt(domain.key),
      'sendImmediately': false
    },
    'form': mailOptions
  }, (err, response, body) => {
    if (err) {
      return fn(err);
    }

    fn();
  });
}
