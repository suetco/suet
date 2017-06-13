var hook = require('../workers/hooks/index.js')
    ;

module.exports = function(app){

  // Webhook (if you cant use Google cloud functions)
  // Use cloud functions if you can though
  app.get('/webhook', function(req, res) {
    return hook.handler(req, res);
  });
}
