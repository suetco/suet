// Called from Google Cloud HTTP function

const dbClient = require('mongodb').MongoClient
  , crypto = require('crypto')
  , request = require('request')
  , multer = require('multer')
  , parser = multer().none()
  , elasticsearch = require('elasticsearch')
  , esc = new elasticsearch.Client({
    host: process.env.ES_HOST,
    httpAuth: process.env.ES_AUTH,
    log: 'error'
  })
  , cheerio = require('cheerio')
  , bugsnag = require('bugsnag')

  , smtpErrors = {
    421: "Recipient server not available.",
    450: "User's mailbox temporarily not available.",
    451: "Server error. Message failed.",
    452: "Insufficient system storage",
    550: "Mailbox is unavailable or recipient server rejected message.",
    551: "Mailbox does not exist on the recipient server.",
    552: "Mailbox does not have enough storage to accept message.",
    553: "Mailbox does not exist.",
    554: "General failure"
    // Mailgun specific. Non standard
    //498: "General failure",
    //605: "General failure",
    //499: "General failure (request timeout)"
  }

  , algorithm = 'aes-256-ctr'
  ;

let dbUrl = process.env.DB_URL || '';
let host = process.env.HOST || 'https://suet.co';

bugsnag.register(process.env.BS_KEY);

// Actions:
// Check if domain exist
// Verify event
// Check against replay (check signature table and store signature if new)
// Get email details
// Get mail
function decrypt(text) {
  let decipher = crypto.createDecipher(algorithm, process.env.AES_KEY);
  let dec = '';
  try {
    dec = decipher.update(text, 'hex', 'utf8');
    dec += decipher.final('utf8');
  }
  catch(ex) {}

  return dec;
}

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
    attachment.attachments[0].title_link = [host, '/mails/', msg_id].join('');
  }
  request.post({
      url: webhook,
      json: true,
      body: attachment
    });
}

function getSMTPError(code) {
  return smtpErrors[code] ? smtpErrors[code] : "General failure";
}

