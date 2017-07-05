
const expect = require('chai').expect
      , dbo = require('../lib/db.js')
      , store = require('./store')
      ;

describe('Suet', function() {

  before(function(done) {
    dbo.connect(function(err){
      if (err)
        done(err);

      // Clear
      dbo.db().collection('accounts').remove({email: store.email});
      dbo.db().collection('accounts').remove({email: store.new_email});

      done();
    })
  });

  require('./unit/auth.js');
  require('./unit/domains.js');
  require('./unit/webhook.js');

});
