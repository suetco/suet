require('dotenv').config();
const dbo = require('../lib/db.js')
    , encrypt = require('../lib/utils.js').encrypt
    ;

dbo.connect(err => {

  if (err) {
    console.log(err);
    return process.exit(0);
  }

  dbo.db().collection('domains').find().toArray((err, docs) => {
    docs.map(d => {
      dbo.db().collection('domains').update({_id: d._id}, {$set: {key: encrypt(d.key)}});
    });
  });
});
