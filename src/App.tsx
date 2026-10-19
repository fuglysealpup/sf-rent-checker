import { useMemo, useState } from 'react'
import { formatLong, isIsoDate, toIso } from './rules/dates'
import {
  BUILDING_TYPE_LABELS,
  InputError,
  REGIME_LABELS,
  evaluate,
  type BuildingType,
  type Evaluation,
  type ServiceMethod,
  type UnitInput,
} from './rules/engine'
import { draftNotice } from './rules/notice'
import { SF_ANNUAL_ALLOWABLE } from './rules/rates'
import { SAMPLE_EFFECTIVE_DATE, SAMPLE_UNIT } from './sample'
import { RentRoll } from './RentRoll'
import { money, pct } from './format'


const today = () => toIso(new Date(Date.now() - new Date().getTimezoneOffset() * 60000))

type Tab = 'unit' | 'roll'

export default function App() {
  const [tab, setTab] = useState<Tab>('unit')
  const t = today()
  const currentSf = SF_ANNUAL_ALLOWABLE.find((p) => p.start <= t && t <= p.end)

  return (
    <div className="page">
      <header className="masthead">
        <div>
          <h1>SF Rent Increase Checker</h1>
          <p>
            Find out which rent rules cover a San Francisco unit, the most you can legally raise the rent, and
            when the notice has to go out.
          </p>
        </div>
        {currentSf && (
          <span className="rate-chip">
            SF annual allowable: {pct(currentSf.percent)} ({currentSf.start.slice(0, 4)}–{currentSf.end.slice(0, 4)})
          </span>
        )}
      </header>
      <p className="disclaimer">
        Demo only, not legal advice. Rules are simplified and may be out of date; confirm with the SF Rent Board
        or a lawyer before serving a notice.
      </p>

      <div className="tabs" role="tablist">
        <button className="tab" role="tab" id="tab-unit" aria-selected={tab === 'unit'} onClick={() => setTab('unit')}>
          Check one unit
        </button>
        <button className="tab" role="tab" id="tab-roll" aria-selected={tab === 'roll'} onClick={() => setTab('roll')}>
          Check a rent roll
        </button>
      </div>

      {tab === 'unit' ? <UnitChecker /> : <RentRoll />}

      <footer>
        Rates: SF Rent Board Documents 571 and 577; AB 1482 cap uses BLS April CPI-U for San Francisco–Oakland–Hayward.
        Rule logic lives in <code>src/rules</code> with unit tests.
      </footer>
    </div>
  )
}

