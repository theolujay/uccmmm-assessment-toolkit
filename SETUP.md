# UCCMM Assessment Toolkit — Local Setup

## 1. Install the prerequisites

Install these two applications:

- [Node.js 24](https://nodejs.org/) (recommended)
- [pnpm](https://pnpm.io/installation) (use the version pinned in `package.json`)

Or run the following on Windows:

```powershell
# Download and install Chocolatey:
powershell -c "irm https://community.chocolatey.org/install.ps1|iex"

# Download and install Node.js:
choco install nodejs --version="24.20.0"

# Verify the Node.js version:
node -v # Should print "v24.20.0".

# Download and install pnpm:
corepack enable pnpm

# Verify pnpm version:
pnpm -v
```

## 2. Open the project

Open a terminal and run:

```powershell
Set-Location # path to the project: something like `/Documents/ChatGPT/...`
```

## 3. Install the project

Run this once:

```bash
pnpm install
```

## 4. Start the project

Run:

```bash
pnpm dev
```

## 5. Open the app

Open this address in your browser:

```text
http://localhost:5173
```

Keep the terminal window open while using the app. Press `Ctrl+C` in the terminal to stop it.

Without Supabase credentials, local development opens in demo mode and stores assessment progress in this browser. Demo invitations do not send email. Use test data only.

To try maturity planning, select **Admin** on the sign-in screen and enter a test email and a password of at least eight characters. Open the profile menu → **Account settings** → **Maturity targets**. Save a target for one or more dimensions, then complete and submit an assessment. On the results page, review the gap analysis, open **View recommendations**, and follow **Open assessment report** → **Print / save PDF**. Changing the targets and submitting a second baseline lets you check that the first still uses its original targets.

## 6. Connect a Supabase project

Copy `apps/web/.env.example` to `apps/web/.env.local` and set:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

Apply all database migrations, including `20261119000200_maturity_targets.sql`, before deploying the updated web app. Deploy the invitation functions if they have not already been deployed:

```bash
supabase link --project-ref your-project-ref
supabase db push
supabase functions deploy invite-stakeholder
supabase functions deploy manage-stakeholder
```

In Supabase Auth settings, set the production Site URL and allow the app’s `/reset-password` redirect. Enable email confirmation for Admin accounts.

Set these Edge Function secrets in Supabase. The service-role key and Resend API key must never be added to a `VITE_` variable or shipped to the browser:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
INVITATION_FROM_EMAIL
APP_BASE_URL
APP_ORIGIN
```

`INVITATION_FROM_EMAIL` must use a sender domain verified in Resend. `APP_BASE_URL` is the public app URL; `APP_ORIGIN` is its origin, such as `https://assessment.example.com`.

## 7. Test recovery after an offline restart

Use a Supabase-connected **production build** on HTTPS or localhost so the service worker can cache the app. Demo mode and the regular `pnpm dev` server are not suitable for this check.

1. Sign in online in a private browser profile. Open **Assessment → Offline recovery on this device → Enable offline recovery**.
2. Start an assessment, answer a question, add a test note, and move to the next question. Wait for **Saved on this device**.
3. Disconnect the device from the network, close the browser or installed app, and reopen the same app URL in the same profile while still offline.
4. Confirm the app restores the active question, answers, and note. Add another answer. Reports and dashboards should stay unavailable, and submission should be blocked.
5. Reconnect. Confirm that the same account is verified, the recovered draft syncs, and submission becomes available when all 30 questions are answered. Use **Retry connection** if needed. Repeat after signing out or using **Forget this device** to confirm that an offline reopen no longer unlocks the draft.
