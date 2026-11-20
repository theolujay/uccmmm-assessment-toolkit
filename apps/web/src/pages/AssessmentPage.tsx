import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { assessmentTemplate, evidenceMaxLength, questionCount, type AssessmentDraft, type AssessmentEvidence, type AssessmentResponses } from '@assessment/contracts';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { loadActiveDraft, saveActiveDraft, submitActiveAssessment, syncActiveDraft } from '../services/assessment-service';

type AssessmentMode = 'intro' | 'questions' | 'review';

export function AssessmentPage() {
  const navigate = useNavigate();
  const { user, offlineRecovery, offlineRecoveryEnabled, enableOfflineRecovery, disableOfflineRecovery } = useAuth();
  const { userId, role, organizationId, email } = user ?? {};
  const identity = useMemo(() => userId && role && organizationId && email !== undefined
    ? { userId, role, organizationId, email }
    : undefined, [userId, role, organizationId, email]);
  const questions = useMemo(
    () => assessmentTemplate.dimensions.flatMap((dimension) => dimension.questions.map((question) => ({ question, dimension }))),
    [],
  );
  const [mode, setMode] = useState<AssessmentMode>('intro');
  const [responses, setResponses] = useState<AssessmentResponses>({});
  const [evidence, setEvidence] = useState<AssessmentEvidence>({});
  const pendingSave = useRef(Promise.resolve(true));
  const pendingSync = useRef(Promise.resolve());
  const [localDraft, setLocalDraft] = useState<AssessmentDraft>();
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'failed'>('saved');
  const [syncError, setSyncError] = useState<string>();
  const [restoreError, setRestoreError] = useState<string>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [recoveryNotice, setRecoveryNotice] = useState<string>();
  const [preparingRecovery, setPreparingRecovery] = useState(false);
  const [activeQuestionId, setActiveQuestionId] = useState(questions[0].question.id);
  const [isReady, setIsReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [error, setError] = useState<string>();
  const canSync = !offlineRecovery && isOnline;
  const canSubmit = !supabase || canSync;

  useEffect(() => {
    if (!identity || isReady) return;
    let cancelled = false;
    void loadActiveDraft(identity, { localOnly: offlineRecovery })
      .then((draft) => {
        if (cancelled) return;
        setResponses(draft.responses);
        setEvidence(draft.evidence);
        setActiveQuestionId(draft.activeQuestionId);
        setMode(draft.status === 'in_progress' ? 'questions' : 'intro');
        setRestoreError(undefined);
        setIsReady(true);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setRestoreError(cause instanceof Error ? cause.message : 'We could not restore your saved progress.');
      });
    return () => { cancelled = true; };
  }, [identity, isReady, loadAttempt, offlineRecovery]);

  useEffect(() => {
    if (!identity || !isReady) return;
    setSaveStatus('saving');
    const save = pendingSave.current.then(async () => {
      try {
        const draft = await saveActiveDraft(identity, { responses, evidence, activeQuestionId });
        if (pendingSave.current === save) {
          setLocalDraft(draft);
          setSaveStatus('saved');
        }
        return true;
      } catch {
        if (pendingSave.current === save) setSaveStatus('failed');
        return false;
      }
    });
    pendingSave.current = save;
  }, [activeQuestionId, evidence, identity, isReady, responses]);

  useEffect(() => {
    if (!supabase || !identity || !localDraft || !canSync || isSubmitting || saveStatus !== 'saved') return;
    let cancelled = false;
    // Local commits never wait on the network. Serialize cloud writes independently.
    pendingSync.current = pendingSync.current.then(async () => {
      if (cancelled) return;
      try {
        await syncActiveDraft(identity, localDraft);
        if (!cancelled) setSyncError(undefined);
      } catch (cause) {
        if (!cancelled) setSyncError(cause instanceof Error ? cause.message : 'Your draft is saved on this device but could not sync.');
      }
    });
    return () => { cancelled = true; };
  }, [canSync, identity, isSubmitting, localDraft, saveStatus]);

  useEffect(() => {
    const onOffline = () => setIsOnline(false);
    const onOnline = () => setIsOnline(true);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => { window.removeEventListener('offline', onOffline); window.removeEventListener('online', onOnline); };
  }, []);

  const activeIndex = Math.max(0, questions.findIndex(({ question }) => question.id === activeQuestionId));
  const current = questions[activeIndex];
  const answeredCount = Object.keys(responses).length;
  const complete = answeredCount === questionCount;

  const selectQuestion = (questionId: string) => {
    setMode('questions');
    setActiveQuestionId(questionId);
  };

  const selectDimension = (dimensionId: string) => {
    const dimensionQuestions = questions.filter(({ dimension }) => dimension.id === dimensionId);
    const firstUnanswered = dimensionQuestions.find(({ question }) => responses[question.id] === undefined);
    selectQuestion((firstUnanswered ?? dimensionQuestions[0]).question.id);
  };

  const answer = (weight: number) => {
    setResponses((currentResponses) => ({ ...currentResponses, [current.question.id]: weight }));
  };

  const updateEvidence = (text: string) => {
    setEvidence((currentEvidence) => {
      const next = { ...currentEvidence };
      if (text === '') delete next[current.question.id];
      else next[current.question.id] = text;
      return next;
    });
  };

  const submit = async () => {
    if (!complete || !identity || !canSubmit) return;
    setError(undefined);
    setIsSubmitting(true);
    try {
      if (!await pendingSave.current) throw new Error('Your draft could not be saved on this device. Try editing a response and saving again.');
      await pendingSync.current;
      await submitActiveAssessment(identity, responses, evidence);
      navigate('/results');
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'We could not submit this assessment. Please try again.');
      setIsSubmitting(false);
    }
  };

  async function trustDevice() {
    setPreparingRecovery(true);
    setRecoveryNotice(undefined);
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      if (!registration?.active) throw new Error('The offline app is not ready. Keep this page open online and try again.');
      enableOfflineRecovery();
      void navigator.storage?.persist?.().catch(() => undefined);
    } catch (cause) {
      setRecoveryNotice(cause instanceof Error ? cause.message : 'Could not enable recovery on this device.');
    } finally {
      setPreparingRecovery(false);
    }
  }

  const recoveryOption = supabase && !offlineRecovery && isOnline && <details className="panel recovery-option" open={offlineRecoveryEnabled || undefined}>
    <summary>Offline recovery on this device</summary>
    <p>Use only on a private device. For seven days, anyone using this browser profile can reopen this local draft, including its notes, without signing in again. Sign out or turn off recovery before sharing this device.</p>
    {offlineRecoveryEnabled ? <p><strong>Recovery enabled.</strong>{' '}<button type="button" className="button secondary" onClick={disableOfflineRecovery}>Turn off recovery</button></p> :
      <button type="button" className="button secondary" disabled={preparingRecovery} onClick={() => void trustDevice()}>{preparingRecovery ? 'Preparing…' : 'Enable offline recovery'}</button>}
    {recoveryNotice && <p className="page-error" role="alert">{recoveryNotice}</p>}
  </details>;
  const offlineNotice = (!isOnline || offlineRecovery) && <p className="offline-note" role="status">{offlineRecovery ? 'Local recovery: continue your saved assessment. Sync and submission require a verified online session.' : 'You’re offline. Your draft is saved on this device. Reconnect to sync and submit.'}</p>;
  const saveNotice = saveStatus === 'failed'
    ? <p className="page-error" role="alert">Could not save the latest edit on this device. Keep this page open and try editing again.</p>
    : <p className="draft-save-status" role="status">{saveStatus === 'saving' ? 'Saving on this device…' : 'Saved on this device'}</p>;

  if (!isReady) {
    return restoreError ? <section className="panel"><h1>Assessment draft unavailable</h1><p className="page-error" role="alert">{restoreError}</p><button className="button" onClick={() => { setRestoreError(undefined); setLoadAttempt((attempt) => attempt + 1); }}>Try loading again</button></section>
      : <section className="loading-state" aria-live="polite">Restoring your saved assessment…</section>;
  }

  if (mode === 'intro') {
    return <section>
      <div className="page-heading"><div><p className="eyebrow">UCCMM maturity assessment</p><h1>Assess your change readiness</h1><p>Answer the questions based on your organisation’s current ERP change-management practices.</p></div></div>
      {offlineNotice}
      <article className="panel assessment-intro-card"><h2>What to expect</h2><ul>
        <li>Six dimensions with five questions each.</li>
        <li>Choose one response from “Not in place” to “Fully and consistently in place.”</li>
        <li>Your score is calculated from all 30 responses and classified into a maturity level.</li>
        <li>You can add a private note to any question. It won’t affect your score.</li>
        <li>Your progress saves automatically on this device and syncs to your account when connected.</li>
        <li>You can leave and resume later. All questions must be answered before submission.</li>
      </ul><button className="button" onClick={() => setMode('questions')}>{answeredCount > 0 ? 'Resume assessment' : 'Start assessment'}</button></article>
      {recoveryOption}
    </section>;
  }

  if (mode === 'review') {
    return <section>
      <div className="page-heading">
        <div><p className="eyebrow">Review assessment</p><h1>Check your answers</h1><p>Every core question must be answered before you submit.</p></div>
        <span className="progress-pill">{answeredCount}/{questionCount} answered</span>
      </div>
      {offlineNotice}
      {saveNotice}
      {canSync && syncError && <p className="page-error" role="alert">{syncError}</p>}
      <div className="review-list">
        {assessmentTemplate.dimensions.map((dimension) => <article className="panel review-dimension" key={dimension.id}>
          <div><h2>{dimension.name}</h2><p>{dimension.description}</p></div>
          <div>{dimension.questions.map((question) => {
            const absoluteIndex = questions.findIndex(({ question: item }) => item.id === question.id) + 1;
            const answered = responses[question.id] !== undefined;
            return <button className="review-question" key={question.id} disabled={isSubmitting} onClick={() => selectQuestion(question.id)}>
              <span><b>{absoluteIndex}.</b> {question.prompt}</span><small className={answered ? 'answered' : 'unanswered'}>{answered ? 'Answered' : 'Unanswered'}{evidence[question.id]?.trim() && <span className="evidence-indicator">Evidence added</span>}</small>
            </button>;
          })}</div>
        </article>)}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="review-actions">
        <button className="button secondary" disabled={isSubmitting} onClick={() => setMode('questions')}>Back to questions</button>
        <button className="button" disabled={!complete || isSubmitting || !canSubmit || saveStatus !== 'saved'} onClick={() => void submit()}>{isSubmitting ? 'Submitting…' : 'Submit assessment'}</button>
      </div>
      {recoveryOption}
    </section>;
  }

  return <section>
      <div className="page-heading">
        <div><p className="eyebrow">Maturity assessment</p><h1>{current.dimension.name}</h1><p>Question {activeIndex + 1} of {questionCount} · Answers are saved automatically.</p></div>
        <span className="progress-pill">{answeredCount}/{questionCount} answered</span>
      </div>
    {offlineNotice}
    {saveNotice}
    {canSync && syncError && <p className="page-error" role="alert">{syncError}</p>}
    <div className="assessment-layout">
      <aside className="dimension-nav" aria-label="Assessment dimensions">
        <h2>Dimensions</h2>
        {assessmentTemplate.dimensions.map((dimension) => {
          const dimensionAnswered = dimension.questions.filter((question) => responses[question.id] !== undefined).length;
          const status = dimensionAnswered === 0 ? 'Not started' : dimensionAnswered === dimension.questions.length ? 'Completed' : 'In progress';
          return <button key={dimension.id} className={dimension.id === current.dimension.id ? 'selected' : ''} onClick={() => selectDimension(dimension.id)}>
            <span>{dimension.order}</span><span>{dimension.shortName}<small>{status}</small></span><small>{dimensionAnswered}/5</small>
          </button>;
        })}
      </aside>
      <article className="question-card">
        <p className="question-number">Question {activeIndex + 1}</p>
        <p className="dimension-description">{current.dimension.description}</p>
        <h2>{current.question.prompt}</h2>
        <fieldset>
          <legend>Select the option that best describes your organisation.</legend>
          {current.question.options.map((option) => <label className={responses[current.question.id] === option.weight ? 'choice selected' : 'choice'} key={option.id}>
            <input type="radio" name={current.question.id} checked={responses[current.question.id] === option.weight} onChange={() => answer(option.weight)} />
            <span>{option.label}</span><small>{option.weight}/5</small>
          </label>)}
        </fieldset>
        <details className="question-evidence" key={current.question.id}>
          <summary>Evidence or comment <span>(optional)</span></summary>
          <label htmlFor="question-evidence">Your private note</label>
          <textarea
            id="question-evidence"
            aria-describedby="question-evidence-hint"
            maxLength={evidenceMaxLength}
            rows={4}
            value={evidence[current.question.id] ?? ''}
            onChange={(event) => updateEvidence(event.target.value)}
          />
          <p id="question-evidence-hint">Only you can see this note. {evidence[current.question.id]?.length ?? 0}/{evidenceMaxLength}</p>
        </details>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="question-actions">
          <button className="button secondary" disabled={activeIndex === 0} onClick={() => selectQuestion(questions[activeIndex - 1].question.id)}>Previous</button>
          {activeIndex < questions.length - 1
            ? <button className="button" onClick={() => selectQuestion(questions[activeIndex + 1].question.id)}>Save & continue</button>
            : <button className="button" onClick={() => setMode('review')}>Review answers</button>}
        </div>
      </article>
      <aside className="question-navigator" aria-label="Question navigator">
        <div><h2>Questions</h2><p>{answeredCount} answered</p></div>
        <div className="question-grid">{questions.map(({ question }, index) => {
          const status = question.id === current.question.id ? 'current' : responses[question.id] !== undefined ? 'answered' : 'unanswered';
          return <button className={status} key={question.id} aria-label={`Question ${index + 1}`} aria-current={status === 'current' ? 'step' : undefined} onClick={() => selectQuestion(question.id)}>{index + 1}</button>;
        })}</div>
        <button className="button secondary review-button" onClick={() => setMode('review')}>Review answers</button>
      </aside>
    </div>
    {recoveryOption}
  </section>;
}