exports.handler = function(req, res) {

  // Add multipart/form-data support
  parser(req, res, () => {

    let event_data = req.body
        , slack_webhook = null;

    if (!event_data.event)
      return res.send({error: "No event data"});

    // No support for unsubscribed
    if (event_data.event == 'unsubscribed')
      return res.send({error: "Unimplemented"});

    // Required parameters
    if (!event_data.signature || !event_data.timestamp
      || !event_data.token || !event_data.domain)
      return res.send({error: "Core data missing"});

    let event = event_data.event.toLowerCase();

    dbClient.connect(dbUrl, (err, db) => {

      // DB connection error
      if (err) {
        bugsnag.notify(err);
        return res.send({error: "Db error"});
      }

      let domain = event_data.domain;
      // Inconsistency in mailgun's API
      let messageId = event_data['message-id'] || event_data['Message-Id'];
      if (!messageId)
        return res.send({error: 'Could not get message id'});

      messageId = messageId.replace(/[\>\<]/g, '');
      let tags = event_data.tag || event_data['X-Mailgun-Tag'] || null;
      if (tags && !Array.isArray(tags))
        tags = [tags];

      // Who owns domain?
      new Promise((resolve, reject) => {
        db.collection('domains').findOne({domain: domain}, (err, doc) => {
          // There is an error or no doc
          if (err || !doc)
            return res.send({error: "Domain not found"});

          if (doc.disabled)
            return res.send({error: "Domain disabled"});

          let key = decrypt(doc.key);

          // Verify event
          let hash = crypto.createHmac('sha256', key)
                             .update([event_data.timestamp, event_data.token].join(''))
                             .digest('hex');
          if (hash !== event_data.signature)
            return res.send({error: "Incorrect signature"});

          // Is Slack connected? Get hook
          if (doc.slack && doc.slack.webhook)
            slack_webhook = doc.slack.webhook;

          return resolve(key);
        });
      })
      // Signature Replay?
      .then(function(apiKey){
        return new Promise(function(resolve, reject){
          db.collection('signatures').findOne({signature: event_data.signature, domain: domain}, function(err, doc){
            // There is an error or it's a replay
            if (err || doc)
              return reject('Signature replay');

            // Save this signature
            db.collection('signatures').insert({signature: event_data.signature, domain: domain});
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
            // There is an error or mail found
            if (err || doc) {
              // Add receiver
              return esc.update({
                index: 'suet',
                type: 'mails',
                id: messageId,
                body: {
                  script: "if (ctx._source.to.contains('"+event_data.recipient.toLowerCase()+"')) { ctx.op = 'none' } else { ctx._source.to.add('"+event_data.recipient.toLowerCase()+"') }",
                }
              }, function(){
                return resolve();
              });
            }

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
              if (err || response.statusCode != 200) {
                return resolve();
              }

              body = JSON.parse(body);

              if (!body.items || body.items.length == 0) {
                return resolve();
              }

              let storageUrl;
              // Loop through items
              // Sometimes, storage is not always in first item
              for (let item of body.items) {
                if (item.storage && item.storage.url) {
                  storageUrl = item.storage.url;
                  break;
                }
              }
              if (!storageUrl) {
                return resolve();
              }

              // 3. Get the stored mail
              request.get({
                'url': storageUrl,
                'gzip': true,
                'auth': {
                  'user': 'api',
                  'pass': apiKey
                }
              }, function(err, response, body) {

                // No body content for you :/
                if (err || response.statusCode != 200) {
                  return resolve();
                }

                body = JSON.parse(body);

                if (body.subject && body.subject.length && (body['stripped-html'] || body['body-plain'])) {
                  // Save
                  let date = body.Date ? new Date(body.Date) : new Date();
                  let content = body['stripped-html'] || body['body-plain'];

                  // Search here
                  let o = {
                    msg_id: messageId,
                    domain: domain,
                    subject: body.subject,
                    body: content,
                    date: date
                  };
                  if (tags)
                    o.tags = tags;
                  db.collection('mails').insert(o);

                  // Index for search
                  let bodyText = '';
                  let $ = cheerio.load(content);
                  $('style,script,footer,header,menu,nav,frame,font,frameset,embed,object,applet,menu,link,form,aside').remove();
                  let bodyEl = $('body');
                  if (bodyEl)
                    bodyText = bodyEl.text();
                  else
                    bodyText = content;

                  esc.index({
                    index: 'suet',
                    type: 'mails',
                    id: messageId,
                    body: {
                      subject: body.subject,
                      body: bodyText.replace(/(<([^>]+)>)/ig, ""),
                      domain: domain,
                      to: [event_data.recipient.toLowerCase()],
                      date: new Date()
                    }
                  }, function (error, response) {
                    return resolve(body.subject);
                  });

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
          let email = event_data.recipient.toLowerCase()
              , data = {
                msg_id: messageId,
                email: email,
                event: event,
                domain: domain
              }

          if (tags)
            data.tags = tags;
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
            let msg = '';
            if (event_data.description) {
              msg = event_data.description+' ';
              data.description = event_data.description;
            }
            else if (event_data.code) {
              msg = getSMTPError(event_data.code);
              data.code = event_data.code;
            }

            sendToSlack(messageId, slack_webhook, email,
                'Dropped', 'danger', subject, msg);
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
            if (err)
              return Promise.reject("DB collection error");

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
      .then(setParams => {
        let inc = {};
        inc[event] = 1;
        db.collection('users').updateOne({
          email: setParams.email,
          domain: setParams.domain
        }, {
          $set: setParams,
          $inc: inc
        }, {upsert: true});

        return;
      })
      .then(() => {

        if (!tags)
          return res.send({status:"ok"});

        // Update Tag counts...
        let tagPromises = tags.map(tag => {
          return new Promise((resolve, reject) => {
            // based on event
            if (event == 'clicked') {
              db.collection('logs').distinct('url', {
                domain: domain, tags: tag, event: 'clicked'
              }, (err, docs) => {
                if (!err)
                  db.collection('tags').updateOne({domain: domain, tag: tag}, {
                    $set: {unique_clicks: docs.length},
                    $inc: {clicked: 1}
                  }, {upsert: true});

                return resolve();
              });
            }
            else if (event == 'delivered') {
              db.collection('tags').updateOne({domain: domain, tag: tag}, {$inc: {delivered: 1}}, {upsert: true});
              return resolve();
            }
            else if (event == 'opened') {
              db.collection('logs').distinct('email', {
                domain: domain, tags: tag, event: 'opened'
              }, (err, docs) => {
                if (!err)
                  db.collection('tags').updateOne({domain: domain, tag: tag}, {
                    $set: {unique_opens: docs.length},
                    $inc: {opened: 1}
                  }, {upsert: true});

                return resolve();
              });
            }
            else if (event == 'complained') {
              db.collection('tags').updateOne({domain: domain, tag: tag}, {$inc: {complained: 1}}, {upsert: true});
              return resolve();
            }
            else if (event == 'dropped') {
              db.collection('tags').updateOne({domain: domain, tag: tag}, {$inc: {dropped: 1}}, {upsert: true});
              return resolve();
            }
            else if (event == 'bounced') {
              db.collection('tags').updateOne({domain: domain, tag: tag}, {$inc: {bounced: 1}}, {upsert: true});
              return resolve();
            }
            else
              return resolve();
          })
        });
        Promise.all(tagPromises)
        .then(done => res.send({status:"ok"}))
        .catch(err => res.send({status:"ok"}))
        ;
      })
      .catch(err => {
        bugsnag.notify(err);
        return res.send({error: "Something went wrong"});
      });
    });
  });
}
