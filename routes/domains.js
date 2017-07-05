var Domains = require('../models/domains.js')
    , render = require('../lib/utils.js').render
    ;

module.exports = function(app){

  // Add key
  app.get('/add-key', function(req, res) {
      res.render('add-key', render(req, {
        title: 'Add API key'
      }));
    });
  app.post('/add-key', function(req, res) {
    if (!req.body.key) {
      req.flash('error', 'You missed the API key');
      return res.redirect('/add-key');
    }

    Domains.getDomains(req.session.account.id, req.body.key, function(err, domains){
      if (err) {
        req.flash('error', err);
        return res.redirect('/add-key');
      }

      req.session.account.domains = domains;
      if (domains.length > 0)
        req.session.account.active_domain = domains[0];

      res.redirect('/dashboard');
    });
  });

}
