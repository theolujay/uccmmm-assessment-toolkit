# UCCMM Assessment Toolkit — Local Setup

## 1. Install the prerequisites

Install these two applications:

- [Node.js 20 or newer](https://nodejs.org/)
- [pnpm](https://pnpm.io/installation)

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

Without Supabase credentials, local development opens in demo mode and stores assessment progress in this browser. Demo invitations do not send email.

## 6. Connect a Supabase project

Copy `apps/web/.env.example` to `apps/web/.env.local` and set:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

Apply the database migration and deploy the invitation functions:

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
