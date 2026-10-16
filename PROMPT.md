# UCCMM Assessment Toolkit — Master Development Prompt & Technical Specification

> **Operational Directive**: This document serves as the master prompt and technical specification for all engineers and AI assistants developing the **UCCMM Assessment Toolkit**. It harmonizes the 47 sections of the Master Development Prompt with the UCCMM Scoring Specification.

---

## 1. Product Identity & Context
- **Product Name**: User-Centred Change Management Maturity Model (UCCMM) Assessment Toolkit.
- **Target Audience**: IT leaders, project sponsors, and enterprise employees implementing Enterprise Resource Planning (ERP) systems in Nigeria.
- **Form Factor**: Production-quality Progressive Web Application (PWA).
- **Primary Source of Truth**:
  - **Visuals**: The official Figma design file (`Assessment Toolkit`). Reproduce colors, typography, layout, spacing, and interaction states exactly.
  - **Functional & Business Logic**: This specification and the academic scoring model in `docs/UCCMM Assessment Scoring Specification.md`.

---

## 2. User Roles & Access Architecture

### 2.1 Admin / IT Leader
- Organisation owner and primary administrator.
- Only the Admin can create an organisation account.
- **Capabilities**:
  - Complete 2-stage organisation registration.
  - Log in with email, password, and remember-me.
  - Take the UCCMM assessment.
  - Invite stakeholders (Name, Email, Department, Job Role) and manage default passcodes.
  - Monitor aggregate participation (Invited, In Progress, Completed, Not Started).
  - View multidimensional results, overall maturity score, and 6-axis Radar Chart.
  - Review prioritised recommendations for dimensions scoring between 10% and 80%.
  - Access historical assessment records by date without overwriting past results.
  - Download comprehensive organisation readiness reports.
  - Manage account and organisation settings.

### 2.2 Stakeholder / Employee
- Organisational employees invited by the Admin.
- **Strict Constraint**: Stakeholders **cannot** register independently.
- **Authentication**: Email + Passcode only.
- **Capabilities**:
  - Complete the 30-question UCCMM assessment with autosave resilience.
  - Non-linear question navigation and pre-submission review screen.
  - View **personal readiness profile** and individual radar chart upon submission.
- **Access Restrictions**:
  - Must **never** see the Admin navigation, admin dashboard, recommendations, stakeholder list, or organisation-wide aggregated metrics.

---