function UnitChecker() {
  const [unit, setUnit] = useState<UnitInput>(SAMPLE_UNIT)
  const [effectiveDate, setEffectiveDate] = useState(SAMPLE_EFFECTIVE_DATE)
  const [proposed, setProposed] = useState('')
  const [method, setMethod] = useState<ServiceMethod>('personal')
  const [serviceDate, setServiceDate] = useState(today())
  const [landlord, setLandlord] = useState('Guerrero Street Properties LLC (example)')
  const [tenants, setTenants] = useState('Alex Rivera (example)')
  const [address, setAddress] = useState('1450 Guerrero St, Unit 3, San Francisco, CA 94110')

  const set = <K extends keyof UnitInput>(key: K, value: UnitInput[K]) => setUnit((u) => ({ ...u, [key]: value }))

  const result = useMemo((): { ev?: Evaluation; errors?: string[] } => {
    try {
      const newRent = proposed.trim() === '' ? undefined : Number(proposed)
      if (newRent !== undefined && !(newRent > 0)) return { errors: ['Proposed rent must be a positive number.'] }
      return {
        ev: evaluate(unit, {
          effectiveDate,
          newRent,
          serviceMethod: method,
          serviceDate: isIsoDate(serviceDate) ? serviceDate : undefined,
        }),
      }
    } catch (e) {
      if (e instanceof InputError) return { errors: e.errors }
      throw e
    }
  }, [unit, effectiveDate, proposed, method, serviceDate])

  const isSfHomeOrCondo = unit.buildingType === 'single_family' || unit.buildingType === 'condo'

  return (
    <div className="workspace">
      <form className="sheet" onSubmit={(e) => e.preventDefault()}>
        <fieldset>
          <legend>
            <h3>The building</h3>
          </legend>
          <label className="field">
            Property address
            <input
              id="address"
              placeholder="Street address and unit, San Francisco, CA"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            <span className="hint">Used on the drafted notice</span>
          </label>
          <div className="row">
            <label className="field">
              Year built
              <input
                id="year"
                type="number"
                value={unit.certificateYear || ''}
                onChange={(e) => set('certificateYear', Number(e.target.value))}
              />
              <span className="hint">Year of first certificate of occupancy</span>
            </label>
            <label className="field">
              Building type
              <select
                id="type"
                value={unit.buildingType}
                onChange={(e) => set('buildingType', e.target.value as BuildingType)}
              >
                {Object.entries(BUILDING_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {unit.certificateYear === 1979 && (
            <label className="check">
              <input
                id="pre-june"
                type="checkbox"
                checked={unit.certificateBeforeJune13_1979 ?? false}
                onChange={(e) => set('certificateBeforeJune13_1979', e.target.checked)}
              />
              Certificate of occupancy issued before June 13, 1979
            </label>
          )}
          {isSfHomeOrCondo && (
            <>
              <label className="check">
                <input
                  id="corp"
                  type="checkbox"
                  checked={unit.ownedByCorporation}
                  onChange={(e) => set('ownedByCorporation', e.target.checked)}
                />
                Owned by a corporation, REIT, or LLC with a corporate member
              </label>
              <label className="check">
                <input
                  id="exempt-notice"
                  type="checkbox"
                  checked={unit.ab1482ExemptionNoticeGiven}
                  onChange={(e) => set('ab1482ExemptionNoticeGiven', e.target.checked)}
                />
                Lease includes the AB 1482 exemption notice
              </label>
            </>
          )}
        </fieldset>

        <fieldset>
          <legend>
            <h3>The tenancy</h3>
          </legend>
          <div className="row">
            <label className="field">
              Move-in date
              <input id="move-in" type="date" value={unit.moveInDate} onChange={(e) => set('moveInDate', e.target.value)} />
            </label>
            <label className="field">
              Starting rent ($/mo)
              <input
                id="initial-rent"
                type="number"
                step="0.01"
                value={unit.initialRent || ''}
                onChange={(e) => set('initialRent', Number(e.target.value))}
              />
            </label>
          </div>
          <div className="history">
            <span className="field" style={{ fontSize: '0.85rem', fontWeight: 500 }}>
              Past increases <span className="hint">(date it took effect, new monthly rent)</span>
            </span>
            {unit.pastIncreases.map((inc, i) => (
              <div className="history-row" key={i}>
                <input
                  id={`inc-date-${i}`}
                  type="date"
                  aria-label={`Increase ${i + 1} date`}
                  value={inc.date}
                  onChange={(e) =>
                    set(
                      'pastIncreases',
                      unit.pastIncreases.map((p, j) => (j === i ? { ...p, date: e.target.value } : p)),
                    )
                  }
                />
                <input
                  id={`inc-rent-${i}`}
                  type="number"
                  step="0.01"
                  aria-label={`Increase ${i + 1} new rent`}
                  value={inc.newRent || ''}
                  onChange={(e) =>
                    set(
                      'pastIncreases',
                      unit.pastIncreases.map((p, j) => (j === i ? { ...p, newRent: Number(e.target.value) } : p)),
                    )
                  }
                />
                <button
                  type="button"
                  className="btn icon"
                  aria-label={`Remove increase ${i + 1}`}
                  onClick={() => set('pastIncreases', unit.pastIncreases.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </div>
            ))}
            <div className="actions">
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  const last = unit.pastIncreases[unit.pastIncreases.length - 1]
                  const lastRent = last?.newRent ?? unit.initialRent
                  set('pastIncreases', [...unit.pastIncreases, { date: '', newRent: lastRent }])
                }}
              >
                Add an increase
              </button>
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>
            <h3>SF Rent Board registration</h3>
          </legend>
          <label className="check">
            <input
              id="inventory"
              type="checkbox"
              checked={unit.housingInventoryReported}
              onChange={(e) => set('housingInventoryReported', e.target.checked)}
            />
            Unit reported to the Housing Inventory this year (due March 1)
          </label>
          <label className="check">
            <input
              id="license"
              type="checkbox"
              checked={unit.rentIncreaseLicense}
              onChange={(e) => set('rentIncreaseLicense', e.target.checked)}
            />
            Have a current rent increase license
          </label>
        </fieldset>

        <fieldset>
          <legend>
            <h3>The increase</h3>
          </legend>
          <div className="row">
            <label className="field">
              Effective date
              <input id="effective" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </label>
            <label className="field">
              New rent ($/mo)
              <input
                id="proposed"
                type="number"
                step="0.01"
                placeholder="Legal maximum"
                value={proposed}
                onChange={(e) => setProposed(e.target.value)}
              />
              <span className="hint">Leave blank to use the maximum</span>
            </label>
          </div>
          <div className="row">
            <label className="field">
              Notice served on
              <input id="service-date" type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
            </label>
            <label className="field">
              Served by
              <select id="method" value={method} onChange={(e) => setMethod(e.target.value as ServiceMethod)}>
                <option value="personal">Hand delivery</option>
                <option value="mail">Mail</option>
              </select>
            </label>
          </div>
        </fieldset>
      </form>

      <div className="sheet" aria-live="polite">
        {result.errors ? (
          <ul className="issues">
            {result.errors.map((e) => (
              <li key={e} className="issue" data-severity="error">
                {e}
              </li>
            ))}
          </ul>
        ) : (
          result.ev && (
            <Ruling
              ev={result.ev}
              parties={{ landlordName: landlord, tenantNames: tenants, address, serviceDate, serviceMethod: method }}
              onParties={{ setLandlord, setTenants }}
            />
          )
        )}
      </div>
    </div>
  )
}

const STATUS_HEADLINE: Record<Evaluation['status'], string> = {
  ok: 'This increase is allowed',
  over_limit: 'This increase is over the legal limit',
  blocked: 'No increase allowed yet',
  too_early: 'Too soon for another increase',
  rate_unavailable: "This year's rate isn't published yet",
}

function Ruling({
  ev,
  parties,
  onParties,
}: {
  ev: Evaluation
  parties: Parameters<typeof draftNotice>[1]
  onParties: { setLandlord: (s: string) => void; setTenants: (s: string) => void }
}) {
  const [copied, setCopied] = useState(false)
  const noticeText = draftNotice(ev, parties)
  const canDraft = ev.status === 'ok' && ev.proposedRent > ev.currentRent && !ev.notice.late
  const bankedTotal = ev.bankedYears.reduce((s, b) => s + b.percent, 0)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(noticeText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const pre = document.getElementById('notice-text')
      if (pre) window.getSelection()?.selectAllChildren(pre)
    }
  }

  return (
    <>
      <div className="verdict" data-status={ev.status}>
        <span className="regime">{REGIME_LABELS[ev.regime]}</span>
        <h2>{STATUS_HEADLINE[ev.status]}</h2>
        <div className="figures">
          <div className="figure">
            <span className="label">Current rent</span>
            <span className="value">{money(ev.currentRent)}</span>
          </div>
          <div className="figure">
            <span className="label">Legal maximum</span>
            <span className="value">{ev.maxRent !== null ? money(ev.maxRent) : ev.regime === 'exempt' ? 'No cap' : '—'}</span>
            {ev.maxPercent !== null && ev.status !== 'blocked' && <span className="sub">+{pct(ev.maxPercent)}</span>}
            {ev.maxRentIfLicensed !== null && <span className="sub">{money(ev.maxRentIfLicensed)} once licensed</span>}
          </div>
          <div className="figure">
            <span className="label">Serve notice by</span>
            <span className="value">{ev.notice.serveBy}</span>
            <span className="sub">{ev.notice.days} days before</span>
          </div>
        </div>
      </div>

      {ev.issues.length > 0 && (
        <ul className="issues">
          {ev.issues.map((i) => (
            <li key={i.message} className="issue" data-severity={i.severity}>
              {i.message}
            </li>
          ))}
        </ul>
      )}

      {ev.breakdown.length > 0 && (
        <section style={{ display: 'grid', gap: 8 }}>
          <h3>How the maximum is calculated</h3>
          <table className="breakdown">
            <tbody>
              {ev.breakdown.map((b) => (
                <tr key={b.label}>
                  <td>{b.label}</td>
                  <td className="num">{pct(b.percent)}</td>
                </tr>
              ))}
              {ev.bankedYears.map((y) => (
                <tr className="sub" key={y.anniversary + y.source}>
                  <td>
                    {y.source === 'partial' ? 'Unused part of the increase on ' : 'Skipped anniversary '}
                    {formatLong(y.anniversary)}
                  </td>
                  <td className="num">{pct(y.percent)}</td>
                </tr>
              ))}
              {ev.maxPercent !== null && (
                <tr className="total">
                  <td>
                    Total{bankedTotal > 0 ? ', added together (banked increases are not compounded)' : ''}
                  </td>
                  <td className="num">{pct(ev.maxPercent)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      <section style={{ display: 'grid', gap: 8 }}>
        <h3>Why these rules apply</h3>
        <ul className="reasons">
          {ev.coverage.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
          <li>{ev.notice.reason}</li>
        </ul>
      </section>

      {ev.history.length > 0 && (
        <section style={{ display: 'grid', gap: 8 }}>
          <h3>Past increases checked</h3>
          <table className="breakdown">
            <tbody>
              {ev.history.map((h) => (
                <tr key={h.date}>
                  <td>
                    {formatLong(h.date)}: {money(h.oldRent)} → {money(h.newRent)}
                  </td>
                  <td className="num">
                    {pct(h.percent, 2)} of {h.allowedPercent !== null ? pct(h.allowedPercent) : '—'} allowed
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section style={{ display: 'grid', gap: 10 }}>
        <h3>Draft notice</h3>
        {canDraft ? (
          <>
            <div className="row">
              <label className="field">
                Owner or agent
                <input id="landlord" value={parties.landlordName} onChange={(e) => onParties.setLandlord(e.target.value)} />
              </label>
              <label className="field">
                Tenant(s)
                <input id="tenants" value={parties.tenantNames} onChange={(e) => onParties.setTenants(e.target.value)} />
              </label>
            </div>
            <pre className="notice" id="notice-text">
              {noticeText}
            </pre>
            <div className="actions">
              <button type="button" className="btn" onClick={copy}>
                {copied ? 'Copied' : 'Copy notice'}
              </button>
            </div>
          </>
        ) : (
          <p className="empty">Fix the problems above and a compliant notice will appear here.</p>
        )}
      </section>

      <section style={{ display: 'grid', gap: 6 }}>
        <h3>Sources</h3>
        <div className="sources">
          {ev.citations.map((c) => (
            <a key={c.url} href={c.url} target="_blank" rel="noreferrer">
              {c.label}
            </a>
          ))}
        </div>
      </section>
    </>
  )
}
