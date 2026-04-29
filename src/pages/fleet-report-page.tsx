import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, History, Loader2, Printer, Sparkles, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'

import { EmptyState, PageHeader } from '@/components/shared'
import { useFleetFilter } from '@/components/fleet-filter'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { generateFleetReportAiSummary } from '@/lib/fleet-report-ai'
import {
  buildFallbackFleetReportAiSummary,
  buildFleetReportSnapshot,
  getFleetReportAiActionLabel,
  getFleetReportPeriodLabel,
  getFleetReportVerdictLabel,
} from '@/lib/fleet-report'
import { formatCurrency, formatDate, getStatusBadgeVariant, getStatusLabel } from '@/lib/format'
import { useAppStore } from '@/store/app-store'
import { useAuthStore } from '@/store/auth-store'
import type { FleetReportAiSummary, FleetReportPeriodKind, FleetReportRecord, FleetReportSnapshot } from '@/types/models'

const periodOptions: Array<{ value: FleetReportPeriodKind; label: string }> = [
  { value: '90d', label: '90 zile' },
  { value: '180d', label: '180 zile' },
  { value: '365d', label: '365 zile' },
  { value: 'all', label: 'De la inceput' },
]

function getFleetReportGenerationToastMessage(aiResult: Awaited<ReturnType<typeof generateFleetReportAiSummary>>) {
  if (aiResult.status === 'success') {
    return 'Raportul a fost generat cu succes.'
  }

  const normalizedMessage = aiResult.message.toLowerCase()

  if (normalizedMessage.includes('modul demo')) {
    return 'Raportul demo a fost generat cu analiza locala.'
  }

  if (normalizedMessage.includes('limita interna') || normalizedMessage.includes('limita gemini') || normalizedMessage.includes('limit')) {
    return 'Limita pentru rapoarte AI a fost atinsa. Raportul a fost generat folosind analiza locala.'
  }

  if (normalizedMessage.includes('aglomerat') || normalizedMessage.includes('unavailable') || normalizedMessage.includes('temporar')) {
    return 'Serviciul AI este indisponibil momentan. Raportul a fost generat folosind analiza locala.'
  }

  return 'Raportul a fost generat folosind analiza locala.'
}

