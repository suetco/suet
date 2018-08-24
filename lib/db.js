let dbClient = require('mongodb').MongoClient
    , ObjectID = require('mongodb').ObjectID
    , db = null
    ;

module.exports = {
  id: ObjectID,
  db: () => {
    return db;
  },
  connect: (fn) => {
    // Use connect method to connect to the Server
    dbClient.connect(process.env.DB_URL, {
      poolSize: 20,
      reconnectTries: 1800,
      reconnectInterval: 2000
    }, (err, client) => {
      if (err)
        return fn(err);

      db = client.db(process.env.DB_NAME);
      return fn(err);
    });
  }
}
