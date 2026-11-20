// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assessmentTemplate, evidenceMaxLength } from '@assessment/contracts';
import { getDraft } from '../lib/storage';
import { saveActiveDraft } from '../services/assessment-service';
import { AssessmentPage } from './AssessmentPage';

const user = vi.hoisted(() => ({
  userId: 'stakeholder-page-test', organizationId: 'org-page-test', role: 'stakeholder' as const, email: 'respondent@example.com',
}));
const environment = vi.hoisted(() => ({ connected: false, offlineRecovery: false, from: vi.fn(), rpc: vi.fn() }));
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user, offlineRecovery: environment.offlineRecovery }) }));
vi.mock('../lib/supabase', () => ({
  isDemoMode: false,
  get supabase() { return environment.connected ? { from: environment.from, rpc: environment.rpc } : null; },
}));

afterEach(() => {
  cleanup();
  environment.connected = false;
  environment.offlineRecovery = false;
  vi.resetAllMocks();
  vi.restoreAllMocks();
});
const showAssessment = () => render(<MemoryRouter><AssessmentPage /></MemoryRouter>);
const savedDraft = () => getDraft(user.userId, assessmentTemplate.version);

describe('assessment evidence editor', () => {
  it('opens an optional per-question textarea, autosaves it, restores it, and marks it in review', async () => {
    const interaction = userEvent.setup();
    const view = showAssessment();
    await interaction.click(await screen.findByRole('button', { name: 'Start assessment' }));
    const summary = screen.getByText('Evidence or comment');
    const details = summary.closest('details');
    expect(details?.open).toBe(false);
    await interaction.click(summary);
    expect(details?.open).toBe(true);
    const textarea = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Your private note' });
    expect(textarea.maxLength).toBe(evidenceMaxLength);
    expect(textarea.required).toBe(false);

    await interaction.type(textarea, 'Minutes from May.{Enter}Follow-up in June.');
    const note = 'Minutes from May.\nFollow-up in June.';
    await waitFor(async () => expect(await savedDraft()).toMatchObject({
      responses: {}, evidence: { 'leadership-1': note },
    }));
    await interaction.click(screen.getByRole('button', { name: 'Question 2' }));
    await interaction.click(screen.getByText('Evidence or comment'));
    expect(screen.getByRole<HTMLTextAreaElement>('textbox').value).toBe('');
    await interaction.click(screen.getByRole('button', { name: 'Review answers' }));
    const firstQuestion = screen.getByRole('button', { name: /Senior leaders regularly communicate/ });
    expect(within(firstQuestion).getByText('Evidence added')).toBeTruthy();
    expect(screen.getAllByText('Evidence added')).toHaveLength(1);
    await waitFor(async () => expect((await savedDraft())?.activeQuestionId).toBe('leadership-2'));

    view.unmount();
    showAssessment();
    await interaction.click(await screen.findByRole('button', { name: 'Question 1' }));
    await interaction.click(screen.getByText('Evidence or comment'));
    const restored = screen.getByRole<HTMLTextAreaElement>('textbox');
    expect(restored.value).toBe(note);
    await interaction.clear(restored);
    await waitFor(async () => expect((await savedDraft())?.evidence).toEqual({}));
  });

  it('restores the draft on a cold start and waits for online verification before syncing or submitting', async () => {
    environment.connected = true;
    environment.offlineRecovery = true;
    const connectivity = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const responses = Object.fromEntries(assessmentTemplate.dimensions.flatMap(({ questions }) => questions.map(({ id }) => [id, 2])));
    const draft = await saveActiveDraft(user, { responses, evidence: { 'leadership-2': 'Stored before the restart.' }, activeQuestionId: 'leadership-2' });
    const interaction = userEvent.setup();
    const view = showAssessment();
    const restoredQuestion = await screen.findByRole('button', { name: 'Question 2' });
    expect(restoredQuestion.getAttribute('aria-current')).toBe('step');
    expect(screen.getByRole<HTMLInputElement>('radio', { name: /rarely in place/i }).checked).toBe(true);
    await interaction.click(screen.getByText('Evidence or comment'));
    expect(screen.getByRole<HTMLTextAreaElement>('textbox').value).toBe('Stored before the restart.');
    await interaction.click(screen.getByRole('radio', { name: /^not in place/i }));
    await waitFor(async () => expect((await savedDraft())?.responses['leadership-2']).toBe(1));
    await interaction.click(screen.getByRole('button', { name: 'Review answers' }));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Submit assessment' }).disabled).toBe(true);

    // Connectivity alone is not authorisation to transmit or submit the draft.
    connectivity.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event('online')));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Submit assessment' }).disabled).toBe(true);
    expect(environment.from).not.toHaveBeenCalled();
    expect(environment.rpc).not.toHaveBeenCalled();

    const upsert = vi.fn().mockReturnValue({ abortSignal: vi.fn().mockResolvedValue({ error: null }) });
    environment.from.mockReturnValue({ upsert });
    environment.offlineRecovery = false;
    view.rerender(<MemoryRouter><AssessmentPage /></MemoryRouter>);
    await waitFor(() => expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: draft.id, responses: { ...responses, 'leadership-2': 1 } }), expect.anything()));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Submit assessment' }).disabled).toBe(false);
    expect(environment.rpc).not.toHaveBeenCalled();
  });
});
