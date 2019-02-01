const dbo = require('../lib/db.js')
    , crypto = require('crypto')
    , request = require('request')
    , moment = require('moment')

    , Mail = require('../lib/mail.js')
    , Domains = require('./domains.js')
    ;

function unique(event, domain, fn) {
  dbo.db().collection('logs').aggregate([
    {$match: {domain: domain, event: event/*, date: date*/}},
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
      return fn(err);

    return fn(err, d[0].count);
  });
}

exports.dashboardData = (domain, query, fn)  => {
  let data = {
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
  if (query['engagement.days']) {
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
  }
  let p = new Promise((resolve, reject) => {
    // Main data
    dbo.db().collection('logs').aggregate([
      {$match: {domain: domain, date: eng_date}},
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
    ]).toArray((err, docs) => {
      if (err)
        return resolve();

      let d, e
          , events_map
          , e_labels = []
          , e_data = {
            failed: []
            , delivered: []
            , clicked: []
            , opened: []
          };
      for (d of docs) {
        e_labels.push(d._id);
        events_map = {'delivered': false, 'failed': false, 'opened': false, 'clicked': false};
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
      resolve();
    });
  })
  .then(() => {
    // Delivered
    return new Promise((resolve, reject) => {
      dbo.db().collection('logs').count({domain: domain, event: 'delivered'}, (err, count) => {
        data.delivered = count;
        return resolve();
      })
    })
  })
  .then(() => {
    // Failed
    return new Promise((resolve, reject) => {
      dbo.db().collection('logs').count({domain: domain, event: 'failed'}, (err, count) => {
        data.failed = count;
        return resolve();
      })
    })
  })
  .then(() => {
    // Clicked
    return new Promise((resolve, reject) => {
      dbo.db().collection('logs').count({domain: domain, event: 'clicked'}, (err, count) => {
        data.clicked = count;
        return resolve();
      })
    })
  })
  .then(() => {
    // Opened
    return new Promise((resolve, reject) => {
      dbo.db().collection('logs').count({domain: domain, event: 'opened'}, (err, count) => {
        data.opened = count;
        return resolve();
      })
    })
  })
  .then(() => {
    // Get top clicks

    // Date filter
    let click_date = date;
    if (query['top_clicks.days']) {
      let from = query['top_clicks.days'].toLowerCase();
      if (from == 'today')
        click_date = {$gte: moment().startOf('day').toDate()};
      else if (from == 'yesterday')
        click_date = {
          $gte: moment().subtract(1, 'days').startOf('day').toDate(),
          $lte: moment().subtract(1, 'days').endOf('day').toDate()
        };
      else {
        from = parseInt(from);
        if (from > 0)
          click_date = {$gte: moment().subtract(from, 'days').toDate()};
      }
    }

    return new Promise((resolve, reject) => {
      dbo.db().collection('logs').aggregate([
        {$match: {domain: domain, event: 'clicked', date: click_date}},
        {$group: {
          _id: '$url',
          count: {$sum: 1}
        }},
        {$sort: {count: -1}},
        {$limit: 5}
      ]).toArray((err, docs) => {
        if (err)
          return resolve();

        data.clicks = docs;
        resolve();
      });
    });
  })
  .then(() => {
    // Get top opens

    // Date filter
    let open_date = date;
    if (query['top_opens.days']) {
      let from = query['top_opens.days'].toLowerCase();
      if (from == 'today')
        open_date = {$gte: moment().startOf('day').toDate()};
      else if (from == 'yesterday')
        open_date = {
          $gte: moment().subtract(1, 'days').startOf('day').toDate(),
          $lte: moment().subtract(1, 'days').endOf('day').toDate()
        };
      else {
        from = parseInt(from);
        if (from > 0)
          open_date = {$gte: moment().subtract(from, 'days').toDate()};
      }
    }
    return new Promise((resolve, reject) => {

      dbo.db().collection('logs').aggregate([
      {$match: {domain: domain, event: 'opened', date: open_date}},
      {$group: {
        _id: '$msg_id',
        count: {$sum: 1}
      }},
      {$sort: {count: -1}},
      {$limit: 5},
      {$lookup: {
        from: 'mails',
        localField: '_id',
        foreignField: 'msg_id',
        as: 'mail'
      }},
      {$unwind: '$mail'}
    ]).toArray((err, docs) => {
        if (err)
          return resolve();

        data.opens = docs;
        resolve();
      });
    });
  })
  .then(() => {
    // Get platform
    return new Promise((resolve, reject) => {

      dbo.db().collection('logs').aggregate([
      {$match: {domain: domain, platform: {$exists: true}}},
      {$group: {
        _id: '$platform',
        count: {$sum: 1}
      }}
    ]).toArray((err, docs) => {
        if (err)
          return resolve();

        let pf_labels = []
            , pf_data = [];
        for (let d of docs) {
          pf_labels.push(d._id);
          pf_data.push(d.count);
        }

        data.platform = {labels: pf_labels, data: pf_data};

        resolve();
      });
    });
  })
  .then(() => {
    // Get OS
    return new Promise((resolve, reject) => {

      dbo.db().collection('logs').aggregate([
      {$match: {domain: domain, os: {$exists: true}}},
      {$group: {
        _id: '$os',
        count: {$sum: 1}
      }}
    ]).toArray((err, docs) => {
        if (err)
          return resolve();

        let os_labels = []
            , os_data = [];
        for (let d of docs) {
          os_labels.push(d._id);
          os_data.push(d.count);
        }

        data.os = {labels: os_labels, data: os_data};

        resolve();
      });
    });
  })
  .then(() => {
    // Count mail
    return new Promise((resolve, reject) => {
      dbo.db().collection('mails').count({domain: domain}, (err, c) => {
        if (err)
          return reject(err);

        data.mails = c;

        resolve();
      });
    });
  })
  .then(() => {
    // Count events
    return new Promise((resolve, reject) => {
      dbo.db().collection('logs').count({domain: domain}, (err, c) => {
        if (err)
          return reject(err);

        data.feed = c;

        resolve();
      });
    });
  })
  .then(() => {
    // Count users
    return new Promise((resolve, reject) => {
      dbo.db().collection('users').count({domain: domain}, (err, c) => {
        if (err)
          return reject(err);

        data.users = c;

        resolve();
      });
    });
  })
  .then(() => {
    // Unique opens
    return new Promise((resolve, reject) => {
      unique('opened', domain, (err, c) => {

        if (c)
          data.unique_opens = c;

        resolve();
      });
    });
  })
  .then(() => {
    // Unique clicks
    return new Promise((resolve, reject) => {
      unique('clicked', domain, (err, c) => {

        if (c)
          data.unique_clicks = c;

        resolve();
      });
    });
  })
  .then(() => {
    return fn(null, data);
  })
  .catch(err => {
    console.log(err);
    return fn();
  });
}

exports.create = (data, fn) => {

  if (!data)
    return fn('No data provided.');

  let email = data.email || '';
  let password = data.password || '';

  email = email.toLowerCase().trim();
  if (!/^\S+@\S+$/.test(email))
    return fn('Email invalid. Confirm and try again');
  if (password.length < 6)
    return fn('Password should have at least six characters');

  // Email valid, continue
  dbo.db().collection('accounts').findOne({
    email: email
  }, (err, doc) => {
    if (err)
      return fn('There has been an internal error. Please try again later.');

    if (doc)
      return fn('This email is already in use.');

    let salt = crypto.randomBytes(128).toString('base64');
    crypto.pbkdf2(password, salt, 5000, 32, 'sha512', (err, derivedKey) => {
      if (err)
        return fn('There has been an internal error. Please try again later.');

      dbo.db().collection('accounts').insert({
        email: email,
        password: new Buffer(derivedKey).toString('base64'),
        salt: salt,
        reg_date: new Date()
      }, (err, result) => {
        return fn(null, {
          id: result.ops[0]._id,
          email: result.ops[0].email,
          reg_date: new Date()
        });
      });
    });
  });
}

exports.login = (data, fn) => {
  if (!data)
    return fn('No data provided.');

  let email = data.email || '';
  let password = data.password || '';

  email = email.toLowerCase().trim();
  dbo.db().collection('accounts').findOne({email: email}, (err, doc) => {
    if (err)
      return fn('There has been an internal error. Please try again later.');

    if (!doc)
      return fn('Email not found.');

    crypto.pbkdf2(password, doc.salt, 5000, 32, 'sha512', (err, derivedKey) => {
      if (err)
        return fn('There has been an internal error. Please try again later.');

      let hash = new Buffer(derivedKey).toString('base64');
      if (hash != doc.password)
        return fn('Wrong password. Confirm and try again.');

      let json = {
        id: doc._id,
        email: doc.email,
        reg_date: doc.reg_date
      };

      if (doc.payid)
        json.payid = doc.payid;

      // Update last login
      dbo.db().collection('accounts').update({email: email},
        {$set: {ll: new Date()}});

      // Get his domains
      Domains.get(doc._id, (err, domains) => {
        if (domains && domains.length > 0) {
          json.domains = domains;
          json.active_domain = domains[0];
        }

        return fn(null, json);
      });
    });
  });
}

exports.add = (from, email, domain, fn) => {

  if (!email)
    return fn('No email provided.');

  email = email.toLowerCase().trim();
  if (!/^\S+@\S+$/.test(email))
    return fn('Email invalid. Confirm and try again');

  // Email valid, continue
  dbo.db().collection('accounts').findOne({
    email: email
  }, (err, doc) => {
    if (err)
      return fn('There has been an internal error. Please try again later.');

    let tmplObj = {
      acc_domain: domain,
      email: from,
      domain: process.env.HOST
    }

    if (doc) {
      // Get id and add to new account
      // Add to domain
      dbo.db().collection('domains').updateOne({
        domain: domain
      }, {
        $addToSet: {accs: doc._id}
      }, {upsert: true});

      return Mail.send(email, 'You have been invited to '+domain+' on Suet', 'invite', tmplObj, () => {
        // todo: what to do with error? Account created by mail not sent
        return fn(null, email);
      });
    }

    let password = crypto.randomBytes(2).toString('hex');
    let salt = crypto.randomBytes(128).toString('base64');
    crypto.pbkdf2(password, salt, 5000, 32, 'sha512', (err, derivedKey) => {
      if (err)
        fn('There has been an internal error. Please try again later.');

      // Create account
      dbo.db().collection('accounts').insert({
        email: email,
        password: new Buffer(derivedKey).toString('base64'),
        salt: salt,
        reg_date: new Date()
      }, (err, result) => {
        let id = result.ops[0]._id;

        // Add to domain
        dbo.db().collection('domains').updateOne({
          domain: domain
        }, {
          $addToSet: {accs: id}
        }, {upsert: true});

        let hash = new Buffer(derivedKey).toString('base64');
        tmplObj.uid = id.toHexString();
        // Add to recover
        dbo.db().collection('recover').insert({
            hash: hash,
            uid: tmplObj.uid,
            date: new Date()
        }, (err, result) => {
          tmplObj.hash = encodeURIComponent(hash);
          // todo: what to do with err?
          Mail.send(email, 'You have been invited to '+domain+' on Suet', 'invite', tmplObj, () => {
            // todo: what to do with error? Account created by mail not sent
            return fn(null, email);
          });
        });
      });
    });
  });
}

exports.recoverPassword = (data, fn) => {

  let email = data.email || '';
  dbo.db().collection('accounts').findOne({email: email},
    (err, doc) => {
      if (err)
        return fn('There has been an internal error. Please try again later.');

      if (!doc)
        return fn('The specified email does not exist.');

      let salt = crypto.randomBytes(128).toString('base64');
      crypto.pbkdf2(salt, salt, 5000, 32, 'sha512', (err, derivedKey) => {

        if (err)
          return fn('There has been an internal error. Please try again later.');

        let hash = new Buffer(derivedKey).toString('base64');
        let uid = doc._id.toHexString();
        // Delete all recover requests for user
        dbo.db().collection('recover').remove({uid: uid});
        // Add this one
        dbo.db().collection('recover').insert({
            hash: hash,
            uid: uid,
            date: new Date()
        }, (err, result) => {
          // Send email
          let tmplObj = {
            hash: encodeURIComponent(hash),
            uid: uid,
            domain: process.env.HOST
          }

          Mail.send(email, 'Reset your password', 'recover', tmplObj, fn);
        });
      });
  });
}

exports.confirmReset = (hash, uid, fn) => {

  dbo.db().collection('recover').findOne({uid: uid, hash: decodeURIComponent(hash)},
    (err, doc) => {
      if (err)
        return fn('There has been an internal error. Please try again later.');

      if (!doc)
        return fn('Invalid reset details.');

      return fn();
  });
}

exports.resetPassword = (hash, uid, data, fn) => {

    let password = data.password || '';
    let passwordb = data.passwordb || '';

    if (password != passwordb)
      return fn('Password and confirmation did not match.');
    if (!password || password.length < 6)
      return fn('Your password should be at least 6 characters.');

    dbo.db().collection('recover').findOne({uid: uid, hash: decodeURIComponent(hash)},
      (err, doc) => {
        if (err)
          return fn('There has been an internal error. Please try again later.');

        if (!doc)
          return fn('Invalid reset details.');

        let salt = crypto.randomBytes(128).toString('base64');
        crypto.pbkdf2(password, salt, 5000, 32, 'sha512', (err, derivedKey) => {
          if (err)
            return fn('There has been an internal error. Please try again later.');

          dbo.db().collection('accounts').update(
            {_id: dbo.id(uid)},
            {$set: {password: new Buffer(derivedKey).toString('base64'), salt: salt}},
            (err, result) => {
              dbo.db().collection('recover').remove({uid: uid});
              return fn();
          });
        });

    });
}

exports.updateEmail = (uid, email, fn) => {
  if (!uid)
    return fn('User id missing');

  uid = dbo.id(uid);
  email = email.toLowerCase().trim();

  if (!/^\S+@\S+$/.test(email))
    return fn('Email invalid. Confirm and try again');

  dbo.db().collection('accounts').findOne({email: email}, (err, doc) => {
    if (err)
      return fn('There has been an internal error. Please try again later.');

    if (doc && uid+'' != doc._id+'')
      return fn('Email is already in use');

    dbo.db().collection('accounts').updateOne({_id: uid}, {$set: {email: email}},
      (err, result) => {
      if (err)
        return fn('There has been an internal error. Please try again later.');

      return fn(null, {email:email});
    });
  });
}

exports.updatePassword = (uid, oldPassword, password, fn) => {

  if (!uid)
    return fn('User ID missing');

  if (!oldPassword)
    return fn('Old password missing');

  uid = dbo.id(uid);

  if (!password || password.length < 6)
    return fn('Your password should be at least 6 characters.');

  dbo.db().collection('accounts').findOne({_id: uid}, (err, doc) => {
    if (err)
      return fn('There has been an internal error. Please try again later.');

    if (!doc)
      return fn('Invalid account.');

    crypto.pbkdf2(oldPassword, doc.salt, 5000, 32, 'sha512', (err, derivedKey) => {
      if (err)
        return fn('There has been an internal error. Please try again later.');

      let hash = new Buffer(derivedKey).toString('base64');
      if (hash != doc.password)
        return fn('Wrong password. Confirm and try again.');

      // Update password here
      let salt = crypto.randomBytes(128).toString('base64');
      crypto.pbkdf2(password, salt, 5000, 32, 'sha512', (err, derivedKey) => {
        if (err)
          return fn('There has been an internal error. Please try again later.');

        dbo.db().collection('accounts').update({_id: uid},
          {$set: {password: new Buffer(derivedKey).toString('base64'), salt: salt}},
          (err, result) => {
          if (err)
            return fn('There has been an internal error. Please try again later.');

          return fn(null);
        });
      });
    });
  });
}

exports.removeProfile = (uid, domain, fn) => {

  if (!uid)
    return fn('User ID missing');

  uid = dbo.id(uid);

  // Get domain
  Domains.getOne(uid, domain, (err, domain) => {
    if (err)
      return fn(err);

    if (!domain)
      return fn('Domain not found');

    if (domain.owner == uid.toHexString())
      return fn('You created this account. You cannot be removed.');

    Domains.removeProfile(domain._id, uid, err => {
      if (err)
        return fn(err);

      return fn();
    });
  });
}

exports.deleteProfile = (uid, fn) => {

  if (!uid)
    return fn('User ID missing');

  // Get domains for user
  Domains.get(uid, (err, domains) => {
    if (err)
      return fn(err);

    let dp = domains.map(domain => {
      return new Promise((resolve, reject) => {
        // If just you, remove your profile
        // else delete domain
        if (domain.accs.length === 1)
          Domains.delete(domain.domain, err => {
            if (err)
              return reject();
            return resolve();
          });
        else {
          Domains.removeProfile(domain._id, uid, err => {
            if (err)
              return reject();
            return resolve();
          });
        }
      });
    });

    Promise.all(dp).then(() => {
      dbo.db().collection('accounts').remove({_id: dbo.id(uid)}, err => {
        fn(err);
      });
    }).catch(reason => {
      fn(reason);
    });
  });
}
