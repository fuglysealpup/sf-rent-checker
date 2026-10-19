import { useMemo, useState } from 'react'
import { money, pct } from './format'
import { isIsoDate } from './rules/dates'
import { CSV_COLUMNS, parseRentRoll } from './rules/csv'
import { InputError, REGIME_LABELS, evaluate, type Evaluation } from './rules/engine'
import { SAMPLE_EFFECTIVE_DATE, SAMPLE_ROLL } from './sample'

interface RowResult {
  line: number
  label: string
  ev?: Evaluation
  errors?: string[]
}

const TONE: Record<Evaluation['status'], 'ok' | 'bad' | 'warn'> = {
  ok: 'ok',
  over_limit: 'bad',
  blocked: 'bad',
  too_early: 'warn',
  rate_unavailable: 'warn',
}

const STATUS_LABEL: Record<Evaluation['status'], string> = {
  ok: 'Can raise',
  over_limit: 'Over limit',
  blocked: 'Blocked',
  too_early: 'Too soon',
  rate_unavailable: 'Rate unknown',
}

export function RentRoll() {
  const [csv, setCsv] = useState(SAMPLE_ROLL)
  const [effectiveDate, setEffectiveDate] = useState(SAMPLE_EFFECTIVE_DATE)

  const rows = useMemo((): RowResult[] => {
    if (!isIsoDate(effectiveDate)) return []
    return parseRentRoll(csv).map((r) => {
      if (r.error || !r.unit) return { line: r.line, label: `Line ${r.line}`, errors: [r.error ?? 'Unreadable row'] }
      try {
        return {
          line: r.line,
          label: r.unit.label || `Line ${r.line}`,
          ev: evaluate(r.unit, { effectiveDate, serviceMethod: 'mail' }),
        }
      } catch (e) {
        if (e instanceof InputError) return { line: r.line, label: r.unit.label || `Line ${r.line}`, errors: e.errors }
        throw e
      }
    })
  }, [csv, effectiveDate])

  const evaluated = rows.filter((r) => r.ev).map((r) => r.ev!)
  const count = (s: Evaluation['status']) => evaluated.filter((e) => e.status === s).length
  const uplift = evaluated
    .filter((e) => e.status === 'ok' && e.maxRent !== null)
    .reduce((s, e) => s + (e.maxRent! - e.currentRent), 0)
  const warnings = evaluated.filter((e) => e.issues.some((i) => i.severity === 'warning')).length

  const onFile = (file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setCsv(String(reader.result ?? ''))
    reader.readAsText(file)
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="sheet">
        <div className="row">
          <label className="field">
            Planned effective date for increases
            <input id="roll-effective" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            <span className="hint">Notice dates assume service by mail</span>
          </label>
          <label className="field">
            Upload a rent roll (.csv)
            <input id="roll-file" type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
            <span className="hint">Or edit the example below</span>
          </label>
        </div>
        <label className="field">
          Rent roll CSV <span className="hint">(example data; past increases as date:new rent, separated by semicolons)</span>
          <textarea id="roll-csv" className="csv" spellCheck={false} value={csv} onChange={(e) => setCsv(e.target.value)} />
        </label>
        <details>
          <summary className="hint">Columns</summary>
          <p className="hint">
            {CSV_COLUMNS.join(', ')}. Yes/no columns accept yes, no, true, false, 1 or 0.{' '}
            <code>built_before_june_13_1979</code> is only needed for 1979 buildings.
          </p>
        </details>
      </div>

      <div className="summary-strip">
        <span className="pill" data-tone="neutral">
          {rows.length} units
        </span>
        <span className="pill" data-tone="ok">
          {count('ok')} can raise, +{money(uplift)}/mo total
        </span>
        <span className="pill" data-tone="bad">
          {count('blocked') + count('over_limit')} blocked
        </span>
        <span className="pill" data-tone="warn">
          {count('too_early') + count('rate_unavailable')} not yet eligible
        </span>
        <span className="pill" data-tone="warn">
          {warnings} with history or registration warnings
        </span>
      </div>

      <div className="table-wrap">
        <table className="roll">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Rules</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Current</th>
              <th style={{ textAlign: 'right' }}>Max rent</th>
              <th style={{ textAlign: 'right' }}>Max %</th>
              <th style={{ textAlign: 'right' }}>Banked</th>
              <th>Mail notice by</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              if (!r.ev) {
                return (
                  <tr key={r.line}>
                    <td>{r.label}</td>
                    <td colSpan={8}>
                      <span className="pill" data-tone="bad">
                        Can't read row
                      </span>{' '}
                      {r.errors?.join(' ')}
                    </td>
                  </tr>
                )
              }
              const ev = r.ev
              const banked = ev.bankedYears.reduce((s, b) => s + b.percent, 0)
              const flags = ev.issues.filter((i) => i.severity !== 'info')
              return (
                <tr key={r.line}>
                  <td>{r.label}</td>
                  <td>{REGIME_LABELS[ev.regime]}</td>
                  <td>
                    <span className="pill" data-tone={TONE[ev.status]}>
                      {STATUS_LABEL[ev.status]}
                    </span>
                  </td>
                  <td className="num">{money(ev.currentRent)}</td>
                  <td className="num">
                    {ev.maxRent !== null ? money(ev.maxRent) : ev.regime === 'exempt' ? 'No cap' : '—'}
                  </td>
                  <td className="num">{ev.maxPercent !== null && ev.status !== 'blocked' ? pct(ev.maxPercent) : '—'}</td>
                  <td className="num">{banked > 0 ? pct(banked) : '—'}</td>
                  <td className="num" style={{ textAlign: 'left' }}>
                    {ev.status === 'too_early' && ev.earliestEffectiveDate
                      ? `Eligible ${ev.earliestEffectiveDate}`
                      : ev.notice.serveBy}
                  </td>
                  <td>
                    {flags.length ? (
                      <ul className="roll-flags">
                        {flags.map((f) => (
                          <li key={f.message}>{f.message}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="hint">None</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
