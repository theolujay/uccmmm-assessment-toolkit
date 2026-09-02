
Gift ChatGPT credits
Send a friend credits they can use for Work or Codex tasks

Assessment Toolkit – Initial Build.docx
DOCX



Assessment Toolkit – Initial Build
You are the lead engineer for a school project called Assessment Toolkit.

The application must be built as a production-quality Progressive Web Application (PWA).

1. Before writing code

First inspect the complete repository.

Read:

AGENTS.md

README.md

all BMAD-generated project documentation

package.json if it exists

the existing folder structure

Do not immediately generate the entire application.

First report:

current repository state;

anything already configured;

any conflicts or missing dependencies;

the implementation plan you propose;

the files/directories you intend to create or modify.

Then proceed with the approved architecture below unless an existing repository convention provides a strong reason not to.


2. Technology stack

Use:

React

Vite

TypeScript

Tailwind CSS

React Router

React Hook Form

Zod

Supabase for authentication and PostgreSQL persistence

IndexedDB for offline assessment drafts

Vitest and React Testing Library

Playwright for critical end-to-end journeys

appropriate Vite PWA/service-worker tooling

Do not introduce Next.js or another major framework without a documented reason.

Keep dependencies minimal.


3. Design source

The Figma file Assessment Toolkit is the visual source of truth.

The application includes:

organisation/personal signup;

authentication;

role-based dashboards;

admin dashboard;

stakeholder management;

staff dashboard;

assessment management;

multi-dimension assessment;

scoring;

recommendations;

results/reporting.

Reproduce the Figma layouts accurately while creating reusable components instead of copying markup separately for every page.

Extract shared:

typography;

colours;

spacing;

button styles;

form controls;

cards;

status badges;

tables;

navigation;

assessment progress UI.

The app must be responsive and usable on desktop, tablet and mobile.

Do not hard-code desktop Figma widths.


4. Known design inconsistencies

Do not blindly reproduce inconsistent Figma copy.

Known issues include:

some UI refers to 30 assessment questions while another refers to 24;

an assessment navigation item for Dimension 6 is labelled as Dimension 5: Resilience.

Question and dimension counts must be derived from data rather than hard-coded into UI components.

Create a central assessment configuration/data model so that question counts, dimension names and sequence come from one source of truth.

Document any additional inconsistencies discovered.

Do not silently invent a business rule to resolve an ambiguity.


5. Core data model

Design for these concepts:

profiles;

organisations;

organisation membership;

users/roles;

assessment templates;

dimensions;

questions;

assessments;

assessment responses;

dimension scores;

overall scores;

recommendations;

reports.

Use clear TypeScript domain types.

Keep UI components independent from direct Supabase queries by providing an appropriate service/data-access layer.


6. Role-based access

Support at minimum:

Admin

Staff/User

Protected routes must prevent unauthorised role access.

Do not rely exclusively on hiding frontend buttons for security.

Prepare Supabase Row Level Security requirements and migrations/policies where appropriate.


7. Assessment workflow

Implement the assessment engine so a user can:

start an assessment;

see assessment progress;

navigate through dimensions/questions;

save responses automatically;

continue an unfinished assessment;

survive accidental refresh/browser closure;

continue temporarily without connectivity;

validate required questions;

submit an assessment;

calculate/display scores;

view dimension-level results;

view recommendations;

generate/view a report.

Question data must drive the UI.

Do not create one React component per question.


8. PWA requirements

This must be a genuine installable PWA.

Configure:

Web App Manifest;

application icons/placeholders;

service worker;

installability;

offline fallback;

sensible app-shell caching;

update handling;

network-status handling.

An assessment that is in progress should be stored locally when necessary and recoverable when the device reconnects.

Do not cache authentication tokens or sensitive API responses using unsafe generic service-worker strategies.


9. Accessibility and UX

Include:

keyboard navigation;

semantic HTML;

visible focus states;

accessible labels;

appropriate ARIA only where required;

readable contrast;

loading states;

error states;

empty states;

validation messages;

disabled/submitting states;

mobile-friendly touch targets.


10. Development strategy

Do not attempt the whole project in one uncontrolled change.

Implement in milestones:

Milestone 1 – Project foundation

Tooling, routing, Tailwind, PWA foundation, project structure, linting and testing.

Milestone 2 – Design system and application shell

Reusable components and responsive application layout.

Milestone 3 – Figma screens with mock data

Build the major screens and make the complete happy-path navigation demonstrable.

Milestone 4 – Authentication and roles

Supabase authentication and protected role-based routes.

Milestone 5 – Assessment engine

Data-driven questions, responses, autosave, resume and validation.

Milestone 6 – Offline PWA functionality

IndexedDB/local drafts, connectivity handling and synchronisation.

Milestone 7 – Scoring, recommendations and reporting

Milestone 8 – Testing and production readiness

At the end of every milestone:

run TypeScript checks;

run linting;

run relevant tests;

fix failures before continuing;

summarise completed work;

list unresolved issues.


11. Coding standards

Use TypeScript strict mode.

Avoid:

any unless genuinely unavoidable;

giant components;

duplicated UI;

hard-coded assessment data throughout components;

fake API calls presented as implemented;

unnecessary state-management libraries;

hard-coded secrets;

committing .env files.

Keep environment variables in .env.example.

Prefer simple, understandable architecture appropriate for a school project over enterprise complexity.


12. Important behaviour

If Supabase credentials are not yet available:

do not block frontend development;

create a clearly separated mock-data implementation;

define interfaces that will later be backed by Supabase;

never pretend mock data is a live backend.

Record significant assumptions in project documentation.

Start by auditing the repository and proposing the implementation plan. Do not generate the entire application before completing that assessment.


Ask for change
