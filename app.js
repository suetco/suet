require('dotenv').config();
const express = require('express')
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
    , acl = require('./lib/acl.js')
    , dbo = require('./lib/db.js')
    ;

dbo.connect(function(err){

  if (err) {
    // todo: Notify!!!
    console.log(err);
    return process.exit(0);
  }

  // Index DB
  require('./lib/indexes.js')(dbo);

  // Filters
  // Override 'remove'
  engine.registerFilter('remove', function(v, arg){
    let arr = [],
        arg_arr = arg.split(',')
        ;

    // Remove
    for (let _arg of arg_arr) {
      for (let k in v) {
        if (k == _arg)
          delete v[k];
      }
    }
    // Build http query
    for (k in v)
      arr.push([k, '=', v[k]].join(''));

    return arr.join('&');
  });
  engine.registerFilter('sum', function(v){
    if (!v)
      return 0;
    return v.reduce(function(a, b) {
      return a + b;
    }, 0);
  });
  engine.registerFilter('format', function(v){
    if (!v)
      return 0;
    return v.toLocaleString();
  });

  // Config
  const app = express();
  app.listen(process.env.PORT || 3000);

  // Middlewares
  const sess = {
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
  app.use(acl());

  // Routes
  require('./routes/auth.js')(app);
  require('./routes/domains.js')(app);
  require('./routes/app.js')(app);
  require('./routes/connections.js')(app);
  require('./routes/static.js')(app);

  // No matching route
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    // todo: log err.message
    console.log(err.message);
    res.end();
    //res.render('error');
  });

});
