const render = require('../lib/utils.js').render
    , SEShook = require('../workers/ses-webhook/index.js')
    , MGhook = require('../workers/mg-webhook/index.js')
    , hook = require('../workers/hooks/index.js')
    ;

module.exports = app => {

  app.get('/', (req, res) => {
    res.render('index', render(req));
  });

  app.get('/privacy', (req, res) => {
    res.render('privacy', render(req, {
      title: 'Privacy policy'
    }));
  });
  app.get('/terms', (req, res) => {
    res.render('tos', render(req, {
      title: 'Terms of Service'
    }));
  });

  app.get('/support', (req, res) => {
    res.render('support', render(req, {
      title: 'Support'
    }));
  });

  // Webhook (if you cant use Google cloud functions)
  // Use cloud functions if you can though
  // Deprecated
  app.all('/webhook', (req, res) => {
    // If a webhook is set, ignore this
    if (process.env.WEBHOOK)
      return res.end();

    return hook.handler(req, res);
  });
  app.all('/mailgun/webhook', (req, res) => {
    // If a webhook is set, ignore this
    if (process.env.WEBHOOK)
      return res.end();

    return MGhook.handler(req, res);
  });
  app.all('/ses/webhook', (req, res) => {
    // If a webhook is set, ignore this
    if (process.env.SES_WEBHOOK)
      return res.end();

    return SEShook.handler(req, res);
  });
}
