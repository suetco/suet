
const hook = require('../../workers/hooks/index.js')
      , expect = require('chai').expect
      ;

// todo: Detailed test

describe('Webhook', function() {
  it('to be a function', function() {
    expect(hook.handler).to.be.a('function');
  });
});
