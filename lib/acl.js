module.exports = () => {

  return (req, res, next) => {
    // Cache control
    res.header("Cache-Control", "no-cache, no-store, must-revalidate");

    let url = req.url.substring(1),
        page;
    // If session doesnot exist and accessing any of the secured pages
    let secured = ['dashboard', 'feed', 'search', 'mails', 'users', 'links', 'profile', 'connect',
                  'disconnect', 'settings', 'billing'];
    let login = ['signup', 'recover', 'login'];
    if (!req.session.account) {
      for (page of secured) {
        if (url.lastIndexOf(page, 0) === 0) {
          req.session.ref = req.url;
          return res.redirect('/login');
        }
      }
    }
    else {
      // If logged in but accessing "signup pages"
      for (page of login) {
        if (url.lastIndexOf(page, 0) === 0) {
          return res.redirect('/dashboard');
        }
      }
      // If no domains setup yet, add key
      if (!req.session.account.domains ||
          (req.session.account.domains && req.session.account.domains.length == 0)) {
        for (page of secured) {
          if (url.lastIndexOf(page, 0) === 0) {
            return res.redirect('/select-service');
          }
        }
      }
    }

    next();
  }
}