## 3. Strict Anonymisation & Privacy Mandate
- The Admin needs to know participation rates (who completed, who hasn't).
- However, **the Admin must NEVER be able to see or identify an individual stakeholder's specific answers or scores**.
- **Architectural Requirement**: Decouple respondent identity from the response store. Store participation status (`completed: true`) in the stakeholder record, while assessment responses are stored anonymously or with non-reversible keys. Enforce this at the database/RLS layer, not merely by hiding UI elements.

---

## 4. Assessment Engine & Scoring Specification

### 4.1 Structure
- **6 Dimensions**:
  1. Leadership, Governance & Strategy
  2. Communication and Stakeholder Engagement
  3. Requirements and Process Alignment
  4. Organisational and User Readiness
  5. Training, Support, and User Experience
  6. Contextual Resilience and Continuous Improvement
- **5 Core Questions per Dimension** = **30 Core Questions Total**.
- The 5 core questions per dimension are fixed and immutable. Admins may append additional questions in future versions.
- **5 Response Options per Question**: Weighted numerically $1 \dots 5$.

### 4.2 Mathematical Formulas

#### Dimension Score ($D_j$)
$$D_j = \frac{\sum_{i=1}^{n_j} r_{ij}}{5n_j} \times 100$$
- $r_{ij} \in \{1, 2, 3, 4, 5\}$: Response value selected for question $i$ in dimension $j$.
- $n_j = 5$: Number of core questions in dimension $j$.
- $5$: Maximum possible score per item.
- Score Range: $20\% \dots 100\%$.

#### Overall Maturity Score ($M$)
$$M = \sum_{j=1}^{6} w_j D_j$$
- $w_j$: Dimension weight (configurable, defaulting to equal weighting $\approx 0.1667$).
- **Sum Constraint**: $\sum_{j=1}^{6} w_j = 1.0$ ($100\%$).

### 4.3 The Five Maturity Levels
Every score maps to one of five maturity stages:
1. **Initial**
2. **Developing**
3. **Defined**
4. **Managed**
5. **Optimising**

### 4.4 Assessment Immutability & Versioning
- Completed assessments must store an immutable snapshot of:
  - Question text and response values.
  - Dimension weights at the time of submission.
  - Calculated dimension scores and overall maturity score.
  - Maturity levels and assessment timestamp.
- Future changes to questions or weights must **never** alter historical assessment records.

---

## 5. UI Layout & Interaction Specifications

### 5.1 3-Pane Assessment Interface
The assessment view must implement the Figma 3-pane layout on desktop:
- **Left Pane**: Dimension list with real-time status indicators (*Not Started*, *In Progress*, *Completed*).
- **Centre Pane**: Current dimension title, description, question prompt, and 5 interactive option cards.
- **Right Pane**: Interactive question progress grid ($1 \dots 30$) with visual states (*Current*, *Answered*, *Unanswered/Skipped*).

### 5.2 Assessment Workflow
1. **Assessment Intro**: Explains the 6 dimensions, 30 questions, scoring method, and autosave.
2. **Question Flow**: Allows non-linear jumping between questions and dimensions.
3. **Autosave**: Every answer selection persists to IndexedDB immediately, surviving refreshes and connection drops.
4. **Review Screen**: Displays all 30 questions before final submission, flagging unanswered questions.
5. **Submission**: Calculates scores, locks the record, and transitions to the Results view.

### 5.3 Empty States & Dynamic Controls
- **Admin Dashboard**: Before an assessment is taken, show the empty state (*"No assessment data yet"*). The **"Download Report"** CTA must be **disabled** until an assessment is completed.
- **Form Controls**: All inputs must handle `default`, `focus`, `filled`, `error`, `disabled`, and `valid` states. Primary submit buttons remain disabled until forms pass Zod validation.

---

## 6. Recommendations & Reporting Engine

### 6.1 Recommendations Engine
- Generated automatically upon assessment completion.
- Focuses on dimensions scoring between **10% and 80%** (areas not yet in the *Optimising* tier).
- Explains:
  - What needs improvement.
  - Why the dimension matters in an ERP rollout.
  - Specific, actionable steps to elevate maturity.
- Filterable by historical assessment dates.

### 6.2 Reporting Engine
- Generates a polished, printable/PDF report containing:
  - Organisation profile and assessment date.
  - Overall maturity score and maturity level.
  - 6 dimension scores and multidimensional **Radar Chart**.
  - Prioritised action recommendations.
  - Complete exclusion of identifiable stakeholder responses.

---

## 7. Technology Stack & Coding Standards

### 7.1 Approved Stack
- **Framework**: React 19 + Vite 7 (Strictly client-side SPA; **no Next.js**).
- **Monorepo**: pnpm workspaces (`apps/web` and `packages/contracts`).
- **Styling**: Tailwind CSS 4 (`@import "tailwindcss";`), Inter & Anton typography.
- **Forms & Validation**: React Hook Form + Zod.
- **Offline Storage**: IndexedDB via `idb`.
- **PWA Tooling**: `vite-plugin-pwa` with service worker caching.
- **Testing**: Vitest + Testing Library + Playwright.
- **Backend / BaaS**: Supabase (PostgreSQL + RLS + Auth).

### 7.2 Strict Engineering Rules
1. **No Next.js Artifacts**: Keep codebase purely client-side; remove all `next/server` remnants.
2. **TypeScript Strict Mode**: Zero `any` types; define models in `@assessment/contracts`.
3. **Service Layer Abstraction**: UI components must interact with data via services (`apps/web/src/services/`) to allow mock operation when Supabase credentials are not active.
4. **Never Block on Missing Credentials**: Provide robust mock fallbacks that simulate live operations cleanly.
5. **Historical Integrity**: Never mutate past assessment submissions.