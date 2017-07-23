const dbo = require('../lib/db.js')
    , crypto = require('crypto')
    , request = require('request')
    , moment = require('moment')

    , Domains = require('./domains.js')
    ;

exports.dashboardData = function(domain, query, fn) {
  let data = {
        clicks: [],
        opens: [],
        platform: [],
        os: [],
        mails: 0,
        feed: 0,
        users: 0
      }
      , date = {$gte: moment().subtract(7, 'days').toDate()} // last 7 days
      ;
  let p = new Promise(function(resolve, reject){
    // Main data
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
    ]).toArray(function(err, docs){
      if (err)
        return resolve();

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
      resolve();
    });
  })
  .then(function(){
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

    return new Promise(function(resolve, reject){
      dbo.db().collection('logs').aggregate([
        {$match: {domain: domain, event: 'clicked', date: click_date}},
        {$group: {
          _id: '$url',
          count: {$sum: 1}
        }},
        {$sort: {count: -1}},
        {$limit: 5}
      ]).toArray(function(err, docs){
        if (err)
          return resolve();

        data.clicks = docs;
        resolve();
      });
    });
  })
  .then(function(){
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
    return new Promise(function(resolve, reject){

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
    ]).toArray(function(err, docs){
        if (err)
          return resolve();

        data.opens = docs;
        resolve();
      });
    });
  })
  .then(function(){
    // Get platform
    return new Promise(function(resolve, reject){

      dbo.db().collection('logs').aggregate([
      {$match: {domain: domain, platform: {$exists: true}}},
      {$group: {
        _id: '$platform',
        count: {$sum: 1}
      }}
    ]).toArray(function(err, docs){
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
  .then(function(){
    // Get OS
    return new Promise(function(resolve, reject){

      dbo.db().collection('logs').aggregate([
      {$match: {domain: domain, os: {$exists: true}}},
      {$group: {
        _id: '$os',
        count: {$sum: 1}
      }}
    ]).toArray(function(err, docs){
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
  .then(function(){
    // Count mail
    return new Promise(function(resolve, reject){
      dbo.db().collection('mails').count({domain: domain}, function(err, c){
        if (err)
          return reject(err);

        data.mails = c;

        resolve();
      });
    });
  })
  .then(function(){
    // Count events
    return new Promise(function(resolve, reject){
      dbo.db().collection('logs').count({domain: domain}, function(err, c){
        if (err)
          return reject(err);

        data.feed = c;

        resolve();
      });
    });
  })
  .then(function(){
    // Count users
    return new Promise(function(resolve, reject){
      dbo.db().collection('users').count({domain: domain}, function(err, c){
        if (err)
          return reject(err);

        data.users = c;

        resolve();
      });
    });
  })
  .then(function() {
    return fn(null, data);
  })
  .catch(function(err) {
    return fn();
  });
}

exports.create = function(data, fn) {

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
  }, function(err, doc) {
    if (err)
      return fn('There has been an internal error. Please try again later.');

    if (doc)
      return fn('This email is already in use.');

    let salt = crypto.randomBytes(128).toString('base64');
    crypto.pbkdf2(password, salt, 5000, 32, 'sha512', function(err, derivedKey) {
      if (err)
        fn('There has been an internal error. Please try again later.');

      dbo.db().collection('accounts').insert({
        email: email,
        password: new Buffer(derivedKey).toString('base64'),
        salt: salt,
        reg_date: new Date()
      }, function(err, result) {
        return fn(null, {
          id: result.ops[0]._id,
          email: result.ops[0].email
        });
      });
    });
  });
}

exports.login = function(data, fn) {
  if (!data)
    return fn('No data provided.');

  let email = data.email || '';
  let password = data.password || '';

  email = email.toLowerCase().trim();
  dbo.db().collection('accounts').findOne({email: email}, function(err, doc) {
    if (err)
      return fn('There has been an internal error. Please try again later.');

    if (!doc)
      return fn('Email not found.');

    crypto.pbkdf2(password, doc.salt, 5000, 32, 'sha512', function(err, derivedKey) {
      if (err)
        return fn('There has been an internal error. Please try again later.');

      let hash = new Buffer(derivedKey).toString('base64');
      if (hash != doc.password)
        return fn('Wrong password. Confirm and try again.');

      let json = {
        id: doc._id,
        email: doc.email
      };
      // Get his domains
      Domains.get(doc._id, function(err, domains){
        if (domains && domains.length > 0) {
          let _domains = [];
          for (let domain of domains)
            _domains.push(domain.domain)
          json.domains = _domains;
          json.active_domain = _domains[0];
        }

        return fn(null, json);
      });
    });
  });
}

exports.recoverPassword = function(res, data, fn) {

  let email = data.email || '';
  dbo.db().collection('accounts').findOne({email: email},
    function(err, doc) {
      if (err)
        return fn('There has been an internal error. Please try again later.');

      if (!doc)
        return fn('The specified email does not exist.');

      let salt = crypto.randomBytes(128).toString('base64');
      crypto.pbkdf2(salt, salt, 5000, 32, 'sha512', function(err, derivedKey) {

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
        }, function(err, result) {
          // Send email
          let tmplObj = {
            hash: encodeURIComponent(hash),
            uid: uid,
            domain: process.env.HOST
          }

          res.render('mail_templates/recover', tmplObj, function(err, html) {
            if (err)
              return fn('There has been an internal error. Please try again later.');

            res.render('mail_templates/recover_txt', tmplObj, function(err, text) {

              let params = {
                from: process.env.EMAIL_FROM,
                subject: 'Reset your password',
                html: html,
                to: email
              }

              if (!err && text)
                params.text = text;

              request.post({
                url: 'https://api.mailgun.net/v3/'+process.env.EMAIL_DOMAIN+'/messages',
                auth: {
                  user: 'api',
                  pass: process.env.EMAIL_KEY
                },
                sendImmediately: false,
                form: params
              }, function(err, response, body) {

                if (err || response.statusCode != 200)
                  return fn('There has been an error sending recovery mail. Please try again later.');

                return fn();
              });//*/

            });
          });
        });
      });
  });
}

exports.confirmReset = function(hash, uid, fn) {

  dbo.db().collection('recover').findOne({uid: uid, hash: decodeURIComponent(hash)},
    function(err, doc) {
      if (err)
        return fn('There has been an internal error. Please try again later.');

      if (!doc)
        return fn('Invalid reset details.');

      return fn();
  });
}

exports.resetPassword = function(hash, uid, data, fn) {

    let password = data.password || '';
    let passwordb = data.passwordb || '';

    if (password != passwordb)
      return fn('Password and confirmation did not match.');
    if (!password || password.length < 6)
      return fn('Your password should be at least 6 characters.');

    dbo.db().collection('recover').findOne({uid: uid, hash: decodeURIComponent(hash)},
      function(err, doc) {
        if (err)
          return fn('There has been an internal error. Please try again later.');

        if (!doc)
          return fn('Invalid reset details.');

        let salt = crypto.randomBytes(128).toString('base64');
        crypto.pbkdf2(password, salt, 5000, 32, 'sha512', function(err, derivedKey) {
          if (err)
            return fn('There has been an internal error. Please try again later.');

          dbo.db().collection('accounts').update(
            {_id: dbo.id(uid)},
            {$set: {password: new Buffer(derivedKey).toString('base64'), salt: salt}},
            function(err, result) {
              dbo.db().collection('recover').remove({uid: uid});
              return fn();
          });
        });

    });
}

exports.updateEmail = function(uid, email, fn) {
  if (!uid)
    return fn('User id missing');

  uid = dbo.id(uid);
  email = email.toLowerCase().trim();

  if (!/^\S+@\S+$/.test(email))
    return fn('Email invalid. Confirm and try again');

  dbo.db().collection('accounts').findOne({email: email}, function(err, doc) {
    if (err)
      return fn('There has been an internal error. Please try again later.');

    if (doc && uid+'' != doc._id+'')
      return fn('Email is already in use');

    dbo.db().collection('accounts').updateOne({_id: uid}, {$set: {email: email}},
      function(err, result) {
      if (err)
        return fn('There has been an internal error. Please try again later.');

      return fn(null, {email:email});
    });
  });
}

exports.updatePassword = function(uid, oldPassword, password, fn) {

  if (!uid)
    return fn('User ID missing');

  if (!oldPassword)
    return fn('Old password missing');

  uid = dbo.id(uid);

  if (!password || password.length < 6)
    return fn('Your password should be at least 6 characters.');

  dbo.db().collection('accounts').findOne({_id: uid}, function(err, doc) {
    if (err)
      return fn('There has been an internal error. Please try again later.');

    if (!doc)
      return fn('Invalid account.');

    crypto.pbkdf2(oldPassword, doc.salt, 5000, 32, 'sha512', function(err, derivedKey) {
      if (err)
        return fn('There has been an internal error. Please try again later.');

      let hash = new Buffer(derivedKey).toString('base64');
      if (hash != doc.password)
        return fn('Wrong password. Confirm and try again.');

      // Update password here
      let salt = crypto.randomBytes(128).toString('base64');
      crypto.pbkdf2(password, salt, 5000, 32, 'sha512', function(err, derivedKey) {
        if (err)
          return fn('There has been an internal error. Please try again later.');

        dbo.db().collection('accounts').update({_id: uid},
          {$set: {password: new Buffer(derivedKey).toString('base64'), salt: salt}},
          function(err, result) {
          if (err)
            return fn('There has been an internal error. Please try again later.');

          return fn(null);
        });
      });
    });
  });
}

exports.deleteProfile = function(uid, fn) {

  if (!uid)
    return fn('User ID missing');

  // Get domains for user
  Domains.get(uid, function(err, domains){
    if (err)
      return fn(err);

    let dp = domains.map(function(domain){
      return new Promise(function(resolve, reject){
        if (domain.accs.length === 1)
          Domains.delete(domain._id, function(err){
            if (err)
              return reject();
            return resolve();
          });
        else
          Domains.removeProfile(domain._id, uid, function(err){
            if (err)
              return reject();
            return resolve();
          });
      });
    });

    Promise.all(dp).then(function(){
      dbo.db().collection('accounts').remove({_id: dbo.id(uid)}, function(err){
        fn(err);
      });
    }).catch(function(reason) {
      fn(reason);
    });
  });
}
