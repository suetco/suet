const dbo = require('../lib/db.js')
    , moment = require('moment')
    ;

function unique(event, domain, tag) {
  return new Promise((resolve, reject) => {
    dbo.db().collection('logs').aggregate([
      {$match: {domain: domain, event: event, tags: tag}},
      {$group: {
        _id: {
          msg_id: "$msg_id",
          email: "$email"
        }
      }},
      {$group: {
        _id: null,
        count: {$sum: 1}
      }}
    ]).toArray((err, d) => {
      if (err || !d[0])
        return reject(err);

      return resolve(d[0].count);
    });
  });
}

exports.all = (domain, options, fn) => {
  if (!domain)
    return fn('Domain not specified');

  options = options || {};
  let limit = options.limit || 20;
  let skip = options.offset || 0;
  let sort = null
      , order = null
      , allowedSort = ['clicked', 'opened', 'date']
      ;
  if (options.sort && allowedSort.indexOf(options.sort) != -1)
    sort = options.sort;
  if (options.dir && options.dir == 'asc')
    order = 1;

  let qs = {limit: limit, skip: parseInt(skip), sort: {}};
  if (sort)
    qs.sort[sort] = order;

  let p = new Promise((resolve, reject) => {
    dbo.db().collection('tags').count({domain: domain}, (err, c) => {
      if (err)
        return reject(err);

      resolve(c);
    });
  })
  .then(total => {
    dbo.db().collection('tags').find({domain: domain}, qs).toArray((err, docs) => {
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

exports.get = (domain, tag, query, fn)  => {
  let data = {
        tag: {},
        clicks: [],
        opens: [],
        platform: [],
        os: [],
        unique_opens: 0,
        unique_clicks: 0,
        mails: 0,
        feed: 0,
        users: 0
      }
      , date = {$gte: moment().subtract(7, 'days').toDate()} // last 7 days
      ;
  let eng_date = date;
  /*if (query['engagement.days']) {
    let from = query['engagement.days'].toLowerCase();
    if (from == 'today')
      eng_date = {$gte: moment().startOf('day').toDate()};
    else if (from == 'yesterday')
      eng_date = {
        $gte: moment().subtract(1, 'days').startOf('day').toDate(),
        $lte: moment().subtract(1, 'days').endOf('day').toDate()
      };
    else {
      from = parseInt(from);
      if (from > 0)
        eng_date = {$gte: moment().subtract(from, 'days').toDate()};
    }
  }//*/
  // Main data
  dbo.db().collection('tags').findOne({domain: domain, tag: tag})
  .then(doc => {
    data.tag = doc;
    return dbo.db().collection('logs').aggregate([
      {$match: {domain: domain, tags: tag, date: eng_date}},
      {$group: {
        _id: {
          date: {$dateToString: {format: "%Y-%m-%d", date: "$date"}},
          event: '$event'
        },
        count: {'$sum': 1}
      }},
      {$group: {
        _id: '$_id.date',
        event: {$push: {event: "$_id.event", count: "$count"}}
      }},
      {$sort: {'_id': 1}}
    ])
    .toArray();
  })
  .then(docs => {
    let d, e
        , events_map
        , e_labels = []
        , e_data = {
          dropped: []
          , delivered: []
          , clicked: []
          , opened: []
        };
    for (d of docs) {
      e_labels.push(d._id);
      events_map = {'delivered': false, 'dropped': false, 'opened': false, 'clicked': false};
      for (e of d.event) {
        if (e_data[e.event]) {
          e_data[e.event].push(e.count);
          events_map[e.event] = true;
        }
      }
      // Fill any missing event with 0
      for (e in events_map) {
        if (!events_map[e])
          e_data[e].push(0);
      }
    }

    data.engagement = {label: e_labels, data: e_data};
    // Get platform
    return dbo.db().collection('logs').aggregate([
      {$match: {domain: domain, tags: tag, platform: {$exists: true}}},
      {$group: {
        _id: '$platform',
        count: {$sum: 1}
      }}
    ]).toArray();
  })
  .then(docs => {
    let pf_labels = []
        , pf_data = [];
    for (let d of docs) {
      pf_labels.push(d._id);
      pf_data.push(d.count);
    }

    data.platform = {labels: pf_labels, data: pf_data};
    // Get OS
    return dbo.db().collection('logs').aggregate([
      {$match: {domain: domain, tags: tag, os: {$exists: true}}},
      {$group: {
        _id: '$os',
        count: {$sum: 1}
      }}
    ]).toArray();
  })
  .then(docs => {
    let os_labels = []
        , os_data = [];
    for (let d of docs) {
      os_labels.push(d._id);
      os_data.push(d.count);
    }

    data.os = {labels: os_labels, data: os_data};
    // Count mail
    return dbo.db().collection('mails').count({domain: domain, tags: tag});
  })
  .then(c => {
    data.mails = c;
    // Count events
    return dbo.db().collection('logs').count({domain: domain, tags: tag});
  })
  .then(c => {
    data.feed = c;
    // Count events
    return dbo.db().collection('logs').count({domain: domain, tags: tag, event: 'delivered'});
  })
  .then(c => {
    data.delivered = c;
    return dbo.db().collection('logs').count({domain: domain, tags: tag, event: 'opened'});
  })
  .then(c => {
    data.opened = c;
    return dbo.db().collection('logs').count({domain: domain, tags: tag, event: 'clicked'});
  })
  .then(c => {
    data.clicked = c;
    // Unique opens
    return unique('opened', domain, tag);
  })
  .then(c => {
    data.unique_opens = c;
    // Unique clicks
    return unique('clicked', domain, tag);
  })
  .then(c => {
    data.unique_clicks = c;
    return fn(null, data);
  })
  .catch(err => {
    console.log(err);
    return fn();
  });
}
