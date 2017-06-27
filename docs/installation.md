## Installation

### Requirements

- NodeJs (>= 4.0)
- MongoDb (>= 3.4)

### Download and Config

It is assumed you have MongoDb installed already. If not, [install MongoDb](https://docs.mongodb.com/manual/installation/). Note that MongoDb must be publicly accessible via an IP or domain if you are using Google Cloud HTTP function (see Webhook Setup). If you can, I recommend you use a separate server to host MongoDb.

- Create directory locally or on your server
- Run `git clone https://github.com/kehers/suet` in the directory or just download and unzip right in
- Run `npm install`
- Create the following environmental variables: ~.
- Start `app.js` (node/forever/pm2 or whatever you are comfortable with)

### Webhook Setup

You need to setup a [webhook](http://mailgun-documentation.readthedocs.io/en/latest/api-webhooks.html) that Mailgun will send events to. The recommended option is to use [Google Cloud HTTP function](https://cloud.google.com/functions/docs/writing/http). It is highly scalable especially if you send lots of mails.

> Q: Why not AWS API gateway + Lambda?
 
> A: Mailgun uses the content-type multipart/form-data to send some event data and this content-type is not supported by AWS API gateway (yet).

If microservices is not your thing or just can't go through the stress, there is a webhook endpoint available at `[your server]/webhook`.

#### Using Google Cloud HTTP function

- Go to your [Google Cloud Console](https://console.cloud.google.com/) (if you don't have an account yet, create one)
- Enable Cloud functions in the dashboard
- Click on **Create Function**
- Enter your preferred name (e.g suet-hooks) 
- In the trigger section, select **HTTP trigger**. Note the **URL**, that will be your webhook
- Edit `workers/hooks/index.js:4` and enter your MongoDb URL. (No environment variable in Google cloud or I wasn’t looking hard enough)
- Copy the content of the file and paste in the index.js section of the Cloud function.
- Copy the content of `workers/hooks/package.json` and paste in the package.json section
- Select or create a **Stage bucket**. The stage bucket is simply where the code staged so you can use anything here
- In **Function to execute**, enter `handler`
- Save

#### Using app's webhook endpoint

No setup or config needed here. Your webhook is automatically available at `[your server]/webhook`.

### Update endpoint in Mailgun

Once you have the webhook setup and have the webhook URL handy, visit [Mailgun](https://mailgun.com/app/webhooks) and update your webhook endpoint to point to either your Google Cloud function URL or `[your server]/webhook` depending on which one you are going with. The `Unsubscribes` event is not supported so you can leave it out.

Mailgun will now start sending events to your webhook URL.
