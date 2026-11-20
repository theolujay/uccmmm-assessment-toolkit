import { describe, expect, it } from 'vitest';
import {
  assessmentTemplate,
  classifyMaturity,
  defaultMaturityBands,
  type DimensionScore,
} from './index';
import {
  assessContinuityEvidence,
  calculateDimensionGaps,
  generateRecommendations,
  qualifyOverallResult,
  recommendationLibrary,
  targetGapPriorityPolicy,
} from './recommendations';

function score(index: number, scorePercentage: number, maturityLevel = classifyMaturity(scorePercentage)): DimensionScore {
  const dimension = assessmentTemplate.dimensions[index];
  return { dimensionId: dimension.id, dimensionName: dimension.name, scorePercentage, maturityLevel, itemCount: 5 };
}

describe('recommendation library', () => {
  it('has a foundation, structure, optimise and sustain tier for each of the six dimensions', () => {
    for (const dimension of assessmentTemplate.dimensions) {
      const tiers = recommendationLibrary.filter((entry) => entry.dimensionId === dimension.id).map((entry) => entry.maxLevel);
      expect(tiers).toEqual(['Developing', 'Defined', 'Managed', 'Optimising']);
    }
  });

  it('has unique ids and no empty fields', () => {
    expect(new Set(recommendationLibrary.map((entry) => entry.id)).size).toBe(recommendationLibrary.length);
    for (const entry of recommendationLibrary) {
      expect([entry.weakness, entry.action, entry.benefit].every((text) => text.trim().length > 0)).toBe(true);
    }
  });
});

describe('calculateDimensionGaps', () => {
  it('sorts by gap, weaker actual, then stable ID, with met targets before unset targets', () => {
    const scores = [score(0, 72), score(5, 20), score(4, 100), score(3, 64), score(2, 64), score(1, 72)];
    const targets = { leadership: 100, training: 100, readiness: 92, requirements: 92, communication: 70 };
    const result = calculateDimensionGaps(scores, targets);
    expect(result.map(({ dimensionId, targetPercentage, gap, priority }) => [dimensionId, targetPercentage, gap, priority])).toEqual([
      ['readiness', 92, 28, 'high'], ['requirements', 92, 28, 'high'], ['leadership', 100, 28, 'high'],
      ['communication', 70, 0, undefined], ['training', 100, 0, undefined], ['resilience', undefined, undefined, undefined],
    ]);
    expect(calculateDimensionGaps([...scores].reverse(), targets)).toEqual(result);
    expect(scores.map(({ dimensionId }) => dimensionId)).toEqual(['leadership', 'resilience', 'training', 'readiness', 'requirements', 'communication']);
    expect(calculateDimensionGaps(scores)).toEqual(calculateDimensionGaps(scores, {}));
  });

  it('discloses draft policy cutoffs of a full and half default maturity band', () => {
    expect(targetGapPriorityPolicy).toEqual({ status: 'draft', highGapMin: 20, mediumGapMin: 10 });
  });

  it.each([
    [80, 20, 'high'], [80.01, 19.99, 'medium'], [90, 10, 'medium'], [90.01, 9.99, 'low'],
    [99.75, 0.25, 'low'], [100, 0, undefined],
  ])('classifies a score of %s against a 100%% target', (actual, gap, priority) => {
    const [result] = calculateDimensionGaps([score(0, actual)], { leadership: 100 });
    expect(result.gap).toBeCloseTo(gap, 9);
    expect(result.priority).toBe(priority);
  });

  it('does not misclassify a full-band gap due to percentage calculation precision', () => {
    const [gap] = calculateDimensionGaps([score(0, (14 / 25) * 100)], { leadership: 76 });
    expect(gap).toMatchObject({ gap: 20, priority: 'high' });
  });
});

