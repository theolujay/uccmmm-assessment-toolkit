# UCCMM Assessment Toolkit — Developer & Architecture Guide

> **Version**: 2.0.0  
> **Authoritative Guide**: Architecture, Domain Models, Scoring Engine, Privacy, and Implementation Patterns for the User-Centred Change Management Maturity Model (UCCMM) Assessment Toolkit.

---

## 1. System Architecture Overview

The **UCCMM Assessment Toolkit** is engineered as a lightweight, production-grade Progressive Web Application (PWA) using a modular monorepo architecture managed by **pnpm workspaces**.

```text
┌───────────────────────────────────────────────────────────────┐
│                          apps/web                             │
│  React 19 + Vite 7 + Tailwind CSS 4 + React Router 7 + PWA    │
└────────────────┬──────────────────────────────┬───────────────┘
                 │                              │
        Imports Contracts              Persists & Synchronizes
                 │                              │
                 ▼                              ▼
┌────────────────────────────────┐  ┌───────────────────────────┐
│      packages/contracts        │  │      Storage Layer        │
│  Zod Schemas + Domain Models   │  │  • IndexedDB (Offline)    │
│  + Pure Scoring Engine Math    │  │  • Supabase (Postgres/RLS)│
└────────────────────────────────┘  └───────────────────────────┘
```

### Architectural Principles
1. **Client-Side SPA & PWA**: The application runs entirely as a client-side Single Page Application (SPA). There is **no Next.js or Node.js server runtime** in the web app. All dynamic server needs are handled via Supabase BaaS (Backend-as-a-Service).
2. **Contracts Package (`@assessment/contracts`)**: Acts as the single source of truth for all domain entities, validation schemas (Zod), and pure calculation logic (scoring algorithms). It has zero DOM or UI dependencies.
3. **Data Access & Service Abstraction Layer**: UI components must never make direct Supabase queries. A dedicated service layer (`apps/web/src/services/`) abstracts data operations behind interfaces, allowing the app to run seamlessly in **Mock Mode** (local memory/IndexedDB) or **Live Mode** (Supabase).
4. **Figma as Visual Truth**: Every component, layout, color token, font, and spacing rule must faithfully reproduce the official Figma design system.

---

## 2. Domain Data Model & Entity Specifications

The core domain model encapsulates organisations undergoing ERP transformations in Nigeria and their participating stakeholders.

```text
┌────────────────┐       1:N       ┌────────────────────────┐
│  Organisation  ├─────────────────┤      Stakeholder       │
└───────┬────────┘                 └───────────┬────────────┘
        │ 1:1                                  │ 1:N
┌───────▼────────┐                             │
│     Admin      │                             │
└───────┬────────┘                             │
        │ 1:N                                  │
┌───────▼──────────────────────────────────────▼────────────┐
│                        Assessment                         │
│  - type: 'admin' | 'stakeholder'                          │
│  - responses: AssessmentResponse[]                        │
│  - dimensionScores: DimensionScore[]                      │
│  - overallScore: number                                   │
│  - maturityLevel: MaturityLevel                           │
└───────────────────────────────────────────────────────────┘
```

### 2.1 Entity Definitions

```typescript
// packages/contracts/src/index.ts

export type MaturityLevel = 
  | 'Initial' 
  | 'Developing' 
  | 'Defined' 
  | 'Managed' 
  | 'Optimising';

export interface ResponseOption {
  id: string;
  text: string;
  weight: number; // 1 to 5
}

export interface AssessmentQuestion {
  id: string;
  dimensionId: string;
  prompt: string;
  options: ResponseOption[];
  isCore: boolean; // 5 core questions per dimension are fixed
  order: number;
}

export interface AssessmentDimension {
  id: string;
  name: string;
  shortName: string;
  description: string;
  order: number;
  weight: number; // e.g. 0.1667 (summing to 1.0 across all dimensions)
  questions: AssessmentQuestion[];
}

export interface DimensionScore {
  dimensionId: string;
  dimensionName: string;
  scorePercentage: number; // 20.0 to 100.0
  maturityLevel: MaturityLevel;
  itemCount: number;
}

export interface AssessmentRecord {
  id: string;
  organisationId: string;
  respondentType: 'admin' | 'stakeholder';
  // Privacy notice: For stakeholders, respondentId is omitted or pseudonymised
  version: string;
  date: string; // ISO-8601
  responses: Record<string, number>; // questionId -> selectedOptionWeight
  dimensionScores: DimensionScore[];
  overallScore: number; // 20.0 to 100.0
  overallMaturityLevel: MaturityLevel;
  recommendations?: AssessmentRecommendation[];
}
```

