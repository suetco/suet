const Logs = require('../models/logs.js')
    , Mails = require('../models/mails.js')
    , Users = require('../models/users.js')
    , Links = require('../models/links.js')
    , Accounts = require('../models/accounts.js')
    , Domains = require('../models/domains.js')

    , render = require('../lib/utils.js').render
    , smtpError = require('../lib/utils.js').getSMTPError
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

module.exports = app => {

  app.get('/switch/:domain', (req, res) => {
    // If domain exist
    for (let domain of req.session.account.domains) {
      if (domain.domain == req.params.domain) {
        req.session.account.active_domain = domain;
        break;
      }
    }

    res.redirect('back');
  });

  app.get('/dashboard', (req, res) => {
    Accounts.dashboardData(req.session.account.active_domain.domain, req.query, (err, data) => {
      res.render('dashboard', render(req, {
        title: 'Dashboard',
        webhook: process.env.WEBHOOK || [process.env.HOST, '/webhook'].join(''),
        page: 'dashboard',
        query: req.query,
        data: data
      }));
    });
  });

  app.get('/feed', (req, res) => {
    let options = {};
    if (req.query.sort)
      options.sort = req.query.sort;
    if (req.query.dir)
      options.dir = req.query.dir;
    if (req.query.action)
      options.action = req.query.action;
    if (req.query.date)
      options.date = req.query.date;
    if (req.query.offset)
      options.offset = req.query.offset;
    Logs.feed(req.session.account.active_domain.domain, options, (err, data) => {
      if (!err) {
        for (let d of data.data) {
          d.timeago = moment(d.date).fromNow();
          if (!d.description)
            d.description = smtpError(d.code);
        }
      }

      res.render('feed', render(req, {
        title: 'Feed',
        page: 'feed',
        query: req.query,
        action: req.query.action,
        date: req.query.date,
        data: data
      }));
    })
  });

  app.get('/mails', (req, res) => {
    let options = {};
    if (req.query.sort)
      options.sort = req.query.sort;
    if (req.query.offset)
      options.offset = req.query.offset;
    Mails.getAll(req.session.account.active_domain.domain, options, (err, data) => {
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
  app.get('/mails/:id', (req, res) => {
    Mails.get(req.params.id, req.session.account.active_domain.domain, (err, doc) => {
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

  app.get('/users', (req, res) => {
    let options = {sort: 'last_seen'};
    if (req.query.sort)
      options.sort = req.query.sort;
    if (req.query.dir)
      options.dir = req.query.dir;
    if (req.query.offset)
      options.offset = req.query.offset;
    Users.getAll(req.session.account.active_domain.domain, options, (err, data) => {
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
  app.get('/users/:email', (req, res) => {
    Users.get(req.params.email, req.session.account.active_domain.domain, (err, doc) => {
      if (err || !doc) {
        req.flash('error', err);
        return res.redirect('/users');
      }
      for (let d of doc.logs) {
        d.timeago = moment(d.date).fromNow();
        if (!d.description)
          d.description = smtpError(d.code);
      }
      res.render('user', render(req, {
        title: doc.email,
        page: 'users',
        data: doc
      }));
    })
  });

  app.get('/links', (req, res) => {
    let options = {sort: 'date', dir: 'desc'};
    if (req.query.sort)
      options.sort = req.query.sort;
    if (req.query.dir)
      options.dir = req.query.dir;
    if (req.query.offset)
      options.offset = req.query.offset;
    Links.getAll(req.session.account.active_domain.domain, options, (err, data) => {
      if (!err && data) {
        for (let d of data.data) {
          d.url = d._id;
          delete d._id;
          d.timeago = moment(d.date).fromNow();
          let _emails = [];
          for (let e of d.emails) {
            _emails.push(`<a href="users/${e.email}">${e.email}</a>`);
          }
          d.clickers = "";
          let l = _emails.length;
          if (l > 4) {
            d.clickers = _emails.slice(0, 4).join(', ');
            d.clickers += ' and '+(l - 4)+' others';
          }
          else
            d.clickers = _emails.join(', ');
        }
      }

      res.render('links', render(req, {
        title: 'Links',
        page: 'links',
        query: req.query,
        data: data
      }));
    })
  });
  app.get('/links/:url', (req, res) => {
    Links.get(req.params.url, req.session.account.active_domain.domain, (err, doc) => {
      if (err || !doc) {
        req.flash('error', err);
        return res.redirect('/links');
      }
      for (let d of doc) {
        d.timeago = moment(d.date).fromNow();
      }

      res.render('link', render(req, {
        title: decodeURIComponent(req.params.url),
        page: 'links',
        data: doc
      }));
    })
  });

  app.get('/profile', (req, res) => {
    res.render('profile', render(req, {
      title: 'Profile'
    }));
  });
  app.post('/profile', (req, res) => {
    if (req.body.email) {
      Accounts.updateEmail(req.session.account.id, req.body.email, (err, status) => {
        if (err) {
          req.flash('error', err);
        }
        else {
          req.flash('info', 'Email updated');
          req.session.account.email = status.email;
        }

        return res.redirect('/profile');
      });
    }
    else if (req.body.password) {
      Accounts.updatePassword(req.session.account.id,
        req.body.password, req.body.new_password, (err, status) => {
        if (err)
          req.flash('error', err);
        else
          req.flash('info', 'Password updated');

        return res.redirect('/profile');
      });
    }
    else if (req.body.delete) {
      Accounts.deleteProfile(req.session.account.id, (err, status) => {
        if (err) {
          req.flash('error', err);
          return res.redirect('/profile');
        }

        return res.redirect('/logout');
      });
    }
    else
      return res.redirect('/profile');
  });

  app.get('/settings', (req, res) => {
    Domains.getOne(req.session.account.id,
      req.session.account.active_domain.domain, (err, domain) => {

        // If removing a member
        if (req.query.remove && domain) {
          if (domain.owner !== req.session.account.id) {
            req.flash('error', 'Only administrators can perform this action');
            return res.redirect('/settings');
          }

          return Accounts.removeProfile(req.query.remove,
            req.session.account.active_domain.domain, err => {
            if (err)
              req.flash('error', err);
            else
              req.flash('info', 'Member removed from domain');

            return res.redirect('/settings');
          });
        }

        res.render('settings', render(req, {
          title: 'Settings',
          host: process.env.HOST,
          domain: domain,
          client_id: process.env.SLACK_CLIENT_ID
        }));
    });
  });
  app.post('/settings', (req, res) => {
    Domains.getOne(req.session.account.id,
      req.session.account.active_domain.domain, (err, domain) => {
      if (domain.owner !== req.session.account.id) {
        req.flash('error', 'Only administrators can perform this action');
        return res.redirect('/settings');
      }

      if (req.body.invite_email) {
        Accounts.add(req.session.account.email,
          req.body.invite_email, domain.domain, (err, email) => {
            if (err)
              req.flash('error', err);
            else
              req.flash('info', 'Member invited to domain');

            return res.redirect('/settings');
        });
      }
      else if (req.body.delete) {
        Domains.delete(domain.domain, err => {
          if (err)
            req.flash('error', err);

          // Remove from domains session
          for (let i in req.session.account.domains) {
            if (req.session.account.domains[i].domain == domain.domain) {
              req.session.account.domains.splice(i, 1);
              break;
            }
          }

          // Remove active domain
          req.flash('info', domain.domain+' was successfully removed from your Suet account');
          delete req.session.account.active_domain;
          // Redirect
          if (req.session.account.domains.length > 0) {
            req.session.account.active_domain = req.session.account.domains[0];
            res.redirect('/dashboard');
          }
          else {
            res.redirect('/add-key');
          }
        });
      }
    });
  });
}
