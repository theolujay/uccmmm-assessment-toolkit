// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { assessmentTemplate, createAssessmentRecord, type Role } from '@assessment/contracts';
import { getAssessmentHistory } from '../services/assessment-service';
import { RecommendationsPage } from './RecommendationsPage';
import { ReportsPage } from './ReportsPage';
import { ResultsPage } from './ResultsPage';

const account = vi.hoisted(() => ({ role: 'admin' as Role, organizationName: 'Test organisation' }));
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: account }) }));
vi.mock('../services/assessment-service');
vi.mock('../services/organisation-service', () => ({ getOrganisationProfile: async () => undefined }));

const responses = Object.fromEntries(assessmentTemplate.dimensions.flatMap(({ id, questions }) => questions.map(({ id: questionId }) => [questionId, id === 'resilience' ? 2 : 4])));
const common = { organisationId: 'org', respondentType: 'admin', template: assessmentTemplate, responses } as const;
const latest = createAssessmentRecord({ ...common, id: 'latest', submittedAt: '2026-11-18T12:00:00.000Z', targetSnapshot: { training: 90 } });
const historical = createAssessmentRecord({ ...common, id: 'historical', submittedAt: '2026-11-17T12:00:00.000Z', targetSnapshot: { resilience: 80, leadership: 80 }, evidence: { 'resilience-1': 'Private baseline note.' } });

beforeEach(() => {
  account.role = 'admin';
  vi.mocked(getAssessmentHistory).mockResolvedValue([latest, historical]);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const show = (path: string) => render(<MemoryRouter initialEntries={[path]}><Routes>
  <Route path="/results" element={<ResultsPage />} />
  <Route path="/recommendations" element={<RecommendationsPage />} />
  <Route path="/reports" element={<ReportsPage />} />
</Routes></MemoryRouter>);

it('carries the selected baseline through the gap chart, roadmap and printable report', async () => {
  const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
  const user = userEvent.setup();
  show('/results');
  await user.selectOptions(await screen.findByRole('combobox', { name: 'Past assessments' }), 'historical');
  const gap = screen.getByRole('region', { name: 'Target gap analysis' });
  const rows = within(gap).getAllByRole('listitem');
  expect(within(rows[0]).getByText('40 pp short · high priority')).toBeTruthy();
  expect(within(rows[1]).getByText('Target met')).toBeTruthy();
  expect(within(gap).getAllByText('No target')).toHaveLength(4);
  expect(screen.getByText(/critical target gap in Contextual Resilience/)).toBeTruthy();
  await user.click(screen.getByRole('link', { name: 'View recommendations' }));
  expect((await screen.findByRole<HTMLSelectElement>('combobox', { name: 'Assessment date' })).value).toBe('historical');
  expect(screen.getByText(/40 percentage points below the 80% target/)).toBeTruthy();
  expect(screen.getByText(/Continuity plan \(2\/5\)/)).toBeTruthy();
  expect(screen.queryByText('Private baseline note.')).toBeNull();
  await user.click(screen.getByRole('link', { name: 'Open assessment report' }));
  await user.click(await screen.findByRole('button', { name: 'Print / save PDF' }));
  expect(print).toHaveBeenCalledOnce();
  expect(screen.getByText('Private baseline note.')).toBeTruthy();
  expect(screen.getByText(/40 percentage points below the 80% target/)).toBeTruthy();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Assessment date' }), 'latest');
  expect(screen.queryByText('Private baseline note.')).toBeNull();
  expect(screen.getByText('10 pp short · medium priority')).toBeTruthy();
});

it('does not expose Admin planning controls on a stakeholder result', async () => {
  account.role = 'stakeholder';
  vi.mocked(getAssessmentHistory).mockResolvedValue([createAssessmentRecord({
    ...common, id: 'stakeholder', respondentType: 'stakeholder', submittedAt: '2026-11-18T12:00:00.000Z',
  })]);
  show('/results');
  expect(await screen.findByRole('heading', { name: 'Maturity profile' })).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Target gap analysis' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'View recommendations' })).toBeNull();
});
