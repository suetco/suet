const Domains = require('../models/domains.js')
    , render = require('../lib/utils.js').render
    ;

module.exports = app => {

  app.get('/select-service', (req, res) => {
      res.render('select-service', render(req, {
        title: 'Select Service'
      }));
    });

  app.get('/ses/add-key', (req, res) => {
      res.render('ses-add-key', render(req, {
        title: 'Add IAM keys'
      }));
    });
  app.post('/ses/add-key', (req, res) => {
    if (!req.body.id) {
      req.flash('error', 'You missed the Access ID');
      return res.redirect('/ses/add-key');
    }
    if (!req.body.secret) {
      req.flash('error', 'You missed the Access Secret');
      return res.redirect('/ses/add-key');
    }

    Domains.getSESDomains(req.session.account.id, req.body, (err, domains) => {
      if (err) {
        req.flash('error', err);
        return res.redirect('/ses/add-key');
      }

      req.session.account.temp = {
        domains: domains,
        key: req.body
      };

      res.redirect('/ses/select-domains');
    });
  });
  //*/

  app.get('/mailgun/add-key', (req, res) => {
      res.render('mailgun-add-key', render(req, {
        title: 'Add API key'
      }));
    });
  app.post('/mailgun/add-key', (req, res) => {
    if (!req.body.key) {
      req.flash('error', 'You missed the API key');
      return res.redirect('/mailgun/add-key');
    }

    Domains.getMGDomains(req.session.account.id, req.body.key, (err, domains) => {
      if (err) {
        req.flash('error', err);
        return res.redirect('/mailgun/add-key');
      }

      req.session.account.temp = {
        domains: domains,
        key: req.body.key
      };

      res.redirect('/mailgun/select-domains');
    });
  });

  // SES Select Domains
  app.get('/ses/select-domains', (req, res) => {
    if (!req.session.account.temp)
      return res.redirect('/add-key');

    res.render('ses-select-domains', render(req, {
      title: 'Select Domains',
      domains: req.session.account.temp.domains
    }));
  });
  app.post('/ses/select-domains', (req, res) => {
    if (!req.body.domains) {
      req.flash('error', 'You did not select any domain');
      return res.redirect('/ses/select-domains');
    }

    Domains.setupSESDomains(req.session.account.id, req.session.account.temp.key,
      req.body.domains, err => {
      if (err) {
        req.flash('error', err);
        return res.redirect('/ses/select-domains');
      }

      delete req.session.account.temp;
      Domains.get(req.session.account.id, (err, domains) => {
        req.session.account.domains = domains;
        req.session.account.active_domain = domains[0];

        res.redirect('/ses/complete');
      })

    });
  });
  app.get('/ses/complete', (req, res) => {
    res.render('ses-complete', render(req, {
      title: 'Setup complete'
    }));
  });

  // MG Select Domains
  app.get('/mailgun/select-domains', (req, res) => {
    if (!req.session.account.temp)
      return res.redirect('/add-key');

    res.render('mailgun-select-domains', render(req, {
      title: 'Select Domains',
      domains: req.session.account.temp.domains
    }));
  });
  app.post('/mailgun/select-domains', (req, res) => {
    if (!req.body.domains) {
      req.flash('error', 'You did not select any domain');
      return res.redirect('/mailgun/select-domains');
    }

    let domainHooks = {};
    for (let _d of req.session.account.temp.domains) {
      domainHooks[_d.name] = _d;
    }

    Domains.setupMGDomains(req.session.account.id, req.session.account.temp.key, req.body.domains,
        domainHooks, err => {
      if (err) {
        req.flash('error', err);
        return res.redirect('/mailgun/select-domains');
      }

      delete req.session.account.temp;
      Domains.get(req.session.account.id, (err, domains) => {
        req.session.account.domains = domains;
        req.session.account.active_domain = domains[0];

        res.redirect('/dashboard');
      })

    });
  });

}
