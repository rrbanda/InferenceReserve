import styles from './ArchDiagram.module.css';

const C = {
  navy: '#00205B',
  accent: '#00A3E0',
  lightBg: '#F5F7FA',
  border: '#D8DCE0',
  textDark: '#1A1A1A',
  textMid: '#6B7785',
  white: '#FFFFFF',
  dimWhite: 'rgba(255,255,255,0.55)',
  customBg: '#EAF7FD',
  arrowSolid: '#5A6A7A',
  arrowDash: '#A8B4BF',
  gwBg: '#001840',
};

function Box({ x, y, w, h, label, sub, type }: {
  x: number; y: number; w: number; h: number; label: string; sub?: string;
  type: 'upstream' | 'gateway' | 'custom' | 'infra' | 'filter';
}) {
  const fills: Record<string, { bg: string; stroke: string; dash: boolean; text: string; sub: string }> = {
    upstream: { bg: C.navy, stroke: 'none', dash: false, text: C.white, sub: C.dimWhite },
    gateway: { bg: C.accent, stroke: 'none', dash: false, text: C.white, sub: C.dimWhite },
    custom: { bg: C.customBg, stroke: C.accent, dash: true, text: C.navy, sub: C.textMid },
    infra: { bg: C.lightBg, stroke: C.border, dash: false, text: C.textDark, sub: C.textMid },
    filter: { bg: 'rgba(255,255,255,0.12)', stroke: 'rgba(255,255,255,0.25)', dash: false, text: C.white, sub: 'rgba(255,255,255,0.5)' },
  };
  const f = fills[type];

  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={5} fill={f.bg}
        stroke={f.stroke} strokeWidth={f.stroke !== 'none' ? 1.2 : 0}
        strokeDasharray={f.dash ? '5 3' : undefined} />
      <text x={x + w / 2} y={sub ? y + h * 0.38 : y + h / 2} textAnchor="middle" dominantBaseline="central"
        fill={f.text} fontSize={11} fontWeight={600} fontFamily="Helvetica Neue,Arial,sans-serif">{label}</text>
      {sub && <text x={x + w / 2} y={y + h * 0.68} textAnchor="middle" dominantBaseline="central"
        fill={f.sub} fontSize={8} fontFamily="Helvetica Neue,Arial,sans-serif">{sub}</text>}
    </g>
  );
}

function Arr({ d, dash, color }: { d: string; dash?: boolean; color?: string }) {
  const c = color || (dash ? C.arrowDash : C.arrowSolid);
  const mid = dash ? 'url(#ad)' : 'url(#as)';
  return <path d={d} fill="none" stroke={c}
    strokeWidth={dash ? 1 : 1.5} strokeDasharray={dash ? '4 3' : undefined} markerEnd={mid} />;
}

function Label({ x, y, text }: { x: number; y: number; text: string }) {
  return <text x={x} y={y} fill={C.textMid} fontSize={8.5} fontWeight={700} letterSpacing={1}
    fontFamily="Helvetica Neue,Arial,sans-serif">{text}</text>;
}

