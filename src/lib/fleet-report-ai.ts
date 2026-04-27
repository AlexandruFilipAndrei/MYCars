import type { FleetReportAiSummary, FleetReportSnapshot } from '@/types/models'
import { supabase } from '@/lib/supabase'

type AiGenerationSuccess = {
  status: 'success'
  provider: string
  model: string
  summary: FleetReportAiSummary
}

type AiGenerationUnavailable = {
  status: 'unavailable'
  message: string
}

export type AiGenerationResult = AiGenerationSuccess | AiGenerationUnavailable

type FleetReportAiResponse = {
  provider?: string
  model?: string
  data?: FleetReportAiSummary
}

async function readErrorMessage(response: Response) {
  const rawText = await response.text()

  try {
    const parsed = JSON.parse(rawText) as { message?: string }
    return parsed.message?.trim() || rawText || 'Serviciul AI nu a raspuns corect.'
  } catch {
    return rawText || 'Serviciul AI nu a raspuns corect.'
  }
}

export async function generateFleetReportAiSummary(report: FleetReportSnapshot): Promise<AiGenerationResult> {
  try {
    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token

    if (!accessToken) {
      throw new Error('Nu exista o sesiune valida pentru generarea AI.')
    }

    const response = await fetch('/api/generate-fleet-report', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ report }),
    })

    if (!response.ok) {
      throw new Error(await readErrorMessage(response))
    }

    const payload = (await response.json()) as FleetReportAiResponse

    if (!payload.data) {
      throw new Error('Raspunsul AI nu a avut structura asteptata.')
    }

    return {
      status: 'success',
      provider: payload.provider ?? 'gemini',
      model: payload.model ?? 'gemini-2.5-flash',
      summary: payload.data,
    }
  } catch (error) {
    return {
      status: 'unavailable',
      message: error instanceof Error ? error.message : 'Rezumatul AI nu a putut fi generat acum.',
    }
  }
}
