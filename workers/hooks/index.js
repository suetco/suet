// Called from Google Cloud HTTP function

const dbClient = require('mongodb').MongoClient
  , crypto = require('crypto')
  , request = require('request')
  , multer = require('multer')
  , parser = multer().none()
  ;

let dbUrl = process.env.DB_URL || '';
let hook = process.env.HOOK || 'https://suet.co';

// Actions:
// Check if domain exist
// Verify event
// Check against replay (check signature table and store signature if new)
// Get email details
// Get mail
function sendToSlack(msg_id, webhook, recipient, type, color, subject, msg) {
  if (!webhook) return;
  let attachment = {
    attachments: [{
      fallback: msg,
      color: color,
      author_name: recipient,
      author_link: "mailto:"+recipient,
      fields: [{
        title: type,
        value: msg,
        short: false
      }]
    }]
  };
  if (subject) {
    attachment.attachments[0].title = subject;
    attachment.attachments[0].title_link = [hook, '/mails/', msg_id].join('');
  }
  request.post({
      url: webhook,
      json: true,
      body: attachment
    });
}

exports.handler = function(req, res) {

  // Add multipart/form-data support
  parser(req, res, function(){

    let event_data = req.body,
        slack_webhook = null;

    if (!event_data.event)
      return res.send({error: "No event data"});

    // No support for unsubscribed
    if (event_data.event == 'unsubscribed')
      return res.send({error: "Unimplemented"});

    // Required parameters
    if (!event_data.signature || !event_data.timestamp
      || !event_data.token || !event_data.domain)
      return res.send({error: "Core data missing"});

    dbClient.connect(dbUrl, function(err, db) {

      // DB connection error
      if (err) {
        console.log(err);
        return res.send({error: "Db error"});
      }

      let domain = event_data.domain;
      // Inconsistency in mailgun's API
      let messageId = event_data['message-id'] || event_data['Message-Id'];
      if (!messageId) {
        return res.send({error: 'Could not get message id'});
      }

      messageId = messageId.replace(/[\>\<]/g, '');

      // Who owns domain?
      let p = new Promise(function(resolve, reject){
        db.collection('domains').findOne({domain: domain}, function(err, doc){
          // There is an error or no doc
          if (err || !doc)
            return res.send({error: "Domain not found"});

          // Verify event
          let hash = crypto.createHmac('sha256', doc.key)
                             .update([event_data.timestamp, event_data.token].join(''))
                             .digest('hex');
          if (hash != event_data.signature)
            return res.send({error: "Incorrect signature"});

          // Is Slack connected? Get hook
          if (doc.slack && doc.slack.webhook)
            slack_webhook = doc.slack.webhook;

          return resolve(doc.key);
        });
      })
      // Signature Replay?
      .then(function(apiKey){
        return new Promise(function(resolve, reject){
          db.collection('signatures').findOne({signature: event_data.signature}, function(err, doc){
            // There is an error or it's a replay
            if (err || doc)
              return reject('Signature replay');

            // Save this signature
            db.collection('signatures').insert({signature: event_data.signature});
            return resolve(apiKey);
          });
        });
      })
      // Get email details
      // todo: Allow turning this off
      .then(function(apiKey){
        return new Promise(function(resolve, reject){
          // 1. Has the mail been pulled?
          db.collection('mails').findOne({
            msg_id: messageId
          }, function(err, doc){
            // There is an error or no doc
            if (err || doc)
              return resolve();

            // 2. Get the related event
            request.get({
              'url': ['https://api.mailgun.net/v3/', domain, '/events'].join(''),
              'gzip': true,
              'qs': {
                'message-id': messageId
              },
              'auth': {
                'user': 'api',
                'pass': apiKey
              }
            }, function(err, response, body) {

              // No body content for you :/
              if (err || response.statusCode != 200)
                return resolve();

              body = JSON.parse(body);

              if (!body.items || body.items.length == 0)
                return resolve();

              body = body.items[0];
              if (!body.storage || !body.storage.url)
                return resolve();

              // 3. Get the stored mail
              request.get({
                'url': body.storage.url,
                'gzip': true,
                'auth': {
                  'user': 'api',
                  'pass': apiKey
                }
              }, function(err, response, body) {

                // No body content for you :/
                if (err || response.statusCode != 200)
                  return resolve();

                body = JSON.parse(body);

                if (body.subject && body['stripped-html']) {
                  // Save
                  db.collection('mails').insert({
                    msg_id: messageId,
                    domain: domain,
                    subject: body.subject,
                    body: body['stripped-html'],
                    date: new Date(body.Date)
                  });

                  return resolve(body.subject);
                }
                else
                  return resolve();

              });  // \3
            }); // \2
          }); // \1
        });
      })
      // Track event
      .then(function(subject){
        return new Promise(function(resolve, reject){
          let event = event_data.event.toLowerCase()
              , email = event_data.recipient.toLowerCase()

              , data = {
                msg_id: messageId,
                email: email,
                event: event,
                domain: domain
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
            sendToSlack(messageId, slack_webhook, email,
              'Complained', 'warning', subject, 'The subscriber complained about your email');
          }
          else if (event == 'dropped') {
            // Notify of drops
            if (event_data.description) {
              let msg = event_data.description;
              if (event_data.reason)
                msg += ' #'+event_data.reason;

              sendToSlack(messageId, slack_webhook, email,
                'Dropped', 'danger', subject, msg);
            }
            if (event_data.reason)
              data.reason = event_data.reason;
            if (event_data.code)
              data.code = event_data.code;
            if (event_data.description)
              data.description = event_data.description;
          }
          else if (event == 'bounced') {
            // Notify of bounce
            if (event_data.error) {
              sendToSlack(messageId, slack_webhook, email,
                'Bounced', 'warning', subject, event_data.error);
            }

            if (event_data.error)
              data.error = event_data.error;
            if (event_data.code)
              data.code = event_data.code;
            if (event_data.notification)
              data.description = event_data.notification;
          }

          data.date = new Date(event_data.timestamp*1000);

          db.collection('logs').insert(data, function(err) {
            if (err) {
              return res.send({error: "DB collection error"});
            }

            let setParams = {
              email: email,
              domain: domain,
              last_seen: new Date()
            }

            // Uniques
            if (event == 'clicked') {
              // Mail clicked
              db.collection('mails').updateOne({msg_id: messageId}, {$inc: {clicked: 1}});
              db.collection('logs').distinct('url', {email: email, domain: domain, event: 'clicked'}, function(err, docs){
                if (!err)
                  setParams.unique_clicks = docs.length;

                return resolve(setParams);
              });
            }
            else if (event == 'opened') {
              // Mail Opened
              db.collection('mails').updateOne({msg_id: messageId}, {$inc: {opened: 1}});
              db.collection('logs').distinct('msg_id', {email: email, domain: domain, event: 'opened'}, function(err, docs){
                if (!err)
                  setParams.unique_opens = docs.length;

                return resolve(setParams);
              });
            }
            else
              return resolve(setParams);
          });
        });
      })
      .then(function(setParams){
        let inc = {};
        inc[event_data.event] = 1;
        db.collection('users').updateOne({
          email: setParams.email,
          domain: setParams.domain
        }, {
          $set: setParams,
          $inc: inc
        }, {upsert: true});

        return res.send({status:"ok"});
      })
      .catch(function(err){
        console.log(err);

        return res.send({error: "Something went wrong"});
      });

    });

  });
}
