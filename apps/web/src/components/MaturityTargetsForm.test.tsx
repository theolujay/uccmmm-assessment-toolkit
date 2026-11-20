// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getMaturityTargets, updateMaturityTargets } from '../services/maturity-target-service';
import { MaturityTargetsForm } from './MaturityTargetsForm';

vi.mock('../services/maturity-target-service');
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

it('loads saved values, clears a target, and saves only the dimensions with values', async () => {
  vi.mocked(getMaturityTargets).mockResolvedValue({ leadership: 80 });
  vi.mocked(updateMaturityTargets).mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(<MaturityTargetsForm />);
  const leadership = await screen.findByRole<HTMLInputElement>('spinbutton', { name: /leadership/i });
  expect(leadership.value).toBe('80');
  expect(screen.getAllByRole('spinbutton')).toHaveLength(6);
  await user.clear(leadership);
  await user.type(screen.getByRole('spinbutton', { name: /contextual resilience/i }), '100');
  await user.click(screen.getByRole('button', { name: 'Save maturity targets' }));
  expect(updateMaturityTargets).toHaveBeenCalledWith({ resilience: 100 });
  expect(await screen.findByText('Maturity targets saved for future Admin submissions.')).toBeTruthy();
});

it('does not send out-of-range values and keeps edits after a failed save', async () => {
  vi.mocked(getMaturityTargets).mockResolvedValue({});
  vi.mocked(updateMaturityTargets).mockRejectedValue(new Error('Not connected.'));
  const user = userEvent.setup();
  render(<MaturityTargetsForm />);
  const leadership = await screen.findByRole<HTMLInputElement>('spinbutton', { name: /leadership/i });
  const save = screen.getByRole('button', { name: 'Save maturity targets' });
  await user.type(leadership, '19');
  await user.click(save);
  expect(leadership.validity.rangeUnderflow).toBe(true);
  expect(updateMaturityTargets).not.toHaveBeenCalled();
  await user.clear(leadership);
  await user.type(leadership, '70');
  await user.click(save);
  expect((await screen.findByRole('alert')).textContent).toBe('Not connected.');
  expect(leadership.value).toBe('70');
});