describe('generateRecommendations', () => {
  const scores = [
    score(0, 76, 'Managed'), score(1, 64, 'Managed'), score(2, 60, 'Defined'),
    score(3, 52, 'Defined'), score(4, 68, 'Managed'), score(5, 48, 'Defined'),
  ];

  it('orders by priority, then lowest score (worked example: Defined dimensions first)', () => {
    const result = generateRecommendations(scores, defaultMaturityBands);
    expect(result.map((r) => r.priority)).toEqual(['medium', 'medium', 'medium', 'low', 'low', 'low']);
    expect(result.slice(0, 3).map((r) => r.dimensionId)).toEqual(['resilience', 'readiness', 'requirements']);
  });

  it('uses the tier matching the dimension level', () => {
    const resilience = generateRecommendations(scores, defaultMaturityBands).find((r) => r.dimensionId === 'resilience');
    expect(resilience?.id).toBe('resilience-structure');
    expect(resilience?.nextLevel).toBe('Managed');
  });

  it('reports the points needed to exceed the current band', () => {
    const resilience = generateRecommendations(scores, defaultMaturityBands).find((r) => r.dimensionId === 'resilience');
    expect(resilience?.pointsToNextLevel).toBeCloseTo(12, 9);
  });

  it('marks Initial and Developing dimensions high priority with the foundation tier', () => {
    const result = generateRecommendations([score(5, 20, 'Initial'), score(0, 36, 'Developing')], defaultMaturityBands);
    expect(result.map((r) => [r.dimensionId, r.priority, r.id])).toEqual([
      ['resilience', 'high', 'resilience-foundation'],
      ['leadership', 'high', 'leadership-foundation'],
    ]);
  });

  it('gives no recommendations above 80% or below the lower bound', () => {
    expect(generateRecommendations([score(0, 84, 'Optimising')], defaultMaturityBands)).toEqual([]);
    expect(generateRecommendations([score(0, 5, 'Initial')], defaultMaturityBands)).toEqual([]);
  });

  it('includes exactly 80% (Managed): zero points to the boundary still requires an increase', () => {
    const result = generateRecommendations([score(0, 80)], defaultMaturityBands);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ nextLevel: 'Optimising', pointsToNextLevel: 0 });
  });

  it('uses target priorities ahead of baseline priorities, even for a stronger actual score', () => {
    const result = generateRecommendations([score(5, 20), score(0, 76), score(3, 52), score(4, 60), score(1, 36), score(2, 36)], defaultMaturityBands, {
      targets: { leadership: 100, readiness: 68, training: 68, communication: 36 },
    });
    expect(result.map(({ dimensionId, gap, priority, priorityBasis }) => [dimensionId, gap, priority, priorityBasis])).toEqual([
      ['leadership', 24, 'high', 'target-gap'], ['readiness', 16, 'medium', 'target-gap'], ['training', 8, 'low', 'target-gap'],
      ['resilience', undefined, 'high', 'maturity-level'], ['requirements', undefined, 'high', 'maturity-level'],
      ['communication', 0, 'low', 'target-met'],
    ]);
    expect(result[5]).toMatchObject({ targetPercentage: 36, nextLevel: 'Defined', pointsToNextLevel: 4 });
  });

  it('gives guidance within Optimising for a positive gap but no next maturity level', () => {
    const result = generateRecommendations([score(0, 84), score(4, 100)], defaultMaturityBands, { targets: { leadership: 100, training: 100 } });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'leadership-sustain', maturityLevel: 'Optimising', targetPercentage: 100,
      gap: 16, priority: 'medium', nextLevel: undefined, pointsToNextLevel: undefined,
    });
  });

  it('breaks equal gaps by weaker actual then stable ID independently of input order', () => {
    const tied = [score(0, 72), score(2, 64), score(1, 64)];
    const options = { targets: { leadership: 90, requirements: 82, communication: 82 } };
    const result = generateRecommendations(tied, defaultMaturityBands, options);
    expect(result.map(({ dimensionId }) => dimensionId)).toEqual(['communication', 'requirements', 'leadership']);
    expect(generateRecommendations([...tied].reverse(), defaultMaturityBands, options)).toEqual(result);
  });
});

