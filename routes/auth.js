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

  // Logout
  app.get('/logout', function(req, res) {
    req.session.destroy();
    res.redirect('/');
  });
}
