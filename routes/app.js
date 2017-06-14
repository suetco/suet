const model = require('../models/logs.js')
    , Mails = require('../models/mails.js')
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
    res.render('dashboard', render(req, {
      title: 'Dashboard',
      page: 'dashboard',
    }));
  });

  app.get('/feed', function(req, res) {
    let options = {};
    if (req.query.sort)
      options.sort = req.query.sort;
    model.feed(req.session.account.active_domain, options, function(err, docs) {
      for (let d of docs) {
        d.timeago = moment(d.date).fromNow();
      }
      res.render('feed', render(req, {
        title: 'Feed',
        page: 'feed',
        data: docs
      }));
    })
  });

  app.get('/mails', function(req, res) {
    Mails.getAll(req.session.account.active_domain, {}, function(err, docs) {
      for (let d of docs) {
        d.timeago = moment(d.date).fromNow();
      }
      res.render('mails', render(req, {
        title: 'Mails',
        page: 'mails',
        data: docs
      }));
    })
  });

  app.get('/users', function(req, res) {
    model.users(req.session.account.active_domain, {}, function(err, docs) {
      for (let user of docs) {
        user.timeago = moment(user.last_seen).fromNow();
      }
      res.render('users', render(req, {
        title: 'Users',
        page: 'users',
        data: docs
      }));
    })
  })

}
