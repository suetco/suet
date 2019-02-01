const dbClient = require('mongodb').MongoClient
      , request = require('request')
      , useragent = require('useragent')

      , dbUrl = process.env.DB_URL || ''
      , dbName = 'suet'

      , elasticsearch = require('elasticsearch')
      , esc = new elasticsearch.Client({
        host: process.env.ES_HOST,
        httpAuth: process.env.ES_AUTH,
        log: 'error'
      })
      , bugsnag = require('bugsnag')
      ;

const EMAIL_DOMAIN = process.env.EMAIL_DOMAIN || '';
const DB_NAME = process.env.DB_NAME || '';
const HOST = process.env.HOST || '';
const EMAIL_FROM = process.env.EMAIL_FROM || '';

bugsnag.register(process.env.BS_KEY);

function notify(msg_id, slack_webhook, failure_email, recipient, type, color, subject, msg) {
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
        text: msg
      }
    });
  }
}

exports.handler = function(req, res) {
  // Confirm subscription?
  if (req.is('text/*')) {
    req.body = JSON.parse(req.body);
    if (req.body.SubscribeURL) {
      request.get(req.body.SubscribeURL);
      return res.end();
    }
  }

  let body = JSON.parse(req.body.Message);

  if (!body.eventType)
    return res.end();

  let event = body.eventType.toLowerCase()
      , event_data = body
      , slack_webhook = null
      , failure_email = null
      ;

  dbClient.connect(process.env.DB_URL, (err, client) => {

    // DB connection error
    if (err) {
      bugsnag.notify(err);
      return res.send({error: "Db error"});
    }

    const db = client.db(DB_NAME);

    let domain = event_data.mail.tags['ses:from-domain'][0];
    let messageId = event_data.mail.messageId;
    let email = event_data.mail.destination[0];

    // #todo: Add support for tags later

    // Who owns domain?
    new Promise((resolve, reject) => {
      db.collection('domains').findOne({domain: domain}, (err, doc) => {
        // There is an error or no doc
        if (err || !doc)
          return res.send({error: "Domain not found"});

        if (doc.disabled)
          return res.send({error: "Domain disabled"});

        // #todo: Verify event is from SES

        // Is Slack connected? Get hook
        if (doc.slack && doc.slack.webhook)
          slack_webhook = doc.slack.webhook;
        if (doc.failure_email)
          failure_email = doc.failure_email

        // 1. Has the mail been pulled?
        db.collection('mails').findOne({
          msg_id: messageId
        }, (err, doc) => {
          // There is an error or mail found
          if (err || doc) {
            // #todo
            // Add receiver
            /*return esc.update({
              index: 'suet',
              type: 'mails',
              id: messageId,
              body: {
                script: "if (ctx._source.to.contains('"+event_data.recipient.toLowerCase()+"')) { ctx.op = 'none' } else { ctx._source.to.add('"+event_data.recipient.toLowerCase()+"') }",
              }
            }, function(){
              return resolve();
            });*/
            return resolve(doc.subject);
          }

          /*let o = {
            msg_id: messageId,
            domain: domain,
            subject: event_data.mail.commonHeaders.subject,
            date: date
          }
          if (tags)
            o.tags = tags;//*/
          db.collection('mails').insert({
            msg_id: messageId,
            domain: domain,
            subject: event_data.mail.commonHeaders.subject,
            date: new Date()
          });

          // Index search
          esc.index({
            index: 'suet',
            type: 'mails',
            id: messageId,
            body: {
              subject: body.subject,
              domain: domain,
              to: event_data.mail.commonHeaders.to,
              date: new Date()
            }
          },  (error, response) => {
            return resolve(event_data.mail.commonHeaders.subject);
          });


        }); // \1
      });
    })
    // Track event
    .then(subject => {

      return new Promise((resolve, reject) => {
        let data = {
              msg_id: messageId,
              email: email,
              event: event,
              domain: domain
            }

        // if (tags)
        //   data.tags = tags;
        // if (event_data.country)
        //   data.country = event_data.country;
        // if (event_data.city)
        //   data.city = event_data.city;

        // Get user agent details
        let ua;
        if (event == 'click')
          ua = useragent.parse(event_data.click.userAgent);
        else if (event == 'open')
          ua = useragent.parse(event_data.open.userAgent);
        else if (event == 'complaint')
          ua = useragent.parse(event_data.complaint.userAgent);
        if (ua) {
          data.os = ua.os.family;
          data.client = ua.family;
          data.platform = ua.device.family;
        }

        if (event == 'click') {
          event = 'clicked';
          data.url = event_data.click.link;
        }
        else if (event == 'open') {
          event = 'opened';
        }
        else if (event == 'delivery') {
          event = 'delivered';
        }
        else if (event == 'complaint') {
          event = 'complained';
          notify(messageId, slack_webhook, failure_email, email,
            'Complained', 'warning', subject, 'The subscriber complained about your email');
        }
        else if (event == 'reject') {
          event = 'failed';
          notify(messageId, slack_webhook, failure_email, email,
              'Dropped', 'danger', subject, event_data.reject.reason);
          data.description = event_data.reject.reason || '';
        }
        else if (event == 'bounce') {
          event = 'failed';
          notify(messageId, slack_webhook, failure_email, email,
              'Bounced', 'warning', subject, event_data.bounce.bouncedRecipients[0].diagnosticCode);
          data.code = event_data.bounce.bouncedRecipients[0].diagnosticCode;
          data.description = event_data.bounce.bouncedRecipients[0].diagnosticCode || '';
        }
        else {
          // Not supported
          return reject();
        }

        data.event = event;
        data.date = new Date(event_data.mail.timestamp);

        db.collection('logs').insert(data, err => {
          if (err)
            return Promise.reject("DB collection error");

          let setParams = {
            email: email,
            domain: domain,
            last_seen: new Date()
          }

          // Calculate Uniques
          if (event == 'clicked') {
            // Mail clicked
            db.collection('mails').updateOne({msg_id: messageId}, {$inc: {clicked: 1}});
            db.collection('logs').distinct('url', {email: email, domain: domain, event: 'clicked'}, (err, docs) => {
              if (!err)
                setParams.unique_clicks = docs.length;

              return resolve(setParams);
            });
          }
          else if (event == 'opened') {
            // Mail Opened
            db.collection('mails').updateOne({msg_id: messageId}, {$inc: {opened: 1}});
            db.collection('logs').distinct('msg_id', {email: email, domain: domain, event: 'opened'}, (err, docs) => {
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
      }, {upsert: true}, () => {
        return res.send({status:"ok"});
      });
    })
    .catch(err => {
      bugsnag.notify(err);
      return res.send({error: "Something went wrong"});
    });
  });
}
