// Called from Amazon API gateway

var dbClient = require('mongodb').MongoClient;

exports.handler = function(event_data, context, callback) {

  if (!event_data.event)
    return callback();

  context.callbackWaitsForEmptyEventLoop = false;

  dbClient.connect(process.env.db_url, function(err, db) {

    // DB connection error
    if (err)
      return callback(err);

    var event = event_data.event.toLowerCase()
        , email = event_data.recipient
        , inc = {}
        , unique_clicks = 0
        , unique_opens = 0
        ;

    var data = {
      msg_id: event_data['message-id'],
      email: email,
      event: event,
      domain: event_data.domain,
      date: new Date(event_data.timestamp*1000)
    }

    if (event_data.country)
      data.country = event_data.country;
    if (event_data.city)
      data.city = event_data.city;
    if (event_data['client-os'])
      data.os = event_data['client-os'];
    if (event_data['client-name'])
      data.client = event_data['client-name'];
    if (event_data['device-type'])
      data.platform = event_data['device-type'];

    if (event == 'clicked') {
      data.url = event_data.url;
    }
    else if (event == 'complained') {
      // Notify user of complaint
    }
    else if (data.event == 'dropped') {
      // Notify of drops
      if (event_data.reason)
        data.reason = event_data.reason;
      if (event_data.code)
        data.code = event_data.code;
      if (event_data.description)
        data.description = event_data.description;
    }
    else if (data.event == 'bounced') {
      // Notify of bounce
      if (event_data.error)
        data.error = event_data.error;
      if (event_data.code)
        data.code = event_data.code;
      if (event_data.notification)
        data.description = event_data.notification;
    }

    inc[event] = 1;

    db.collection('logs').insert(data, function(err) {
      if (err)
        return callback(err);

      var p = Promise.resolve();
      // Uniques
      if (event == 'clicked') {
        p.then(function() {
          return new Promise(function(resolve) {
            db.collection('logs').distinct('url', {email: email, event: 'clicked'}, function(err, docs){
              if (!err)
                unique_clicks = docs.length;

              resolve();
            });
          });
        });
      }
      else if (event == 'opened') {
        p.then(function() {
          return new Promise(function(resolve) {
            db.collection('logs').distinct('msg_id', {email: email, event: 'opened'}, function(err, docs){
              if (!err)
                unique_opens = docs.length;

              resolve();
            });
          });
        });
      }

      p.then(function() {
        db.collection('users').update({email: email}, {
          $set: {email: email, unique_opens: unique_opens, unique_clicks: unique_clicks, last_seen: new Date()}
          , $inc: inc
        }, {upsert: true});

        return callback(null, {status:"ok"});
      })
      .catch(function(err){
        return callback(err);
      });

    });
  });
};
