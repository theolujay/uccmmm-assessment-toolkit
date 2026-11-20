# UCCMM Assessment Toolkit

> **User-Centred Change Management Maturity Model (UCCMM) Assessment Toolkit**  
> A Progressive Web Application (PWA) for IT leaders and organisations implementing Enterprise Resource Planning (ERP) systems in Nigeria.

---

## 📖 Overview

The **UCCMM Assessment Toolkit** implements the academic **User-Centred Change Management Maturity Model**. It helps IT leaders in Nigerian organisations assess how they manage the human side of an ERP rollout, identify their weakest areas, and decide what to improve first. It does not run or integrate with an ERP system.

The platform provides dedicated workflows for two distinct user types:
1. **Admin / IT Leader**: The organisation account owner who sets up the organisation profile, invites and tracks stakeholder participation, completes administrative assessments, analyzes maturity scores via multidimensional radar charts, reviews prioritised recommendations, and exports readiness reports.
2. **Stakeholder / Employee**: Organisational staff invited by the Admin who authenticate via email and secure passcodes to complete assessments and view their individual readiness profiles—with strict privacy guarantees protecting individual response confidentiality.

---

## 🚀 Key Features

- **Six-Dimension Assessment Engine**: Evaluates readiness across 6 dimensions with 5 core questions per dimension (30 core items) using a 5-point Likert-style weighted scale.
- **Mathematical Scoring & 5-Level Maturity Model**: Dynamic dimension calculation ($D_j = \frac{\sum r_{ij}}{5n_j} \times 100$) and weighted overall maturity ($M = \sum w_j D_j$) mapped across 5 stages: *Initial*, *Developing*, *Defined*, *Managed*, and *Optimising*.
- **Privacy & Anonymisation by Design**: Clear separation between participant tracking (invited, started, completed) and response data. Admins cannot view identifiable stakeholder answers.
- **PWA & Local Drafts**: The production app caches the interface and saves drafts in IndexedDB. Users can opt in on a private device to reopen a saved assessment after a restart while still offline. Sync and submission wait for online session verification. See [offline recovery](MATURITY-PLANNING.md#offline-behaviour).
- **Role-Based Portals**:
  - **Admin Portal**: 2-stage organisation onboarding, assessment dashboard, stakeholder invitation & participation tracking, historical assessment timeline, maturity radar charts, and recommendation actions.
  - **Stakeholder Portal**: Simplified, distraction-free assessment environment with progress tracking, non-linear navigation, review stage, and personal readiness results.
- **Targets & Gap Analysis**: Admins set optional per-dimension targets. Each new Admin baseline captures the targets in effect at submission, so historical gaps remain comparable.
- **Recommendations & Reporting**: A rule-based roadmap prioritises target shortfalls and flags weak continuity practices. An Admin can print the selected baseline or save it as PDF from the browser. The guidance and gap priority thresholds are provisional.

---

## 🏗️ Architecture & Monorepo Structure

The project is structured as a modern TypeScript monorepo managed with **pnpm workspaces**:

```text
uccmmm-assessment-toolkit/
├── apps/
│   └── web/                         # Primary Vite + React PWA client application
│       ├── public/                  # Static assets (SVGs, preview graphics, manifest)
│       ├── src/
│       │   ├── components/          # Reusable UI components (AppShell, StatCard, etc.)
│       │   ├── data/                # Assessment dimensions, questions, templates
│       │   ├── lib/                 # Storage (IndexedDB), scoring, Supabase client
│       │   ├── pages/               # Route views (Auth, Dashboard, Assessment, Results, etc.)
│       │   ├── main.tsx             # Application bootstrap & router configuration
│       │   └── styles.css           # Tailwind CSS & design system tokens
│       ├── package.json
│       └── vite.config.ts           # Vite + PWA configuration
├── packages/
│   └── contracts/                   # Shared schemas, domain types, and Zod validators
│       ├── src/
│       │   └── index.ts             # Domain models, auth schemas, scoring types
│       └── package.json
├── MATURITY-PLANNING.md             # Scoring, targets, and validation notes
├── GUIDE.md                         # Developer & Architecture Guide
├── PLAN.md                          # Implementation Plan, Gap Analysis & Roadmap
├── PROMPT.md                        # Master Development Prompt & Technical Specification
├── SETUP.md                         # Step-by-step local machine setup guide
├── package.json                     # Monorepo root configuration
└── pnpm-workspace.yaml              # Workspace configuration
```

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework & Tooling** | [React 19](https://react.dev/), [Vite 7](https://vitejs.dev/) | High-performance SPA with fast HMR |
| **Language** | [TypeScript 5](https://www.typescriptlang.org/) | Strict type safety across contracts and UI |
| **Styling & Design** | [Tailwind CSS 4](https://tailwindcss.com/) | Design-token-driven styling matching Figma |
| **Routing** | [React Router 7](https://reactrouter.com/) | Client-side routing with role-based protections |
| **Forms & Validation** | [React Hook Form](https://react-hook-form.com/), [Zod](https://zod.dev/) | High-performance form state & schema validation |
| **Persistence & Auth** | [Supabase](https://supabase.com/) | PostgreSQL, Row-Level Security (RLS), & Auth |
| **Offline Storage** | [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) via [`idb`](https://github.com/jakearchibald/idb) | Local client-side autosave for assessments |
| **PWA Capabilities** | [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/) | Service worker, caching strategies, manifest |
| **Testing** | [Vitest](https://vitest.dev/), [Testing Library](https://testing-library.com/) | Unit, contract, and UI component testing |
| **Database regression tests** | PostgreSQL (`psql`) | Migration, scoring, and row-level access checks |

---

## 📊 Scoring Model Summary

The scoring engine implements the academic formulas summarised in [Maturity planning](MATURITY-PLANNING.md):

### 1. Dimension Score ($D_j$)
$$D_j = \frac{\sum_{i=1}^{n_j} r_{ij}}{5n_j} \times 100$$
- $r_{ij} \in [1, 5]$: Response value selected for item $i$ in dimension $j$.
- $n_j = 5$: Number of core questions in dimension $j$.
- Range: $20\% - 100\%$.

### 2. Overall Maturity Score ($M$)
$$M = \sum_{j=1}^{6} w_j D_j$$
- $w_j = 1/6$ in `uccmm-v1`, so the overall score is the mean of the six dimension scores.

### 3. Five Maturity Levels
1. **Initial**
2. **Developing**
3. **Defined**
4. **Managed**
5. **Optimising**

All completed assessments are versioned and stored immutably to guarantee historical data integrity.

---

## 💻 Getting Started

### Prerequisites
- **Node.js**: v24 recommended
- **pnpm**: use the version pinned in `package.json`.

### Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/theolujay/uccmmm-assessment-toolkit.git
   cd uccmmm-assessment-toolkit
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Configure environment variables**:
   Copy `apps/web/.env.example` to `apps/web/.env.local` to connect Supabase, or leave it unset for local demo mode:
   ```env
   VITE_SUPABASE_URL=your-supabase-url
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```

4. **Start the development server**:
   ```bash
   pnpm dev
   ```
   Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 📜 Available Scripts

| Command | Description |
| :--- | :--- |
| `pnpm dev` | Starts the Vite development server with HMR |
| `pnpm build` | Compiles contracts and builds the web application for production |
| `pnpm typecheck` | Executes TypeScript type checking across all workspace packages |
| `pnpm lint` | Runs ESLint across all projects |
| `pnpm test` | Runs unit and contract tests using Vitest |

---

## 📚 Further Documentation

- **[Developer & Architecture Guide (GUIDE.md)](GUIDE.md)**: Deep dive into architectural patterns, data flow, scoring engine, privacy design, and offline PWA handling.
- **[Master Implementation Plan (PLAN.md)](PLAN.md)**: Comprehensive repository assessment, gap analysis against newly-added docs, and milestone roadmap.
- **[Master Development Prompt (PROMPT.md)](PROMPT.md)**: Authoritative technical specifications, Figma fidelity guidelines, and operational prompts.
- **[Local Setup Guide (SETUP.md)](SETUP.md)**: Simple instructions for local development environments.
- **[Maturity planning](MATURITY-PLANNING.md)**: Scoring, target and roadmap rules, and remaining validation work.