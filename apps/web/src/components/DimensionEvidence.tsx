import type { AssessmentRecord } from '@assessment/contracts';

export function DimensionEvidence({ record, dimensionId }: { record: AssessmentRecord; dimensionId: string }) {
  const dimension = record.templateSnapshot.dimensions.find((item) => item.id === dimensionId);
  const questions = dimension?.questions.filter((question) => record.evidence[question.id]?.trim());
  if (!questions?.length) return null;

  return <dl className="dimension-evidence" aria-label="Your evidence and comments">
    {questions.map((question) => <div key={question.id}>
      <dt>{question.prompt}</dt>
      <dd>{record.evidence[question.id]}</dd>
    </div>)}
  </dl>;
}
