var model = require('../models/logs.js')
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

  app.get('/dashboard', function(req, res) {
    res.render('dashboard', render(req, {
      title: 'Dashboard',
      page: 'dashboard',
    }));
  });

  app.get('/mails', function(req, res) {
    res.render('mails', render(req, {
      title: 'Mails',
      page: 'mails',
    }));
  });

  app.get('/feed', function(req, res) {
    model.feed(function(err, docs) {
      for (var d of docs) {
        d.timeago = moment(d.date).fromNow();
      }
      res.render('feed', render(req, {
        title: 'Feed',
        page: 'feed',
        data: docs
      }));
    })
  });

  app.get('/users', function(req, res) {
    model.users(function(err, docs) {
      for (var user of docs) {
        user.timeago = moment(user.last_seen).fromNow();
        if (!user.clicked)
          user.clicked = 0;
        if (!user.opened)
          user.opened = 0;
        if (!user.unique_opens)
          user.unique_opens = 0;
        if (!user.unique_clicks)
          user.unique_clicks = 0;
      }
      res.render('users', render(req, {
        title: 'Users',
        page: 'users',
        data: docs
      }));
    })
  })

}
