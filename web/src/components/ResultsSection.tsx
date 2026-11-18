import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DedupLog, Override, Params, Site, Summary, Tier, toCsv, yieldValue } from '../lib/calc';
import { Meta } from '../lib/types';
import { C, download, fmt, TIER_COLOR } from '../lib/store';

interface Props {
  sites: Site[]; sm: Summary; meta: Meta; isDaegu: boolean; dedup: DedupLog[]; sido: string; params: Params;
  overrides: Record<string, Override>; setOverrides: (u: (p: Record<string, Override>) => Record<string, Override>) => void;
  onSelect: (id: string) => void;
}

const TIER_ROWS: { t: Tier; rule: string }[] = [
  { t: '1단계', rule: '제약 표기 없음, 용량 큰 순으로 누적 50%까지' },
  { t: '2단계', rule: '제약 표기 없음, 나머지' },
  { t: '현장 검토', rule: '둔치·천변, 임시, 주차빌딩, 지하, 부설' },
  { t: '문턱(대상 가능)', rule: '1,000㎡ 미만 추정이나 확장형·장애인 구획이 섞이면 넘을 수 있음' },
  { t: '문턱 구간', rule: '875~1,000㎡ 추정, 실제 면적 확인 권장' },
  { t: '제외(현장 확인)', rule: '현장 확인으로 설치 불가 처리' },
];

