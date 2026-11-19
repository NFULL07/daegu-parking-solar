import { useMemo, useState } from 'react';
import { Params, Site } from '../lib/calc';
import { fmt, TIER_HEX } from '../lib/store';

interface Props { sites: Site[]; sido: string; params: Params; onPick: (id: string) => void }

// 시민용: 우리 구·군 공영주차장에 태양광을 올리면 생기는 변화(기대효과)
export default function CitizenSection({ sites, sido, params, onPick }: Props) {
  const lots = useMemo(() => sites.filter((s) => s.group === 'mandate' && s.tier !== '제외(현장 확인)'), [sites]);
  const gus = useMemo(() => {
    const m = new Map<string, number>();
    lots.forEach((s) => m.set(s.gu, (m.get(s.gu) ?? 0) + s.cap_kw));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
  }, [lots]);
  const [gu, setGu] = useState('');
  const pick = gu && gus.includes(gu) ? gu : '';
  const xs = pick ? lots.filter((s) => s.gu === pick) : lots;
  const gen = xs.reduce((t, s) => t + s.gen_mwh, 0);
  const co2 = xs.reduce((t, s) => t + s.co2_t, 0);
  const hhYear = params.household_kwh_month * 12;
  const households = (gen * 1000) / hhYear;
  const first = xs.filter((s) => s.tier === '1단계').length;
  const review = xs.filter((s) => s.tier === '현장 검토').length;
  const t1co2 = xs.filter((s) => s.tier === '1단계').reduce((t, s) => t + s.co2_t, 0);
  const r10 = (v: number) => Math.round(v / 10) * 10;
  const top = [...xs].sort((a, b) => b.cap_kw - a.cap_kw).slice(0, 5);
  const place = pick ? `${sido.replace(/(광역시|특별시|특별자치시|특별자치도)$/, '')} ${pick}` : sido;

  return (
    <section className="card citizen" id="local">
      <div className="sec-head">
        <h2>우리 구·군에서는</h2>
        <p>구·군을 고르면 그 지역 공영주차장에 태양광을 올렸을 때 한 해 동안 생기는 변화를 보여줍니다. 모두 설치를 가정한 기대효과입니다.</p>
      </div>
      <div className="gu-pick" role="group" aria-label="구·군 선택">
        <button className={pick === '' ? 'on' : ''} onClick={() => setGu('')}>{sido} 전체</button>
        {gus.map((g) => <button key={g} className={pick === g ? 'on' : ''} onClick={() => setGu(g)}>{g}</button>)}
      </div>
      <div className="citizen-body">
        <p className="citizen-say">
          {place} 공영주차장 <b>{fmt(xs.length)}곳</b>에 태양광 지붕을 올리면 한 해 약 <b>{fmt(r10(gen))}MWh</b>의 전기를 만들 수 있습니다.
          {' '}4인 가구 약 <b>{fmt(r10(households))}가구</b>가 1년 동안 쓰는 양이고,
          {' '}온실가스는 한 해 약 <b>{fmt(r10(co2))}톤</b>(tCO2eq) 줄일 수 있습니다. <span className="tag est">기대효과·추정</span>
        </p>
        <dl className="citizen-nums">
          <div><dt>대상 주차장</dt><dd>{fmt(xs.length)}곳<span>주차구획 {fmt(xs.reduce((t, x) => t + x.stalls, 0))}면</span></dd></div>
          <div><dt>설치용량</dt><dd>{fmt(xs.reduce((t, x) => t + x.cap_kw, 0) / 1000, 2)}MW<span>설치의무 기준 상한</span></dd></div>
          <div><dt>먼저 설치 제안</dt><dd>{fmt(first)}곳<span>{first ? `이 곳만 해도 한 해 약 ${fmt(r10(t1co2))}톤 감축` : '이 지역에는 1단계 대상지가 없습니다'}</span></dd></div>
          <div><dt>현장 확인 필요</dt><dd>{fmt(review)}곳<span>둔치, 임시 주차장, 주차빌딩 등</span></dd></div>
        </dl>
        <div className="citizen-list">
          <div className="small muted">{pick ? `${pick}에서` : '전체에서'} 설치용량이 큰 주차장</div>
          <ol>
            {top.map((s) => (
              <li key={s.id}>
                <button className="link" onClick={() => onPick(s.id)}>{s.name}</button>
                <span className="muted small"> {pick ? '' : `${s.gu}, `}{fmt(s.stalls)}면, {fmt(s.gen_mwh)}MWh/년</span>
                <span className="tier-mark"><i style={{ background: TIER_HEX[s.tier ?? 'under'] }} />{s.tier}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <p className="muted small">
        4인 가구 환산은 정부 전기요금 발표(2023년 5월)에서 쓴 4인 가구 월평균 {fmt(params.household_kwh_month)}kWh, 연 {fmt(hhYear)}kWh 기준입니다.
        {' '}온실가스는 발전량에 전력배출계수 {params.ef}tCO2eq/MWh를 곱한 값입니다. 실제 설치·운영 실적이 아닌 추정치입니다.
      </p>
    </section>
  );
}
