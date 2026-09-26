# CMHK — protected Vercel edition

This package contains all seven existing form functions, signature uploads, separate PDF downloads and the bilingual disclaimer, with a server-enforced login added. It is a replacement Vercel project, not an extra static page to upload into the old `dist` folder.

**Status:** code and automated security checks are complete. No Vercel, Supabase, SMTP or SMS account has been connected, and live OTP delivery has not been tested. Finish the setup and acceptance checks below before giving users access. Without configuration it fails closed: the tool is not served.

## What users get

Approved personal email addresses can sign in with an emailed code. If enabled, approved mobile numbers can sign in with an SMS code. After login, the existing disclaimer must be accepted. An eight-hour, non-renewing secure session expires automatically; there is also a Sign out button. An expired or revoked session is rejected on the next server request, and open pages check every minute.

Email OR SMS is passwordless **single-factor** authentication, not two-factor authentication. This package does not implement an additional authenticator/passkey factor. Enable MFA separately for your administrator accounts on Vercel, Supabase and the delivery providers. SMS is convenient but is not inherently stronger than email: recycled numbers and SIM swaps are relevant risks. Review a member's phone number before approving it.

## 1. Create Supabase and its database

1. Create a dedicated project at https://supabase.com/dashboard. Keep its service-role key private.
2. Open SQL Editor and run `schema.sql` once. The four tables have Row Level Security enabled and no anonymous/client permissions. Do not add public policies.
3. Under Table Editor → `tool_members`, add yourself first: lowercase personal `email`, optional `phone` in international format (Hong Kong example: `+85291234567`), and `active=true`. Leave `id` and `created_at` to their defaults.
4. Add other approved people the same way. No one can self-approve. Do not give ordinary users access to the Supabase dashboard.

Approval is an administrator-created allowlist entry, not an invitation email. Contact approved users separately. Each approved email or phone is a login credential: only add addresses and numbers you have verified belong to the intended person.

## 2. Enable email codes

1. Enable the Email provider in Supabase Authentication. Keep email confirmation enabled. Allow creation of Auth users: the server checks the private allowlist before requesting a new OTP. Creating a Supabase Auth account alone never grants access to this tool.
2. Configure **custom SMTP** using your email provider. Supabase's built-in sender is limited to project team addresses and is not suitable for delivering codes to ordinary personal email addresses. You may need a verified sending domain. Recipients may use Gmail, Outlook, Yahoo or other personal addresses.
3. In Authentication → Email Templates, set BOTH **Confirm signup** and **Magic Link** templates to display the code: `Your verification code is: {{ .Token }}`. Do not use a link-only template.
4. Set the OTP expiry to a short period such as 10 minutes and configure provider rate limits. This form accepts 6–10 digit codes.
5. Set Supabase's Site URL to the final HTTPS Vercel/custom-domain origin. No OAuth callback is required for this code-entry flow.

## 3. Optional SMS codes

1. Enable the Phone provider in Supabase Authentication and configure a supported SMS provider, such as Twilio, using its credentials and sender configuration.
2. Arrange delivery to Hong Kong or the countries you need, including any sender registration and billing required by your provider. Trial accounts may restrict recipients.
3. Add the approved person's full international phone number to their `tool_members` row. A phone is unique across members; changes should be checked with the person.
4. Set `SMS_ENABLED=true` in Vercel, then redeploy. With `false`, the SMS choice stays unavailable and the server rejects SMS requests.
5. Send a real test code to an approved number. Email and SMS are alternative ways to access the same approved member record. SMS delivery incurs provider charges; this package does not create or pay for those accounts.

## 4. Deploy the whole project to Vercel

1. Extract this ZIP. Use its contents as the repository root. Remove the old static `dist` deployment and old public copies of form files. Do NOT keep the previous build/output settings or deploy only `private/tool`.
2. Import the repository into Vercel. Framework preset: **Other**. Root Directory: the directory containing this `vercel.json`. Build Command: empty. Output Directory: **public**. Node: **22.x**. There are no npm dependencies to install.
3. In Settings → Environment Variables, add the following for Production. Keep all values server-side; do not prefix them `NEXT_PUBLIC_` or `VITE_`.

