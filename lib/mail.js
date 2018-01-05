const request = require('request')
      , Liquid = require('liquidjs')
      , path = require('path')
      , engine = Liquid({
          root: path.resolve(__dirname, '../public_html/mail_templates'),
          extname: '.liquid'
        });

exports.send = (to, subject, template, tmplObj, fn) => {

    // Send email
    let html;
    engine.renderFile(template, tmplObj)
    .then(_html => {
      html = _html;
      return engine.renderFile(template+'_txt', tmplObj);
    })
    .then(text => {
        let params = {
          from: process.env.EMAIL_FROM,
          subject: subject,
          html: html,
          to: to
        }

        if (text)
          params.text = text;

        request.post({
          url: 'https://api.mailgun.net/v3/'+process.env.EMAIL_DOMAIN+'/messages',
          auth: {
            user: 'api',
            pass: process.env.EMAIL_KEY
          },
          sendImmediately: false,
          form: params
        }, (err, response, body) => {

          if (err || response.statusCode != 200)
            return fn('There has been an error sending the mail. Please try again later.');

          return fn();
        });
    })
    .catch(err => {
      console.log(err);
      return fn('There has been an internal error. Please try again later.');
    })
}
