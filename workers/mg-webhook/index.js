// Called from Google Cloud HTTP function

const dbClient = require('mongodb').MongoClient
  , crypto = require('crypto')
  , request = require('request')
  , elasticsearch = require('elasticsearch')
  , esc = new elasticsearch.Client({
    host: process.env.ES_HOST,
    httpAuth: process.env.ES_AUTH,
    log: 'error'
  })
  , cheerio = require('cheerio')
  , bugsnag = require('bugsnag')

  , algorithm = 'aes-256-ctr'
  ;

const EMAIL_DOMAIN = process.env.EMAIL_DOMAIN || '';
const DB_NAME = process.env.DB_NAME || '';
const HOST = process.env.HOST || '';
const EMAIL_FROM = process.env.EMAIL_FROM || '';

bugsnag.register(process.env.BS_KEY);

// Actions:
// Check if domain exist
// Verify event
// Check against replay (check signature table and store signature if new)
// Get email details
// Get mail
function decrypt(text) {
  let decipher = crypto.createDecipher(algorithm, process.env.AES_KEY)
  let dec = '';
  try {
    dec = decipher.update(text, 'hex', 'utf8');
    dec += decipher.final('utf8');
  }
  catch(ex) {}

  return dec;
}

function notify(msg_id, slack_webhook, failure_email, recipient,
                  type, color, subject, msg, domain) {
  if (slack_webhook) {
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
      attachment.attachments[0].title_link = `${HOST}/mails/${msg_id}`;
    }
    request.post({
      url: slack_webhook,
      json: true,
      body: attachment
    });
  }
  if (failure_email) {
    request.post({
      'url': `https://api.mailgun.net/v3/${EMAIL_DOMAIN}/messages`,
      'auth': {
        'user': 'api',
        'pass': process.env.EMAIL_KEY,
        'sendImmediately': false
      },
      'form': {
        from: EMAIL_FROM,
        to: failure_email,
        subject: `${type}: ${subject}`,
        text: `Email: ${recipient}\r\nDomain: ${domain}\r\n\r\n${msg}`
      }
    });
  }
}

