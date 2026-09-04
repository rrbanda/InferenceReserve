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

export default function ArchDiagram() {
  const W = 780, H = 480;
  const L = 30, BH = 36, BW = 160;

  const Y = { client: 8, ingress: 60, routing: 130, serving: 200, iso: 270, obs: 350 };

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

        {/* INGRESS */}
        <RowLabel x={L} y={Y.ingress - 2} text="INGRESS" />
        <line x1={L} y1={Y.ingress + 2} x2={W - L} y2={Y.ingress + 2} stroke={C.border} />
        <Box x={L + 20} y={Y.ingress + 12} w={210} h={BH} label="Envoy AI Gateway" sub="L7 proxy · token counting" type="upstream" />
        <Box x={W - L - 230} y={Y.ingress + 12} w={210} h={BH} label="PT Auth Service" sub="tenant identity · TPM budget" type="custom" />

        {/* ROUTING */}
        <RowLabel x={L} y={Y.routing - 2} text="ROUTING" />
        <line x1={L} y1={Y.routing + 2} x2={W - L} y2={Y.routing + 2} stroke={C.border} />
        <Box x={L + 10} y={Y.routing + 12} w={110} h={BH} label="HTTPRoute" type="gateway" />
        <Box x={L + 135} y={Y.routing + 12} w={145} h={BH} label="InferencePool" sub="per-tenant" type="gateway" />
        <Box x={W - L - BW - 10} y={Y.routing + 12} w={BW} h={BH} label="llm-d EPP" sub="cache · queue scoring" type="upstream" />

        {/* SERVING */}
        <RowLabel x={L} y={Y.serving - 2} text="SERVING" />
        <line x1={L} y1={Y.serving + 2} x2={W - L} y2={Y.serving + 2} stroke={C.border} />
        <Box x={L + 20} y={Y.serving + 12} w={200} h={BH} label="LLMInferenceService" sub="KServe v0.17" type="upstream" />
        <Box x={W - L - 240} y={Y.serving + 12} w={220} h={BH} label="vLLM on H100 NVL" sub="fixed replicas · per-request metrics" type="upstream" />

        {/* ISOLATION + MANAGEMENT */}
        <RowLabel x={L} y={Y.iso - 2} text="ISOLATION" />
        <RowLabel x={W / 2 + 20} y={Y.iso - 2} text="RESERVATION MGMT" />
        <line x1={L} y1={Y.iso + 2} x2={W - L} y2={Y.iso + 2} stroke={C.border} />
        <Box x={L + 10} y={Y.iso + 12} w={140} h={BH} label="Namespace + Quota" type="infra" />
        <Box x={L + 165} y={Y.iso + 12} w={140} h={BH} label="Tainted PT Nodes" type="infra" />
        <Box x={W / 2 + 30} y={Y.iso + 12} w={130} h={BH} label="PT CRD" sub="reservation spec" type="custom" />
        <Box x={W - L - 140} y={Y.iso + 12} w={120} h={BH} label="Reservation Mgr" sub="generates YAML" type="custom" />

        {/* OBSERVABILITY */}
        <RowLabel x={L} y={Y.obs - 2} text="OBSERVABILITY" />
        <line x1={L} y1={Y.obs + 2} x2={W - L} y2={Y.obs + 2} stroke={C.border} />
        <Box x={L + 5} y={Y.obs + 12} w={100} h={BH} label="DCGM" sub="GPU metrics" type="upstream" />
        <Box x={L + 115} y={Y.obs + 12} w={110} h={BH} label="vLLM /metrics" sub="tokens · TTFT" type="upstream" />
        <Box x={L + 240} y={Y.obs + 12} w={95} h={BH} label="Prometheus" type="gateway" />
        <Box x={L + 350} y={Y.obs + 12} w={120} h={BH} label="Grafana" sub="dashboards" type="custom" />
        <Box x={W - L - 135} y={Y.obs + 12} w={115} h={BH} label="Billing" sub="token aggregation" type="custom" />

        {/* === REQUEST FLOW ARROWS (solid, clean L-shapes) === */}
        {/* Client down to Gateway */}
        <Arr d={`M${W / 2},${Y.client + 30} L${W / 2},${Y.ingress + 12 + BH / 2} L${L + 230},${Y.ingress + 12 + BH / 2}`} />
        {/* Gateway right to Auth */}
        <Arr d={`M${L + 235},${Y.ingress + 30} L${W - L - 230},${Y.ingress + 30}`} />
        {/* Gateway down to HTTPRoute */}
        <Arr d={`M${L + 125},${Y.ingress + 12 + BH} L${L + 125},${Y.routing + 12}`} />
        {/* HTTPRoute right to Pool */}
        <Arr d={`M${L + 120},${Y.routing + 30} L${L + 135},${Y.routing + 30}`} />
        {/* Pool right to EPP */}
        <Arr d={`M${L + 280},${Y.routing + 30} L${W - L - BW - 10},${Y.routing + 30}`} />
        {/* EPP down to vLLM */}
        <Arr d={`M${W - L - BW / 2 - 10},${Y.routing + 12 + BH} L${W - L - BW / 2 - 10},${Y.serving + 12}`} />
        {/* vLLM down to Namespace */}
        <Arr d={`M${L + 120},${Y.serving + 12 + BH} L${L + 80},${Y.iso + 12}`} />

        {/* === DASHED: Reservation Manager generates LLMInferenceService YAML === */}
        {/* Res Mgr → LLMInferenceService (generates YAML, KServe reconciles the rest) */}
        <Arr d={`M${W - L - 80},${Y.iso + 12} L${W - L - 80},${Y.serving + 12 + BH + 4} L${L + 220},${Y.serving + 30}`} dash />
        {/* Res Mgr → Grafana dashboards */}
        <Arr d={`M${W - L - 80},${Y.iso + 12 + BH} L${W - L - 80},${Y.obs + 30} L${L + 470},${Y.obs + 30}`} dash />

        {/* === KServe auto-provisions routing from LLMInferenceService === */}
        <Arr d={`M${L + 120},${Y.serving + 12} L${L + 120},${Y.routing + 12 + BH + 4} L${L + 135 + 72},${Y.routing + 12 + BH + 4}`} dash />

        {/* === OBSERVABILITY ARROWS (simple left to right) === */}
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
          <text x={380} y={9} fill={C.textMid} fontSize={9} fontFamily="Helvetica Neue,Arial,sans-serif">Operator provisions</text>
        </g>
      </svg>
    </div>
  );
}
