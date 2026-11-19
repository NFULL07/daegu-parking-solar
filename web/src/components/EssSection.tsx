import { useMemo, useState } from 'react';
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { essAnnual, essDay, essSimulate, ESS_MODES, Params } from '../lib/calc';
import { EssInputs } from '../lib/types';
import { C, fmt } from '../lib/store';

interface Props { essIn: EssInputs; pvMw: number; params: Params; setParams: (u: (p: Params) => Params) => void; sido: string }

export default function EssSection({ essIn, pvMw, params, setParams }: Props) {
  const ratio = params.ess_ratio, eta = params.eta;
  const set = (k: 'ess_ratio' | 'eta', v: number) => setParams((p) => ({ ...p, [k]: v }));
  const sim = useMemo(() => essSimulate(essIn.days263, pvMw, ratio, eta), [essIn, pvMw, ratio, eta]);
  const an = useMemo(() => essAnnual(essIn.days365_window_per_mw, pvMw, ratio, eta, params.ev_kwh), [essIn, pvMw, ratio, eta, params.ev_kwh]);
  const base = sim.modes.none.shortfall;
  const bars = ESS_MODES.map((m) => ({ key: m.key, name: m.label, v: sim.modes[m.key].shortfall, days: sim.modes[m.key].shortfall_days,
    cut: base > 0 ? 1 - sim.modes[m.key].shortfall / base : 0 }));
  const best = [...bars].sort((a, b) => a.v - b.v)[0];

  const dates = useMemo(() => Object.keys(essIn.hourly_per_mw).sort(), [essIn]);
  const winSum = (d: string) => essIn.hourly_per_mw[d].slice(10, 17).reduce((t, v) => t + v, 0);
  const presets = useMemo(() => {
    const xs = dates.map((d) => ({ d, w: winSum(d) })).sort((a, b) => a.w - b.w);
    return { 맑은날: xs[xs.length - 1].d, 보통날: xs[Math.floor(xs.length / 2)].d, 흐린날: xs[Math.floor(xs.length * 0.1)].d };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates]);
  const [day, setDay] = useState(presets.보통날);
  const hours = essDay(essIn.hourly_per_mw[day], pvMw, ratio, eta, essIn.charge_hours, essIn.discharge_hours)
    .filter((h) => h.hh >= 5 && h.hh <= 21)
    .map((h) => ({ hh: `${h.hh}시`, 태양광: h.pv, 'ESS 충전': h.charge, 'ESS 방전': h.discharge, '저장량': h.soc }));

  return (
    <section className="card" id="ess">
      <div className="sec-head">
        <h2>ESS 운영 시뮬레이터 <span className="tag sim">시뮬레이션</span></h2>
        <p>대상 주차장 태양광({fmt(pvMw, 2)}MW)에 ESS를 붙여 낮 10~17시에 충전하고 저녁 18~21시(2026년 개편 최고요금 구간)에 방전합니다. 전날 14시 예측으로 다음 날 저녁 공급량을 약속했을 때 얼마나 모자라는지 비교합니다.</p>
      </div>
      <div className="controls">
        <label className="field">ESS 용량 <b>{fmt(pvMw * ratio, 1)}MWh <span className="muted">(설비 {fmt(ratio, 2)}시간분)</span></b>
          <input type="range" min={0.25} max={3} step={0.25} value={ratio} onChange={(e) => set('ess_ratio', Number(e.target.value))} />
        </label>
        <label className="field">ESS 종합효율 <b>{fmt(eta * 100)}%</b>
          <input type="range" min={0.5} max={0.95} step={0.01} value={eta} onChange={(e) => set('eta', Number(e.target.value))} />
          <span className="muted small">실측 평균 66%, 최고 71% (윤금란 외 2019)</span>
        </label>
      </div>

      <div className="stats">
        <div><span className="muted small">낮에 꽉 차는 날</span><b>{fmt(sim.full_charge_share * 100, 1)}%</b></div>
        <div><span className="muted small">연간 저녁 공급 가능량</span><b>{fmt(an.supply)}MWh</b></div>
        <div><span className="muted small">충방전 손실</span><b>{fmt(an.loss)}MWh</b></div>
        <div><span className="muted small">전기차 충전 환산</span><b>약 {fmt(an.ev_sessions / 10000, 1)}만 회</b></div>
      </div>
      <p className="note">
        {sim.full_charge_share >= 0.9
          ? `이 규모에서는 ${fmt(sim.full_charge_share * 100)}%의 날에 낮 태양광만으로 ESS가 꽉 찹니다. 예측 없이 고정 시간표로 운영해도 결과가 거의 같습니다.`
          : `꽉 차지 않는 날이 ${fmt((1 - sim.full_charge_share) * 100)}%라 예측이 의미가 있습니다. 가장 부족이 적은 방식은 "${best.name}"입니다(예측 없음 대비 -${fmt(best.cut * 100)}%).`}
      </p>

      <div className="grid2">
        <div>
          <h3>계획 방식별 저녁 공급 부족 <span className="muted small">2025년 {sim.n_days}일 합계</span></h3>
          <div style={{ height: 230 }}>
            <ResponsiveContainer>
              <BarChart data={bars} layout="vertical" margin={{ left: 8, right: 120, top: 4, bottom: 4 }} barCategoryGap={8}>
                <CartesianGrid horizontal={false} stroke={C.grid} />
                <XAxis type="number" tick={{ fontSize: 12, fill: C.ink2 }} unit="MWh" axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12, fill: C.ink }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number, _n, p) => [`${fmt(v, 1)}MWh, ${(p.payload as { days: number }).days}일`, '부족량']} cursor={{ fill: C.hover }} />
                <Bar dataKey="v" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  {bars.map((b) => <Cell key={b.key} fill={b.key === best.key ? C.blue : C.muted} />)}
                  <LabelList dataKey="v" position="right" style={{ fontSize: 12, fill: C.ink2 }}
                    formatter={(v: number) => `${fmt(v)}MWh`} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="tbl small">
            <thead><tr><th>계획 방식</th><th className="num">약속량</th><th className="num">지킨 양</th><th className="num">부족</th><th className="num">부족일</th></tr></thead>
            <tbody>
              {ESS_MODES.map((m) => (
                <tr key={m.key}><td>{m.label}</td><td className="num">{fmt(sim.modes[m.key].committed)}</td><td className="num">{fmt(sim.modes[m.key].reliable)}</td>
                  <td className="num">{fmt(sim.modes[m.key].shortfall)}</td><td className="num">{sim.modes[m.key].shortfall_days}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">단위 MWh. 안전 계획은 하위 20% 분위수 예측으로 약속량을 잡는 방식입니다(공식 예측은 같은 여유율 적용). 부족분은 저녁에 계통 전력으로 메워야 하는 양입니다. ESS는 충방전 손실이 있어 온실가스 추가 감축으로 계산하지 않습니다.</p>
        </div>
        <div>
          <h3>하루 운영 예시</h3>
          <div className="filters">
            {(Object.keys(presets) as (keyof typeof presets)[]).map((k) => (
              <button key={k} className={day === presets[k] ? '' : 'ghost'} onClick={() => setDay(presets[k])}>{k}</button>
            ))}
            <select value={day} onChange={(e) => setDay(e.target.value)} aria-label="날짜">{dates.map((d) => <option key={d}>{d}</option>)}</select>
          </div>
          <div style={{ height: 300 }}>
            <ResponsiveContainer>
              <ComposedChart data={hours} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="hh" tick={{ fontSize: 12, fill: C.ink2 }} tickLine={false} axisLine={{ stroke: C.grid }} />
                <YAxis tick={{ fontSize: 12, fill: C.ink2 }} tickLine={false} axisLine={false} width={40} />
                <Tooltip formatter={(v: number) => `${fmt(v, 1)}MWh`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="태양광" stroke={C.mutedDark} fill={C.muted} fillOpacity={0.5} isAnimationActive={false} />
                <Bar dataKey="ESS 충전" fill={C.blueLight} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="ESS 방전" fill={C.ink2} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Line type="linear" dataKey="저장량" stroke={C.blue} strokeWidth={2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="muted small">{day} 대구 전력거래소 실적 패턴을 설치용량 {fmt(pvMw, 2)}MW로 환산(완전 예측 가정). 단위 MWh.</p>
        </div>
      </div>
    </section>
  );
}
