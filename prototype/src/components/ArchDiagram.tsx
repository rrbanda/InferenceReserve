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
  arrowSolid: '#7A8A9A',
  arrowDash: '#A8B4BF',
};

function Box({ x, y, w, h, label, sub, type }: {
  x: number; y: number; w: number; h: number; label: string; sub?: string;
  type: 'upstream' | 'gateway' | 'custom' | 'infra';
}) {
  const fills = {
    upstream: { bg: C.navy, stroke: 'none', dash: false, text: C.white, sub: C.dimWhite },
    gateway: { bg: C.accent, stroke: 'none', dash: false, text: C.white, sub: C.dimWhite },
    custom: { bg: C.customBg, stroke: C.accent, dash: true, text: C.navy, sub: C.textMid },
    infra: { bg: C.lightBg, stroke: C.border, dash: false, text: C.textDark, sub: C.textMid },
  }[type];

  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={5} fill={fills.bg}
        stroke={fills.stroke} strokeWidth={fills.stroke !== 'none' ? 1.5 : 0}
        strokeDasharray={fills.dash ? '5 3' : undefined} />
      <text x={x + w / 2} y={sub ? y + h * 0.38 : y + h / 2} textAnchor="middle" dominantBaseline="central"
        fill={fills.text} fontSize={11} fontWeight={600} fontFamily="Helvetica Neue,Arial,sans-serif">{label}</text>
      {sub && <text x={x + w / 2} y={y + h * 0.7} textAnchor="middle" dominantBaseline="central"
        fill={fills.sub} fontSize={8.5} fontFamily="Helvetica Neue,Arial,sans-serif">{sub}</text>}
    </g>
  );
}

function Arr({ d, dash }: { d: string; dash?: boolean }) {
  return <path d={d} fill="none" stroke={dash ? C.arrowDash : C.arrowSolid}
    strokeWidth={dash ? 1 : 1.4} strokeDasharray={dash ? '4 3' : undefined} markerEnd={dash ? 'url(#ad)' : 'url(#as)'} />;
}

function RowLabel({ x, y, text }: { x: number; y: number; text: string }) {
  return <text x={x} y={y} fill={C.textMid} fontSize={8.5} fontWeight={700} letterSpacing={1.2}
    fontFamily="Helvetica Neue,Arial,sans-serif">{text}</text>;
}

function Note({ x, y, text }: { x: number; y: number; text: string }) {
  return <text x={x} y={y} fill={C.textMid} fontSize={8} fontStyle="italic"
    fontFamily="Helvetica Neue,Arial,sans-serif">{text}</text>;
}

