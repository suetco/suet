
const Domains = require('../../models/domains.js')
      , expect = require('chai').expect
      , store = require('../store')
      ;

describe('Domains', function() {

  describe('Get domains from Mailgun from API key', function() {
    it('must be passed account id', function(done) {
      Domains.getDomains(undefined, 'key-12345', function(err, doc){
        expect(err).to.be.a('string');
        expect(doc).to.be.undefined;
        done();
      });
    });
    it('must be passed API key parameter', function(done) {
      Domains.getDomains(store.uid, undefined, function(err, doc){
        expect(err).to.be.a('string');
        expect(doc).to.be.undefined;
        done();
      });
    });
    it('must return invalid key error', function(done) {
      Domains.getDomains(store.uid, 'key-12345', function(err, doc){
        expect(err).to.be.a('string');
        expect(doc).to.be.undefined;
        done();
      });
    });
    // todo: use https://github.com/node-nock/nock here to test response if key valid
    // Or just pass correct API key via process.env?
  });
  describe('Get user domains in DB', function() {
    it('must be passed account id', function(done) {
      Domains.get(undefined, function(err, doc){
        expect(err).to.be.a('string');
        expect(doc).to.be.undefined;
        done();
      });
    });
    it('must return domains', function(done) {
      Domains.get(store.uid, function(err, doc){
        expect(err).to.be.null;
        expect(doc).to.be.an('array');
        done();
      });
    });
  });
});