exports.handler = function(req, res) {

  let event_data = req.body
      , slack_webhook = null
      , failure_email = null
      ;

  if (!event_data['event-data'].event)
    return res.send({error: "No event data"});

  // No support for unsubscribed
  if (event_data['event-data'].event == 'unsubscribed')
    return res.send({error: "Unimplemented"});

  // Required parameters
  if (!event_data.signature.signature || !event_data.signature.timestamp
    || !event_data.signature.token)
    return res.send({error: "Core data missing"});

  let event = event_data['event-data'].event.toLowerCase();

  dbClient.connect(process.env.DB_URL, (err, client) => {

    // DB connection error
    if (err) {
      bugsnag.notify(err);
      return res.send({error: "Db error"});
    }

    const db = client.db(DB_NAME);

    let messageId = event_data['event-data'].message.headers['message-id'];
    if (!messageId)
      return res.send({error: 'Could not get message id'});

    // Note: not longer enough to determine domain
    let domain = messageId.split('@')[1];

    let tags = event_data['event-data'].tag || null;
    // tags or campaigns?
    if (tags && !Array.isArray(tags)) // <-- not sure this is needed anymore
      tags = [tags];

    // Get right domain
    new Promise((resolve, reject) => {
      // If there is a storage url, get domain from storage url
      if (event_data['event-data'].storage &&
          event_data['event-data'].storage.url) {
        domain = event_data['event-data'].storage.url.match(/v3\/domains\/([^\/]*)\//)[1]
        return resolve();
      }

      // See if mail is pulled already and confirm domain from there
      db.collection('mails').findOne({
        msg_id: messageId
      }, (err, doc) => {
        // There is an error or mail found
        if (err)
          return reject();

        if (doc)
          domain = doc.domain;

        return resolve();
      })
    })
    // Who owns domain?
    .then(() => {
      return db.collection('domains').findOne({domain: domain});
    })
    .then(doc => {
      if (!doc)
        throw new Error("Domain not found");

      if (doc.disabled)
        throw new Error("Domain disabled");

      let key = decrypt(doc.key);

      // Verify event
      let hash = crypto.createHmac('sha256', key)
                         .update(`${event_data.signature.timestamp}${event_data.signature.token}`)
                         .digest('hex');
      if (hash !== event_data.signature.signature)
        throw new Error("Incorrect signature");

      // Is Slack connected? Get hook
      if (doc.slack && doc.slack.webhook)
        slack_webhook = doc.slack.webhook;

      if (doc.failure_email)
        failure_email = doc.failure_email;

      return key;
    })
    // Signature Replay?
    .then(apiKey => {
      return new Promise((resolve, reject) => {
        db.collection('signatures').findOne({signature: event_data.signature.signature,
          domain: domain}, (err, doc) => {
          // There is an error or it's a replay
          if (err || doc)
            return reject('Signature replay');

          // Save this signature
          db.collection('signatures').insert({signature: event_data.signature.signature, domain: domain});
          return resolve(apiKey);
        });
      });
    })
    // Get email details
    .then(apiKey => {
      return new Promise((resolve, reject) => {
        // 1. Has the mail been pulled?
        db.collection('mails').findOne({
          msg_id: messageId
        }, (err, doc) => {
          // There is an error or mail found
          if (err)
            return reject();

          if (doc) {
            // Add receiver
            return esc.update({
              index: 'suet',
              type: 'mails',
              id: messageId,
              body: {
                script: "if (ctx._source.to.contains('"+event_data['event-data'].recipient.toLowerCase()+"')) { ctx.op = 'none' } else { ctx._source.to.add('"+event_data['event-data'].recipient.toLowerCase()+"') }",
              }
            }, () => {
              return resolve(doc.subject);
            });
          }

          // No storage url, move on
          if (!event_data['event-data'].storage)
            return resolve();

          let storageUrl = event_data['event-data'].storage.url;

          // 2. Get the stored mail
          request.get({
            url: storageUrl,
            gzip: true,
            auth: {
              user: 'api',
              pass: apiKey
            },
            sendImmediately: false
          }, (err, response, body) => {

            //console.log(storageUrl, apiKey, body);

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
                  to: [event_data['event-data'].recipient.toLowerCase()],
                  date: new Date()
                }
              }, (error, response) => {
                return resolve(body.subject);
              });

            }
            else
              return resolve();
          });// \2

        }); //\1
      });
    })
    // Track event
    .then(subject => {
      return new Promise(function(resolve, reject){
        let email = event_data['event-data'].recipient.toLowerCase()
            , data = {
              msg_id: messageId,
              email: email,
              event: event,
              domain: domain
            }

        if (tags)
          data.tags = tags;

        if (event_data['event-data']['geolocation'] && event_data['event-data']['geolocation'].country)
          data.country = event_data['event-data']['geolocation'].country;
        if (event_data['event-data']['geolocation'] && event_data['event-data']['geolocation'].city)
          data.city = event_data['event-data']['geolocation'].city;
        if (event_data['event-data']['client-info'] && event_data['event-data']['client-info']['client-os'])
          data.os = event_data['event-data']['client-info']['client-os'];
        if (event_data['event-data']['client-info'] && event_data['event-data']['client-info']['client-name'])
          data.client = event_data['event-data']['client-info']['client-name'];
        if (event_data['event-data']['client-info'] && event_data['event-data']['client-info']['device-type'])
          data.platform = event_data['event-data']['client-info']['device-type'];

        if (event == 'clicked') {
          data.url = event_data['event-data'].url;
        }
        else if (event == 'complained') {
          notify(messageId, slack_webhook, failure_email, email,
            'Complained', 'warning', subject, 'The subscriber complained about your email', domain);
        }
        else if (event == 'failed') {
          // Notify of drops
          let msg = '';
          if (event_data['event-data']['delivery-status'].description &&
             event_data['event-data']['delivery-status'].description.length) {
            msg = event_data['event-data']['delivery-status'].description;
          }
          else if (event_data['event-data']['delivery-status'].message) {
            msg = event_data['event-data']['delivery-status'].message;
          }

          notify(messageId, slack_webhook, failure_email, email,
              'Failed', 'danger', subject, msg, domain);
          data.description = msg;
        }

        data.date = new Date(event_data['event-data'].timestamp*1000);

        db.collection('logs').insert(data, function(err) {
          if (err)
            return reject("DB collection error");

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
          else if (event == 'failed') {
            db.collection('tags').updateOne({domain: domain, tag: tag}, {$inc: {failed: 1}}, {upsert: true});
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
      console.log(err);
      bugsnag.notify(err);
      return res.send({error: "Something went wrong"});
    });
  });
}
