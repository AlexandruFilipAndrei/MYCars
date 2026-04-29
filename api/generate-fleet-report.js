const MODEL = 'gemini-2.5-flash'
const MAX_REPORT_CARS = 120
const MAX_REPORT_OWNERS = 50
const GEMINI_MAX_ATTEMPTS = 3
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const responseSchema = {
  type: 'object',
  properties: {
    executiveSummary: {
      type: 'string',
      description: 'Un rezumat executiv in limba romana, bazat strict pe datele primite.',
    },
    highlights: {
      type: 'array',
      description: '2-4 observatii pozitive despre performanta flotei.',
      minItems: 2,
      maxItems: 4,
      items: { type: 'string' },
    },
    risks: {
      type: 'array',
      description: '2-4 riscuri sau probleme care cer atentie.',
      minItems: 2,
      maxItems: 4,
      items: { type: 'string' },
    },
    recommendations: {
      type: 'array',
      description: '2-4 recomandari practice, in limba romana.',
      minItems: 2,
      maxItems: 4,
      items: { type: 'string' },
    },
    carCommentaries: {
      type: 'array',
      description: 'Comentarii scurte pentru masinile cele mai importante din raport.',
      minItems: 1,
      maxItems: 8,
      items: {
        type: 'object',
        properties: {
          carId: { type: 'string' },
          label: { type: 'string' },
          summary: { type: 'string' },
          action: {
            type: 'string',
            enum: ['keep', 'monitor', 'replace_candidate'],
          },
        },
        required: ['carId', 'label', 'summary', 'action'],
      },
    },
    generatedAt: {
      type: 'string',
      description: 'Data ISO la care a fost generat rezumatul.',
    },
  },
  required: ['executiveSummary', 'highlights', 'risks', 'recommendations', 'carCommentaries', 'generatedAt'],
}

function readRequestBody(req) {
  if (!req.body) {
    return null
  }

  if (typeof req.body === 'string') {
    return JSON.parse(req.body)
  }

  return req.body
}

function getResponseText(payload) {
  return payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part?.text)
    .filter(Boolean)
    .join('')
}

function getBearerToken(req) {
  const header = req.headers?.authorization ?? req.headers?.Authorization

  if (Array.isArray(header)) {
    return getBearerToken({ headers: { authorization: header[0] } })
  }

  if (typeof header !== 'string') {
    return null
  }

  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function isTransientGeminiStatus(status) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}

function getProviderErrorMessage(rawText) {
  try {
    const parsed = JSON.parse(rawText)
    return parsed?.error?.message || parsed?.message || rawText
  } catch {
    return rawText
  }
}

function getFriendlyGeminiErrorMessage(status, rawText) {
  const providerMessage = compactText(getProviderErrorMessage(rawText), 700)
  const normalizedMessage = providerMessage.toLowerCase()

  if (status === 503 || normalizedMessage.includes('high demand') || normalizedMessage.includes('unavailable')) {
    return 'Gemini este aglomerat temporar. Raportul a fost salvat cu analiza locala; incearca din nou mai tarziu pentru concluzii AI externe.'
  }

  if (status === 429) {
    return 'Limita Gemini a fost atinsa temporar. Raportul a fost salvat cu analiza locala; incearca din nou mai tarziu.'
  }

  return providerMessage || 'Gemini request failed.'
}

async function generateGeminiContent(apiKey, requestBody) {
  let lastResponse = null

  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(requestBody),
    })

    if (response.ok || !isTransientGeminiStatus(response.status) || attempt === GEMINI_MAX_ATTEMPTS) {
      return response
    }

    lastResponse = response
    await sleep(700 * attempt)
  }

  return lastResponse
}

