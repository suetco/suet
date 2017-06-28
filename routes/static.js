var hook = require('../workers/hooks/index.js')
    , render = require('../lib/utils.js').render
    ;

module.exports = function(app){

  // Webhook (if you cant use Google cloud functions)
  // Use cloud functions if you can though
  app.get('/', function(req, res) {
    res.render('index', render(req));
  });

  app.get('/webhook', function(req, res) {
    return hook.handler(req, res);
  });
}
