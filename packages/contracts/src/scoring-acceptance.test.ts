import { describe, expect, it } from 'vitest';
import {
  assessmentTemplate,
  calculateAssessmentScores,
  calculateDimensionGaps,
  classifyMaturity,
  createAssessmentRecord,
  generateRecommendations,
  qualifyOverallResult,
  rankDimensions,
  type AssessmentResponses,
} from './index';

const questionIdsByDimension = assessmentTemplate.dimensions.map((dimension) => dimension.questions.map((question) => question.id));

function uniform(value: number): AssessmentResponses {
  return Object.fromEntries(questionIdsByDimension.flat().map((id) => [id, value]));
}

/** Five items per dimension with the given item values, one array per dimension. */
function fromDimensionItems(items: readonly (readonly number[])[]): AssessmentResponses {
  return Object.fromEntries(items.flatMap((values, dimension) => values.map((value, item) => [questionIdsByDimension[dimension][item], value])));
}

// Report 4.2.2 worked example: dimension totals 19, 16, 15, 13, 17, 12.
const workedExample = fromDimensionItems([
  [4, 4, 4, 4, 3],
  [3, 3, 3, 3, 4],
  [3, 3, 3, 3, 3],
  [3, 3, 3, 2, 2],
  [4, 3, 4, 3, 3],
  [3, 3, 2, 2, 2],
]);

describe('Report Table 5.2: basic scoring', () => {
  it('TC-S1 all responses 1: every dimension 20%, overall 20%, Initial', () => {
    const result = calculateAssessmentScores(assessmentTemplate, uniform(1));
    expect(result.dimensionScores.map((d) => d.scorePercentage)).toEqual(Array(6).fill(20));
    expect(result.overallScore).toBe(20);
    expect(result.overallMaturityLevel).toBe('Initial');
  });

  it('TC-S2 all responses 5: every dimension 100%, overall 100%, Optimising', () => {
    const result = calculateAssessmentScores(assessmentTemplate, uniform(5));
    expect(result.dimensionScores.map((d) => d.scorePercentage)).toEqual(Array(6).fill(100));
    expect(result.overallScore).toBe(100);
    expect(result.overallMaturityLevel).toBe('Optimising');
  });

  it('TC-S3 all responses 3: every dimension 60%, overall 60%, Defined', () => {
    const result = calculateAssessmentScores(assessmentTemplate, uniform(3));
    expect(result.dimensionScores.map((d) => d.scorePercentage)).toEqual(Array(6).fill(60));
    expect(result.overallScore).toBe(60);
    expect(result.overallMaturityLevel).toBe('Defined');
  });

  it('TC-S4 worked example: dimensions 76, 64, 60, 52, 68, 48; overall 61.33%; Managed', () => {
    const result = calculateAssessmentScores(assessmentTemplate, workedExample);
    result.dimensionScores.forEach((dimension, index) => expect(dimension.scorePercentage).toBeCloseTo([76, 64, 60, 52, 68, 48][index], 9));
    expect(result.overallScore).toBeCloseTo(61.3333333, 6);
    expect(result.overallMaturityLevel).toBe('Managed');
  });

  it('TC-S5 worked example dimension levels: Managed, Managed, Defined, Defined, Managed, Defined', () => {
    const result = calculateAssessmentScores(assessmentTemplate, workedExample);
    expect(result.dimensionScores.map((d) => d.maturityLevel)).toEqual(['Managed', 'Managed', 'Defined', 'Defined', 'Managed', 'Defined']);
  });

  it('TC-S6 equal weighting: overall equals the mean of the six dimension scores', () => {
    const result = calculateAssessmentScores(assessmentTemplate, workedExample);
    const mean = result.dimensionScores.reduce((sum, d) => sum + d.scorePercentage, 0) / 6;
    expect(result.overallScore).toBeCloseTo(mean, 9);
  });
});

