// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assessmentTemplate, evidenceMaxLength } from '@assessment/contracts';
import { getDraft } from '../lib/storage';
import { AssessmentPage } from './AssessmentPage';

const user = vi.hoisted(() => ({
  userId: 'stakeholder-page-test', organizationId: 'org-page-test', role: 'stakeholder', email: 'respondent@example.com',
}));
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user }) }));
vi.mock('../lib/supabase', () => ({ isDemoMode: false, supabase: null }));

afterEach(cleanup);
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
});