export default function ArchDiagram() {
  const W = 780, H = 510;
  const L = 30, BH = 36;

  const Y = { client: 8, gateway: 60, filters: 130, serving: 210, ctrlplane: 285, iso: 355, obs: 420 };

  return (
    <div className={styles.wrapper}>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg}>
        <defs>
          <marker id="as" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">
            <polygon points="0 0,6 2.5,0 5" fill={C.arrowSolid} /></marker>
          <marker id="ad" markerWidth="5" markerHeight="4" refX="5" refY="2" orient="auto">
            <polygon points="0 0,5 2,0 4" fill={C.arrowDash} /></marker>
        </defs>

        {/* CLIENT */}
        <Box x={W / 2 - 70} y={Y.client} w={140} h={30} label="Client Request" type="infra" />

        {/* DATA PLANE: GATEWAY */}
        <RowLabel x={L} y={Y.gateway - 2} text="DATA PLANE — GATEWAY (ENVOY AI GATEWAY)" />
        <line x1={L} y1={Y.gateway + 2} x2={W - L} y2={Y.gateway + 2} stroke={C.border} />
        <Box x={W / 2 - 120} y={Y.gateway + 12} w={240} h={BH} label="Envoy AI Gateway" sub="L7 proxy · token counting · filter chain host" type="upstream" />

        {/* GATEWAY FILTER CHAIN */}
        <RowLabel x={L} y={Y.filters - 2} text="GATEWAY FILTER CHAIN (runs inside Envoy)" />
        <line x1={L} y1={Y.filters + 2} x2={W - L} y2={Y.filters + 2} stroke={C.border} />
        <Note x={L + 5} y={Y.filters + 12} text="① ext_authz" />
        <Box x={L + 5} y={Y.filters + 18} w={200} h={BH} label="PT Auth Service" sub="tenant identity · TPM budget · routing" type="custom" />
        <Note x={L + 225} y={Y.filters + 12} text="② HTTPRoute matching (config)" />
        <Box x={L + 225} y={Y.filters + 18} w={140} h={BH} label="HTTPRoute" sub="path → InferencePool" type="gateway" />
        <Note x={W - L - 195} y={Y.filters + 12} text="③ ext_proc" />
        <Box x={W - L - 195} y={Y.filters + 18} w={175} h={BH} label="llm-d EPP" sub="filter → score → pick best pod" type="upstream" />

        {/* SERVING */}
        <RowLabel x={L} y={Y.serving - 2} text="DATA PLANE — MODEL SERVING" />
        <line x1={L} y1={Y.serving + 2} x2={W - L} y2={Y.serving + 2} stroke={C.border} />
        <Box x={W / 2 - 130} y={Y.serving + 12} w={260} h={BH} label="vLLM on H100 NVL (selected pod)" sub="fixed replicas · per-request metrics · prefix caching" type="upstream" />
        <Note x={W / 2 + 145} y={Y.serving + 35} text="Gateway forwards directly to EPP-selected pod" />

        {/* CONTROL PLANE */}
        <RowLabel x={L} y={Y.ctrlplane - 2} text="CONTROL PLANE — KSERVE + RESERVATION MGMT" />
        <line x1={L} y1={Y.ctrlplane + 2} x2={W - L} y2={Y.ctrlplane + 2} stroke={C.border} />
        <Box x={L + 5} y={Y.ctrlplane + 12} w={190} h={BH} label="LLMInferenceService" sub="KServe v0.17 — auto-provisions stack" type="upstream" />
        <Box x={L + 210} y={Y.ctrlplane + 12} w={140} h={BH} label="InferencePool" sub="CRD: pod set for EPP" type="gateway" />
        <Box x={W / 2 + 60} y={Y.ctrlplane + 12} w={120} h={BH} label="PT CRD" sub="reservation spec" type="custom" />
        <Box x={W - L - 155} y={Y.ctrlplane + 12} w={135} h={BH} label="Reservation Mgr" sub="generates YAML" type="custom" />

        {/* ISOLATION */}
        <RowLabel x={L} y={Y.iso - 2} text="ISOLATION (PHASE 1: PHYSICAL)" />
        <line x1={L} y1={Y.iso + 2} x2={W - L} y2={Y.iso + 2} stroke={C.border} />
        <Box x={L + 10} y={Y.iso + 12} w={140} h={BH} label="Namespace + Quota" sub="ResourceQuota + Kueue" type="infra" />
        <Box x={L + 165} y={Y.iso + 12} w={140} h={BH} label="Tainted PT Nodes" sub="NoSchedule for shared" type="infra" />
        <Box x={L + 320} y={Y.iso + 12} w={140} h={BH} label="NVIDIA GPU Operator" sub="drivers · MIG · DCGM" type="upstream" />

        {/* OBSERVABILITY */}
        <RowLabel x={L} y={Y.obs - 2} text="OBSERVABILITY" />
        <line x1={L} y1={Y.obs + 2} x2={W - L} y2={Y.obs + 2} stroke={C.border} />
        <Box x={L + 5} y={Y.obs + 12} w={100} h={BH} label="DCGM" sub="GPU metrics" type="upstream" />
        <Box x={L + 115} y={Y.obs + 12} w={110} h={BH} label="vLLM /metrics" sub="tokens · TTFT" type="upstream" />
        <Box x={L + 240} y={Y.obs + 12} w={95} h={BH} label="Prometheus" type="gateway" />
        <Box x={L + 350} y={Y.obs + 12} w={120} h={BH} label="Grafana" sub="dashboards" type="custom" />
        <Box x={W - L - 135} y={Y.obs + 12} w={115} h={BH} label="Chargeback" sub="token aggregation" type="custom" />

        {/* === DATA FLOW ARROWS === */}
        {/* Client → Gateway */}
        <Arr d={`M${W / 2},${Y.client + 30} L${W / 2},${Y.gateway + 12}`} />
        {/* Gateway → Filter chain: Auth → HTTPRoute → EPP (left to right) */}
        <Arr d={`M${W / 2 - 120},${Y.gateway + 12 + BH} L${L + 105},${Y.filters + 18}`} />
        <Arr d={`M${L + 205},${Y.filters + 36} L${L + 225},${Y.filters + 36}`} />
        <Arr d={`M${L + 365},${Y.filters + 36} L${W - L - 195},${Y.filters + 36}`} />
        {/* Gateway → vLLM (direct, the main data path — after EPP selects pod) */}
        <Arr d={`M${W / 2 + 120},${Y.gateway + 12 + BH} L${W / 2 + 120},${Y.serving + 12}`} />

        {/* === CONTROL PLANE DASHED ARROWS === */}
        {/* ResMgr reads PT CRD */}
        <Arr d={`M${W - L - 88},${Y.ctrlplane + 12} L${W / 2 + 180},${Y.ctrlplane + 30}`} dash />
        {/* ResMgr → creates LLMInferenceService YAML */}
        <Arr d={`M${W - L - 155},${Y.ctrlplane + 30} L${L + 195},${Y.ctrlplane + 30}`} dash />
        {/* LLMInferenceService auto-provisions InferencePool, EPP, HTTPRoute */}
        <Arr d={`M${L + 195},${Y.ctrlplane + 30} L${L + 210},${Y.ctrlplane + 30}`} dash />
        <Arr d={`M${L + 100},${Y.ctrlplane + 12} L${L + 100},${Y.filters + 18 + BH + 4} L${L + 295},${Y.filters + 18 + BH + 4}`} dash />
        {/* ResMgr → Grafana */}
        <Arr d={`M${W - L - 88},${Y.ctrlplane + 12 + BH} L${W - L - 88},${Y.obs + 30} L${L + 470},${Y.obs + 30}`} dash />

        {/* === OBSERVABILITY ARROWS === */}
        <Arr d={`M${L + 105},${Y.obs + 30} L${L + 115},${Y.obs + 30}`} />
        <Arr d={`M${L + 225},${Y.obs + 30} L${L + 240},${Y.obs + 30}`} />
        <Arr d={`M${L + 335},${Y.obs + 30} L${L + 350},${Y.obs + 30}`} />

        {/* LEGEND */}
        <g transform={`translate(${L + 10},${H - 30})`}>
          <rect width={10} height={10} rx={2} fill={C.navy} />
          <text x={14} y={9} fill={C.textMid} fontSize={9} fontFamily="Helvetica Neue,Arial,sans-serif">Upstream</text>
          <rect x={80} width={10} height={10} rx={2} fill={C.accent} />
          <text x={94} y={9} fill={C.textMid} fontSize={9} fontFamily="Helvetica Neue,Arial,sans-serif">Gateway API</text>
          <rect x={175} width={10} height={10} rx={2} fill={C.customBg} stroke={C.accent} strokeWidth={1} strokeDasharray="3 2" />
          <text x={189} y={9} fill={C.textMid} fontSize={9} fontFamily="Helvetica Neue,Arial,sans-serif">Custom Build</text>
          <line x1={280} y1={5} x2={296} y2={5} stroke={C.arrowSolid} strokeWidth={1.3} markerEnd="url(#as)" />
          <text x={300} y={9} fill={C.textMid} fontSize={9} fontFamily="Helvetica Neue,Arial,sans-serif">Data flow</text>
          <line x1={360} y1={5} x2={376} y2={5} stroke={C.arrowDash} strokeWidth={1} strokeDasharray="3 2" markerEnd="url(#ad)" />
          <text x={380} y={9} fill={C.textMid} fontSize={9} fontFamily="Helvetica Neue,Arial,sans-serif">Control plane provisions</text>
        </g>
      </svg>
    </div>
  );
}