| Name | Value |
| --- | --- |
| `APP_ORIGIN` | Exact HTTPS origin, e.g. `https://your-tool.vercel.app`, without a path or trailing slash |
| `SUPABASE_URL` | Your project's `https://…supabase.co` URL |
| `SUPABASE_ANON_KEY` | Supabase legacy `anon` key, used by the server for Auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase legacy `service_role` key, used only by the server for database access |
| `RATE_LIMIT_SECRET` | A unique secret of at least 32 random characters |
| `SMS_ENABLED` | `false` initially; `true` after SMS delivery is configured |

Generate a secret locally with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Never put real values in Git or send them in chat. `.env.example` contains placeholders only.

4. Redeploy after saving settings. If testing a preview deployment, set `APP_ORIGIN` to its actual origin and use a separate test database. A production-only origin intentionally rejects sign-in POSTs from other origins. Open the canonical origin directly, not inside another site's frame.
5. Disable/delete old unprotected Vercel deployments and any alternate public copies of the tool. Updating one production alias does not necessarily remove old deployment URLs.

## 5. Approve, revoke and review

- **Approve:** add a lowercase email and optional international phone in `tool_members`, `active=true`.
- **Revoke:** set `active=false`. Every protected server request checks this value, including existing sessions. A page already loaded checks again within a minute. Revocation cannot recall PDFs or code a user already downloaded.
- **Change credentials:** revoke first, delete that member's `tool_sessions` rows, verify the new email/phone, edit the member record, then reactivate. This prevents sessions created using an old address/number from staying valid.
- **Audit:** inspect `tool_audit`, matching `member_id` to `tool_members`. It records login method, logout and document-generation requests with function type and timestamp. These timestamps are UTC; Hong Kong is UTC+8.
- **Privacy:** the app sends no HKID, customer name, account number, signature or generated PDF to the audit endpoint. Form generation remains in the browser. The providers still process login identifiers and may keep their own service/security logs. IPs used for app rate limits are stored as keyed hashes, not raw IPs.
- **Retention:** schedule the cleanup SQL at the end of `schema.sql`, for example daily. Audit retention is not automatically scheduled by this ZIP; the supplied query removes entries older than 90 days. Back up and restrict access to this database as appropriate.

## Before releasing access

Run `npm test`, then perform these LIVE checks (the automated suite mocks Supabase; it cannot certify your cloud settings):

1. In a private browser window, opening `/` must lead to login. Direct requests for `/app.js`, `/template.png`, `/private/tool/index.html` and `/dist/index.html` must not return tool content.
2. Unapproved email/phone must not receive an app-issued code or gain access. The send screen deliberately gives the same generic response either way.
3. An approved email receives a code; a wrong/expired code fails; a valid code enters the disclaimer; Agree enters the tool and Disagree goes to Google.
4. Repeat with an approved SMS number after enabling SMS. Test actual delivery in the target country.
5. Generate a form and check `tool_audit`: task and member only, no customer details. Check signatures, dates and separate PDF filenames against the previous version.
6. Sign out and confirm the tool files are blocked. Disable the member and confirm their existing session no longer works. Test a second browser and the Vercel-generated hostname as well as any custom domain.
7. Confirm old static deployments no longer expose the tool. Never change Output Directory back to `dist` or expose `private` as static content.

## Limits and design

The server guards the HTML, JavaScript and form templates, not merely a visual login overlay. Cookies are opaque, Secure, HttpOnly and SameSite=Strict; only hashes are stored in the session table. Responses are not cached. Same-origin checks protect state-changing endpoints. Rate limits apply to code sends and verification, by identifier and hashed IP, across server instances. Missing configuration, database failures or failed auditing block access/generation requests.

The generation log records a request, not proof that a PDF was saved or used. An authorised person can still copy downloaded material, run saved client code or misuse documents. Authentication does not establish someone's legal identity or guarantee lawful use. The existing disclaimer remains in place.

## Official setup references

- Email codes: https://supabase.com/docs/guides/auth/auth-email-passwordless
- Production email delivery: https://supabase.com/docs/guides/auth/auth-smtp
- SMS delivery: https://supabase.com/docs/guides/auth/phone-login
- Vercel configuration: https://vercel.com/docs/project-configuration/vercel-json
- Vercel Node functions: https://vercel.com/docs/functions/runtimes/node-js