async function verifySupabaseUser(req) {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
  const token = getBearerToken(req)

  if (!token) {
    return { ok: false, status: 401, message: 'Missing authorization token.' }
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, status: 503, message: 'Supabase auth is not configured for AI reports.' }
  }

  const authResponse = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${token}`,
    },
  })

  if (!authResponse.ok) {
    return { ok: false, status: 401, message: 'Invalid authorization token.' }
  }

  const user = await authResponse.json()

  if (!user?.id) {
    return { ok: false, status: 401, message: 'Invalid authorization token.' }
  }

  return { ok: true, user }
}

function isValidReportPayload(report) {
  return Boolean(
    report &&
      typeof report === 'object' &&
      typeof report.generatedAt === 'string' &&
      typeof report.periodStart === 'string' &&
      typeof report.periodEnd === 'string' &&
      Array.isArray(report.selectedOwnerIds) &&
      report.totals &&
      typeof report.totals === 'object' &&
      Array.isArray(report.cars) &&
      report.cars.length > 0 &&
      report.cars.length <= MAX_REPORT_CARS &&
      report.selectedOwnerIds.length > 0 &&
      report.selectedOwnerIds.length <= MAX_REPORT_OWNERS &&
      report.selectedOwnerIds.every((ownerId) => typeof ownerId === 'string') &&
      report.cars.every((car) => typeof car?.carId === 'string' && typeof car?.ownerId === 'string'),
  )
}

function getUniqueStrings(values) {
  return Array.from(new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim())))
}

async function verifyReportFleetAccess(req, report) {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
  const token = getBearerToken(req)
  const selectedOwnerIds = getUniqueStrings(report.selectedOwnerIds)
  const reportCars = report.cars.map((car) => ({
    carId: car.carId.trim(),
    ownerId: car.ownerId.trim(),
  }))
  const carIds = getUniqueStrings(reportCars.map((car) => car.carId))

  if (!supabaseUrl || !supabaseAnonKey || !token) {
    return { ok: false, status: 503, message: 'Supabase access validation is not configured for AI reports.' }
  }

  if (
    selectedOwnerIds.length !== report.selectedOwnerIds.length ||
    carIds.length !== report.cars.length ||
    !selectedOwnerIds.every((id) => UUID_PATTERN.test(id)) ||
    !reportCars.every((car) => UUID_PATTERN.test(car.carId) && UUID_PATTERN.test(car.ownerId))
  ) {
    return { ok: false, status: 400, message: 'Invalid report fleet identifiers.' }
  }

  const selectedOwnerSet = new Set(selectedOwnerIds)
  const requestedCarOwnerById = new Map(reportCars.map((car) => [car.carId, car.ownerId]))

  if (!reportCars.every((car) => selectedOwnerSet.has(car.ownerId))) {
    return { ok: false, status: 403, message: 'Report contains cars outside the selected fleets.' }
  }

  const baseUrl = supabaseUrl.replace(/\/$/, '')
  const profilesResponse = await fetch(
    `${baseUrl}/rest/v1/profiles?select=id&id=in.(${selectedOwnerIds.join(',')})`,
    {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
    },
  )

  if (!profilesResponse.ok) {
    return { ok: false, status: 502, message: 'Could not validate report fleet access.' }
  }

  const accessibleProfiles = await profilesResponse.json()

  if (!Array.isArray(accessibleProfiles) || accessibleProfiles.length !== selectedOwnerIds.length) {
    return { ok: false, status: 403, message: 'Report contains fleets that are not accessible to the current user.' }
  }

  const carsResponse = await fetch(
    `${baseUrl}/rest/v1/cars?select=id,owner_id&id=in.(${carIds.join(',')})`,
    {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
    },
  )

  if (!carsResponse.ok) {
    return { ok: false, status: 502, message: 'Could not validate report fleet access.' }
  }

  const accessibleCars = await carsResponse.json()

  if (!Array.isArray(accessibleCars) || accessibleCars.length !== carIds.length) {
    return { ok: false, status: 403, message: 'Report contains cars that are not accessible to the current user.' }
  }

  const hasOwnerMismatch = accessibleCars.some((car) => requestedCarOwnerById.get(car.id) !== car.owner_id)

  if (hasOwnerMismatch) {
    return { ok: false, status: 403, message: 'Report contains invalid fleet ownership data.' }
  }

  return { ok: true }
}

function finiteNumber(value) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : 0
}

function compactText(value, maxLength = 220) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function compactReport(report) {
  return {
    generatedAt: compactText(report.generatedAt, 40),
    periodKind: compactText(report.periodKind, 16),
    periodStart: compactText(report.periodStart, 16),
    periodEnd: compactText(report.periodEnd, 16),
    selectedFleetCount: Array.isArray(report.selectedOwnerIds) ? report.selectedOwnerIds.length : 0,
    scoringVersion: compactText(report.scoringVersion, 60),
    overallScore: finiteNumber(report.overallScore),
    totals: {
      carCount: finiteNumber(report.totals?.carCount),
      totalRevenue: finiteNumber(report.totals?.totalRevenue),
      totalCost: finiteNumber(report.totals?.totalCost),
      totalProfit: finiteNumber(report.totals?.totalProfit),
      utilization: finiteNumber(report.totals?.utilization),
      availability: finiteNumber(report.totals?.availability),
      profitMargin: finiteNumber(report.totals?.profitMargin),
      profitPerAvailableDay: finiteNumber(report.totals?.profitPerAvailableDay),
      totalServiceDays: finiteNumber(report.totals?.totalServiceDays),
      totalIdleDays: finiteNumber(report.totals?.totalIdleDays),
    },
    cars: report.cars.map((car) => ({
      carId: compactText(car.carId, 80),
      label: compactText(car.label, 160),
      status: compactText(car.status, 40),
      score: finiteNumber(car.score),
      verdict: compactText(car.verdict, 40),
      revenue: finiteNumber(car.revenue),
      maintenanceCost: finiteNumber(car.maintenanceCost),
      insuranceAllocated: finiteNumber(car.insuranceAllocated),
      totalCost: finiteNumber(car.totalCost),
      profit: finiteNumber(car.profit),
      utilization: finiteNumber(car.utilization),
      availability: finiteNumber(car.availability),
      serviceDays: finiteNumber(car.serviceDays),
      idleDays: finiteNumber(car.idleDays),
      profitPerAvailableDay: finiteNumber(car.profitPerAvailableDay),
    })),
  }
}

function normalizeStringList(value, maxItems) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((item) => compactText(item, 420)).filter(Boolean).slice(0, maxItems)
}

function normalizeAiSummary(value) {
  if (!value || typeof value !== 'object') {
    throw new Error('Gemini returned invalid JSON structure.')
  }

  const executiveSummary = compactText(value.executiveSummary, 1200)

  if (!executiveSummary) {
    throw new Error('Gemini returned an empty executive summary.')
  }

  const allowedActions = new Set(['keep', 'monitor', 'replace_candidate'])
  const carCommentaries = Array.isArray(value.carCommentaries)
    ? value.carCommentaries
        .map((item) => ({
          carId: compactText(item?.carId, 80),
          label: compactText(item?.label, 160),
          summary: compactText(item?.summary, 600),
          action: allowedActions.has(item?.action) ? item.action : 'monitor',
        }))
        .filter((item) => item.carId && item.label && item.summary)
        .slice(0, 8)
    : []
  const highlights = normalizeStringList(value.highlights, 4)
  const risks = normalizeStringList(value.risks, 4)
  const recommendations = normalizeStringList(value.recommendations, 4)

  if (highlights.length === 0 || risks.length === 0 || recommendations.length === 0 || carCommentaries.length === 0) {
    throw new Error('Gemini returned incomplete structured content.')
  }

  return {
    executiveSummary,
    highlights,
    risks,
    recommendations,
    carCommentaries,
    generatedAt: compactText(value.generatedAt, 40) || new Date().toISOString(),
  }
}

function stripJsonCodeFence(value) {
  const trimmedValue = value.trim()
  const fencedMatch = trimmedValue.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fencedMatch?.[1]?.trim() ?? trimmedValue
}

function extractJsonObject(value) {
  const trimmedValue = stripJsonCodeFence(value)
  const firstBraceIndex = trimmedValue.indexOf('{')

  if (firstBraceIndex === -1) {
    return trimmedValue
  }

  let depth = 0
  let inString = false
  let escaped = false

  for (let index = firstBraceIndex; index < trimmedValue.length; index += 1) {
    const character = trimmedValue[index]

    if (escaped) {
      escaped = false
      continue
    }

    if (character === '\\' && inString) {
      escaped = true
      continue
    }

    if (character === '"') {
      inString = !inString
      continue
    }

    if (inString) {
      continue
    }

    if (character === '{') {
      depth += 1
    }

    if (character === '}') {
      depth -= 1

      if (depth === 0) {
        return trimmedValue.slice(firstBraceIndex, index + 1)
      }
    }
  }

  return trimmedValue
}

function parseAiSummaryText(responseText) {
  const candidates = [
    responseText,
    stripJsonCodeFence(responseText),
    extractJsonObject(responseText),
  ]

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      // Try the next normalized representation.
    }
  }

  throw new Error('Gemini returned invalid JSON.')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ message: 'Method not allowed.' })
  }

  try {
    const auth = await verifySupabaseUser(req)

    if (!auth.ok) {
      return res.status(auth.status).json({ message: auth.message })
    }

    const apiKey = process.env.GEMINI_API_KEY

    if (!apiKey) {
      return res.status(503).json({ message: 'GEMINI_API_KEY is not configured.' })
    }

    const body = readRequestBody(req)
    const report = body?.report

    if (!isValidReportPayload(report)) {
      return res.status(400).json({ message: 'Invalid report payload.' })
    }

    const access = await verifyReportFleetAccess(req, report)

    if (!access.ok) {
      return res.status(access.status).json({ message: access.message })
    }

    const prompt = [
      'Esti un analist de flota auto.',
      'Raspunde exclusiv in limba romana.',
      'Nu inventa cifre sau fapte care nu exista in input.',
      'Explica pe scurt ce masini produc bine, ce masini sunt sub asteptari si ce actiuni merita facute pentru a creste profitabilitatea flotei.',
      'Daca o masina are scor mic, leaga explicatia in primul rand de veniturile actuale, costurile actuale si profitul actual.',
      'Nu insista pe documente sau notificari; raportul trebuie sa ramana concentrat pe performanta economica.',
      'Raportul este estimativ si trebuie sa ramana prudent, clar si util pentru un manager de flota.',
      'Returneaza obligatoriu toate campurile cerute: executiveSummary, 2-4 highlights, 2-4 risks, 2-4 recommendations, cel putin un carCommentary si generatedAt.',
      '',
      'Snapshot raport:',
      JSON.stringify(compactReport(report)),
    ].join('\n')

    const geminiResponse = await generateGeminiContent(apiKey, {
      systemInstruction: {
        parts: [
          {
            text: 'Analizezi rapoarte economice pentru flote auto. Folosesti doar datele primite si ramai concret.',
          },
        ],
      },
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema,
        temperature: 0.25,
        maxOutputTokens: 1800,
      },
    })

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text()
      return res.status(geminiResponse.status).json({
        message: getFriendlyGeminiErrorMessage(geminiResponse.status, errorText),
      })
    }

    const payload = await geminiResponse.json()
    const responseText = getResponseText(payload)

    if (!responseText) {
      return res.status(502).json({
        message: 'Gemini returned no usable content.',
        promptFeedback: payload?.promptFeedback ?? null,
      })
    }

    try {
      return res.status(200).json({
        provider: 'gemini',
        model: MODEL,
        data: normalizeAiSummary(parseAiSummaryText(responseText)),
      })
    } catch {
      return res.status(502).json({ message: 'Gemini returned invalid structured content.' })
    }
  } catch (error) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Unexpected AI generation error.',
    })
  }
}
