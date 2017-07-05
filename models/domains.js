var dbo = require('../lib/db.js')
    , request = require('request')
    ;

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
