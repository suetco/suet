var Accounts = require('../models/accounts.js')
    , render = require('../lib/utils.js').render
    ;

module.exports = app => {

  // Signup
  app.get('/signup', (req, res) => {
      res.render('signup', render(req, {
        title: 'Signup'
      }));
    });
  app.post('/signup', (req, res) => {
    Accounts.create(req.body, (err, doc)=> {
      if (err) {
        req.flash('error', err);
        return res.redirect('/signup');
      }

      req.session.account = doc;
      return res.redirect('/dashboard');
    });
  });

  // Login
  app.get('/login', (req, res) => {
      res.render('login', render(req, {
        title: 'Login'
      }));
    });
  app.post('/login', (req, res) => {
    Accounts.login(req.body, (err, doc)=> {
      if (err) {
        req.flash('error', err);
        return res.redirect('/login');
      }

      req.session.account = doc;
      if (req.session.ref) {
        let ref = req.session.ref;
        delete req.session.ref;
        return res.redirect(ref);
      }

      return res.redirect('/dashboard');
    });
  });

  // Recover
  app.get('/recover', (req, res) => {
      res.render('recover', render(req, {
        title: 'Recover password'
      }));
    });
  app.post('/recover', (req, res) => {
    Accounts.recoverPassword(req.body, (err, doc)=> {
      if (err)
        req.flash('error', err);
      else
        req.flash('info', 'Password reset mail has been sent');

      return res.redirect('/recover');
    });
  });

  app.get('/reset/:hash/:id', (req, res) => {
    Accounts.confirmReset(req.params.hash, req.params.id, (err, status) => {
      if (err) {
        req.flash('error', err);
        return res.redirect('/recover');
      }

      res.render('reset', render(req, {
          title: 'Create new password'
        }));
    })
  });
  app.post('/reset/:hash/:id', (req, res) => {
    Accounts.resetPassword(req.params.hash, req.params.id, req.body, (err, status) => {
      if (err) {
        req.flash('error', err);
        return res.redirect('/reset/'+req.params.hash+'/'+req.params.id);
      }

      req.flash('info', 'Password reset successful. Login to continue.');
      // todo: auto login
      res.redirect('/login');
    })
  });

  // Logout
  app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
  });
}