export function FleetReportPage() {
  const { cars, rentals, maintenance, fleetReports, saveFleetReport, deleteFleetReport } = useAppStore()
  const { isDemo } = useAuthStore()
  const { matchesOwner, selectedOwnerIds, getFleetOwnerName } = useFleetFilter()
  const [periodKind, setPeriodKind] = useState<FleetReportPeriodKind>('365d')
  const [activeReportId, setActiveReportId] = useState<string | null>(null)
  const [reportPendingDelete, setReportPendingDelete] = useState<FleetReportRecord | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const carsById = useMemo(() => new Map(cars.map((car) => [car.id, car])), [cars])
  const visibleCars = useMemo(() => cars.filter((car) => matchesOwner(car.ownerId)), [cars, matchesOwner])
  const visibleRentals = useMemo(
    () => rentals.filter((item) => matchesOwner(carsById.get(item.carId)?.ownerId ?? '')),
    [carsById, matchesOwner, rentals],
  )
  const visibleMaintenance = useMemo(
    () => maintenance.filter((item) => matchesOwner(carsById.get(item.carId)?.ownerId ?? '')),
    [carsById, maintenance, matchesOwner],
  )
  const normalizedSelectedOwnerIds = useMemo(() => [...selectedOwnerIds].sort((first, second) => first.localeCompare(second)), [selectedOwnerIds])
  const reportHistory = useMemo(
    () =>
      [...fleetReports]
        .filter((report) => haveSameOwnerSelection(report.selectedOwnerIds, normalizedSelectedOwnerIds))
        .sort((first, second) => second.createdAt.localeCompare(first.createdAt)),
    [fleetReports, normalizedSelectedOwnerIds],
  )
  const activeReport = useMemo(
    () => reportHistory.find((report) => report.id === activeReportId) ?? reportHistory[0] ?? null,
    [activeReportId, reportHistory],
  )
  const selectedFleetLabel = useMemo(
    () => selectedOwnerIds.map((ownerId) => getFleetOwnerName(ownerId)).join(', '),
    [getFleetOwnerName, selectedOwnerIds],
  )

  useEffect(() => {
    if (!activeReportId || (activeReportId && !reportHistory.some((report) => report.id === activeReportId))) {
      setActiveReportId(reportHistory[0]?.id ?? null)
    }
  }, [activeReportId, reportHistory])

  const handleGenerateReport = async () => {
    if (visibleCars.length === 0) {
      toast.error('Selecteaza cel putin o masina pentru a genera raportul.')
      return
    }

    setIsGenerating(true)

    try {
      const snapshot = buildFleetReportSnapshot({
        cars: visibleCars,
        rentals: visibleRentals,
        maintenance: visibleMaintenance,
        selectedOwnerIds: normalizedSelectedOwnerIds,
        periodKind,
      })
      const aiResult = isDemo
        ? {
            status: 'unavailable' as const,
            message: 'Modul demo foloseste analiza locala.',
          }
        : await generateFleetReportAiSummary(snapshot)

      const aiSummary = aiResult.status === 'success' ? aiResult.summary : buildFallbackFleetReportAiSummary(snapshot)
      const savedReport = await saveFleetReport({
        periodKind,
        periodStart: snapshot.periodStart,
        periodEnd: snapshot.periodEnd,
        selectedOwnerIds: normalizedSelectedOwnerIds,
        scoringVersion: snapshot.scoringVersion,
        aiProvider: aiResult.status === 'success' ? aiResult.provider : 'local',
        aiModel: aiResult.status === 'success' ? aiResult.model : 'fleet-report-fallback-v1',
        report: {
          ...snapshot,
          aiSummary,
        },
      })

      setActiveReportId(savedReport.id)
      toast.success(getFleetReportGenerationToastMessage(aiResult))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nu am putut genera raportul de flota.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handlePrintPdf = (report: FleetReportRecord) => {
    const printFrame = document.createElement('iframe')
    printFrame.title = 'Raport flota PDF'
    printFrame.style.position = 'fixed'
    printFrame.style.right = '0'
    printFrame.style.bottom = '0'
    printFrame.style.width = '1px'
    printFrame.style.height = '1px'
    printFrame.style.border = '0'
    printFrame.style.opacity = '0'
    printFrame.style.pointerEvents = 'none'

    document.body.appendChild(printFrame)

    const printWindow = printFrame.contentWindow
    const printDocument = printWindow?.document

    if (!printWindow || !printDocument) {
      printFrame.remove()
      toast.error('Nu am putut pregati raportul pentru print.')
      return
    }

    const cleanup = () => {
      window.setTimeout(() => printFrame.remove(), 500)
    }

    printWindow.addEventListener('afterprint', cleanup, { once: true })
    printDocument.open()
    printDocument.write(buildReportPrintHtml(report))
    printDocument.close()
    printWindow.focus()
    window.setTimeout(() => {
      printWindow.print()
      window.setTimeout(() => {
        if (document.body.contains(printFrame)) {
          printFrame.remove()
        }
      }, 60000)
    }, 100)
  }

  const handleDeleteReport = async () => {
    if (!reportPendingDelete) {
      return
    }

    setIsDeleting(true)

    try {
      await deleteFleetReport(reportPendingDelete.id)
      setActiveReportId((currentId) => (currentId === reportPendingDelete.id ? null : currentId))
      setReportPendingDelete(null)
      toast.success('Raportul a fost sters.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nu am putut sterge raportul.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="fleet-report-page space-y-6">
      <PageHeader
        title="Raport flota"
        description="Genereaza un raport economic pentru flotele selectate si pastreaza istoricul rapoartelor salvate."
        action={
          <Button onClick={() => void handleGenerateReport()} disabled={isGenerating || visibleCars.length === 0}>
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isGenerating ? 'Se genereaza...' : isDemo ? 'Genereaza raport' : 'Genereaza raport AI'}
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            {periodOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={periodKind === option.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPeriodKind(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>

          <div className="flex flex-col gap-2 text-sm text-muted-foreground lg:flex-row lg:items-center lg:justify-between">
            <p>
              Flote selectate: <span className="font-medium text-foreground">{selectedFleetLabel || 'Nicio flota selectata'}</span>
            </p>
            <p>{visibleCars.length} masini intra in analiza curenta.</p>
          </div>
        </CardContent>
      </Card>

      {visibleCars.length === 0 ? (
        <EmptyState
          title="Nu exista masini in selectia curenta"
          description="Selecteaza cel putin o flota din filtrul de sus pentru a genera raportul."
        />
      ) : null}

      {!activeReport && visibleCars.length > 0 ? (
        <EmptyState
          title={fleetReports.length > 0 ? 'Nu exista rapoarte pentru selectia curenta' : 'Nu exista rapoarte salvate'}
          description={
            fleetReports.length > 0
              ? 'Schimba filtrul de flote sau genereaza un raport nou pentru selectia afisata acum.'
              : 'Genereaza primul raport pentru a vedea cifrele importante pentru fiecare masina.'
          }
        />
      ) : null}

      {activeReport ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <ReportSummary report={activeReport} onPrint={handlePrintPdf} />
            <AiSummarySection summary={activeReport.report.aiSummary} aiProvider={activeReport.aiProvider} />
            <CarsSection report={activeReport.report} />
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Istoric rapoarte
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {reportHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">Istoricul va aparea aici dupa primul raport generat.</p>
              ) : (
                reportHistory.map((report) => (
                  <div
                    key={report.id}
                    className={`rounded-2xl border p-4 transition-colors ${
                      report.id === activeReport.id ? 'border-primary bg-primary/5' : 'hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button type="button" onClick={() => setActiveReportId(report.id)} className="min-w-0 flex-1 text-left">
                        <p className="font-semibold">{getFleetReportPeriodLabel(report.periodKind)}</p>
                        <p className="text-sm text-muted-foreground">{formatDate(report.createdAt)}</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {report.selectedOwnerIds.length} flote - {report.report.cars.length} masini
                        </p>
                      </button>
                      <div className="flex items-start gap-2">
                        <Badge variant={getVerdictBadgeVariant(report.report.overallScore)}>{report.report.overallScore}/100</Badge>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0"
                          onClick={(event) => {
                            event.stopPropagation()
                            setReportPendingDelete(report)
                          }}
                          aria-label={`Sterge raportul din ${formatDate(report.createdAt)}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Dialog open={Boolean(reportPendingDelete)} onOpenChange={(open) => (!open ? setReportPendingDelete(null) : null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Stergi raportul?</DialogTitle>
            <DialogDescription>Raportul selectat va fi sters definitiv din istoric. Actiunea nu se poate anula.</DialogDescription>
          </DialogHeader>

          {reportPendingDelete ? (
            <div className="rounded-2xl bg-muted p-4 text-sm">
              <p className="font-semibold">{getFleetReportPeriodLabel(reportPendingDelete.periodKind)}</p>
              <p className="mt-1 text-muted-foreground">{formatDate(reportPendingDelete.createdAt)}</p>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setReportPendingDelete(null)} disabled={isDeleting}>
              Renunta
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleDeleteReport()} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Sterge raportul
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ReportSummary({
  report,
  onPrint,
}: {
  report: FleetReportRecord
  onPrint: (report: FleetReportRecord) => void
}) {
  const summaryCards = [
    { label: 'Scor economic', value: `${report.report.overallScore}/100` },
    { label: 'Profit actual', value: formatCurrency(report.report.totals.totalProfit) },
    { label: 'Venituri actuale', value: formatCurrency(report.report.totals.totalRevenue) },
    { label: 'Costuri actuale', value: formatCurrency(report.report.totals.totalCost) },
  ]

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Rezumat raport</CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              Perioada analizata: {formatDate(report.periodStart)} - {formatDate(report.periodEnd)} - {getFleetReportPeriodLabel(report.periodKind)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Scorul economic combina profitul actual cu costurile si scade atunci cand masina pierde timp productiv din cauza service-ului.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onPrint(report)}>
              <Printer className="h-4 w-4" />
              Salveaza PDF
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="min-w-0 p-5">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className="mt-2 break-words font-display text-2xl font-bold leading-tight tabular-nums 2xl:text-3xl">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function getAiSummaryTitle(aiProvider?: string) {
  return aiProvider === 'local' ? 'Analiza locala' : 'Concluzii AI'
}

function AiSummarySection({ summary, aiProvider }: { summary?: FleetReportAiSummary; aiProvider?: string }) {
  const title = getAiSummaryTitle(aiProvider)

  if (!summary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <div className="flex items-start gap-3 rounded-2xl bg-muted p-4 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Rezumatul AI nu a fost generat pentru acest raport. Raportul economic ramane disponibil; genereaza un raport nou pentru concluzii actualizate.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        <p className="text-sm leading-7 text-foreground">{summary.executiveSummary}</p>

        <SummaryList title="Puncte forte" items={summary.highlights} />
        <SummaryList title="Puncte slabe" items={summary.risks} />
        <SummaryList title="Ce merita facut" items={summary.recommendations} />
      </CardContent>
    </Card>
  )
}

function SummaryList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) {
    return null
  }

  return (
    <div>
      <p className="font-semibold">{title}</p>
      <div className="mt-3 space-y-2">
        {items.map((item, index) => (
          <div key={`${title}-${index}`} className="rounded-2xl bg-muted p-3 text-sm">
            {item}
          </div>
        ))}
      </div>
    </div>
  )
}

function CarsSection({ report }: { report: FleetReportSnapshot }) {
  const commentaryByCarId = useMemo(
    () => new Map((report.aiSummary?.carCommentaries ?? []).map((item) => [item.carId, item])),
    [report.aiSummary?.carCommentaries],
  )

  return (
    <div className="space-y-4">
      {report.cars.map((car) => {
        const commentary = commentaryByCarId.get(car.carId)

        return (
          <Card key={car.carId}>
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link to={`/masini/${car.carId}`} className="font-display text-2xl font-bold hover:text-primary">
                    {getCarReportIdentifier(car)}
                  </Link>
                  <p className="mt-1 text-sm text-muted-foreground">{getCarReportModelLabel(car)}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant={getStatusBadgeVariant(car.status)}>{getStatusLabel(car.status)}</Badge>
                    <Badge variant={getVerdictBadgeVariant(car.score)}>{getFleetReportVerdictLabel(car.verdict)}</Badge>
                    {commentary ? <Badge variant="muted">{getFleetReportAiActionLabel(commentary.action)}</Badge> : null}
                  </div>
                </div>

                <div className="rounded-2xl bg-muted px-4 py-3 text-right">
                  <p className="text-sm text-muted-foreground">Scor economic</p>
                  <p className="font-display text-3xl font-bold">{car.score}</p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Metric label="Venituri actuale" value={formatCurrency(car.revenue)} />
                <Metric label="Costuri actuale" value={formatCurrency(car.totalCost)} />
                <Metric label="Profit actual" value={formatCurrency(car.profit)} />
                <Metric label="Scor economic" value={`${car.score}/100`} />
              </div>

              {commentary ? <p className="rounded-2xl bg-muted p-4 text-sm">{commentary.summary}</p> : null}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function getCarReportIdentifier(car: Pick<FleetReportSnapshot['cars'][number], 'licensePlate' | 'label'>) {
  return car.licensePlate || car.label
}

function getCarReportModelLabel(car: Pick<FleetReportSnapshot['cars'][number], 'brand' | 'model'>) {
  return `${car.brand} ${car.model}`.trim()
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-muted p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-semibold leading-snug tabular-nums">{value}</p>
    </div>
  )
}

function getVerdictBadgeVariant(score: number): NonNullable<BadgeProps['variant']> {
  if (score >= 80) return 'success'
  if (score >= 60) return 'info'
  if (score >= 40) return 'warning'
  return 'danger'
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function buildListHtml(title: string, items: string[]) {
  if (items.length === 0) {
    return ''
  }

  return `
    <section class="section">
      <h3>${escapeHtml(title)}</h3>
      <ul class="bullet-list">
        ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
    </section>
  `
}

function buildReportPrintHtml(report: FleetReportRecord) {
  const snapshot = report.report
  const cards = [
    { label: 'Scor economic', value: `${snapshot.overallScore}/100` },
    { label: 'Profit actual', value: formatCurrency(snapshot.totals.totalProfit) },
    { label: 'Venituri actuale', value: formatCurrency(snapshot.totals.totalRevenue) },
    { label: 'Costuri actuale', value: formatCurrency(snapshot.totals.totalCost) },
  ]

  const summary = snapshot.aiSummary
  const summaryTitle = getAiSummaryTitle(report.aiProvider)

  return `<!DOCTYPE html>
  <html lang="ro">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Raport flota</title>
      <style>
        :root {
          color-scheme: light;
          --ink: #172033;
          --muted: #60708a;
          --line: #d9e1ea;
          --panel: #f7f9fc;
          --accent: #1d4ed8;
          --accent-soft: #e9f0ff;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: Inter, Arial, sans-serif;
          color: var(--ink);
          background: white;
        }
        .page {
          width: 100%;
          max-width: 1200px;
          margin: 0 auto;
          padding: 24px 28px 36px;
        }
        .header {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          align-items: flex-start;
          border-bottom: 2px solid var(--line);
          padding-bottom: 18px;
        }
        .header h1 {
          margin: 0 0 8px;
          font-size: 28px;
          line-height: 1.1;
        }
        .subtle {
          color: var(--muted);
          font-size: 14px;
          line-height: 1.5;
        }
        .score-box {
          min-width: 170px;
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 16px;
          background: var(--panel);
          text-align: right;
        }
        .score-box .label {
          font-size: 12px;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .score-box .value {
          margin-top: 8px;
          font-size: 34px;
          font-weight: 800;
        }
        .stats {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          margin-top: 20px;
        }
        .stat {
          border: 1px solid var(--line);
          border-radius: 14px;
          background: var(--panel);
          padding: 16px;
          break-inside: avoid;
        }
        .stat .label {
          color: var(--muted);
          font-size: 13px;
        }
        .stat .value {
          margin-top: 10px;
          font-size: 24px;
          font-weight: 800;
          line-height: 1.1;
          overflow-wrap: anywhere;
        }
        .section {
          margin-top: 22px;
          break-inside: avoid;
        }
        .section h2,
        .section h3 {
          margin: 0 0 12px;
        }
        .summary-block {
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 18px;
          background: white;
        }
        .summary-block p {
          margin: 0;
          font-size: 15px;
          line-height: 1.65;
        }
        .bullet-list {
          margin: 0;
          padding-left: 20px;
        }
        .bullet-list li {
          margin: 0 0 8px;
          font-size: 14px;
          line-height: 1.55;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 12px;
        }
        th, td {
          border-bottom: 1px solid var(--line);
          padding: 10px 8px;
          vertical-align: top;
          text-align: left;
          font-size: 13px;
        }
        th {
          color: var(--muted);
          font-weight: 700;
          background: var(--panel);
        }
        .car-name {
          font-weight: 700;
        }
        .car-model {
          margin-top: 3px;
          color: var(--muted);
          font-size: 12px;
        }
        .car-note {
          margin-top: 6px;
          color: var(--muted);
          font-size: 12px;
          line-height: 1.5;
        }
        .pill {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          background: var(--accent-soft);
          color: var(--accent);
        }
        .footer {
          margin-top: 24px;
          padding-top: 12px;
          border-top: 1px solid var(--line);
          color: var(--muted);
          font-size: 12px;
        }
        @media screen {
          body {
            background: #eef2f7;
          }
        }
        @media print {
          @page { size: A4 landscape; margin: 12mm; }
          .page { padding: 0; max-width: none; }
        }
      </style>
    </head>
    <body>
      <div class="page">
        <section class="header">
          <div>
            <h1>Raport flota</h1>
            <div class="subtle">
              Perioada analizata: ${escapeHtml(formatDate(report.periodStart))} - ${escapeHtml(formatDate(report.periodEnd))}<br />
              Tip raport: ${escapeHtml(getFleetReportPeriodLabel(report.periodKind))}<br />
              Generat la: ${escapeHtml(formatDate(report.createdAt))}
            </div>
          </div>
          <div class="score-box">
            <div class="label">Scor economic</div>
            <div class="value">${snapshot.overallScore}/100</div>
          </div>
        </section>

        <section class="stats">
          ${cards
            .map(
              (card) => `
                <div class="stat">
                  <div class="label">${escapeHtml(card.label)}</div>
                  <div class="value">${escapeHtml(card.value)}</div>
                </div>
              `,
            )
            .join('')}
        </section>

        ${
          summary
            ? `
              <section class="section">
                <h2>${escapeHtml(summaryTitle)}</h2>
                <div class="summary-block">
                  <p>${escapeHtml(summary.executiveSummary)}</p>
                </div>
              </section>
              ${buildListHtml('Puncte forte', summary.highlights)}
              ${buildListHtml('Puncte slabe', summary.risks)}
              ${buildListHtml('Ce merita facut', summary.recommendations)}
            `
            : `
              <section class="section">
                <h2>${escapeHtml(summaryTitle)}</h2>
                <div class="summary-block">
                  <p>Rezumatul AI nu a fost generat pentru acest raport. Raportul economic ramane disponibil.</p>
                </div>
              </section>
            `
        }

        <section class="section">
          <h2>Masini analizate</h2>
          <table>
            <thead>
              <tr>
                <th>Nr. inmatriculare</th>
                <th>Scor</th>
                <th>Venituri actuale</th>
                <th>Costuri actuale</th>
                <th>Profit actual</th>
                <th>Verdict</th>
              </tr>
            </thead>
            <tbody>
              ${snapshot.cars
                .map(
                  (car) => `
                    <tr>
                      <td>
                        <div class="car-name">${escapeHtml(getCarReportIdentifier(car))}</div>
                        <div class="car-model">${escapeHtml(getCarReportModelLabel(car))}</div>
                      </td>
                      <td>${car.score}/100</td>
                      <td>${escapeHtml(formatCurrency(car.revenue))}</td>
                      <td>${escapeHtml(formatCurrency(car.totalCost))}</td>
                      <td>${escapeHtml(formatCurrency(car.profit))}</td>
                      <td><span class="pill">${escapeHtml(getFleetReportVerdictLabel(car.verdict))}</span></td>
                    </tr>
                    ${
                      summary?.carCommentaries.find((item) => item.carId === car.carId)
                        ? `
                          <tr>
                            <td colspan="6" class="car-note">
                              ${escapeHtml(summary.carCommentaries.find((item) => item.carId === car.carId)?.summary ?? '')}
                            </td>
                          </tr>
                        `
                        : ''
                    }
                  `,
                )
                .join('')}
            </tbody>
          </table>
        </section>

        <div class="footer">
          Veniturile actuale reprezinta valoarea acumulata pana la data raportului, calculata proportional cu zilele acoperite de fiecare segment tarifar. Costurile actuale includ mentenanta din perioada si costul anual al asigurarii repartizat proportional. Scorul economic combina profitul actual cu costurile si penalizeaza perioadele pierdute din service.
        </div>
      </div>
    </body>
  </html>`
}

function haveSameOwnerSelection(first: string[], second: string[]) {
  if (first.length !== second.length) {
    return false
  }

  const firstSorted = [...first].sort((left, right) => left.localeCompare(right))
  const secondSorted = [...second].sort((left, right) => left.localeCompare(right))

  return firstSorted.every((ownerId, index) => ownerId === secondSorted[index])
}
