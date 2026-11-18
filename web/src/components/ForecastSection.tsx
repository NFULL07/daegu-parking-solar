import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ForecastEval, ForecastRow } from '../lib/types';
import { C, fmt } from '../lib/store';

function Dumbbell({ ev }: { ev: ForecastEval }) {
  const rows = Object.entries(ev.by_month).map(([m, v]) => ({ m: Number(m), ...v }));
  const better = rows.filter((r) => r.ai_nMAE < r.ewp_nMAE).length;
  const W = 640, x0 = 92, w = 470, y0 = 34, step = 24, vmax = 9;
  const X = (v: number) => x0 + (v / vmax) * w;
  return (
    <figure className="fig">
      <figcaption>
        <b>12개월 중 {better}개월은 AI 오차가 더 작다</b>
        <span className="muted small"> · {rows.filter((r) => r.ai_nMAE >= r.ewp_nMAE).map((r) => `${r.m}월`).join('·')}은 더 큼</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${y0 + rows.length * step + 26}`} role="img" aria-label="월별 예측 오차 비교" className="svg">
        {[0, 2, 4, 6, 8].map((t) => (
          <g key={t}>
            <line x1={X(t)} x2={X(t)} y1={y0 - 12} y2={y0 + rows.length * step - 8} stroke={C.grid} />
            <text x={X(t)} y={y0 + rows.length * step + 10} textAnchor="middle" fontSize="11" fill={C.ink2}>{t}%</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const y = y0 + i * step, worse = r.ai_nMAE >= r.ewp_nMAE;
          return (
            <g key={r.m}>
              <text x={x0 - 12} y={y + 4} textAnchor="end" fontSize="12" fontWeight={worse ? 700 : 400} fill={worse ? C.ink : C.ink2}>
                {r.m}월{r.days < 5 ? ` (${r.days}일)` : ''}
              </text>
              <line x1={X(Math.min(r.ai_nMAE, r.ewp_nMAE))} x2={X(Math.max(r.ai_nMAE, r.ewp_nMAE))} y1={y} y2={y} stroke={C.grid} strokeWidth={3} />
              <circle cx={X(r.ewp_nMAE)} cy={y} r={6} fill={C.mutedDark} stroke="#fff" strokeWidth={2}><title>{`${r.m}월 공식 ${r.ewp_nMAE}% (${r.days}일)`}</title></circle>
              <circle cx={X(r.ai_nMAE)} cy={y} r={6} fill={C.blue} stroke="#fff" strokeWidth={2}><title>{`${r.m}월 AI ${r.ai_nMAE}% (${r.days}일)`}</title></circle>
              <text x={X(Math.max(r.ai_nMAE, r.ewp_nMAE)) + 12} y={y + 4} fontSize="11" fill={C.ink2}>{r.ewp_nMAE.toFixed(1)} → {r.ai_nMAE.toFixed(1)}</text>
            </g>
          );
        })}
      </svg>
      <div className="legend"><span><i style={{ background: C.mutedDark }} />공식 예측(한국동서발전)</span><span><i style={{ background: C.blue }} />AI 보정 예측</span></div>
    </figure>
  );
}

export default function ForecastSection({ ev, ts }: { ev: ForecastEval; ts: ForecastRow[] }) {
  const days = useMemo(() => {
    const m = new Map<string, ForecastRow[]>();
    ts.forEach((r) => m.set(r.date, [...(m.get(r.date) ?? []), r]));
    return m;
  }, [ts]);
  const stats = useMemo(() => [...days.entries()].map(([d, rs]) => ({
    d, act: rs.reduce((t, r) => t + r.actual, 0),
    gain: rs.reduce((t, r) => t + Math.abs(r.ewp - r.actual) - Math.abs(r.ai - r.actual), 0),
  })), [days]);
  const pick = (k: 'ai' | 'ewp' | 'clear' | 'cloudy') => {
    const xs = [...stats].sort((a, b) => k === 'ai' ? b.gain - a.gain : k === 'ewp' ? a.gain - b.gain : k === 'clear' ? b.act - a.act : a.act - b.act);
    return (k === 'cloudy' ? xs.find((x) => x.act > 50) : xs[0])!.d;
  };
  const [date, setDate] = useState(() => [...days.keys()].sort()[Math.floor(days.size / 2)]);
  const data = (days.get(date) ?? []).map((r) => ({ hh: `${r.hh}시`, 실적: r.actual, '공식 예측': r.ewp, 'AI 예측': r.ai }));
  const e = ev.hourly;

  return (
    <section className="card">
      <div className="sec-head">
        <h2>3. AI 하루 전 발전량 예측 <span className="tag ver">검증</span></h2>
        <p>전날 14시에 알 수 있는 예보 기상과 공식 예측을 입력으로, 대구 전체 태양광 발전량을 시간별로 예측했습니다. 공식 예측을 대체하지 않고 보정하는 모델입니다.</p>
      </div>
      <div className="grid2">
        <div>
          <table className="tbl">
            <thead><tr><th>지표 (설비용량 {ev.capacity_mw}MW 대비)</th><th className="num">공식 예측</th><th className="num">AI 보정</th></tr></thead>
            <tbody>
              <tr><td>시간 단위 평균 오차(nMAE)</td><td className="num">{e.official_ewp.nMAE_pct}%</td><td className="num b">{e.ai.nMAE_pct}%</td></tr>
              <tr><td>시간 단위 nRMSE</td><td className="num">{e.official_ewp.nRMSE_pct}%</td><td className="num">{e.ai.nRMSE_pct}%</td></tr>
              <tr><td>평균 편향</td><td className="num">{e.official_ewp.bias_pct}%</td><td className="num">+{e.ai.bias_pct}%</td></tr>
              <tr><td>실적과의 상관계수</td><td className="num">{e.official_ewp.r}</td><td className="num">{e.ai.r}</td></tr>
              <tr><td>하루 합계 오차</td><td className="num">{ev.daily_total_nMAE_pct.ewp}%</td><td className="num">{ev.daily_total_nMAE_pct.ai_nested}%</td></tr>
            </tbody>
          </table>
          <p className="small">
            오차 {ev.improvement.relative_pct}% 감소(−{ev.improvement.nMAE_pctpt}%p, 95% 신뢰구간 {ev.improvement.pctpt_95ci_day_bootstrap[0]}~{ev.improvement.pctpt_95ci_day_bootstrap[1]}%p).
            검증: {ev.n_days}일 · {fmt(ev.n_hours)}시간, 한 달씩 빼고 학습하는 중첩 교차검증. {ev.model.type}.
          </p>
          <Dumbbell ev={ev} />
        </div>
        <div>
          <h3>하루씩 보기</h3>
          <div className="filters">
            <select value={date} onChange={(e) => setDate(e.target.value)} aria-label="날짜">
              {[...days.keys()].sort().map((d) => <option key={d}>{d}</option>)}
            </select>
            <button className="ghost" onClick={() => setDate(pick('ai'))}>AI가 가장 나았던 날</button>
            <button className="ghost" onClick={() => setDate(pick('ewp'))}>공식이 가장 나았던 날</button>
            <button className="ghost" onClick={() => setDate(pick('cloudy'))}>흐린 날</button>
          </div>
          <div style={{ height: 300 }}>
            <ResponsiveContainer>
              <LineChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="hh" tick={{ fontSize: 12, fill: C.ink2 }} tickLine={false} axisLine={{ stroke: C.grid }} />
                <YAxis tick={{ fontSize: 12, fill: C.ink2 }} tickLine={false} axisLine={false} unit="" width={40} />
                <Tooltip formatter={(v: number) => `${fmt(v, 1)}MWh`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="실적" stroke={C.ink} strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="공식 예측" stroke={C.mutedDark} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="AI 예측" stroke={C.blue} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="muted small">단위 MWh, 대구 전력거래소 등록 태양광 전체({ev.capacity_mw}MW). 시각은 시작 시각. 이 값은 교차검증 중 해당 달을 빼고 학습한 모델의 예측입니다.</p>
        </div>
      </div>
    </section>
  );
}
