var dbo = require('../lib/db.js')
    , request = require('request')
    ;

// Get list of domains connected to account
exports.get = function(accId, fn) {
  if (!accId)
    return fn('Invalid account');
  dbo.db().collection('domains').find({
    accs: dbo.id(accId)
  }).toArray(function(err, docs) {
    if (err) {
      return fn('Internal Error');
    }

    fn(null, docs);
  });
}

// Get a domain
exports.getOne = function(accId, domain, fn) {
  if (!accId)
    return fn('Invalid account');
  if (!domain)
    return fn('Invalid domain');
  dbo.db().collection('domains').findOne({
    accs: dbo.id(accId),
    domain: domain
  }, function(err, doc) {
    if (err)
      return fn('Internal Error');

    if (!doc)
      return fn();

    doc.owner = doc.owner.toHexString();

    dbo.db().collection('accounts').find({_id: {$in: doc.accs}}).toArray(function(err, users){
      doc.users = [];
      for (let user of users) {
        doc.users.push({
          id: user._id.toHexString(),
          email: user.email
        });
      }
      fn(null, doc);
    });
  });
}

// Get domains from Mailgun
exports.getDomains = function(accId, key, fn) {

  if (!accId)
    return fn('Invalid account');
  if (!key)
    return fn('You missed the API key.');

  accId = dbo.id(accId);
  dbo.db().collection('accounts').findOne({_id: accId}, function(err, doc) {
    if (!doc)
      return fn('Invalid account');

    // Validate API key and get domains
    request.get({
      'url': 'https://api.mailgun.net/v3/domains',
      'gzip': true,
      'auth': {
        'user': 'api',
        'pass': key
      }
    }, function(err, response, body) {

      if (err || response.statusCode != 200) {
        return fn('Error validating your Mailgun API key. Please try again later.');
      }

      body = JSON.parse(body);

      if (body && body.items) {
        if (body.items.length == 0)
          return fn('No domains found in your account');

        var domains = [];
        for (var domain of body.items) {
          // Save domains in account
          domains.push(domain.name);
          dbo.db().collection('domains').updateOne({
            domain: domain.name
          }, {
            $addToSet: {accs: accId},
            $set: {key: key, owner: accId}
          }, {upsert: true});
        }

        return fn(null, domains);
      }

      return fn('There has been an error getting the domains. Try again later');
    });
  });
}

// Connect Slack to the domain
exports.saveSlackAcc = function(domain, params, fn) {

  if (!domain)
    return fn('No domain provided');
  if (!params)
    return fn('Slack details empty');
  if (!params.team || !params.webhook)
    return fn('Slack details empty');

  dbo.db().collection('domains').updateOne({
    domain: domain
  }, {$set: {
      slack: {
        team: params.team,
        webhook: params.webhook
      }
    }
  }, function(err, status) {
    if (err) {
      return fn('Internal Error');
    }

    fn(null, params.team);
  });
}

// Disconnect Slack from the domain
exports.removeSlack = function(domain, fn) {

  if (!domain)
    return fn('No domain provided');

  dbo.db().collection('domains').updateOne({
    domain: domain
  }, {$unset: {slack: true}}, function(err) {
    if (err) {
      return fn('Internal Error');
    }

    fn();
  });
}

// Remove a user account from profile
exports.removeProfile = function(id, accId, fn) {

  if (!id) {
    if (fn)
      return fn('No domain id provided');

    return;
  }

  dbo.db().collection('domains').updateOne({
    _id: dbo.id(id)
  }, {$pull: {accs: dbo.id(accId)}}, function(err) {
    if (!fn)
      return;

    if (err) {
      return fn('Internal Error');
    }

    fn();
  });
}

// Delete the domain
exports.delete = function(id, fn) {

  if (!id)
    return fn('No domain id provided');

  id = dbo.id(id);

  // Get domain
  dbo.db().collection('domains').findOne({
    _id: id
  }, function(err, doc) {
    if (err)
      return fn('Internal Error');

    if (!doc)
      return fn('Domain not found');

    // Delete all
    dbo.db().collection('logs').remove({domain: doc.domain});
    dbo.db().collection('mails').remove({domain: doc.domain});
    dbo.db().collection('users').remove({domain: doc.domain});
    dbo.db().collection('domains').remove({_id: id}, function(err){
      if (err)
        return fn('Internal Error');

      return fn();
    });
  });
}
