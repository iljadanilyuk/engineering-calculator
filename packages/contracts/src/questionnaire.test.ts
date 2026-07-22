import { describe, expect, test } from 'bun:test'

import {
  QUESTIONNAIRE_VERSION,
  calculateQuestionnaireProgress,
  getQuestionnaireActiveOptions,
  getQuestionnaireActiveQuestions,
  getQuestionnairePublicDefinition,
  getQuestionnaireQuestionAnswerType,
  markQuestionnaireAnswersActivity,
  questionnaireAnswersPatchRequestSchema,
  questionnaireDefinitionPatchRequestSchema,
  questionnaireDefinitionRecordSchema,
  questionnaireStartRequestSchema,
  technicalQuestionnaireDefinition,
  technicalQuestionnaireQuestionIds,
  technicalQuestionnaireQuestions,
  type QuestionnaireDefinition,
  type QuestionnaireStoredAnswer,
} from './questionnaire'

describe('technical questionnaire contracts', () => {
  const questionById = new Map(technicalQuestionnaireQuestions.map((question) => [question.id, question]))
  const optionLabelsFor = (questionId: string) => {
    const question = questionById.get(questionId)
    if (!question || !('options' in question)) return []

    return (question.options ?? []).map((option) => option.label)
  }
  const activeStateFor = (answers: readonly QuestionnaireStoredAnswer[], questionId: string) =>
    answers.find((answer) => answer.questionId === questionId)?.isActive

  test('publishes a sanitized question structure without filled XLSX answers', () => {
    const serialized = JSON.stringify(technicalQuestionnaireDefinition)

    expect(technicalQuestionnaireDefinition.version).toBe(QUESTIONNAIRE_VERSION)
    expect(technicalQuestionnaireDefinition.sections.length).toBeGreaterThanOrEqual(12)
    expect(technicalQuestionnaireQuestionIds.length).toBeGreaterThan(100)
    expect(new Set(technicalQuestionnaireQuestionIds).size).toBe(technicalQuestionnaireQuestionIds.length)
    expect(serialized).toContain('Filled/sample answers from the XLSX are excluded')
    expect(serialized).not.toContain('iljadanilyuk@gmail.com')

    for (const section of technicalQuestionnaireDefinition.sections) {
      for (const question of section.questions) {
        const options = 'options' in question ? question.options : undefined
        expect(question.id).toBeTruthy()
        expect(question.prompt).toBeTruthy()
        expect(question.sourceRow).toBeGreaterThan(0)
        for (const option of options ?? []) {
          expect(option.id).toBeTruthy()
          expect(option.label).toBeTruthy()
        }
      }
    }
  })

  test('validates published definition records and allows safe text, ordering, and enablement edits', () => {
    const record = questionnaireDefinitionRecordSchema.parse({
      ...technicalQuestionnaireDefinition,
      status: 'static_fallback',
      definitionHash: 'a'.repeat(64),
      publishedAt: null,
      updatedAt: '2026-07-21T00:00:00.000Z',
    })
    const edit = questionnaireDefinitionPatchRequestSchema.parse({
      baseDefinitionHash: record.definitionHash,
      edits: [
        {
          target: 'section',
          sectionId: record.sections[0].id,
          title: 'Обновленное название раздела',
          isEnabled: true,
        },
        {
          target: 'question',
          questionId: 'client_email',
          prompt: 'Электронная почта для связи',
          isEnabled: true,
          answerType: 'text',
          showIf: null,
        },
        {
          target: 'option',
          questionId: 'OBJ_DOCS',
          optionId: 'PARTIAL',
          label: 'Есть часть материалов',
          hint: null,
          isEnabled: false,
          showIf: { questionId: 'OBJ_STAGE', exists: true },
        },
        {
          target: 'section_order',
          sectionIds: record.sections.map((section) => section.id),
        },
        {
          target: 'question_order',
          sectionId: record.sections[0].id,
          questionIds: record.sections[0].questions.map((question) => question.id),
        },
        {
          target: 'question_create',
          sectionId: record.sections[0].id,
          prompt: 'Новый уточняющий вопрос',
          answerType: 'number',
        },
        {
          target: 'question_delete',
          questionId: 'client_email',
        },
        {
          target: 'option_order',
          questionId: 'OBJ_DOCS',
          optionIds: questionById.get('OBJ_DOCS')?.options?.map((option) => option.id) ?? [],
        },
        {
          target: 'option_create',
          questionId: 'client_email',
          label: 'Почта будет позже',
          hint: null,
        },
        {
          target: 'option_delete',
          questionId: 'client_email',
          optionId: 'OPTION_1',
        },
      ],
    })

    expect(record.status).toBe('static_fallback')
    expect(edit.edits).toHaveLength(10)
    expect(getQuestionnaireQuestionAnswerType(questionById.get('OBJ_DOCS')!)).toBe('single_option')
    expect(getQuestionnaireQuestionAnswerType(questionById.get('client_email')!)).toBe('text')
    expect(getQuestionnaireQuestionAnswerType(questionById.get('total_area')!)).toBe('number')
    expect(
      questionnaireDefinitionPatchRequestSchema.parse({
        baseDefinitionHash: record.definitionHash,
        edits: [
          {
            target: 'question',
            questionId: 'OBJ_DOCS',
            prompt: 'Text',
            showIf: { never: true },
          },
        ],
      }).edits[0],
    ).toMatchObject({ target: 'question', showIf: { never: true } })
    expect(() =>
      questionnaireDefinitionPatchRequestSchema.parse({
        baseDefinitionHash: record.definitionHash,
        edits: [
          {
            target: 'option',
            questionId: 'OBJ_DOCS',
            optionId: 'PARTIAL',
            id: 'NEW_ID',
            label: 'New label',
          },
        ],
      }),
    ).toThrow()
  })

  test('removes disabled sections, questions, and options from active public flow', () => {
    const sectionDisabled: QuestionnaireDefinition = {
      ...technicalQuestionnaireDefinition,
      sections: technicalQuestionnaireDefinition.sections.map((section) =>
        section.id === 'object_source' ? { ...section, isEnabled: false } : section,
      ),
    }
    const questionDisabled: QuestionnaireDefinition = {
      ...technicalQuestionnaireDefinition,
      sections: technicalQuestionnaireDefinition.sections.map((section) => ({
        ...section,
        questions: section.questions.map((question) =>
          question.id === 'OBJ_DOCS' ? { ...question, isEnabled: false } : question,
        ),
      })),
    }
    const optionDisabled: QuestionnaireDefinition = {
      ...technicalQuestionnaireDefinition,
      sections: technicalQuestionnaireDefinition.sections.map((section) => ({
        ...section,
        questions: section.questions.map((question) =>
          question.id === 'OBJ_DOCS'
            ? {
                ...question,
                options: question.options?.map((option) =>
                  option.id === 'PARTIAL' ? { ...option, isEnabled: false } : option,
                ),
              }
            : question,
        ),
      })),
    }
    const legacySection: QuestionnaireDefinition = {
      ...technicalQuestionnaireDefinition,
      sections: technicalQuestionnaireDefinition.sections.map((section, index) =>
        index === 0 ? { ...section, isLegacy: true } : section,
      ),
    }

    expect(getQuestionnaireActiveQuestions([], sectionDisabled).map((question) => question.id)).not.toContain('OBJ_DOCS')
    expect(getQuestionnaireActiveQuestions([], questionDisabled).map((question) => question.id)).not.toContain('OBJ_DOCS')
    expect(getQuestionnaireActiveOptions(questionById.get('OBJ_DOCS')!, [], optionDisabled).map((option) => option.id)).not.toContain('PARTIAL')
    expect(getQuestionnairePublicDefinition(legacySection).sections.map((section) => section.id)).not.toContain(
      technicalQuestionnaireDefinition.sections[0].id,
    )

    const disabledOptionAnswer = [
      {
        questionId: 'OBJ_DOCS',
        kind: 'option' as const,
        optionId: 'PARTIAL',
        updatedAt: '2026-07-21T08:00:00.000Z',
        isActive: true,
      },
    ]
    const activeQuestionIds = getQuestionnaireActiveQuestions(disabledOptionAnswer, optionDisabled)
      .map((question) => question.id)
    const markedAnswers = markQuestionnaireAnswersActivity(disabledOptionAnswer, optionDisabled)
    const progress = calculateQuestionnaireProgress(markedAnswers, '2026-07-21T08:00:00.000Z', optionDisabled)
    const publicDefinition = getQuestionnairePublicDefinition(optionDisabled)
    const publicObjectDocs = publicDefinition.sections
      .flatMap((section) => section.questions)
      .find((question) => question.id === 'OBJ_DOCS')

    expect(activeQuestionIds).not.toContain('OBJ_WALL_MATERIAL')
    expect(markedAnswers.find((answer) => answer.questionId === 'OBJ_DOCS')?.isActive).toBe(false)
    expect(progress.answeredCount).toBe(0)
    expect(publicObjectDocs?.options?.map((option) => option.id)).not.toContain('PARTIAL')
  })

  test('publishes the updated heating envelope branches while keeping legacy ids hidden', () => {
    expect(questionById.get('OBJ_DOCS')?.prompt).toContain('материалы по дому')
    expect(questionById.get('OBJ_WALL_MATERIAL')?.prompt).toContain('наружные стены')
    expect(questionById.get('OBJ_FLOOR_BELOW')?.prompt).toContain('под полом первого')
    expect(questionById.get('OBJ_ROOF_TYPE')?.prompt).toContain('над верхним')
    expect(questionById.get('wall_materials')?.isLegacy).toBe(true)
    expect(questionById.get('roof_materials')?.isLegacy).toBe(true)
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
          questionId: 'OBJ_DOCS',
          kind: 'option',
          optionId: 'PARTIAL',
        },
        {
          questionId: 'OBJ_WALL_MATERIAL',
          kind: 'option',
          optionId: 'AERATED_CONCRETE',
        },
        {
          questionId: 'OBJ_ROOF_TYPE',
          kind: 'skipped',
        },
      ],
    })

    expect(result.clientName).toBe('Анна')
    expect(result.initialAnswers).toHaveLength(3)
  })

  test('activates wall, floor, and roof branches independently from document answers', () => {
    const noAnswers = getQuestionnaireActiveQuestions([])
    expect(noAnswers.map((question) => question.id)).toContain('OBJ_DOCS')
    expect(noAnswers.map((question) => question.id)).not.toContain('OBJ_WALL_MATERIAL')

    const docsPartial = [{ questionId: 'OBJ_DOCS', kind: 'option' as const, optionId: 'PARTIAL' }]
    const envelopeQuestionIds = getQuestionnaireActiveQuestions(docsPartial).map((question) => question.id)
    expect(envelopeQuestionIds).toEqual(expect.arrayContaining([
      'OBJ_WALL_MATERIAL',
      'OBJ_FLOOR_BELOW',
      'OBJ_ROOF_TYPE',
    ]))
    expect(envelopeQuestionIds).not.toContain('OBJ_WALL_THICKNESS')

    const wallKnown = [
      ...docsPartial,
      { questionId: 'OBJ_WALL_MATERIAL', kind: 'option' as const, optionId: 'BRICK' },
    ]
    const wallQuestionIds = getQuestionnaireActiveQuestions(wallKnown).map((question) => question.id)
    const thicknessOptions = getQuestionnaireActiveOptions(
      questionById.get('OBJ_WALL_THICKNESS')!,
      wallKnown,
    ).map((option) => option.id)

    expect(wallQuestionIds).toEqual(expect.arrayContaining([
      'OBJ_WALL_THICKNESS',
      'OBJ_WALL_INSULATION',
    ]))
    expect(thicknessOptions).toEqual(expect.arrayContaining(['MM_250', 'MM_380', 'MM_510', 'MM_640']))
    expect(thicknessOptions).not.toContain('MM_375')
  })

  test('marks hidden branch answers inactive and restores them when branch returns', () => {
    const updatedAt = '2026-07-21T08:00:00.000Z'
    const hidden = markQuestionnaireAnswersActivity([
      { questionId: 'OBJ_DOCS', kind: 'option', optionId: 'PARTIAL', updatedAt, isActive: true },
      { questionId: 'OBJ_WALL_MATERIAL', kind: 'option', optionId: 'UNKNOWN', updatedAt, isActive: true },
      { questionId: 'OBJ_WALL_THICKNESS', kind: 'option', optionId: 'MM_380', updatedAt, isActive: true },
      { questionId: 'OBJ_WALL_INSULATION', kind: 'option', optionId: 'YES', updatedAt, isActive: true },
      { questionId: 'OBJ_WALL_INSULATION_MATERIAL', kind: 'option', optionId: 'STONE_WOOL', updatedAt, isActive: true },
    ])
    const restored = markQuestionnaireAnswersActivity([
      { questionId: 'OBJ_DOCS', kind: 'option', optionId: 'PARTIAL', updatedAt, isActive: true },
      { questionId: 'OBJ_WALL_MATERIAL', kind: 'option', optionId: 'BRICK', updatedAt, isActive: true },
      { questionId: 'OBJ_WALL_THICKNESS', kind: 'option', optionId: 'MM_380', updatedAt, isActive: false },
      { questionId: 'OBJ_WALL_INSULATION', kind: 'option', optionId: 'YES', updatedAt, isActive: false },
      { questionId: 'OBJ_WALL_INSULATION_MATERIAL', kind: 'option', optionId: 'STONE_WOOL', updatedAt, isActive: false },
    ])

    expect(activeStateFor(hidden, 'OBJ_WALL_THICKNESS')).toBe(false)
    expect(activeStateFor(hidden, 'OBJ_WALL_INSULATION')).toBe(false)
    expect(activeStateFor(hidden, 'OBJ_WALL_INSULATION_MATERIAL')).toBe(false)
    expect(getQuestionnaireActiveQuestions(hidden).map((question) => question.id)).not.toContain(
      'OBJ_WALL_INSULATION_MATERIAL',
    )
    expect(restored.find((answer) => answer.questionId === 'OBJ_WALL_THICKNESS')?.isActive).toBe(true)
    expect(restored.find((answer) => answer.questionId === 'OBJ_WALL_INSULATION')?.isActive).toBe(true)
    expect(restored.find((answer) => answer.questionId === 'OBJ_WALL_INSULATION_MATERIAL')?.isActive).toBe(true)

    const docsFull = markQuestionnaireAnswersActivity([
      { questionId: 'OBJ_DOCS', kind: 'option', optionId: 'FULL', updatedAt, isActive: true },
      { questionId: 'OBJ_ROOF_TYPE', kind: 'option', optionId: 'COLD_ATTIC', updatedAt, isActive: true },
      { questionId: 'OBJ_ROOF_INSULATION_LOCATION', kind: 'option', optionId: 'CEILING', updatedAt, isActive: true },
    ])
    expect(activeStateFor(docsFull, 'OBJ_ROOF_TYPE')).toBe(false)
    expect(activeStateFor(docsFull, 'OBJ_ROOF_INSULATION_LOCATION')).toBe(false)
    expect(getQuestionnaireActiveQuestions(docsFull).map((question) => question.id)).not.toContain(
      'OBJ_ROOF_INSULATION_LOCATION',
    )
  })

  test('calculates progress from active questions only and counts skipped as clarification', () => {
    const updatedAt = '2026-07-21T08:00:00.000Z'
    const answers = markQuestionnaireAnswersActivity([
      { questionId: 'OBJ_DOCS', kind: 'option', optionId: 'PARTIAL', updatedAt, isActive: true },
      { questionId: 'OBJ_WALL_MATERIAL', kind: 'option', optionId: 'UNKNOWN', updatedAt, isActive: true },
      { questionId: 'OBJ_WALL_THICKNESS', kind: 'option', optionId: 'MM_380', updatedAt, isActive: true },
      { questionId: 'OBJ_WALL_INSULATION', kind: 'option', optionId: 'YES', updatedAt, isActive: true },
      { questionId: 'OBJ_WALL_INSULATION_MATERIAL', kind: 'option', optionId: 'STONE_WOOL', updatedAt, isActive: true },
      { questionId: 'OBJ_ROOF_TYPE', kind: 'skipped', updatedAt, isActive: true },
    ])
    const progress = calculateQuestionnaireProgress(answers, updatedAt)

    expect(progress.answeredCount).toBe(3)
    expect(progress.skippedCount).toBe(1)
    expect(progress.unknownCount).toBe(1)
    expect(progress.totalQuestions).toBe(getQuestionnaireActiveQuestions(answers).length)
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