---

## 3. Mathematical Scoring Engine & Classification

The scoring engine implements the exact mathematical formulas specified in `docs/UCCMM Assessment Scoring Specification.md`.

### 3.1 Dimension Score Calculation ($D_j$)
The percentage score for each dimension $j$ is calculated dynamically based on respondent answers:

$$D_j = \frac{\sum_{i=1}^{n_j} r_{ij}}{5n_j} \times 100$$

Where:
- $D_j$ = percentage score for dimension $j$.
- $r_{ij}$ = response weight value selected for question $i$ in dimension $j$ ($r_{ij} \in \{1, 2, 3, 4, 5\}$).
- $n_j$ = total number of assessment items in dimension $j$ (5 core questions currently).
- $5$ = maximum possible response value per question.

**Example**:
If a respondent selects values `[4, 5, 3, 4, 5]` across a dimension with 5 questions:
$$\text{Sum} = 4 + 5 + 3 + 4 + 5 = 21$$
$$D_j = \frac{21}{5 \times 5} \times 100 = \frac{21}{25} \times 100 = 84.0\%$$

### 3.2 Overall Maturity Score Calculation ($M$)
The overall maturity score is the weighted linear combination of all 6 dimension percentage scores:

$$M = \sum_{j=1}^{6} w_j D_j$$

Where:
- $M$ = overall maturity percentage score ($20.0\% \le M \le 100.0\%$).
- $D_j$ = percentage score for dimension $j$.
- $w_j$ = weight assigned to dimension $j$.
- **Validation Constraint**: The six dimension weights must collectively equal 1.0 (100%):
  $$\sum_{j=1}^{6} w_j = 1.0$$

### 3.3 The Five Maturity Levels
Every calculated score (both dimension-level and overall) maps to one of five progressive maturity stages:

1. **Initial**: Ad-hoc, unstructured change management practices; high risk of user resistance.
2. **Developing**: Emerging change management awareness; inconsistent execution.
3. **Defined**: Documented, standardized change processes across ERP workstreams.
4. **Managed**: Quantitative metrics tracked; predictable stakeholder engagement.
5. **Optimising**: Continuous improvement, culture of adaptability, and proactive change leadership.

### 3.4 Numerical Precision & Historical Immutability
- **Storage Precision**: Raw calculations must be performed using floating-point numbers without intermediate rounding to prevent cumulative rounding distortion.
- **Display Rounding**: The UI should format scores rounded to whole percentages or 1 decimal place (e.g., `84%` or `84.0%`).
- **Snapshot Immutability**: Historical completed assessments must preserve their exact inputs, weights, questions, and calculated scores. Future edits to question sets or dimension weights must **never** retroactively modify historical records.

---

## 4. Privacy & Anonymisation Architecture

A core mandate of the UCCMM Toolkit is protecting employee confidentiality during organizational readiness assessments.

```text
ADMIN PORTAL VIEW:
┌────────────────────────────────────────────────────────┐
│ Stakeholder Participation Tracker                      │
│ Total Invited: 24 | Completed: 18 | In Progress: 6     │
└────────────────────────────────────────────────────────┘
                   ▲
                   │ Aggregated metrics ONLY
┌──────────────────┴──────────────────┐
│  Identity / Participation DB        │
│  • email, name, role, dept          │
│  • status: 'completed'              │
└─────────────────────────────────────┘
                 ✕ STRICT DISCONNECTION
┌─────────────────────────────────────┐
│  Assessment Responses DB            │
│  • organisation_id: 'org-xyz'       │
│  • responses: { ... }               │
│  • scores: [ ... ]                  │
│  (NO stakeholder_id or user foreign │
│   key attached to response records) │
└─────────────────────────────────────┘
```

