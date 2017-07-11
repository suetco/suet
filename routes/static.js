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

  // Webhook (if you cant use Google cloud functions)
  // Use cloud functions if you can though
  app.all('/webhook', function(req, res) {
    return hook.handler(req, res);
  });
}
