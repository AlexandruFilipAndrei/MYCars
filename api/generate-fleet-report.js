const MODEL = 'gemini-2.5-flash'
const MAX_REPORT_CARS = 120

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
      items: { type: 'string' },
    },
    risks: {
      type: 'array',
      description: '2-4 riscuri sau probleme care cer atentie.',
      items: { type: 'string' },
    },
    recommendations: {
      type: 'array',
      description: '2-4 recomandari practice, in limba romana.',
      items: { type: 'string' },
    },
    carCommentaries: {
      type: 'array',
      description: 'Comentarii scurte pentru masinile cele mai importante din raport.',
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
        additionalProperties: false,
      },
    },
    generatedAt: {
      type: 'string',
      description: 'Data ISO la care a fost generat rezumatul.',
    },
  },
  required: ['executiveSummary', 'highlights', 'risks', 'recommendations', 'carCommentaries', 'generatedAt'],
  additionalProperties: false,
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
      report.cars.length <= MAX_REPORT_CARS,
  )
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

  return {
    executiveSummary,
    highlights: normalizeStringList(value.highlights, 4),
    risks: normalizeStringList(value.risks, 4),
    recommendations: normalizeStringList(value.recommendations, 4),
    carCommentaries,
    generatedAt: compactText(value.generatedAt, 40) || new Date().toISOString(),
  }
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

    const prompt = [
      'Esti un analist de flota auto.',
      'Raspunde exclusiv in limba romana.',
      'Nu inventa cifre sau fapte care nu exista in input.',
      'Explica pe scurt ce masini produc bine, ce masini sunt sub asteptari si ce actiuni merita facute pentru a creste profitabilitatea flotei.',
      'Daca o masina are scor mic, leaga explicatia in primul rand de veniturile actuale, costurile actuale si profitul actual.',
      'Nu insista pe documente sau notificari; raportul trebuie sa ramana concentrat pe performanta economica.',
      'Raportul este estimativ si trebuie sa ramana prudent, clar si util pentru un manager de flota.',
      '',
      'Snapshot raport:',
      JSON.stringify(compactReport(report)),
    ].join('\n')

    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        system_instruction: {
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
          responseJsonSchema: responseSchema,
          temperature: 0.25,
          maxOutputTokens: 1800,
        },
      }),
    })

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text()
      return res.status(502).json({ message: errorText || 'Gemini request failed.' })
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
        data: normalizeAiSummary(JSON.parse(responseText)),
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
