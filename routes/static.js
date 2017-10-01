var hook = require('../workers/hooks/index.js')
    , render = require('../lib/utils.js').render
    ;

module.exports = function(app){

  app.get('/', function(req, res) {
    res.render('index', render(req));
  });

  app.get('/privacy', function(req, res) {
    res.render('privacy', render(req, {
      title: 'Privacy policy'
    }));
  });
  app.get('/terms', function(req, res) {
    res.render('tos', render(req, {
      title: 'Terms of Service'
    }));
  });

  app.get('/support', function(req, res) {
    res.render('support', render(req, {
      title: 'Support'
    }));
  });

  // Webhook (if you cant use Google cloud functions)
  // Use cloud functions if you can though
  app.all('/webhook', function(req, res) {
    // If a webhook is set, ignore this
    if (process.env.WEBHOOK)
      return res.end();

    return hook.handler(req, res);
  });
}
