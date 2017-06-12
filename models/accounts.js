var dbo = require('../lib/db.js')
    , crypto = require('crypto')
    , validate = require('mailgun-validate')

    , Domains = require('./domains.js')
    ;

var validator = new validate('pubkey-02iismi5n5xozcmeyu3-ymqe3f9-0da4');

exports.create = function(data, fn) {

  var email = data.email || '';
  var password = data.password || '';

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
      var e = 'Email invalid.';
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
          var salt = crypto.randomBytes(128).toString('base64');
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
  var email = data.email || '';
  var password = data.password || '';

  email = email.toLowerCase().trim();
  dbo.db().collection('accounts').findOne({email: email}, function(err, doc) {
    if (err) {
      return fn('There has been an internal error. Please try again later.');
    } else {
      if (doc) {
        crypto.pbkdf2(password, doc.salt, 5000, 32, 'sha512', function(err, derivedKey) {
          if (!err) {
            var hash = new Buffer(derivedKey).toString('base64');
            if (hash == doc.password) {
              var json = {
                id: doc._id,
                email: doc.email
              };
              // Get his domains
              Domains.get(doc._id, function(err, domains){
                if (domains && domains.length > 0) {
                  json.domains = domains;
                  json.active_domain = domains[0];
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
      else {
        return fn('Email not found.');
      }
    }
  });
}

exports.recoverPassword = function(res, data, fn) {

  var email = data.email || '';
  // Email valid, continue
  dbo.db.collection('users').findOne({email: email},
    function(err, doc) {
      if (err) {
        // pusher here
        return fn('There has been an internal error. Please try again later.');
      } else {
        if (doc) {
          var salt = crypto.randomBytes(128).toString('base64');
          crypto.pbkdf2(salt, salt, 5000, 32, function(err, derivedKey) {
            if (!err) {
                var hash = new Buffer(derivedKey).toString('base64');
                var uid = doc._id.toHexString();
                // Delete all recover for user
                dbo.db.collection('recover').remove({uid: uid}, function(err, removed){});
                // Add this one
                dbo.db.collection('recover').insert({
                    hash: hash,
                    uid: uid,
                    reg_date: new Date()
                }, function(err, result) {
                  // Send email
                  var tmplObj = {hash: encodeURIComponent(hash), uid: uid};
                  res.render('mail_templates/recover', tmplObj, function(err, html) {
                    if (err)  {
                      return;
                    }

                    res.render('mail_templates/recover_txt', tmplObj, function(err, text) {
                      if (err)  {
                        console.log(err);
                        return;
                      }

                      var transporter = nodemailer.createTransport({
                          service: 'Mailgun',
                          auth: {
                              user: 'postmaster@flit.email',
                              pass: 'e783d6450cd2d5101d044b5f091fd271'
                          }
                      });

                      var mailOptions = {
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

    var password = data.password || '';
    var passwordb = data.passwordb || '';

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

          var salt = crypto.randomBytes(128).toString('base64');
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

    var uid = dbo.id(uid);
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
            var e = 'Email invalid.';
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

  var uid = dbo.id(uid);

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
              var hash = new Buffer(derivedKey).toString('base64');
              if (hash == doc.password) {
                // Update password here
                var salt = crypto.randomBytes(128).toString('base64');
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

exports.saveKey = function(acc_id, key, fn) {
  if (!acc_id)
    return fn('Invalid account');
  if (!key)
    return fn('API key missing');

  acc_id = dbo.id(acc_id);

  dbo.db().collection('accounts').findOne({_id: acc_id}, function(err, doc) {
    if (!doc)
      return fn('Invalid account');

    dbo.db().collection('accounts').updateOne({
      _id: acc_id
    }, {
      $set: {key: key}
    }, function(err) {
      if (err)
        return fn('There has been an internal error');

      return fn(null, true);
    });
  });
}
