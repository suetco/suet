module.exports = function() {

  return function (req, res, next) {
    // Cache control
    res.header("Cache-Control", "no-cache, no-store, must-revalidate");

    var url = req.url.substring(1);
    // If session doesnot exist and accessing any of the secured pages
    var secured = ['dashboard', 'feed', 'mails', 'users', 'settings'];
    if (!req.session.account) {
      for (var page of secured) {
        if (url.lastIndexOf(page, 0) === 0) {
          return res.redirect('/login');
        }
      }
    }
    else {
      // If no domains setup yet, add key
      if (!req.session.account.domains ||
          (req.session.account.domains && req.session.account.domains.length == 0)) {
        for (var page of secured) {
          if (url.lastIndexOf(page, 0) === 0) {
            return res.redirect('/add-key');
          }
        }
      }
    }

    next();
  }
}
