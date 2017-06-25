const dbo = require('../lib/db.js')
    , crypto = require('crypto')
    , validate = require('mailgun-validate')

    , Domains = require('./domains.js')
    ;

let validator = new validate('pubkey-02iismi5n5xozcmeyu3-ymqe3f9-0da4');

exports.dashboardData = function(domain, fn) {
  let data = {
    clicks: [],
    opens: [],
    platform: [],
    os: [],
    mails: 0,
    feed: 0,
    users: 0
  }
  let p = new Promise(function(resolve, reject){
    // Main data
    dbo.db().collection('logs').aggregate([
      {$match: {domain: domain}},
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

      let e_labels = []
          , e_data = {
            delivered: [],
            clicked: [],
            opened: []
          };
      for (let d of docs) {
        e_labels.push(d._id);
        for (let e of d.event) {
          e_data[e.event].push(e.count);
        }
      }

      data.engagement = docs;
      resolve();
    });
  })
  .then(function(){
    // Get top clicks
    dbo.db().collection('logs').aggregate([
      {$match: {domain: domain, event: 'clicked'}},
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
  })
  .then(function(){
    // Get top opens
    return new Promise(function(resolve, reject){

      dbo.db().collection('logs').aggregate([
      {$match: {domain: domain, event: 'opened'}},
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

  let email = data.email || '';
  let password = data.password || '';

  email = email.toLowerCase().trim();

  validator.validate(email, function(err, response) {

    if (err || !response) {
      // Cant connect to mailgun
      // Default to regexp
      if (!email.match(/^[\w\.\-\+]+@[\w\.\-\+]+\.[\w]+$/)) {
        return fn('Email invalid. Confirm and try again');
      }
    }
    else if (!response.is_valid) {
      let e = 'Email invalid.';
      if (response.did_you_mean)
        e += ' Do you mean '+response.did_you_mean+'?';
      return fn(e);
    }

    if (!password || password.length < 6) {
      return fn('Your password should be at least 6 characters.');
    }

    // Email valid, continue
    dbo.db().collection('accounts').findOne({
      email: email
    }, function(err, doc) {
      if (err) {
        return fn('There has been an internal error. Please try again later.');
      }
      else {
        if (!doc) {
          let salt = crypto.randomBytes(128).toString('base64');
          crypto.pbkdf2(password, salt, 5000, 32, 'sha512', function(err, derivedKey) {
            if (!err) {
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
            }
            else {
              fn('There has been an internal error. Please try again later.');
            }
          });
        }
        else {
          return fn('This email is already in use.');
        }
      }
    });
  });
}

exports.login = function(data, fn) {
  let email = data.email || '';
  let password = data.password || '';

  email = email.toLowerCase().trim();
  dbo.db().collection('accounts').findOne({email: email}, function(err, doc) {
    if (err) {
      return fn('There has been an internal error. Please try again later.');
    } else {
      if (doc) {
        crypto.pbkdf2(password, doc.salt, 5000, 32, 'sha512', function(err, derivedKey) {
          if (!err) {
            let hash = new Buffer(derivedKey).toString('base64');
            if (hash == doc.password) {
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
            }
            else {
              return fn('Wrong password. Confirm and try again.');
            }
          }
          else {
            return fn('There has been an internal error. Please try again later.');
          }
        });
      }
      else
        return fn('Email not found.');
    }
  });
}

exports.recoverPassword = function(res, data, fn) {

  let email = data.email || '';
  // Email valid, continue
  dbo.db.collection('users').findOne({email: email},
    function(err, doc) {
      if (err) {
        // pusher here
        return fn('There has been an internal error. Please try again later.');
      } else {
        if (doc) {
          let salt = crypto.randomBytes(128).toString('base64');
          crypto.pbkdf2(salt, salt, 5000, 32, function(err, derivedKey) {
            if (!err) {
                let hash = new Buffer(derivedKey).toString('base64');
                let uid = doc._id.toHexString();
                // Delete all recover for user
                dbo.db.collection('recover').remove({uid: uid}, function(err, removed){});
                // Add this one
                dbo.db.collection('recover').insert({
                    hash: hash,
                    uid: uid,
                    reg_date: new Date()
                }, function(err, result) {
                  // Send email
                  let tmplObj = {hash: encodeURIComponent(hash), uid: uid};
                  res.render('mail_templates/recover', tmplObj, function(err, html) {
                    if (err)  {
                      return;
                    }

                    res.render('mail_templates/recover_txt', tmplObj, function(err, text) {
                      if (err)  {
                        console.log(err);
                        return;
                      }

                      let transporter = nodemailer.createTransport({
                          service: 'Mailgun',
                          auth: {
                              user: 'postmaster@flit.email',
                              pass: 'e783d6450cd2d5101d044b5f091fd271'
                          }
                      });

                      let mailOptions = {
                          from: 'Flit <no-reply@flit.email>',
                          to: email,
                          subject: 'Reset your password',
                          text: text,
                          html: html
                      };
                      transporter.sendMail(mailOptions);
                    });
                  });

                  fn.call(this);
                });
            } else {
              return fn('There has been an internal error. Please try again later.');
            }
          });
        } else {
          return fn('The specified email does not exist.');
        }
      }
  });
}

exports.confirmReset = function(hash, uid, fn) {

  dbo.db.collection('recover').findOne({uid: uid, hash: decodeURIComponent(hash)},
    function(err, doc) {
      if (err) {
        return fn('There has been an internal error. Please try again later.');
      }

      if (doc) {
        fn();
      } else {
        fn('Invalid reset details.');
      }

  });
}

exports.resetPassword = function(hash, uid, data, fn) {

    let password = data.password || '';
    let passwordb = data.passwordb || '';

    if (!password || password.length < 6) {
      return fn('Your password should be at least 6 characters.');
    }
    else if (password != passwordb) {
      return fn('Password and confirmation did not match.');
    }
    else {
      dbo.db.collection('recover').findOne({uid: uid, hash: decodeURIComponent(hash)},
        function(err, doc) {
          if (err) {
            return fn('There has been an internal error. Please try again later.');
          }

          if (!doc) {
            return fn('Invalid reset details.');
          }

          let salt = crypto.randomBytes(128).toString('base64');
          crypto.pbkdf2(password, salt, 5000, 32, function(err, derivedKey) {
              if (!err) {
                dbo.db.collection('users').update(
                  {_id: dbo.id(uid)},
                  {$set: {password: new Buffer(derivedKey).toString('base64'), salt: salt}},
                  function(err, result) {
                    dbo.db.collection('recover').remove({uid: uid}, function(err, res){});
                    fn();
                });
              } else {
                return fn('There has been an internal error. Please try again later.');
              }
          });

      });
    }
}

exports.updateEmail = function(uid, email, fn) {

    uid = dbo.id(uid);
    email = email.toLowerCase().trim();

    validator.validate(email, function(err, response) {
        if (err || !response) {
            // Cant connect to mailgun
            // Default to regexp
            if (!email.match(/^[\w\.\-\+]+@[\w\.\-\+]+\.[\w]+$/)) {
                fn('Email invalid. Confirm and try again');
                return;
            }
        }
        else if (!response.is_valid) {
            let e = 'Email invalid.';
            if (response.did_you_mean)
                e += ' Did you mean '+response.did_you_mean+'?';
            fn(e);
            return;
        }

        dbo.db.collection('users').findOne({_id: uid}, function(err, doc) {
              if (err) {
                fn('There has been an internal error. Please try again later.');
                return;
              } else {
                dbo.db.collection('users').update({_id: uid}, {$set: {email: email}},
                  function(err, result) {
                  if (err)
                      return fn('There has been an internal error. Please try again later.');
                  else
                      return fn(null, {email:email});
                });
              }
          });
    });
}

exports.updatePassword = function(uid, oldPassword, password, fn) {

  uid = dbo.id(uid);

  if (!password || password.length < 6) {
    fn('Your password should be at least 6 characters.');
    return;
  }
  else {
    dbo.db.collection('users').findOne({_id: uid}, function(err, doc) {
      if (err) {
        fn('There has been an internal error. Please try again later.');
        return;
      } else {
        if (doc) {
          crypto.pbkdf2(oldPassword, doc.salt, 5000, 32, function(err, derivedKey) {
            if (!err) {
              let hash = new Buffer(derivedKey).toString('base64');
              if (hash == doc.password) {
                // Update password here
                let salt = crypto.randomBytes(128).toString('base64');
                crypto.pbkdf2(password, salt, 5000, 32, function(err, derivedKey) {
                  if (!err) {
                    dbo.db.collection('users').update({_id: uid},
                      {$set: {password: new Buffer(derivedKey).toString('base64'), salt: salt}},
                      function(err, result) {
                      if (err)
                        fn('There has been an internal error. Please try again later.');
                      else
                        fn(null);
                    });
                  } else {
                    fn('There has been an internal error. Please try again later.');
                  }
                });
              } else {
                fn('Wrong password. Confirm and try again.');
              }
            } else {
              // internal error
              fn('There has been an internal error. Please try again later.');
            }
          });
        }
        else {
            fn('Invalid password. Confirm and try again.');
        }
      }
    });
  }
}
