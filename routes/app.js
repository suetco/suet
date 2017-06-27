const Logs = require('../models/logs.js')
    , Mails = require('../models/mails.js')
    , Users = require('../models/users.js')
    , Accounts = require('../models/accounts.js')
    , render = require('../lib/utils.js').render
    , moment = require('moment')
    ;

moment.updateLocale('en', {
    relativeTime : {
        future: "in %s",
        past:   "%s",
        s:  "now",
        m:  "1m",
        mm: "%dm",
        h:  "1h",
        hh: "%dh",
        d:  "1d",
        dd: "%dd",
        M:  "1m",
        MM: "%dm",
        y:  "1y",
        yy: "%dy"
    }
});

module.exports = function(app){

  app.get('/switch/:domain', function(req, res) {
    let domain = req.params.domain;
    // If domain exist
    if (req.session.account.domains.indexOf(domain) != -1 &&
      req.session.account.active_domain != domain)
      req.session.account.active_domain = domain;

    res.redirect('back');
  });

  app.get('/dashboard', function(req, res) {
    Accounts.dashboardData(req.session.account.active_domain, function(err, data) {
      res.render('dashboard', render(req, {
        title: 'Dashboard',
        page: 'dashboard',
        data: data
      }));
    });
  });

  app.get('/feed', function(req, res) {
    let options = {};
    if (req.query.sort)
      options.sort = req.query.sort;
    if (req.query.dir)
      options.dir = req.query.dir;
    if (req.query.filter)
      options.filter = req.query.filter;
    if (req.query.offset)
      options.offset = req.query.offset;
    Logs.feed(req.session.account.active_domain, options, function(err, data) {
      if (!err) {
        for (let d of data.data) {
          d.timeago = moment(d.date).fromNow();
        }
      }

      res.render('feed', render(req, {
        title: 'Feed',
        page: 'feed',
        query: req.query,
        filter: req.query.filter,
        data: data
      }));
    })
  });

  app.get('/mails', function(req, res) {
    let options = {};
    if (req.query.sort)
      options.sort = req.query.sort;
    Mails.getAll(req.session.account.active_domain, options, function(err, data) {
      for (let d of data.data) {
        d.timeago = moment(d.date).fromNow();
      }
      res.render('mails', render(req, {
        title: 'Mails',
        page: 'mails',
        data: data
      }));
    })
  });
  app.get('/mails/:id', function(req, res) {
    Mails.get(req.params.id, req.session.account.active_domain, function(err, doc) {
      if (err || !doc) {
        req.flash('error', err);
        return res.redirect('/mails');
      }
      for (let d of doc.logs) {
        d.timeago = moment(d.date).fromNow();
      }
      res.render('mail', render(req, {
        title: doc.subject,
        page: 'mails',
        data: doc
      }));
    })
  });

  app.get('/users', function(req, res) {
    let options = {sort: 'last_seen'};
    if (req.query.sort)
      options.sort = req.query.sort;
    if (req.query.dir)
      options.dir = req.query.dir;
    if (req.query.offset)
      options.offset = req.query.offset;
    Users.getAll(req.session.account.active_domain, options, function(err, data) {
      for (let user of data.data) {
        user.timeago = moment(user.last_seen).fromNow();
      }
      res.render('users', render(req, {
        title: 'Users',
        page: 'users',
        query: req.query,
        data: data
      }));
    })
  });
  app.get('/users/:email', function(req, res) {
    Users.get(req.params.email, req.session.account.active_domain, function(err, doc) {
      if (err || !doc) {
        req.flash('error', err);
        return res.redirect('/users');
      }
      for (let d of doc.logs) {
        d.timeago = moment(d.date).fromNow();
      }
      res.render('user', render(req, {
        title: doc.email,
        page: 'users',
        data: doc
      }));
    })
  });

  app.get('/settings', function(req, res) {
    res.render('settings', render(req, {
      title: 'Settings'
    }));
  });
}
