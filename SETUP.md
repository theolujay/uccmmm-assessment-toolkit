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

Create a dedicated hosted staging project in the [Supabase dashboard](https://supabase.com/dashboard). Get its Project URL and publishable key (or legacy `anon` key) from **Connect** or **Settings → API Keys**. `VITE_SUPABASE_ANON_KEY` can hold either public key. Never put a secret key, service-role key, database password, or Resend key in a `VITE_` variable.

From the repository root, link the hosted project and apply all three migrations. If you have the CLI installed, you can use `supabase` in place of `npx supabase`. You don't need Docker or `supabase start` to use a hosted project.

```bash
npx supabase login
npx supabase link YOUR_PROJECT_REF
npx supabase db push --remote --dry-run
npx supabase db push --remote
```

`link` records the hosted project; it does not change the default database target in the current CLI. Pass `--remote` to `db push`, not to `link`. If the project is `COMING_UP`, wait until it is **Active Healthy** in the dashboard. Check that the dry run names your hosted project before running the final push.

In **Authentication → URL Configuration**, set the Site URL to `http://localhost:5173` for initial local testing, then switch to your stable HTTPS app URL when deployed. Add the exact `/reset-password` URL for each origin you use. Keep email/password sign-up and email confirmation enabled. Register the first Admin using **Set up your organisation** in the app, not by manually adding a user in Supabase. For a first test, use a Supabase project team email or configure [custom SMTP for Supabase Auth](https://supabase.com/docs/guides/auth/auth-smtp) for confirmations and password resets to other addresses. When using Vercel, also set the two `VITE_SUPABASE_` values there and redeploy.

### Enable stakeholder invitations

1. In [Resend → Domains](https://resend.com/domains), add a domain or subdomain whose DNS you control, such as `notify.example.com`. Add the DNS records Resend provides and wait until it shows **Verified**. Your website can stay on `vercel.app`; this is the **email sender domain**.
2. In [Resend → API Keys](https://resend.com/api-keys), create a **Sending access** key restricted to that domain. Copy the key directly into Supabase, not into chat, source control, or Vercel.
3. In **Supabase → Edge Functions → Secrets**, set these four values:

| Secret | Value |
| --- | --- |
| `RESEND_API_KEY` | Your Resend sending key |
| `INVITATION_FROM_EMAIL` | `UCCMM Toolkit <assessments@notify.example.com>` (use your verified domain) |
| `APP_BASE_URL` | Your deployed app URL, e.g. `https://uccmmm-assessment-toolkit.vercel.app` |
| `APP_ORIGIN` | The exact browser origin, e.g. `https://uccmmm-assessment-toolkit.vercel.app` (no trailing slash) |

The hosted Edge runtime supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`; do not enter them as custom secrets. This configures **stakeholder invitations**. Admin signup confirmations and password resets are separate and use Supabase Auth’s email settings.

```bash
npx supabase functions deploy invite-stakeholder
npx supabase functions deploy manage-stakeholder
```

Verify that an Admin can sign in and submit a test assessment, then invite a stakeholder and sign in separately to check participation and privacy.

## 7. Test recovery after an offline restart

Use a Supabase-connected **production build** on HTTPS or localhost so the service worker can cache the app. Demo mode and the regular `pnpm dev` server are not suitable for this check.

1. Sign in online in a private browser profile. Open **Assessment → Offline recovery on this device → Enable offline recovery**.
2. Start an assessment, answer a question, add a test note, and move to the next question. Wait for **Saved on this device**.
3. Disconnect the device from the network, close the browser or installed app, and reopen the same app URL in the same profile while still offline.
4. Confirm the app restores the active question, answers, and note. Add another answer. Reports and dashboards should stay unavailable, and submission should be blocked.
5. Reconnect. Confirm that the same account is verified, the recovered draft syncs, and submission becomes available when all 30 questions are answered. Use **Retry connection** if needed. Repeat after signing out or using **Forget this device** to confirm that an offline reopen no longer unlocks the draft.
