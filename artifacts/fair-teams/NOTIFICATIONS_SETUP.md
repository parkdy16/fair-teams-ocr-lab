# Fair Teams notifications setup (v1.58.7)

The Action Board Bell UI and server functions are included in the app. Delivery needs a one-time Firebase setup.

## What the Bell does

- The Bell is always a human decision. Fair Teams does not automatically email ordinary board activity.
- Email is selected by default; phone/Web Push is optional.
- Each Idea, Decision, or Action can be notified only once after the server successfully delivers at least one requested channel.
- The Bell then becomes a checked Bell. A later Decision or Action gets a fresh Bell.
- Email follows the permanent Topic: later pings for the same Topic use the same subject plus `Message-ID`, `In-Reply-To`, and `References` headers so mail clients can keep them in one conversation.
- Each recipient gets an individual email thread, so organizer email addresses are not exposed to one another.

## 1. Firebase CLI / billing

Cloud Functions and Secret Manager require a Firebase project on the Blaze plan. Set a budget alert before production use.

From the Fair Teams project root, make sure Firebase CLI is installed and signed into the correct project.

## 2. Configure the SMTP sender

Fair Teams sends mail directly from the authenticated Cloud Function so it can control email-thread headers reliably.

Create one JSON secret:

```bash
firebase functions:secrets:set FAIRTEAMS_SMTP_CONFIG --format=json
```

Enter a JSON object for your SMTP provider, for example:

```json
{
  "host": "smtp.example.com",
  "port": 465,
  "secure": true,
  "user": "notify@example.com",
  "password": "your-smtp-password",
  "from": "Fair Teams <notify@example.com>",
  "replyTo": "notify@example.com"
}
```

For port 587, normally use `"secure": false` so Nodemailer can upgrade with STARTTLS.

Use an SMTP/API credential intended for applications rather than a normal personal-account password when your provider offers one.

## 3. Install and deploy the functions

From the Fair Teams project root:

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

The callable functions deploy to `europe-west1` by default.

## 4. Enable Web Push

Firebase Console → Project settings → Cloud Messaging → Web Push certificates → generate/import a key pair.

Copy the public VAPID key into Vercel as:

```text
VITE_FIREBASE_VAPID_KEY=<public-key>
```

Then redeploy the web app.

The required service-worker endpoint is already included at `/firebase-messaging-sw.js`.

Organizers opt in per browser/device from Action Board → Board settings or directly from the Notify dialog. Fair Teams stores the Firebase Installation ID (FID) for that signed-in organizer and can target all opted-in devices for selected recipients.

### iPhone / iPad

Web Push requires Fair Teams to be added to the Home Screen before iOS/iPadOS can grant notification permission. Android/desktop browsers can grant web notification permission directly when supported.

## 5. Test safely

Start with two organizer accounts in one shared roster:

1. Enable phone notifications on one test device if you want to test push.
2. Create an Action Board topic and a Decision.
3. Press the outline Bell once.
4. Send Email first.
5. Confirm the Bell changes to the checked state and cannot be sent again for that step.
6. Create a second Decision in the same Topic and ping it.
7. Confirm the second email appears in the same email conversation/thread.
8. Add another organizer only on the second ping and confirm their first email still includes the root Topic/context.

