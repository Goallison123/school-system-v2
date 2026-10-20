
# Mid-Term Workflow Test Plan

## 1. Permissions

- [ ] A dean of studies can set the official mid-term date.
- [ ] A dean of studies can edit mid-term marks while the period is open.
- [ ] A teacher cannot edit mid-term marks directly.
- [ ] An IT administrator cannot edit marks using dean permissions.
- [ ] Unauthorized users cannot finalize a mid-term period.
- [ ] Permissions are enforced by Supabase, not only by hiding frontend controls.

## 2. Mid-Term Periods

- [ ] The dean can create a new mid-term period.
- [ ] Each period receives a unique ID.
- [ ] The official date is saved correctly.
- [ ] Marks and reports are associated with the correct period.
- [ ] Creating a new period does not overwrite historical marks.
- [ ] Reports from previous periods remain accessible.

## 3. Report Generation and Finalization

- [ ] Reports can be generated while the period is open.
- [ ] Generating reports does not finalize the period.
- [ ] Marks remain editable after report generation, while the period is open.
- [ ] The dean can explicitly finalize the period.
- [ ] Finalization prevents mark changes through both the UI and database.
- [ ] Finalized reports remain available for historical reference.
- [ ] A new period can be opened without changing previous results.

## 4. Email Reminders

- [ ] The scheduled function runs after the official date is reached.
- [ ] The correct dean receives the reminder email.
- [ ] The email identifies the correct mid-term period and official date.
- [ ] The email explains that generating reports does not finalize marks.
- [ ] A failed email is recorded and can be retried.
- [ ] Successful reminders are not repeatedly sent on every scheduled run.
- [ ] Missing configuration or database errors are reported clearly.

## 5. Security and Reliability

- [ ] Service-role credentials are stored only in server-side secrets.
- [ ] The cron secret is not exposed in frontend code.
- [ ] Unauthorized requests to the reminder function are rejected.
- [ ] Duplicate scheduled requests do not cause duplicate reminders.
- [ ] The database prevents unauthorized mark edits and finalized-period changes.
- [ ] Test emails are verified before production use.

## Release decision

Do not use the workflow with live student records until
permission checks, historical period isolation, finalization,
and reminder delivery have passed their tests.
