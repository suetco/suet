
const Accounts = require('../../models/accounts.js')
      , expect = require('chai').expect
      , store = require('../store')
      ;

describe('Signup', function() {
  it('must have parameters', function(done) {
    Accounts.create(undefined, function(err, doc){
      expect(err).to.be.a('string');
      expect(doc).to.be.undefined;
      done();
    });
  });
  it('must be passed a valid email', function(done) {
    Accounts.create({email: 'a', password: '123456'}, function(err, doc){
      expect(err).to.be.a('string');
      expect(doc).to.be.undefined;
      done();
    });
  });
  it('must be passed a password with 6 or more characters', function(done) {
    Accounts.create({email: store.email, password: '12345'}, function(err, doc){
      expect(err).to.be.a('string');
      expect(doc).to.be.undefined;
      done();
    });
  });
  it('should be successful with correct parameters', function(done) {
    Accounts.create({email: store.email, password: '123456'}, function(err, doc){
      expect(err).to.be.null;
      expect(doc).to.be.have.keys(['id', 'email', 'reg_date'])
      done();
    });
  });
  it('should not allow duplicate data', function(done) {
    Accounts.create({email: store.email, password: '123456'}, function(err, doc){
      expect(err).to.be.a('string');
      expect(doc).to.be.undefined;
      done();
    });
  });
});

describe('Login', function() {
  it('must have parameters', function(done) {
    Accounts.login(undefined, function(err, doc){
      expect(err).to.be.a('string');
      expect(doc).to.be.undefined;
      done();
    });
  });
  it('must return error for not existent email', function(done) {
    Accounts.login({email: 'non+exist@suet.co', password: '123456'}, function(err, doc){
      expect(err).to.be.a('string');
      expect(doc).to.be.undefined;
      done();
    });
  });
  it('must return error for wrong password', function(done) {
    Accounts.login({email: store.email, password: '1234567'}, function(err, doc){
      expect(err).to.be.a('string');
      expect(doc).to.be.undefined;
      done();
    });
  });
  it('should be successful with correct parameters', function(done) {
    Accounts.login({email: store.email, password: '123456'}, function(err, doc){
      expect(err).to.be.null;
      expect(doc).to.be.have.keys(['id', 'email', 'reg_date']);
      if (doc && doc.id)
        store.uid = doc.id;
      done();
    });
  });
});

describe('Email Update', function() {
  it('must have valid user id', function(done) {
    Accounts.updateEmail(undefined, store.email, function(err, doc){
      expect(err).to.be.a('string');
      expect(doc).to.be.undefined;
      done();
    });
  });
  it('must have valid user email', function(done) {
    if (!store.uid)
      return done('Didnt get user id');
    Accounts.updateEmail(store.uid, 'email', function(err, doc){
      expect(err).to.be.a('string');
      expect(doc).to.be.undefined;
      done();
    });
  });
  it('must update email', function(done) {
    if (!store.uid)
      return done('Didnt get user id');
    Accounts.updateEmail(store.uid, store.new_email, function(err, doc){
      expect(err).to.be.null;
      expect(doc).to.be.have.keys(['email']);
      if (doc)
        store.email = doc.email;
      done();
    });
  });
});

describe('Password Update', function() {
  it('must be passed user id parameter', function(done) {
    Accounts.updatePassword(undefined, '123456', '654321', function(err, doc){
      expect(err).to.be.a('string');
      expect(doc).to.be.undefined;
      done();
    });
  });
  it('must be passed old password parameter', function(done) {
    if (!store.uid)
      return done('Didnt get user id');
    Accounts.updatePassword(store.uid, undefined, '654321', function(err, doc){
      expect(err).to.be.a('string');
      expect(doc).to.be.undefined;
      done();
    });
  });
  it('must be passed new password parameter', function(done) {
    if (!store.uid)
      return done('Didnt get user id');
    Accounts.updatePassword(store.uid, '123456', undefined, function(err, doc){
      expect(err).to.be.a('string');
      expect(doc).to.be.undefined;
      done();
    });
  });
  it('must have new password with 6 or more characters', function(done) {
    if (!store.uid)
      return done('Didnt get user id');
    Accounts.updatePassword(store.uid, '123456', '12345', function(err, doc){
      expect(err).to.be.a('string');
      expect(doc).to.be.undefined;
      done();
    });
  });
  it('must have valid old password', function(done) {
    if (!store.uid)
      return done('Didnt get user id');
    Accounts.updatePassword(store.uid, '1234560', '654321', function(err, doc){
      expect(err).to.be.a('string');
      expect(doc).to.be.undefined;
      done();
    });
  });
  it('must update password', function(done) {
    if (!store.uid)
      return done('Didnt get user id');
    Accounts.updatePassword(store.uid, '123456', '654321', function(err, doc){
      expect(err).to.be.null;
      // Login wih new password
      Accounts.login({email: store.email, password: '654321'}, function(err, doc){
        expect(err).to.be.null;
        expect(doc).to.be.have.keys(['id', 'email', 'reg_date']);
        done();
      });
    });
  });
});

describe('Delete account', function() {
  it('must be passed user id parameter', function(done) {
    Accounts.deleteProfile(undefined, function(err, status){
      expect(err).to.be.a('string');
      expect(status).to.be.undefined;
      done();
    });
  });
  // #todo, test for domains, logs, mails and users
  it('must delete everything related to account', function(done) {
    if (!store.uid)
      return done('Didnt get user id');
    Accounts.deleteProfile(store.uid, function(err){
      expect(err).to.be.null;
      done();
    });
  });
  it('must not be able to login', function(done) {
    if (!store.uid)
      return done('Didnt get user id');
    Accounts.login({email: store.new_email, password: '654321'}, function(err, doc){
      expect(err).to.be.a('string');
      expect(doc).to.be.undefined;
      done();
    });
  });
});

