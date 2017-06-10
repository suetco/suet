var express = require('express')
    , Liquid = require('shopify-liquid')
    , engine = Liquid()
    , moment = require('moment')
    , session = require('express-session')
    , sessionStore = require('connect-mongo')(session)
    , bodyParser = require('body-parser')
    , flash = require('flash')
    , compression = require('compression')
    //, favicon = require('serve-favicon')

    // Libs
    , env = require('./env.js')
    , dbo = require('./lib/db.js')
    ;

dbo.connect(function(err){

  if (err) {
    // todo: Notify!!!
    return process.exit(0);
  }

  // Filters
  engine.registerFilter('remove', function(v, arg){
    var arr = [];
    for (var k in v) {
      if (k != arg)
        arr.push([k, '=', v[k]].join(''));
    }

    return arr.join('&');
  });

  // Config
  var app = express();
  app.listen(3000);

  // Middlewares
  var sess = {
    secret: 's1asfas53qedw',
    maxAge: 3600000 * 24 * 365,
    store: new sessionStore({
      db: dbo.db(),
      ttl: 3600000 * 24 * 365
    }),
    resave: false,
    saveUninitialized: false
  }
  app.use(session(sess));

  app.engine('liquid', engine.express());
  app.set('view engine', 'liquid');
  app.set('views', __dirname + '/public_html');
  app.use(flash());
  app.use(compression());
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(express.static(__dirname + '/public_html'));
  // Cache control
  app.use(function (req, res, next) {
    res.header("Cache-Control", "no-cache, no-store, must-revalidate");
    /*var secured = ['dashboard', 'access', 'edit', 'budget'];
    var req_acc = ['dashboard', 'edit', 'budget'];
    if (req.session.account) {
      for (var page of secured) {
        if (req.url.indexOf(page) != -1) {
          return res.redirect('/');
          break;
        }
    }*/
    next();
  });

  // Routes
  require('./routes/app.js')(app);

});
