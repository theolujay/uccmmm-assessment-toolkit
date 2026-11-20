import { useEffect, useState, type FormEvent } from 'react';
import { assessmentTemplate, maturityTargetsSchema, type MaturityTargets } from '@assessment/contracts';
import { getMaturityTargets, updateMaturityTargets } from '../services/maturity-target-service';

export function MaturityTargetsForm() {
  const [targets, setTargets] = useState<MaturityTargets>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    let active = true;
    void getMaturityTargets().then((data) => { if (active) setTargets(data); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load maturity targets.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setMessage(undefined);
    const form = new FormData(event.currentTarget);
    const entries = assessmentTemplate.dimensions.flatMap(({ id }) => {
      const value = form.get(id);
      return typeof value === 'string' && value !== '' ? [[id, Number(value)]] : [];
    });
    const parsed = maturityTargetsSchema.safeParse(Object.fromEntries(entries));
    if (!parsed.success) { setError('Enter whole percentages from 20 to 100, or leave the field blank.'); return; }
    setSaving(true);
    try {
      await updateMaturityTargets(parsed.data);
      setMessage('Maturity targets saved for future Admin submissions.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save maturity targets.');
    } finally { setSaving(false); }
  }

  return <section className="panel settings-panel target-settings" aria-labelledby="target-settings-title">
    <h2 id="target-settings-title">Maturity targets</h2>
    <p id="target-settings-help">Enter a whole percentage from 20 to 100 for each dimension you want to track. Leave a field blank to clear its target. Changes apply to future Admin submissions only.</p>
    {loading && <p role="status">Loading maturity targets…</p>}
    {error && <p className="page-error" role="alert">{error}</p>}
    {targets && <form aria-describedby="target-settings-help" onSubmit={(event) => void submit(event)} onChange={() => setMessage(undefined)}>
      <fieldset disabled={saving} className="settings-form target-fields">
        <legend className="sr-only">Targets by dimension</legend>
        {assessmentTemplate.dimensions.map(({ id, name }) => <label key={id}>
          {name} (%)<input name={id} type="number" min={20} max={100} step={1} defaultValue={targets[id as keyof MaturityTargets]} />
        </label>)}
        <div className="settings-actions full-width"><button className="button">{saving ? 'Saving…' : 'Save maturity targets'}</button></div>
      </fieldset>
    </form>}
    {message && <p className="success-message" role="status">{message}</p>}
  </section>;
}
