import { useMemo } from 'react';
import { Site, Summary } from '../lib/calc';
import { fmt, TIER_HEX } from '../lib/store';
import { ForecastEval } from '../lib/types';

// 대상 주차장을 주차칸처럼 그린다: 칸 너비 = 설치용량, 색 = 제안 단계
const ORDER = ['1단계', '2단계', '현장 검토'] as const;
const W = 640, ROW_H = 58, GAP = 18, ROWS = 5;

interface Props { sites: Site[]; sm: Summary; ev: ForecastEval; sido: string; isDaegu: boolean; cityPlan: { sites: number; mw: number }; onPick: (id: string) => void }

export default function Hero({ sites, sm, ev, sido, isDaegu, cityPlan, onPick }: Props) {
  const lots = useMemo(() => sites
    .filter((s) => s.group === 'mandate' && s.tier !== '제외(현장 확인)')
    .sort((a, b) => ORDER.indexOf(a.tier as typeof ORDER[number]) - ORDER.indexOf(b.tier as typeof ORDER[number]) || b.cap_kw - a.cap_kw), [sites]);
  const total = lots.reduce((t, s) => t + s.cap_kw, 0) || 1;
  // 줄 단위로 채우되 칸이 줄을 넘으면 다음 줄로. 줄 수가 ROWS를 넘지 않도록 칸 너비 배율을 조금씩 줄인다
  const pack = (scale: number) => {
    const out: { s: Site; x: number; row: number; w: number }[] = [];
    let x = 0, row = 0;
    for (const s of lots) {
      const w = Math.min(W, Math.max(3, s.cap_kw * scale));
      if (x + w > W + 0.5 && x > 0) { row += 1; x = 0; }
      out.push({ s, x, row, w });
      x += w;
    }
    return { out, row };
  };
  let scale = (W * ROWS) / total;
  let packed = pack(scale);
  for (let i = 0; i < 40 && packed.row + 1 > ROWS; i++) { scale *= 0.985; packed = pack(scale); }
  const placed = packed.out, row = packed.row;
  const rows = row + 1;
  const H = rows * (ROW_H + GAP);
  const t1 = sm.byTier['1단계'], t2 = sm.byTier['2단계'], rv = sm.byTier['현장 검토'];

  return (
    <section className="hero" aria-label="핵심 결과">
      <div className="hero-inner">
        <div className="hero-text">
          <h1>{sido} 공영주차장 {fmt(sm.mandate.sites)}곳에 태양광을 올리면, 어디부터 시작할까</h1>
          <p className="hero-lead">
            설치의무 대상 후보 {fmt(sm.mandate.sites)}곳, 설치용량 최대 {fmt(sm.mandate.cap_mw, 2)}MW{isDaegu ? `. 대구시 계획은 ${cityPlan.sites}곳 ${cityPlan.mw}MW입니다.` : '.'}
          </p>
          <dl className="facts">
            <div>
              <dt><span className="num">{fmt(t1.sites)}곳</span></dt>
              <dd>먼저 설치하면 제약 없는 대상지 용량의 절반, {fmt(t1.cap_mw, 2)}MW <span className="tag est">추정</span></dd>
            </div>
            <div>
              <dt><span className="num">{fmt(rv.sites)}곳</span></dt>
              <dd>둔치, 임시 주차장, 주차빌딩 등이라 현장 확인이 먼저, {fmt(rv.cap_mw, 2)}MW <span className="tag est">추정</span></dd>
            </div>
            <div>
              <dt><span className="num">{ev.hourly.ai.nMAE_pct}%</span></dt>
              <dd>AI 하루 전 발전량 예측 오차. 한국동서발전 공식 예측은 {ev.hourly.official_ewp.nMAE_pct}% <span className="tag ver">검증</span></dd>
            </div>
          </dl>
        </div>
        <figure className="lot">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`대상 ${lots.length}곳을 설치용량 너비의 주차칸으로 그린 그림`}>
            {Array.from({ length: rows }, (_, r) => (
              <line key={r} x1={0} x2={W} y1={r * (ROW_H + GAP) + ROW_H + GAP / 2} y2={r * (ROW_H + GAP) + ROW_H + GAP / 2}
                stroke="#f2b705" strokeOpacity={0.55} strokeDasharray="14 10" strokeWidth={2} />
            ))}
            {placed.map(({ s, x: px, row: r, w }) => (
              <g key={s.id} className="stall" onClick={() => onPick(s.id)} tabIndex={0} role="button" aria-label={`${s.name}, ${fmt(s.cap_kw)}kW, ${s.tier}`}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(s.id); } }}>
                <rect x={px + 1.5} y={r * (ROW_H + GAP) + 2} width={Math.max(1, w - 3)} height={ROW_H - 4} rx={2}
                  fill={TIER_HEX[s.tier ?? 'under']} />
                <line x1={px} x2={px} y1={r * (ROW_H + GAP)} y2={r * (ROW_H + GAP) + ROW_H} stroke="#f4f6f6" strokeWidth={1.5} />
                <title>{`${s.name} (${s.gu}) ${fmt(s.cap_kw)}kW, ${s.tier}`}</title>
              </g>
            ))}
          </svg>
          <figcaption>
            <span><i style={{ background: TIER_HEX['1단계'] }} />1단계 {fmt(t1.sites)}곳</span>
            <span><i style={{ background: TIER_HEX['2단계'] }} />2단계 {fmt(t2.sites)}곳</span>
            <span><i style={{ background: TIER_HEX['현장 검토'] }} />현장 검토 {fmt(rv.sites)}곳</span>
            <span className="cap-note">칸 하나가 주차장 하나, 칸 너비가 설치용량입니다. 칸을 누르면 지도에서 열립니다.</span>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
