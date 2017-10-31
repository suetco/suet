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

      req.session.account.temp = {
        domains: domains,
        key: req.body.key
      };

      res.redirect('/select-domains');
    });
  });
  // Select Domains
  app.get('/select-domains', function(req, res) {
    if (!req.session.account.temp)
      return res.redirect('/add-key');

    res.render('select-domains', render(req, {
      title: 'Select Domains',
      domains: req.session.account.temp.domains
    }));
  });
  app.post('/select-domains', function(req, res) {
    if (!req.body.domains) {
      req.flash('error', 'You did not select any domain');
      return res.redirect('/select-domains');
    }

    let domainHooks = {};
    for (let _d of req.session.account.temp.domains) {
      domainHooks[_d.name] = _d;
    }

    Domains.setupDomains(req.session.account.id, req.session.account.temp.key, req.body.domains,
        domainHooks, function(err, domains){
      if (err) {
        req.flash('error', err);
        return res.redirect('/select-domains');
      }

      delete req.session.account.temp;
      req.session.account.domains = domains;
      req.session.account.active_domain = domains[0];

      res.redirect('/dashboard');
    });
  });

}
