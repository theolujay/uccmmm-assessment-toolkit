import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { assessmentTemplate, questionCount, type AssessmentResponses } from '../data/assessment';
import { loadActiveDraft, saveActiveDraft, submitActiveAssessment } from '../services/assessment-service';

type AssessmentMode = 'intro' | 'questions' | 'review';

export function AssessmentPage() {
  const navigate = useNavigate();
  const questions = useMemo(
    () => assessmentTemplate.dimensions.flatMap((dimension) => dimension.questions.map((question) => ({ question, dimension }))),
    [],
  );
  const [mode, setMode] = useState<AssessmentMode>('intro');
  const [responses, setResponses] = useState<AssessmentResponses>({});
  const [activeQuestionId, setActiveQuestionId] = useState(questions[0].question.id);
  const [isReady, setIsReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    void loadActiveDraft()
      .then((draft) => {
        if (cancelled) return;
        setResponses(draft.responses);
        setActiveQuestionId(draft.activeQuestionId);
        setMode(Object.keys(draft.responses).length > 0 ? 'questions' : 'intro');
      })
      .catch(() => {
        if (!cancelled) setError('We could not restore your saved progress. You can still complete this assessment.');
      })
      .finally(() => {
        if (!cancelled) setIsReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isReady) return;
    void saveActiveDraft({ responses, activeQuestionId }).then(() => setError(undefined)).catch((error) => {
      setError(error instanceof Error ? error.message : 'Your answer could not be saved. Please keep this tab open and try again.');
    });
  }, [activeQuestionId, isReady, responses]);

  useEffect(() => {
    const onOffline = () => setIsOnline(false);
    const onOnline = () => {
      setIsOnline(true);
      if (isReady) void saveActiveDraft({ responses, activeQuestionId }).then(() => setError(undefined)).catch((syncError) => {
        setError(syncError instanceof Error ? syncError.message : 'Your saved answers could not sync yet.');
      });
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => { window.removeEventListener('offline', onOffline); window.removeEventListener('online', onOnline); };
  }, [activeQuestionId, isReady, responses]);

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

  const submit = async () => {
    if (!complete) return;
    setError(undefined);
    setIsSubmitting(true);
    try {
      await submitActiveAssessment(responses);
      navigate('/results');
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'We could not submit this assessment. Please try again.');
      setIsSubmitting(false);
    }
  };

  if (!isReady) {
    return <section className="loading-state" aria-live="polite">Restoring your saved assessment…</section>;
  }

  if (mode === 'intro') {
    return <section>
      <div className="page-heading"><div><p className="eyebrow">UCCMM maturity assessment</p><h1>Assess your change readiness</h1><p>Answer the questions based on your organisation’s current ERP change-management practices.</p></div></div>
      <article className="panel assessment-intro-card"><h2>What to expect</h2><ul>
        <li>Six dimensions with five questions each.</li>
        <li>Choose one response from “Not in place” to “Fully and consistently in place.”</li>
        <li>Your score is calculated from all 30 responses and classified into a maturity level.</li>
        <li>Your progress saves automatically on this device and syncs to your account when connected.</li>
        <li>You can leave and resume later. All questions must be answered before submission.</li>
      </ul><button className="button" onClick={() => setMode('questions')}>{answeredCount > 0 ? 'Resume assessment' : 'Start assessment'}</button></article>
    </section>;
  }

  if (mode === 'review') {
    return <section>
      <div className="page-heading">
        <div><p className="eyebrow">Review assessment</p><h1>Check your answers</h1><p>Every core question must be answered before you submit.</p></div>
        <span className="progress-pill">{answeredCount}/{questionCount} answered</span>
      </div>
      <div className="review-list">
        {assessmentTemplate.dimensions.map((dimension) => <article className="panel review-dimension" key={dimension.id}>
          <div><h2>{dimension.name}</h2><p>{dimension.description}</p></div>
          <div>{dimension.questions.map((question) => {
            const absoluteIndex = questions.findIndex(({ question: item }) => item.id === question.id) + 1;
            const answered = responses[question.id] !== undefined;
            return <button className="review-question" key={question.id} onClick={() => selectQuestion(question.id)}>
              <span><b>{absoluteIndex}.</b> {question.prompt}</span><small className={answered ? 'answered' : 'unanswered'}>{answered ? 'Answered' : 'Unanswered'}</small>
            </button>;
          })}</div>
        </article>)}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="review-actions">
        <button className="button secondary" onClick={() => setMode('questions')}>Back to questions</button>
        <button className="button" disabled={!complete || isSubmitting} onClick={() => void submit()}>{isSubmitting ? 'Submitting…' : 'Submit assessment'}</button>
      </div>
    </section>;
  }

  return <section>
      <div className="page-heading">
        <div><p className="eyebrow">Maturity assessment</p><h1>{current.dimension.name}</h1><p>Question {activeIndex + 1} of {questionCount} · Answers are saved automatically.</p></div>
        <span className="progress-pill">{answeredCount}/{questionCount} answered</span>
      </div>
      {!isOnline && <p className="offline-note" role="status">You’re offline. Answers are saved on this device and will sync when you reconnect.</p>}
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
  </section>;
}