export default function ArchDiagram() {
  const W = 760, H = 490;
  const MX = W / 2;

  return (
    <div className={styles.wrapper}>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg}>
        <defs>
          <marker id="as" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">
            <polygon points="0 0,6 2.5,0 5" fill={C.arrowSolid} /></marker>
          <marker id="ad" markerWidth="5" markerHeight="4" refX="5" refY="2" orient="auto">
            <polygon points="0 0,5 2,0 4" fill={C.arrowDash} /></marker>
          <marker id="aw" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">
            <polygon points="0 0,6 2.5,0 5" fill="rgba(255,255,255,0.4)" /></marker>
        </defs>

        {/* ===== CLIENT ===== */}
        <Box x={MX - 65} y={6} w={130} h={28} label="Client Request" type="infra" />

        {/* ===== GATEWAY — big box containing the filter chain ===== */}
        <rect x={40} y={52} width={W - 80} height={118} rx={8} fill={C.gwBg} />
        <text x={52} y={68} fill="rgba(255,255,255,0.4)" fontSize={8.5} fontWeight={700}
          letterSpacing={1} fontFamily="Helvetica Neue,Arial,sans-serif">
          ENVOY AI GATEWAY — DATA PLANE
        </text>
        <text x={52} y={80} fill="rgba(255,255,255,0.3)" fontSize={7.5}
          fontFamily="Helvetica Neue,Arial,sans-serif">
          L7 proxy · token counting · all filters run inside this process
        </text>

        {/* Filter chain inside the gateway */}
        <text x={70} y={100} fill="rgba(255,255,255,0.35)" fontSize={7.5} fontWeight={600}
          fontFamily="Helvetica Neue,Arial,sans-serif">FILTER CHAIN</text>

        <Box x={70} y={108} w={175} h={42} label="① PT Auth Service" sub="ext_authz · tenant · TPM budget" type="filter" />

        <path d={`M245,129 L263,129`} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={1.2} markerEnd="url(#aw)" />

        <Box x={270} y={108} w={145} h={42} label="② Route Match" sub="HTTPRoute → InferencePool" type="filter" />

        <path d={`M415,129 L433,129`} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={1.2} markerEnd="url(#aw)" />

        <Box x={440} y={108} w={165} h={42} label="③ llm-d EPP" sub="ext_proc · filter → score → pick" type="filter" />

        {/* EPP result label */}
        <text x={620} y={158} fill="rgba(255,255,255,0.3)" fontSize={7}
          fontFamily="Helvetica Neue,Arial,sans-serif">
          returns selected pod address
        </text>

        {/* ===== vLLM ===== */}
        <Label x={40} y={190} text="MODEL SERVING" />
        <line x1={40} y1={194} x2={W - 40} y2={194} stroke={C.border} strokeWidth={0.5} />
        <Box x={MX - 140} y={204} w={280} h={40} label="vLLM on H100 NVL" sub="EPP-selected pod · fixed replicas · per-request metrics · prefix caching" type="upstream" />

        {/* ===== CONTROL PLANE ===== */}
        <Label x={40} y={266} text="CONTROL PLANE" />
        <line x1={40} y1={270} x2={W - 40} y2={270} stroke={C.border} strokeWidth={0.5} />

        <Box x={50} y={280} w={170} h={38} label="LLMInferenceService" sub="KServe v0.17 — auto-provisions" type="upstream" />
        <Box x={235} y={280} w={130} h={38} label="InferencePool" sub="CRD: pod set for EPP" type="gateway" />
        <Box x={440} y={280} w={110} h={38} label="PT CRD" sub="reservation spec" type="custom" />
        <Box x={565} y={280} w={135} h={38} label="Reservation Mgr" sub="reads CRD · generates YAML" type="custom" />

        {/* ===== ISOLATION ===== */}
        <Label x={40} y={340} text="ISOLATION (PHASE 1: PHYSICAL)" />
        <line x1={40} y1={344} x2={W - 40} y2={344} stroke={C.border} strokeWidth={0.5} />

        <Box x={50} y={354} w={145} h={34} label="Namespace + Quota" sub="ResourceQuota + Kueue" type="infra" />
        <Box x={210} y={354} w={130} h={34} label="Tainted PT Nodes" sub="NoSchedule for shared" type="infra" />
        <Box x={355} y={354} w={155} h={34} label="NVIDIA GPU Operator" sub="drivers · MIG · DCGM" type="upstream" />

        {/* ===== OBSERVABILITY ===== */}
        <Label x={40} y={410} text="OBSERVABILITY" />
        <line x1={40} y1={414} x2={W - 40} y2={414} stroke={C.border} strokeWidth={0.5} />

        <Box x={50} y={422} w={90} h={32} label="DCGM" sub="GPU metrics" type="upstream" />
        <Box x={150} y={422} w={100} h={32} label="vLLM /metrics" sub="tokens · TTFT" type="upstream" />
        <Box x={262} y={422} w={85} h={32} label="Prometheus" type="gateway" />
        <Box x={360} y={422} w={105} h={32} label="Grafana" sub="dashboards" type="custom" />
        <Box x={578} y={422} w={110} h={32} label="Chargeback" sub="token aggregation" type="custom" />

        {/* ===== DATA-PLANE ARROWS (solid) ===== */}
        {/* Client → Gateway (enters the big box) */}
        <Arr d={`M${MX},34 L${MX},52`} />
        {/* Gateway → vLLM (the single real network hop after EPP picks) */}
        <Arr d={`M${MX},170 L${MX},204`} />

        {/* ===== CONTROL-PLANE ARROWS (dashed) ===== */}
        {/* ResMgr → reads PT CRD */}
        <Arr d={`M${565},299 L${550},299`} dash />
        {/* ResMgr → applies LLMInferenceService YAML */}
        <Arr d={`M${565},299 L${565},310 L${135},310 L${135},318`} dash />
        {/* LLMIS → auto-creates InferencePool */}
        <Arr d={`M${220},299 L${235},299`} dash />
        {/* ResMgr → provisions Grafana */}
        <Arr d={`M${632},318 L${632},401 L${412},401 L${412},422`} dash />

        {/* Observability flow arrows */}
        <Arr d={`M${140},438 L${150},438`} />
        <Arr d={`M${250},438 L${262},438`} />
        <Arr d={`M${347},438 L${360},438`} />

        {/* ===== LEGEND ===== */}
        <g transform={`translate(50,${H - 20})`}>
          <rect width={10} height={10} rx={2} fill={C.navy} />
          <text x={14} y={9} fill={C.textMid} fontSize={8.5} fontFamily="Helvetica Neue,Arial,sans-serif">Upstream</text>
          <rect x={78} width={10} height={10} rx={2} fill={C.accent} />
          <text x={92} y={9} fill={C.textMid} fontSize={8.5} fontFamily="Helvetica Neue,Arial,sans-serif">Gateway API</text>
          <rect x={168} width={10} height={10} rx={2} fill={C.customBg} stroke={C.accent} strokeWidth={1} strokeDasharray="3 2" />
          <text x={182} y={9} fill={C.textMid} fontSize={8.5} fontFamily="Helvetica Neue,Arial,sans-serif">Custom Build</text>
          <rect x={262} width={10} height={10} rx={2} fill={C.lightBg} stroke={C.border} strokeWidth={1} />
          <text x={276} y={9} fill={C.textMid} fontSize={8.5} fontFamily="Helvetica Neue,Arial,sans-serif">Infrastructure</text>
          <line x1={356} y1={5} x2={372} y2={5} stroke={C.arrowSolid} strokeWidth={1.3} markerEnd="url(#as)" />
          <text x={376} y={9} fill={C.textMid} fontSize={8.5} fontFamily="Helvetica Neue,Arial,sans-serif">Data flow</text>
          <line x1={430} y1={5} x2={446} y2={5} stroke={C.arrowDash} strokeWidth={1} strokeDasharray="3 2" markerEnd="url(#ad)" />
          <text x={450} y={9} fill={C.textMid} fontSize={8.5} fontFamily="Helvetica Neue,Arial,sans-serif">Control plane</text>
        </g>
      </svg>
    </div>
  );
}
