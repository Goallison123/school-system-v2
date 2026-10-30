
# Mid-Term Reminder Function

## Purpose

Sends an email to the dean of studies when a mid-term period reaches its official date.

The reminder asks the dean to review marks and generate reports. Generating reports does not finalize the period or lock marks.

## Requirements

- A Supabase project
- Supabase CLI
- A verified sender domain or email address in Resend @Prashant will be working on connecting this system to emailing services.
- The database RPCs described below
- A scheduler that can send an authenticated POST request

## Required Supabase secrets

Set these secrets in our Supabase project:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `MIDTERM_REMINDER_CRON_SECRET`
- `MIDTERM_REMINDER_FROM_EMAIL`
- `MIDTERM_SCHOOL_NAME` (optional)

Never place the service-role key or scheduler secret in frontend code.

## Database requirements

Implement these two database RPCs using our actual schema.

### `get_midterm_reminder_targets()`

Returns these fields:

- `period_id`
- `period_name`
- `official_date`
- `recipient_email`
- `recipient_name`

It must return only periods whose official date is today and whose reminder has not already been sent successfully.

The recipient should be the dean of studies, not a teacher or headteacher unless the school's policy explicitly changes.

### `mark_midterm_reminder_sent(p_period_id)`

Records a successful reminder for that period.

Make this operation idempotent so retries do not create duplicate reminder records. Protect it so ordinary users cannot call it to manipulate reminder tracking.

## Deploy

From the repository root:

```bash
supabase functions deploy send-midterm-reminders
```

Set the required secrets with the Supabase CLI:

```bash
supabase secrets set \
  RESEND_API_KEY="our-resend-api-key" \
  MIDTERM_REMINDER_CRON_SECRET="your-long-random-secret" \
  MIDTERM_REMINDER_FROM_EMAIL="verified-sender@example.com" \
  MIDTERM_SCHOOL_NAME="G.S Gacuba 2A"
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are commonly available to Supabase Edge Functions automatically.

## Schedule

Configure a daily scheduler to send an HTTP POST request to:

```text
https://PROJECT_REF.supabase.co/functions/v1/send-midterm-reminders
```

Include this header:

```text
x-cron-secret: OUR_MIDTERM_REMINDER_CRON_SECRET
```

Use a scheduler that runs in the school's intended timezone. Rwanda uses Africa/Kigali (UTC+2). Schedule the function after midnight in Kigali so the date-based query finds periods due that day.

Do not invoke the function from a public frontend without the secret.

## Test

First test with a mid-term period scheduled for today and a test dean email address.

Confirm that:

1. The function returns a successful response.
2. The email provider accepts the email.
3. The database records the reminder.
4. Running the function again does not send the same reminder again.
5. Future-dated and finalized periods are excluded.

## Important limitation

This function sends reminders only. It does not generate reports, finalize periods, or enforce mark-editing permissions. Those responsibilities belong to the application and database security rules.
