import { generateRecommendations, type AssessmentRecord } from '@assessment/contracts';

export function ImprovementRoadmap({ record }: { record: AssessmentRecord }) {
  const actions = generateRecommendations(record.dimensionScores, record.templateSnapshot.maturityBands, {
    targets: record.targetSnapshot,
    responses: record.responses,
  });

  return <section className="improvement-roadmap">
    <h2>Improvement roadmap</h2>
    <p className="draft-guidance">Draft guidance based on scores, recorded targets and continuity ratings. The rules and actions have not yet been validated by expert review.</p>
    {actions.length === 0 ? <p>No actions were triggered by these rules. Continue monitoring and reassess as the ERP project changes.</p> :
      <ol className="roadmap-actions">
        {actions.map((item) => {
          const nextBoundary = item.nextLevel && record.templateSnapshot.maturityBands.find((band) => band.level === item.maturityLevel)?.upperBound;
          return <li className="panel roadmap-action" key={item.id}>
            <p className="action-context">{item.dimensionName} · {Math.round(item.scorePercentage)}% · {item.maturityLevel}</p>
            <h3>{item.action}</h3>
            <dl>
              <div><dt>Capability weakness</dt><dd>{item.weakness}</dd></div>
              <div><dt>Expected benefit</dt><dd>{item.benefit}</dd></div>
              <div><dt>Priority</dt><dd><span className={`action-priority ${item.priority}`}>{item.priority}</span>{item.priorityBasis === 'target-gap' ? ` · ${item.gap} percentage points below the ${item.targetPercentage}% target` : item.priorityBasis === 'target-met' ? ` · ${item.targetPercentage}% target met` : ' · Based on maturity level (no target recorded)'}</dd></div>
              {nextBoundary !== undefined && <div><dt>Next maturity level</dt><dd>{item.nextLevel}: score above {nextBoundary}%.</dd></div>}
              {!!item.continuityEvidence?.lowRatedCriteria.length && <div><dt>Continuity ratings used</dt><dd>{item.continuityEvidence.lowRatedCriteria.map(({ questionId, rating }) => `${questionId === 'resilience-1' ? 'Continuity plan' : 'Backup arrangements'} (${rating}/5)`).join('; ')}</dd></div>}
            </dl>
          </li>;
        })}
      </ol>}
  </section>;
}
