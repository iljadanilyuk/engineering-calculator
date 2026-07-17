import { describe, expect, test } from 'bun:test'

import {
  QUESTIONNAIRE_VERSION,
  questionnaireAnswersPatchRequestSchema,
  questionnaireStartRequestSchema,
  technicalQuestionnaireDefinition,
  technicalQuestionnaireQuestionIds,
  technicalQuestionnaireQuestions,
} from './questionnaire'

describe('technical questionnaire contracts', () => {
  const questionById = new Map(technicalQuestionnaireQuestions.map((question) => [question.id, question]))
  const optionLabelsFor = (questionId: string) => {
    const question = questionById.get(questionId)
    if (!question || !('options' in question)) return []

    return (question.options ?? []).map((option) => option.label)
  }

  test('publishes a sanitized question structure without filled XLSX answers', () => {
    const serialized = JSON.stringify(technicalQuestionnaireDefinition)

    expect(technicalQuestionnaireDefinition.version).toBe(QUESTIONNAIRE_VERSION)
    expect(technicalQuestionnaireDefinition.sections.length).toBeGreaterThanOrEqual(9)
    expect(technicalQuestionnaireQuestionIds.length).toBe(91)
    expect(new Set(technicalQuestionnaireQuestionIds).size).toBe(technicalQuestionnaireQuestionIds.length)
    expect(serialized).toContain('Only column A question/section/option text is used')

    for (const section of technicalQuestionnaireDefinition.sections) {
      for (const question of section.questions) {
        const options = 'options' in question ? question.options : undefined
        expect(Object.keys(question).sort()).toEqual(
          options ? ['id', 'options', 'prompt', 'sourceRow'] : ['id', 'prompt', 'sourceRow'],
        )
        for (const option of options ?? []) {
          expect(Object.keys(option).sort()).toEqual(['id', 'label'])
        }
      }
    }
  })

  test('keeps predefined option labels literal to column A source text', () => {
    expect(optionLabelsFor('heating_type')).toEqual([
      'газовый',
      'электрический',
      'тепловой насос',
      'твердотопливный',
      'комбинированный',
    ])
    expect(optionLabelsFor('boiler_room_piping_material')).toEqual([
      'Медь',
      'нержавейка',
      'ПП',
      'металопласт',
    ])
    expect(optionLabelsFor('gas_chimney')).toEqual(['Коаксиал', 'раздельный', 'В канал', 'в стену'])
    expect(optionLabelsFor('conditioning_system_type')).toEqual(['Сплит', 'Мультисистема', 'ВРВ система'])
  })

  test('validates questionnaire start payloads and initial answers', () => {
    const result = questionnaireStartRequestSchema.parse({
      idempotencyKey: 'questionnaire-start-key-001',
      clientName: '  Анна  ',
      clientPhone: '+375 29 111-22-33',
      objectName: 'Дом 180 м2',
      calculation: {
        areaSqm: '180',
        selectedServiceIds: ['heating'],
      },
      consentAccepted: true,
      source: 'public_questionnaire',
      initialAnswers: [
        {
          questionId: 'interior_finished',
          kind: 'option',
          optionId: 'yes',
        },
        {
          questionId: 'wall_materials',
          kind: 'custom',
          customText: 'Газосиликат, утепление уточним',
        },
        {
          questionId: 'roof_materials',
          kind: 'unknown',
        },
      ],
    })

    expect(result.clientName).toBe('Анна')
    expect(result.initialAnswers).toHaveLength(3)
  })

  test('rejects unknown questions, wrong options, duplicate question ids, and empty custom answers', () => {
    expect(() =>
      questionnaireAnswersPatchRequestSchema.parse({
        answers: [
          {
            questionId: 'missing_question',
            kind: 'unknown',
          },
        ],
      }),
    ).toThrow()

    expect(() =>
      questionnaireAnswersPatchRequestSchema.parse({
        answers: [
          {
            questionId: 'interior_finished',
            kind: 'option',
            optionId: 'maybe',
          },
        ],
      }),
    ).toThrow()

    expect(() =>
      questionnaireAnswersPatchRequestSchema.parse({
        answers: [
          {
            questionId: 'wall_materials',
            kind: 'custom',
            customText: ' ',
          },
        ],
      }),
    ).toThrow()

    expect(() =>
      questionnaireAnswersPatchRequestSchema.parse({
        answers: [
          {
            questionId: 'wall_materials',
            kind: 'unknown',
          },
          {
            questionId: 'wall_materials',
            kind: 'skipped',
          },
        ],
      }),
    ).toThrow()
  })
})