export default function ResultsSection({ sites, sm, meta, isDaegu, dedup, sido, params, overrides, setOverrides, onSelect }: Props) {
  const [q, setQ] = useState('');
  const [tierF, setTierF] = useState<string>('대상');
  const [sortK, setSortK] = useState<'cap' | 'name' | 'gu'>('cap');
  const [showDedup, setShowDedup] = useState(false);
  const y = yieldValue(params);

  const list = useMemo(() => {
    let xs = sites.filter((s) => s.group !== 'under');
    if (tierF === '대상') xs = xs.filter((s) => s.group === 'mandate');
    else if (tierF) xs = xs.filter((s) => s.tier === tierF);
    if (q) xs = xs.filter((s) => (s.name + s.gu + s.address).includes(q));
    const k = sortK;
    return [...xs].sort((a, b) => (k === 'cap' ? b.cap_kw - a.cap_kw : k === 'name' ? a.name.localeCompare(b.name, 'ko') : a.gu.localeCompare(b.gu, 'ko') || b.cap_kw - a.cap_kw));
  }, [sites, q, tierF, sortK]);

  const exportCsv = () => {
    const head = ['순위', '단계', '주차장명', '구·군', '유형', '주소', '주차구획(면)', '면적(㎡)', '면적 근거', '설치용량(kW)', '연 발전량(MWh)', '연 감축량(tCO2eq)', '제약 표기', '현장 확인', '제공기관', '데이터 기준일', '위도', '경도'];
    const rows = list.map((s) => [s.rank ?? '', s.tier ?? '', s.name, s.gu, s.type, s.address, s.stalls, Math.round(s.area_m2), s.areaActual ? '실측 입력' : '구획수 추정',
      Math.round(s.cap_kw * 10) / 10, Math.round(s.gen_mwh * 10) / 10, Math.round(s.co2_t * 10) / 10, s.autoFlags.join(' / '),
      s.status === 'exclude' ? '설치 불가' : s.status === 'confirm' ? '설치 가능 확인' : '', s.provider, s.dataDate, s.lat, s.lon]);
    const note = [[`# ${sido} 공영주차장 태양광 설치의무 분석 결과(추정치). 발전량 ${y}kWh/kW, 배출계수 ${params.ef}tCO2eq/MWh, 구획 ${params.stall_m2}㎡ 기준. 생성 ${new Date().toISOString().slice(0, 10)}`]];
    download(`${sido}_공영주차장_태양광_대상_${new Date().toISOString().slice(0, 10)}.csv`, toCsv([...note, head, ...rows]));
  };

  const guData = sm.byGu.map((g) => ({ gu: g.gu, mw: Math.round(g.cap_mw * 100) / 100, sites: g.sites }));
  const top3 = guData.slice(0, 3).reduce((t, g) => t + g.mw, 0);
  const setOv = (id: string, st: string) =>
    setOverrides((prev) => { const n = { ...prev }; const o = { ...n[id], status: (st || undefined) as Override['status'] }; if (o.status || o.area_m2) n[id] = o; else delete n[id]; return n; });

  return (
    <section className="card">
      <div className="sec-head">
        <h2>2. 기대효과와 설치 순서</h2>
        <p>대상 {fmt(sm.mandate.sites)}곳에 의무 용량을 모두 설치하면 연 <b>{fmt(sm.mandate.gen_gwh, 1)}GWh</b> 발전, 온실가스 <b>{fmt(sm.mandate.co2_t / 1000, 1)}천 tCO2eq</b> 감축이 예상됩니다 <span className="tag est">기대효과·추정</span></p>
      </div>

      <div className="grid2">
        <div>
          <h3>구·군별 설치용량</h3>
          <p className="muted small">상위 3곳 {fmt(top3, 2)}MW, 전체의 {fmt((top3 / (sm.mandate.cap_mw || 1)) * 100)}%</p>
          <div style={{ height: Math.max(220, guData.length * 30 + 30) }}>
            <ResponsiveContainer>
              <BarChart data={guData} layout="vertical" margin={{ left: 8, right: 90, top: 4, bottom: 4 }} barCategoryGap={6}>
                <CartesianGrid horizontal={false} stroke={C.grid} />
                <XAxis type="number" tick={{ fontSize: 12, fill: C.ink2 }} unit="MW" axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="gu" width={60} tick={{ fontSize: 13, fill: C.ink }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number, _n, p) => [`${fmt(v, 2)}MW · ${(p.payload as { sites: number }).sites}곳`, '설치용량']} cursor={{ fill: C.hover }} />
                <Bar dataKey="mw" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  {guData.map((g, i) => <Cell key={g.gu} fill={i < 3 ? C.blue : C.muted} />)}
                  <LabelList dataKey="mw" position="right" formatter={(v: number) => `${fmt(v, 2)}MW`} style={{ fontSize: 12, fill: C.ink2 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <h3>단계별 정리</h3>
          <table className="tbl">
            <thead><tr><th>단계</th><th className="num">곳</th><th className="num">MW</th><th className="num">GWh/년</th></tr></thead>
            <tbody>
              {TIER_ROWS.filter((r) => sm.byTier[r.t].sites > 0 || r.t !== '제외(현장 확인)').map((r) => (
                <tr key={r.t} title={r.rule}>
                  <td><span className="dot" style={{ background: TIER_COLOR[r.t] }} />{r.t}<div className="muted small">{r.rule}</div></td>
                  <td className="num">{fmt(sm.byTier[r.t].sites)}</td>
                  <td className="num">{fmt(sm.byTier[r.t].cap_mw, 2)}</td>
                  <td className="num">{fmt(sm.byTier[r.t].gen_gwh, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {isDaegu && (
            <div className="compare">
              <div><span className="muted small">이 분석</span><b>{fmt(sm.mandate.sites)}곳 · {fmt(sm.mandate.cap_mw, 2)}MW</b></div>
              <div><span className="muted small">대구시 계획 (<a href={meta.city_plan.url} target="_blank" rel="noreferrer">{meta.city_plan.source}</a>)</span><b>{meta.city_plan.sites}곳 · {meta.city_plan.mw}MW</b></div>
            </div>
          )}
          <p className="small">
            같은 주차장이 시와 구·군에 이중 등록된 <b>{dedup.length}건</b>을 제외했습니다.{' '}
            {dedup.length > 0 && <button className="link" onClick={() => setShowDedup(!showDedup)}>{showDedup ? '접기' : '목록 보기'}</button>}
          </p>
          {showDedup && (
            <ul className="small dedup">
              {dedup.map((d) => <li key={d.dropped + d.kept}>{d.dropped}({d.dropped_stalls}면) → {d.kept}({d.kept_stalls}면, {d.kept_provider}) {d.distance_m}m</li>)}
            </ul>
          )}
        </div>
      </div>

      <h3 className="mt">대상지 목록 <span className="muted small">{fmt(list.length)}곳</span></h3>
      <div className="filters">
        <input placeholder="주차장명·주소 검색" value={q} onChange={(e) => setQ(e.target.value)} aria-label="검색" />
        <select value={tierF} onChange={(e) => setTierF(e.target.value)} aria-label="단계">
          <option value="대상">의무 대상 전체</option>
          <option value="">문턱 포함 전체</option>
          {TIER_ROWS.map((r) => <option key={r.t} value={r.t}>{r.t}</option>)}
        </select>
        <select value={sortK} onChange={(e) => setSortK(e.target.value as 'cap')} aria-label="정렬">
          <option value="cap">용량 큰 순</option><option value="gu">구·군 순</option><option value="name">이름 순</option>
        </select>
        <button onClick={exportCsv}>CSV 내려받기(엑셀용)</button>
      </div>
      <div className="tbl-wrap">
        <table className="tbl sites">
          <thead><tr><th className="num">순위</th><th>주차장</th><th>구·군</th><th className="num">면</th><th className="num">kW</th><th className="num">MWh/년</th><th>단계·제약</th><th>현장 확인</th></tr></thead>
          <tbody>
            {list.slice(0, 300).map((s) => (
              <tr key={s.id}>
                <td className="num">{s.rank ?? ''}</td>
                <td><button className="link" onClick={() => onSelect(s.id)}>{s.name}</button>{s.areaActual && <span className="tag ok">실측</span>}</td>
                <td>{s.gu}</td>
                <td className="num">{fmt(s.stalls)}</td>
                <td className="num">{fmt(s.cap_kw)}</td>
                <td className="num">{fmt(s.gen_mwh)}</td>
                <td><span className="dot" style={{ background: s.tier ? TIER_COLOR[s.tier] : 'var(--c-under)' }} />{s.tier}{s.autoFlags.length > 0 && <div className="muted small">{s.autoFlags.join(', ')}</div>}</td>
                <td>
                  <select value={overrides[s.id]?.status ?? ''} onChange={(e) => setOv(s.id, e.target.value)} aria-label={`${s.name} 현장 확인`}>
                    <option value="">자동</option><option value="confirm">설치 가능</option><option value="exclude">설치 불가</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">면적은 주차구획수 x {params.stall_m2}㎡ 추정, 설치용량은 면적 x {params.kw_per_m2}kW/㎡(설치의무 기준), 발전량은 {fmt(y)}kWh/kW 기준입니다. 설치 불합리 구획을 빼지 않은 상한값입니다.</p>
    </section>
  );
}
