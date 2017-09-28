var Accounts = require('../models/accounts.js')
    , render = require('../lib/utils.js').render
    ;

module.exports = function(app){

  // Signup
  app.get('/signup', function(req, res) {
      res.render('signup', render(req, {
        title: 'Signup'
      }));
    });
  app.post('/signup', function(req, res) {
    Accounts.create(req.body, function(err, doc){
      if (err) {
        req.flash('error', err);
        return res.redirect('/signup');
      }

      req.session.account = doc;
      return res.redirect('/dashboard');
    });
  });

  // Login
  app.get('/login', function(req, res) {
      res.render('login', render(req, {
        title: 'Login'
      }));
    });
  app.post('/login', function(req, res) {
    Accounts.login(req.body, function(err, doc){
      if (err) {
        req.flash('error', err);
        return res.redirect('/login');
      }

      req.session.account = doc;
      return res.redirect('/dashboard');
    });
  });

  // Recover
  app.get('/recover', function(req, res) {
      res.render('recover', render(req, {
        title: 'Recover password'
      }));
    });
  app.post('/recover', function(req, res) {
    Accounts.recoverPassword(res, req.body, function(err, doc){
      if (err)
        req.flash('error', err);
      else
        req.flash('info', 'Password reset mail has been sent');

      return res.redirect('/recover');
    });
  });

  app.get('/reset/:hash/:id', function(req, res) {
    Accounts.confirmReset(req.params.hash, req.params.id, function(err, status) {
      if (err) {
        req.flash('error', err);
        return res.redirect('/recover');
      }

      res.render('reset', render(req, {
          title: 'Create new password'
        }));
    })
  });
  app.post('/reset/:hash/:id', function(req, res) {
    Accounts.resetPassword(req.params.hash, req.params.id, req.body, function(err, status) {
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
  app.get('/logout', function(req, res) {
    req.session.destroy();
    res.redirect('/');
  });
}