### Architectural Rules for Anonymisation:
1. **Separation of Concerns**: Stakeholder identity records (`stakeholders` table) store invitation status and completion flags (`invited`, `in_progress`, `completed`).
2. **Response Detachment**: Stakeholder assessment responses are stored in a separate responses repository that does not link to the stakeholder's personal identifiable information (PII).
3. **Admin UI Safeguard**: The Admin Dashboard and Stakeholders Page show completion counts and participation lists, but **never display an identifiable stakeholder's individual answers or scores**.
4. **Data Access Level**: Database Row Level Security (RLS) policies prohibit admins from querying stakeholder response records joined with stakeholder identities.

---

## 5. Offline & Progressive Web Application (PWA) Strategy

Assessments must be resilient against unexpected browser closures, device reboots, and unstable internet connections (especially critical for field teams and remote Nigerian branch offices).

### 5.1 IndexedDB Schema via `idb`
The browser's IndexedDB database `assessment-toolkit` maintains local drafts:

```typescript
// apps/web/src/lib/storage.ts
interface ToolkitDB extends DBSchema {
  drafts: {
    key: string; // 'draft_admin' | 'draft_stakeholder'
    value: {
      id: string;
      userId?: string;
      responses: Record<string, number>;
      activeQuestionIndex: number;
      updatedAt: string;
    };
  };
}
```

### 5.2 Autosave Hook Lifecycle
- Every response selection immediately updates the local state and debounces a write to IndexedDB (within 200ms).
- When internet connectivity is present and the user is authenticated, the service layer syncs the draft with the backend.
- If offline, the application continues functioning without interruption, using visual badges to notify the user of local draft preservation.

---

## 6. Design System & Component Guidelines

### 6.1 Design Tokens
- **Colors**:
  - Primary Dark: `#010a14` (headers, primary buttons, branding)
  - Primary Accent Blue: `#077bf8` (selected states, eyebrows, radio indicators)
  - Background Neutral: `#f3f6f5` (page backdrop)
  - Surface White: `#ffffff` (cards, panels, modals)
  - Borders: `#e4e5e6`
  - Text Primary: `#0f0f10`
  - Text Muted: `#6e7277`
- **Typography**:
  - Headings / Body: `Inter, system-ui, sans-serif`
  - Brand Display: `Anton, sans-serif`

### 6.2 The 3-Pane Assessment Layout
The desktop assessment interface must render three synchronized panes:
1. **Left Pane (Dimensions)**: Vertical list of 6 dimensions displaying index, name, and completion status badge.
2. **Centre Pane (Question & Options)**: Current dimension banner, question prompt, and 5 interactive weighted cards with radio indicators.
3. **Right Pane (Question Navigator)**: Interactive question grid displaying all 30 questions with clear visual states: *Current*, *Answered*, *Unanswered/Skipped*.

### 6.3 Radar Chart for Multidimensional Maturity
The Results and Admin Dashboard views must feature a 6-axis Radar (Spider) chart:
- Visualizes maturity across all six UCCMM dimensions simultaneously.
- Highlights dimensional imbalances (e.g., strong *Leadership* but weak *Communication*).

---

## 7. Developer Workflow & Quality Standards

### 7.1 Workspace Commands

```bash
# Install dependencies
pnpm install

# Run local development server
pnpm dev

# Typecheck all packages
pnpm typecheck

# Lint with ESLint
pnpm lint

# Run Vitest test suites
pnpm test

# Build production bundle
pnpm build
```

### 7.2 Strict Code Quality Rules
- **No `any`**: Use strict TypeScript domain types from `@assessment/contracts`.
- **No Residual Next.js**: All code must target standard browser and Vite environments.
- **No Direct DB Calls from UI**: All data fetching and persistence must route through `src/services/`.
- **Unit Tests Required**: Any modifications to scoring formulas, Zod schemas, or draft storage must include corresponding Vitest tests.