describe('Report Table 5.2: classification boundaries', () => {
  it('TC-B1 20.67% is above 20% and is Developing', () => expect(classifyMaturity(20.67)).toBe('Developing'));
  it('TC-B2 40.00% is Developing', () => expect(classifyMaturity(40)).toBe('Developing'));
  it('TC-B3 40.67% is above 40% and is Defined', () => expect(classifyMaturity(40.67)).toBe('Defined'));
  it('TC-B4 60.67% is above 60% and is Managed', () => expect(classifyMaturity(60.67)).toBe('Managed'));
  it('TC-B5 80.00% is Managed', () => expect(classifyMaturity(80)).toBe('Managed'));
  it('TC-B6 80.67% is above 80% and is Optimising', () => expect(classifyMaturity(80.67)).toBe('Optimising'));
});

describe('Report Table 5.2: ranking', () => {
  it('TC-R1 worked example ranks dimensions 6, 4, 3, 2, 5, 1 from lowest to highest', () => {
    const { dimensionScores } = calculateAssessmentScores(assessmentTemplate, workedExample);
    const order = rankDimensions(dimensionScores).map((d) => assessmentTemplate.dimensions.findIndex((dimension) => dimension.id === d.dimensionId) + 1);
    expect(order).toEqual([6, 4, 3, 2, 5, 1]);
  });

  it('keeps original order for equal scores', () => {
    const order = rankDimensions([{ scorePercentage: 50, id: 'a' }, { scorePercentage: 40, id: 'b' }, { scorePercentage: 50, id: 'c' }]).map((d) => d.id);
    expect(order).toEqual(['b', 'a', 'c']);
  });
});

describe('Report §§3.5.5–3.5.6: scoring to recommendations', () => {
  it('uses the submitted targets and criterion ratings without changing scoring or exposing notes', () => {
    const record = createAssessmentRecord({
      id: 'worked-example', organisationId: 'organisation', respondentType: 'admin',
      submittedAt: '2026-01-01T00:00:00.000Z', template: assessmentTemplate, responses: workedExample,
      targetSnapshot: { leadership: 100, resilience: 68, readiness: 52 },
      evidence: { 'resilience-4': 'Private example: do not include in generated advice.' },
    });
    expect(record.overallScore).toBeCloseTo(61.3333333, 6);
    expect(record.overallMaturityLevel).toBe('Managed');

    const gaps = calculateDimensionGaps(record.dimensionScores, record.targetSnapshot);
    expect(gaps.map(({ dimensionId, gap }) => [dimensionId, gap])).toEqual([
      ['leadership', 24], ['resilience', 20], ['readiness', 0], ['requirements', undefined], ['communication', undefined], ['training', undefined],
    ]);
    const qualification = qualifyOverallResult(record);
    expect(qualification).toMatchObject({ severity: 'critical', largestTargetGap: { dimensionId: 'leadership', gap: 24 } });

    const recommendations = generateRecommendations(record.dimensionScores, record.templateSnapshot.maturityBands, {
      targets: record.targetSnapshot, responses: record.responses,
    });
    expect(recommendations.slice(0, 2).map(({ dimensionId, priority }) => [dimensionId, priority])).toEqual([
      ['leadership', 'high'], ['resilience', 'high'],
    ]);
    expect(recommendations[1].continuityEvidence).toEqual({ availability: 'available', lowRatedCriteria: [{ questionId: 'resilience-4', rating: 2 }] });
    expect(recommendations[1].action).toContain('backup power and connectivity');
    expect(JSON.stringify(recommendations)).not.toContain(record.evidence['resilience-4']);
  });
});

describe('Report Table 5.2: validation', () => {
  it('TC-V1 fewer than 30 responses are rejected', () => {
    const partial = uniform(3);
    delete partial[questionIdsByDimension[0][0]];
    expect(() => calculateAssessmentScores(assessmentTemplate, partial)).toThrow('incomplete');
  });

  it('TC-V2 a response of 0 is rejected', () => {
    expect(() => calculateAssessmentScores(assessmentTemplate, { ...uniform(3), [questionIdsByDimension[0][0]]: 0 })).toThrow();
  });

  it('TC-V3 a response of 6 is rejected', () => {
    expect(() => calculateAssessmentScores(assessmentTemplate, { ...uniform(3), [questionIdsByDimension[0][0]]: 6 })).toThrow();
  });

  it('TC-V4 a non-integer response (3.5) is rejected', () => {
    expect(() => calculateAssessmentScores(assessmentTemplate, { ...uniform(3), [questionIdsByDimension[0][0]]: 3.5 })).toThrow();
  });
});
