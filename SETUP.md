# Assessment Toolkit — Local Setup

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

The current version uses sample data and does not require Supabase credentials.
