import { describe, expect, it } from 'vitest';
import {
  assessmentDraftSchema,
  assessmentRecordSchema,
  assessmentTemplate,
  evidenceMaxLength,
  calculateAssessmentScores,
  calculateDimensionScore,
  classifyMaturity,
  createAssessmentRecord,
  questionCount,
  adminRegistrationSchema,
  defaultMaturityBands,
  validateDimensionWeights,
  type AssessmentResponses,
} from './index';

function completeResponses(value: number): AssessmentResponses {
  return Object.fromEntries(
    assessmentTemplate.dimensions.flatMap((dimension) => dimension.questions.map((question) => [question.id, value])),
  );
}

describe('UCCMM v1 configuration', () => {
  it('contains six dimensions with five core questions and supplied options', () => {
    expect(assessmentTemplate.dimensions).toHaveLength(6);
    expect(questionCount).toBe(30);
    expect(assessmentTemplate.dimensions.every((dimension) => dimension.questions.length === 5)).toBe(true);
    expect(assessmentTemplate.dimensions[5].questions).toHaveLength(5);
    expect(assessmentTemplate.dimensions[0].questions[0].options.map((option) => option.label)).toEqual([
      'Not in place', 'Rarely in place', 'Partially in place', 'Mostly in place', 'Fully and consistently in place',
    ]);
  });
});

describe('UCCMM scoring', () => {
  it('calculates the scoring-specification example without rounding', () => {
    expect(calculateDimensionScore([4, 5, 3, 4, 5])).toBe(84);
  });

  it('calculates minimum and maximum assessments as percentages', () => {
    expect(calculateAssessmentScores(assessmentTemplate, completeResponses(1))).toMatchObject({ overallScore: 20, overallMaturityLevel: 'Initial' });
    expect(calculateAssessmentScores(assessmentTemplate, completeResponses(5))).toMatchObject({ overallScore: 100, overallMaturityLevel: 'Optimising' });
  });

  it('classifies every supplied maturity boundary using the raw score', () => {
    expect(classifyMaturity(20)).toBe('Initial');
    expect(classifyMaturity(20.01)).toBe('Developing');
    expect(classifyMaturity(40)).toBe('Developing');
    expect(classifyMaturity(40.01)).toBe('Defined');
    expect(classifyMaturity(60)).toBe('Defined');
    expect(classifyMaturity(60.01)).toBe('Managed');
    expect(classifyMaturity(80)).toBe('Managed');
    expect(classifyMaturity(80.01)).toBe('Optimising');
  });

  it('rejects overlapping or misordered maturity bands', () => {
    const invalidBands = [
      ...defaultMaturityBands.slice(0, 2),
      { level: 'Defined' as const, upperBound: 35 },
      ...defaultMaturityBands.slice(3),
    ];
    expect(() => classifyMaturity(40, invalidBands)).toThrow('Maturity bands must be ordered');
  });

  it('rejects invalid weights and incomplete responses', () => {
    const invalidDimensions = structuredClone(assessmentTemplate.dimensions);
    invalidDimensions[0].weight = 0.2;
    expect(() => validateDimensionWeights(invalidDimensions)).toThrow('Dimension weights must total 1.0.');
    expect(() => calculateAssessmentScores(assessmentTemplate, {})).toThrow('Cannot calculate an incomplete assessment.');
  });
});

describe('account setup contracts', () => {
  const registration = {
    organisation: {
      name: 'Lagos Logistics Ltd', sector: 'Logistics', employeeCount: 250,
      erpPlatform: 'SAP', implementationStage: 'planning' as const,
    },
    fullName: 'Adenike Admin', email: 'admin@example.com',
    password: 'secure-password-2026', passwordConfirmation: 'secure-password-2026',
  };

  it('accepts complete Admin setup and matching passwords', () => {
    expect(adminRegistrationSchema.safeParse(registration).success).toBe(true);
  });

  it('rejects mismatched passwords and invalid employee counts', () => {
    expect(adminRegistrationSchema.safeParse({ ...registration, passwordConfirmation: 'different-password' }).success).toBe(false);
    expect(adminRegistrationSchema.safeParse({ ...registration, organisation: { ...registration.organisation, employeeCount: 0 } }).success).toBe(false);
  });
});

describe('assessment evidence', () => {
  const now = '2026-09-14T12:00:00.000Z';
  const recordInput = {
    id: 'assessment-1', organisationId: 'organisation-1', respondentType: 'stakeholder' as const,
    submittedAt: now, template: assessmentTemplate, responses: completeResponses(4),
  };
  const draft = {
    ...recordInput, respondentKey: 'respondent-1', assessmentVersion: assessmentTemplate.version,
    activeQuestionId: 'leadership-1', status: 'in_progress', createdAt: now, updatedAt: now,
  };

  it('defaults to an empty map for existing drafts and submitted records', () => {
    const { evidence, ...legacyRecord } = createAssessmentRecord(recordInput);
    expect(evidence).toEqual({});
    expect(assessmentDraftSchema.parse(draft).evidence).toEqual({});
    expect(assessmentRecordSchema.parse(legacyRecord).evidence).toEqual({});
  });

  it('preserves optional free text and freezes a copy on submission without affecting scores', () => {
    const evidence = { 'leadership-1': '  Notes\nSecond line  ', 'resilience-5': 'a'.repeat(evidenceMaxLength) };
    expect(assessmentDraftSchema.parse({ ...draft, responses: {}, evidence }).evidence).toEqual(evidence);
    const record = createAssessmentRecord({ ...recordInput, evidence });
    expect(record.evidence).toEqual(evidence);
    expect(Object.isFrozen(record.evidence)).toBe(true);
    evidence['leadership-1'] = 'Edited';
    expect(record.evidence['leadership-1']).toBe('  Notes\nSecond line  ');
    expect(record.overallScore).toBe(80);
  });

  it.each([
    { 'leadership-1': 'x'.repeat(evidenceMaxLength + 1) },
    { 'leadership-1': '😀'.repeat(evidenceMaxLength / 2 + 1) },
    { 'leadership-6': 'Unknown ID' },
    { 'leadership-1': 123 },
  ])('rejects invalid evidence in both drafts and records (%#)', (evidence) => {
    expect(assessmentDraftSchema.safeParse({ ...draft, evidence }).success).toBe(false);
    expect(assessmentRecordSchema.safeParse({ ...createAssessmentRecord(recordInput), evidence }).success).toBe(false);
  });
});

describe('submitted assessment records', () => {
  it('snapshots the original scoring configuration and results', () => {
    const template = structuredClone(assessmentTemplate);
    const record = createAssessmentRecord({
      id: 'assessment-1', organisationId: 'organisation-1', respondentType: 'admin',
      submittedAt: '2026-09-14T12:00:00.000Z', template, responses: completeResponses(4),
    });
    template.dimensions[0].questions[0].prompt = 'A changed question';
    template.dimensions[0].weight = 0.5;
    expect(record.templateSnapshot.dimensions[0].questions[0].prompt).not.toBe('A changed question');
    expect(record.overallScore).toBe(80);
    expect(record.overallMaturityLevel).toBe('Managed');
  });
});
