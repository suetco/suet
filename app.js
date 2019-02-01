require('dotenv').config();
const express = require('express')
    , Liquid = require('liquidjs')
    , engine = Liquid()
    , moment = require('moment')
    , session = require('express-session')
    , sessionStore = require('connect-mongo')(session)
    , bodyParser = require('body-parser')
    , helmet = require('helmet')
    , path = require('path')
    , flash = require('flash')
    , compression = require('compression')
    , favicon = require('serve-favicon')
    , bugsnag = require('bugsnag')

    // Libs
    , acl = require('./lib/acl.js')
    , dbo = require('./lib/db.js')
    ;

bugsnag.register(process.env.BS_KEY);

dbo.connect(err => {

  // Config
  const app = express();
  app.listen(process.env.PORT || 3000);
  //app.use(helmet());
  app.use(bugsnag.requestHandler);

  if (err)
    bugsnag.notify(err);

  // Index DB
  require('./lib/indexes.js')(dbo);

  // Filters
  // Override 'remove'
  engine.registerFilter('remove', (v, arg) => {
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
  engine.registerFilter('sum', v => {
    if (!v)
      return 0;
    return v.reduce((a, b) => {
      return a + b;
    }, 0);
  });
  engine.registerFilter('format', v => {
    if (!v)
      return 0;
    return v.toLocaleString();
  });
  engine.registerFilter('literal_escape', v => {
    if (!v)
      return v;
    v = v.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<script[^>]*>[\s\S]*/gi, '').replace(/`/g, '\\`')
    return v;
  });
  engine.registerFilter('colour', v => {
    var hash = 0;
    if (v.length == 0) return hash;
    for (let i = 0; i < v.length; i++) {
      hash = v.charCodeAt(i) + ((hash << 5) - hash);
      hash = hash & hash;
    }
    shortened = hash % 360;
    return "hsl(" + shortened + ",90%,70%)";
  })

  // Middlewares
  const sess = {
    secret: process.env.SESSION_KEY,
    maxAge: 3600000 * 24 * 365,
    store: new sessionStore({
      db: dbo.db(),
      ttl: 3600000 * 24 * 365
    }),
    resave: false,
    saveUninitialized: false,
    unset: 'destroy'
  }
  app.use(session(sess));

  app.engine('liquid', engine.express());
  app.set('view engine', 'liquid');
  app.set('views', __dirname + '/public_html');
  app.use(favicon(path.join(__dirname, 'public_html', 'favicon.ico')));
  app.use(flash());
  app.use(compression());
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(bodyParser.json());
  app.use(bodyParser.text());
  app.use(express.static(__dirname + '/public_html/static'));
  app.use(acl());

  // Routes
  require('./routes/auth.js')(app);
  require('./routes/domains.js')(app);
  require('./routes/app.js')(app);
  require('./routes/connections.js')(app);
  require('./routes/static.js')(app);

  // No matching route
  app.use((err, req, res, next) => {
    res.status(err.status || 500);
    // todo: log err.message
    console.log(err.message);
    res.end();
    //res.render('error');
  });

});
