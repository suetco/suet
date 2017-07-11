## Installation

### Requirements

- NodeJs (>= 6.0)
- MongoDB (>= 3.4)

### Download and Config

It is assumed you have MongoDB installed already. If not, [install MongoDB](https://docs.mongodb.com/manual/installation/). Note that MongoDB must be publicly accessible via an IP or domain if you are using Google Cloud HTTP function to handle your webhooks (see [Webhook Setup](#webhook-setup)). If you can, I recommend you host MongoDB on a separate server.

- Create directory locally or on your server
- Run `git clone https://github.com/kehers/suet` in the directory or just download and unzip right in
- Run `npm install`

Next, you will need to create the environmental variables. The email variables (prefixed with `EMAIL_`) are used to send password recovery emails. Suet uses [Mailgun’s API](https://documentation.mailgun.com/en/latest/quickstart-sending.html#how-to-start-sending-email) to send emails instead of normal SMTP. The Slack variables (prefixed with `SLACK_`) are used to sign in Slack accounts that should be connected to the Mailgun domains for notifications. (See [Connecting Slack](#connecting-slack))

The environment variables are:

- `HOST` (The IP or web address your application will be located at, without the trailing slash e.g. http://suet.some.paas)
- `DB_URL` (URL of your MongoDB database e.g mongodb://localhost/suet)
- `EMAIL_FROM` (The sender identification for the email. Format “Name \<email>” e.g. Suet \<no-reply@suet.co>)
- `EMAIL_DOMAIN` (The Mailgun domain you want to send emails from)
- `EMAIL_KEY` (The API key of the domain above. Login to your Mailgun account and click the domain to get the domain API key)
- `WEBHOOK` (Your webhook URL. See [Webhook Setup](#webhook-setup). This is optional. Defaults to `HOST`/webhook if not added)
- `SLACK_CLIENT_ID` (Your Slack app’s client ID. See [Connecting Slack](#connecting-slack))
- `SLACK_CLIENT_SECRET` (Your Slack app’s client secret. See [Connecting Slack](#connecting-slack))

Now you can start the app with the environmental variables. A straight forward way to do this is to simply run it in command line like this:

`HOST="http://suet.some.paas" DB_URL="mongodb://localhost/suet" EMAIL_FROM="Suet <no-reply@mg-domain.co>" EMAIL_KEY="key-123" EMAIL_DOMAIN="mg-domain.co" SLACK_CLIENT_ID="123" SLACK_CLIENT_SECRET="abc" node app.js`

*(Todo: Use file based config. This is becoming a mess :/)*

### Webhook Setup

You need to setup a [webhook](http://mailgun-documentation.readthedocs.io/en/latest/api-webhooks.html) that Mailgun will send events to. The recommended option is to use [Google Cloud HTTP function](https://cloud.google.com/functions/docs/writing/http). It is highly scalable especially if you send lots of mails.

> Q: Why not AWS API gateway + Lambda?
 
> A: Mailgun uses the content-type multipart/form-data to send some event data and this content-type is not supported by AWS API gateway (yet).

If microservices is not your thing or just can't go through the stress, there is a webhook endpoint available at `[host]/webhook`.

#### Using Google Cloud HTTP function

- Go to your [Google Cloud Console](https://console.cloud.google.com/) (if you don't have an account yet, create one).
- Enable Cloud functions in the dashboard.
- Click on **Create Function**.
- Enter your preferred name (e.g suet-hooks).
- In the trigger section, select **HTTP trigger**. Note the **URL**, that will be your webhook URL.
- Edit `workers/hooks/index.js` and enter your MongoDB URL. (No environment variable in Google cloud or I wasn’t looking well enough).
- Also enter the HOST variable (as defined in your environment variable above). This is used to create mail links sent to Slack.
- Copy the content of the file and paste in the index.js section of the Cloud function.
- Copy the content of `workers/hooks/package.json` and paste in the package.json section.
- Select or create a **Stage bucket**. The stage bucket is simply where the code is staged. You can use anything here.
- In **Function to execute**, enter `handler`.
- Save.

#### Using app's webhook endpoint

No setup or config needed here. Your webhook is automatically available at `[host]/webhook`.

### Update endpoint in Mailgun

Once you have the webhook setup and have the webhook URL handy, visit [Mailgun](https://mailgun.com/app/webhooks) and update your webhook endpoint to point to either your Google Cloud function URL or `[host]/webhook` depending on which one you are going with. The `Unsubscribes` event is not supported so you can leave it out.

Mailgun will now start sending events to your webhook URL.

### Connecting Slack

You can connect [Slack](https://slack.com/) to Suet to be able to receive complaint, bounce and fail notifications. To do this you need to create a Slack app and add the details to Suet. Once added, domains can be connected to Slack in the domain settings page of the Suet dashboard.

- Visit [api.slack.com/apps](https://api.slack.com/apps) and click on the `Create New App` button.
- Enter the required details and proceed.
- Under the `Add features and functionality` section, click on `Incoming Webhooks`.
- Activate Incoming Webhooks in the next page (toggle the switch to `On`) then go back to previous page.
- Scroll down to `App Credentials` and copy your Client ID and Client Secret.
- Use the credentials as your Slack environment variables.

