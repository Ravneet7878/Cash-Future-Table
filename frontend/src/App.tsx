import {
  Activity,
  ArrowUpRight,
  Check,
  CircleAlert,
  Clock3,
  Database,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Waves,
} from 'lucide-react';

import type { ConnectionStatus, MarketState } from './market-state';
import type { ReplayStatus } from './protocol';
import { useMarketStream } from './use-market-stream';

const EXPECTED_ROWS = 228;

export function App() {
  const state = useMarketStream();
  return <Dashboard state={state} />;
}

export function Dashboard({ state }: Readonly<{ state: MarketState }>) {
  const rows = [...state.rows.values()];
  const stockCoverage = rows.filter((row) => row.stockLtp !== null).length;
  const futureCoverage = rows.filter((row) => row.futureLtp !== null).length;
  const spreadCoverage = rows.filter(
    (row) => row.buySpread !== null || row.sellSpread !== null,
  ).length;
  const connection = connectionPresentation(state.connection);
  const replay = replayPresentation(state.replay);

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <header className="topbar">
        <a className="brand" href="#top" aria-label="Basis home">
          <span className="brand-mark">B</span>
          <span>
            <strong>Basis</strong>
            <small>Market intelligence</small>
          </span>
        </a>
        <div className="topbar-actions">
          <span className={`status-pill ${connection.tone}`}>
            <span className="status-dot" />
            {connection.label}
          </span>
          <span className="market-label">NSE · Read only</span>
        </div>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="page-title">
          <div className="hero-copy">
            <span className="eyebrow">
              <Sparkles size={14} aria-hidden="true" />
              Live cash–future intelligence
            </span>
            <h1 id="page-title">
              See the spread.
              <span>Read the market.</span>
            </h1>
            <p>
              A focused, real-time view of NSE cash equities and their nearest
              futures—designed for clarity, speed, and zero trading noise.
            </p>
          </div>

          <div className="hero-status" aria-label="Live stream status">
            <div className="orbital-mark" aria-hidden="true">
              <span className="orbit orbit-one" />
              <span className="orbit orbit-two" />
              <Waves size={34} />
            </div>
            <div>
              <span className="micro-label">Replay status</span>
              <strong>{replay.label}</strong>
              <p>{replay.description}</p>
            </div>
          </div>
        </section>

        {state.notice !== null && (
          <div className="notice" role="status">
            <CircleAlert size={18} aria-hidden="true" />
            <span>{state.notice}</span>
          </div>
        )}

        <section className="metrics" aria-label="Market overview">
          <MetricCard
            icon={<Database size={19} />}
            label="Contract universe"
            value={state.hasSnapshot ? formatInteger(rows.length) : '—'}
            detail={`of ${String(EXPECTED_ROWS)} paired symbols`}
            tone="mint"
          />
          <MetricCard
            icon={<Activity size={19} />}
            label="Cash coverage"
            value={state.hasSnapshot ? formatInteger(stockCoverage) : '—'}
            detail="symbols with stock LTP"
            tone="lime"
          />
          <MetricCard
            icon={<Radio size={19} />}
            label="Future coverage"
            value={state.hasSnapshot ? formatInteger(futureCoverage) : '—'}
            detail="symbols with future LTP"
            tone="violet"
          />
          <MetricCard
            icon={<Clock3 size={19} />}
            label="Data sequence"
            value={state.sequence >= 0 ? formatInteger(state.sequence) : '—'}
            detail={formatUpdatedAt(state.updatedAt)}
            tone="sand"
          />
        </section>

        <section className="workspace-grid">
          <article className="panel coverage-panel">
            <div className="panel-heading">
              <div>
                <span className="micro-label">Data readiness</span>
                <h2>Market coverage</h2>
              </div>
              <span className="quiet-chip">
                <ShieldCheck size={15} aria-hidden="true" />
                Validated feed
              </span>
            </div>

            <div className="coverage-list">
              <CoverageRow
                label="Cash LTP"
                count={stockCoverage}
                total={rows.length}
                color="var(--accent-lime)"
                loaded={state.hasSnapshot}
              />
              <CoverageRow
                label="Future LTP"
                count={futureCoverage}
                total={rows.length}
                color="var(--accent-mint)"
                loaded={state.hasSnapshot}
              />
              <CoverageRow
                label="Calculated spreads"
                count={spreadCoverage}
                total={rows.length}
                color="var(--accent-violet)"
                loaded={state.hasSnapshot}
              />
            </div>

            <div className="panel-footnote">
              <span className="footnote-icon">
                <Check size={14} aria-hidden="true" />
              </span>
              All prices arrive in rupees; unavailable quotes remain explicitly
              blank rather than being inferred.
            </div>
          </article>

          <article className="panel stream-panel">
            <div className="panel-heading">
              <div>
                <span className="micro-label">Transport</span>
                <h2>Stream health</h2>
              </div>
              <Activity size={20} className="panel-icon" aria-hidden="true" />
            </div>

            <div className="stream-stage">
              <span className={`stream-icon ${connection.tone}`}>
                {state.connection === 'reconnecting' ? (
                  <RefreshCw size={23} aria-hidden="true" />
                ) : (
                  <Radio size={23} aria-hidden="true" />
                )}
              </span>
              <div>
                <strong>{connection.label}</strong>
                <p>{connection.description}</p>
              </div>
            </div>

            <dl className="stream-details">
              <div>
                <dt>Protocol</dt>
                <dd>Version 1</dd>
              </div>
              <div>
                <dt>Publication</dt>
                <dd>1 second</dd>
              </div>
              <div>
                <dt>Reconnects</dt>
                <dd>{formatInteger(state.reconnectAttempt)}</dd>
              </div>
            </dl>
          </article>
        </section>

        <section className="table-preview" aria-labelledby="table-title">
          <div className="preview-copy">
            <span className="eyebrow dark-eyebrow">Next workspace</span>
            <h2 id="table-title">The market table is ready for its grid.</h2>
            <p>
              Snapshot replacement, keyed row updates, sequence-gap recovery,
              and reconnect handling are active. The interactive five-column AG
              Grid surface arrives in the next reviewed component.
            </p>
          </div>
          <div className="preview-visual" aria-hidden="true">
            <div className="preview-header">
              <i /> <i /> <i /> <i /> <i />
            </div>
            {[82, 66, 91, 74].map((width, index) => (
              <div className="preview-row" key={width}>
                <span style={{ width: `${String(width)}%` }} />
                <em>{String(index + 1).padStart(2, '0')}</em>
              </div>
            ))}
            <span className="preview-badge">
              <ArrowUpRight size={15} /> Live deltas
            </span>
          </div>
        </section>
      </main>

      <footer>
        <span>Basis</span>
        <p>Read-only market data · No order execution</p>
      </footer>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone,
}: Readonly<{
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: string;
}>) {
  return (
    <article className={`metric-card ${tone}`}>
      <span className="metric-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function CoverageRow({
  label,
  count,
  total,
  color,
  loaded,
}: Readonly<{
  label: string;
  count: number;
  total: number;
  color: string;
  loaded: boolean;
}>) {
  const percentage = total === 0 ? 0 : Math.round((count / total) * 100);
  return (
    <div className="coverage-row">
      <div>
        <span>{label}</span>
        <strong>{loaded ? `${String(count)} / ${String(total)}` : '—'}</strong>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label={`${label} coverage`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage}
      >
        <span
          style={{
            width: `${String(percentage)}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
}

function connectionPresentation(status: ConnectionStatus) {
  switch (status) {
    case 'connected':
      return {
        label: 'Live connection',
        description: 'The WebSocket stream is connected and listening.',
        tone: 'is-live',
      };
    case 'reconnecting':
      return {
        label: 'Reconnecting',
        description: 'Recovering with a fresh authoritative snapshot.',
        tone: 'is-waiting',
      };
    case 'offline':
      return {
        label: 'Offline',
        description: 'The market stream is currently stopped.',
        tone: 'is-offline',
      };
    case 'connecting':
      return {
        label: 'Connecting',
        description: 'Opening the live market data channel.',
        tone: 'is-waiting',
      };
  }
}

function replayPresentation(status: ReplayStatus) {
  switch (status) {
    case 'running':
      return {
        label: 'Replay in motion',
        description: 'Cash and futures workers are advancing in parallel.',
      };
    case 'complete':
      return {
        label: 'Final state retained',
        description: 'Replay is complete and the final market view is ready.',
      };
    case 'error':
      return {
        label: 'Replay needs attention',
        description:
          'The last valid state is retained while the issue is shown.',
      };
    case 'waiting':
      return {
        label: 'Preparing the feed',
        description: 'The first connection will start the global replay.',
      };
  }
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat('en-IN').format(value);
}

function formatUpdatedAt(value: number | null): string {
  if (value === null) return 'awaiting first snapshot';
  return `updated ${new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(value)}`;
}
