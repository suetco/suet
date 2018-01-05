const Domains = require('../models/domains.js')
    , request = require('request')
    ;

module.exports = app => {
  // Connect Slack
  app.get('/connect/slack', (req, res) => {
    // 1. Verify code is returned
    // Was there an error?
    if (req.query.error) {
      req.flash('error', req.query.error);
      return res.redirect('/settings');
    }
    // Ok, but was code missing?
    if (!req.query.code) {
      return res.redirect('/settings');
    }

    // Convert code to token then
    request.get({
      'url': 'https://slack.com/api/oauth.access',
      'gzip': true,
      'qs': {
        'client_id': process.env.SLACK_CLIENT_ID,
        'client_secret': process.env.SLACK_CLIENT_SECRET,
        'redirect_uri': [process.env.HOST, '/connect/slack'].join(''),
        'code': req.query.code
      },
      json: true
    }, (err, response, body) => {
      if (err || response.statusCode != 200 || !body.team_name
         || !body.incoming_webhook) {
        req.flash('error', 'There has been an error, adding the Slack account. Try again later');
        return res.redirect('/settings');
      }

      if (!body.incoming_webhook.url) {
        req.flash('error', 'There has been an error, adding the Slack account. Try again later');
        return res.redirect('/settings');
      }

      // Save webhook url
      Domains.saveSlackAcc(req.session.account.active_domain.domain, {
        team: body.team_name,
        webhook: body.incoming_webhook.url
      }, (err, team) => {
        if (err) {
          req.flash('error', err);
          return res.redirect('/settings');
        }

        // All clear
        return res.redirect('/settings');
      });

    });
  });
  // Disconnect Slack
  app.get('/disconnect/slack', (req, res) => {
    // Save webhook url
    Domains.removeSlack(req.session.account.active_domain.domain, err => {
      if (err) {
        req.flash('error', err);
        return res.redirect('/settings');
      }

      // All clear
      req.flash('info', 'Slack Team disconnected');
      return res.redirect('/settings');
    });
  });
}