describe('continuity evidence', () => {
  it('distinguishes unavailable, partial and available ratings, without treating unknown or moderate ratings as low', () => {
    expect(assessContinuityEvidence()).toEqual({ availability: 'unavailable', lowRatedCriteria: [] });
    expect(assessContinuityEvidence({ 'resilience-2': 1 })).toEqual({ availability: 'unavailable', lowRatedCriteria: [] });
    expect(assessContinuityEvidence({ 'resilience-1': 2, 'resilience-4': 0 })).toEqual({
      availability: 'partial', lowRatedCriteria: [{ questionId: 'resilience-1', rating: 2 }],
    });
    expect(assessContinuityEvidence({ 'resilience-1': 3, 'resilience-4': 5 })).toEqual({ availability: 'available', lowRatedCriteria: [] });
  });

  it('adds criterion-specific guidance without reading private notes or implying an outage occurred', () => {
    const options = {
      responses: { 'resilience-1': 2, 'resilience-4': 5 },
      get evidence() { throw new Error('Private notes must not be read'); },
    };
    const [result] = generateRecommendations([score(5, 64)], defaultMaturityBands, options);
    expect(result.continuityEvidence).toEqual({ availability: 'available', lowRatedCriteria: [{ questionId: 'resilience-1', rating: 2 }] });
    expect(result.weakness).toContain('continuity plan was rated');
    expect(result.weakness).not.toContain('Backup arrangements');
    expect(result.action).toContain('offline materials');
  });

  it('surfaces low backup ratings even when aggregate resilience is Optimising', () => {
    const [result] = generateRecommendations([score(5, 88)], defaultMaturityBands, {
      responses: { 'resilience-1': 5, 'resilience-4': 2 },
    });
    expect(result).toMatchObject({ priority: 'low', gap: undefined, nextLevel: undefined });
    expect(result.weakness).toContain('Backup arrangements were rated');
    expect(result.weakness).not.toContain('continuity plan was rated');
    expect(result.action).toContain('backup power and connectivity');
    expect(result.action).not.toContain('offline materials');
  });
});

describe('qualifyOverallResult', () => {
  const mixed = {
    overallMaturityLevel: 'Managed' as const,
    dimensionScores: [score(0, 90), score(3, 32), score(1, 75)],
  };

  it('describes a low score, not a critical target gap, with unset or met targets', () => {
    const result = qualifyOverallResult(mixed);
    expect(result).toMatchObject({ severity: 'weak', label: 'Managed overall, with a low score in Organisational and User Readiness', largestTargetGap: undefined });
    expect(qualifyOverallResult(mixed, { readiness: 32 })).toEqual(result);
  });

  it('uses the snapshot to qualify with the largest positive gap, not necessarily the weakest score', () => {
    const result = qualifyOverallResult({ ...mixed, targetSnapshot: { readiness: 36, communication: 100 } });
    expect(result.severity).toBe('critical');
    expect(result.label).toBe('Managed with a critical target gap in Communication and Stakeholder Engagement');
    expect(result.weakestDimension.dimensionId).toBe('readiness');
    expect(result.largestTargetGap).toMatchObject({ dimensionId: 'communication', gap: 25, targetPercentage: 100 });
  });

  it.each([36, 42])('qualifies a readiness shortfall against %s without calling it critical', (target) => {
    const result = qualifyOverallResult(mixed, { readiness: target });
    expect(result).toMatchObject({
      severity: 'weak', label: 'Managed with a target shortfall in Organisational and User Readiness', largestTargetGap: { gap: target - 32 },
    });
  });

  it('reports a weak dimension for the worked example (Managed overall, weakest Defined)', () => {
    const result = qualifyOverallResult({
      overallMaturityLevel: 'Managed',
      dimensionScores: [score(0, 76, 'Managed'), score(1, 64, 'Managed'), score(2, 60, 'Defined'), score(3, 52, 'Defined'), score(4, 68, 'Managed'), score(5, 48, 'Defined')],
    });
    expect(result.severity).toBe('weak');
    expect(result.weakestDimension.dimensionId).toBe('resilience');
    expect(result.strongestDimension.dimensionId).toBe('leadership');
  });

  it('adds no qualifier when no dimension is below the overall level', () => {
    const result = qualifyOverallResult({ overallMaturityLevel: 'Defined', dimensionScores: [score(0, 60, 'Defined'), score(1, 64, 'Managed')] });
    expect(result).toMatchObject({ severity: 'none', label: 'Defined' });
  });
});
