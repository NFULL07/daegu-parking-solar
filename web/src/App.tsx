import { useEffect, useMemo, useState } from 'react';
import { buildSites, classify, Override, Params, publicLots, RawRow, selectSido, summarize } from './lib/calc';
import { download, fmt, getJson, useStored } from './lib/store';
import { Meta, ForecastEval, ForecastRow, EssInputs, CityGeo } from './lib/types';
import MapSection from './components/MapSection';
import ResultsSection from './components/ResultsSection';
import ForecastSection from './components/ForecastSection';
import EssSection from './components/EssSection';
import AssumptionsPanel from './components/AssumptionsPanel';
import RegionLoader from './components/RegionLoader';
import Footer from './components/Footer';

const DAEGU = '대구광역시';

export interface Dataset { sido: string; rows: RawRow[]; uploaded: boolean; fileName?: string }

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [daegu, setDaegu] = useState<RawRow[] | null>(null);
  const [fc, setFc] = useState<{ ev: ForecastEval; ts: ForecastRow[] } | null>(null);
  const [essIn, setEssIn] = useState<EssInputs | null>(null);
  const [geo, setGeo] = useState<CityGeo | null>(null);
  const [err, setErr] = useState('');
  const [upload, setUpload] = useState<Dataset | null>(null);
  const [panel, setPanel] = useState<'' | 'params' | 'region'>('');
  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    Promise.all([
      getJson<Meta>('meta.json'), getJson<RawRow[]>('parking_daegu.json'), getJson<ForecastEval>('forecast_eval.json'),
      getJson<ForecastRow[]>('forecast_timeseries.json'), getJson<EssInputs>('ess_inputs.json'), getJson<CityGeo>('daegu_sigungu.json'),
    ]).then(([m, d, ev, ts, e, g]) => { setMeta(m); setDaegu(d); setFc({ ev, ts }); setEssIn(e); setGeo(g); })
      .catch((e) => setErr(String(e)));
  }, []);

  const defaults: Params | null = meta ? { ...meta.defaults, yieldKey: 'mid', yieldCustom: meta.defaults.yields.mid } : null;
  const [params, setParams] = useStored<Params>('params:v1', (defaults ?? ({} as Params)));
  const ds: Dataset | null = upload ?? (daegu ? { sido: DAEGU, rows: daegu, uploaded: false } : null);
  const [overrides, setOverrides] = useStored<Record<string, Override>>(`ov:v1:${ds?.sido ?? ''}:${ds?.uploaded ? 'u' : 'b'}`, {});

  const p: Params | null = defaults ? { ...defaults, ...params, yields: { ...defaults.yields, ...(params.yields ?? {}) } } : null;

  const prep = useMemo(() => {
    if (!ds || !p) return null;
    const sel = selectSido(ds.rows, ds.sido);
    const { lots, log } = publicLots(sel, ds.sido, p.dedup_radius_m);
    return { nRows: sel.length, base: buildSites(lots, ds.sido), log };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds?.rows, ds?.sido, p?.dedup_radius_m]);

  const sites = useMemo(() => (prep && p ? classify(prep.base, p, overrides) : []), [prep, JSON.stringify(p), overrides]);
  const sm = useMemo(() => summarize(sites), [sites]);

  if (err) return <div className="loading">데이터를 불러오지 못했습니다: {err}</div>;
  if (!meta || !ds || !p || !prep || !fc || !essIn) return <div className="loading">데이터를 불러오는 중…</div>;

  const isDaegu = ds.sido === DAEGU;
  const t1 = sm.byTier['1단계'], rv = sm.byTier['현장 검토'];
  const clean = t1.sites + sm.byTier['2단계'].sites;
  const ovCount = Object.values(overrides).filter((o) => o.status || o.area_m2).length;

  return (
    <div className="app">
      <header className="top">
        <div className="top-inner">
          <div>
            <div className="eyebrow">공공데이터 기반 분석 도구 · 2026 대구 기후·환경·탄소중립 공공데이터 AI 활용대회</div>
            <h1>공영주차장 태양광 설치의무, 어디부터 어떻게</h1>
            <p className="sub">
              {ds.sido} 공영주차장 {fmt(prep.nRows)}개 행에서 설치의무 대상을 고르고, 설치 순서와 ESS 운영을 계산합니다.
              {ds.uploaded && <> 불러온 파일: <b>{ds.fileName}</b></>}
            </p>
          </div>
          <div className="actions">
            <button onClick={() => setPanel('params')}>가정값 조정{defaults && JSON.stringify(p) !== JSON.stringify(defaults) ? ' ●' : ''}</button>
            <button onClick={() => setPanel('region')}>다른 지역 데이터</button>
            {ds.uploaded && <button className="ghost" onClick={() => { setUpload(null); setSelected(null); }}>대구 기본 데이터로</button>}
          </div>
        </div>
      </header>

      <main>
        <section className="kpis" aria-label="핵심 결과">
          <div className="kpi">
            <div className="kpi-label">설치의무 대상 후보 <span className="tag est">추정</span></div>
            <div className="kpi-value">{fmt(sm.mandate.sites)}곳 · {fmt(sm.mandate.cap_mw, 2)}MW</div>
            <div className="kpi-note">
              {fmt(sm.mandate.stalls)}면, 용량은 상한값
              {isDaegu && <> · 대구시 계획 {meta.city_plan.sites}곳·{meta.city_plan.mw}MW</>}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-label">1단계 설치 <span className="tag est">추정</span></div>
            <div className="kpi-value">{fmt(t1.sites)}곳이 용량 절반</div>
            <div className="kpi-note">제약 없는 {fmt(clean)}곳 중 {fmt(sm.tier1ShareOfClean * 100)}%가 {fmt(t1.cap_mw, 2)}MW</div>
          </div>
          <div className="kpi warn">
            <div className="kpi-label">현장 검토 필요 <span className="tag est">추정</span></div>
            <div className="kpi-value">{fmt(rv.sites)}곳 · {fmt(rv.cap_mw, 2)}MW</div>
            <div className="kpi-note">대상 용량의 {fmt((rv.cap_mw / (sm.mandate.cap_mw || 1)) * 100)}% · 둔치·임시·주차빌딩 등</div>
          </div>
          <div className="kpi accent">
            <div className="kpi-label">AI 하루 전 예측 오차 <span className="tag ver">검증</span></div>
            <div className="kpi-value">{fc.ev.improvement.relative_pct}% 감소</div>
            <div className="kpi-note">공식 {fc.ev.hourly.official_ewp.nMAE_pct}% → AI {fc.ev.hourly.ai.nMAE_pct}% (대구 2025)</div>
          </div>
        </section>

        {import.meta.env.VITE_NO_LOCAL_FONT && <div className="banner">미리보기 화면입니다. 지도 배경, CSV·작업 내용 파일 내려받기는 정식 주소(GitHub Pages)에서 동작합니다.</div>}
        {toast && <div className="banner" role="status">{toast} <button className="link" onClick={() => setToast('')}>닫기</button></div>}
        {ovCount > 0 && <div className="banner">현장 확인 결과 {ovCount}건이 반영된 계산입니다. 지도나 표에서 바꾸거나 되돌릴 수 있습니다.</div>}
        {ds.uploaded && <div className="banner">AI 예측과 ESS 시뮬레이션은 대구 2025년 실측 발전 패턴 기준입니다. {ds.sido}에는 참고용으로만 쓰세요. kW당 발전량도 가정값에서 지역에 맞게 바꿀 수 있습니다.</div>}

        <MapSection sites={sites} geo={isDaegu ? geo : null} selected={selected} onSelect={setSelected}
          overrides={overrides} setOverrides={setOverrides} params={p} />

        <ResultsSection sites={sites} sm={sm} meta={meta} isDaegu={isDaegu} dedup={prep.log} sido={ds.sido}
          params={p} overrides={overrides} setOverrides={setOverrides} onSelect={(id) => { setSelected(id); document.getElementById('map')?.scrollIntoView({ behavior: 'smooth' }); }} />

        <ForecastSection ev={fc.ev} ts={fc.ts} />

        <EssSection essIn={essIn} pvMw={sm.mandate.cap_mw} params={p} setParams={setParams} sido={ds.sido} />
      </main>

      <Footer meta={meta} />

      {panel === 'params' && defaults && (
        <AssumptionsPanel params={p} defaults={defaults} onChange={setParams} onClose={() => setPanel('')} sido={ds.sido} ovCount={ovCount}
          onResetOverrides={() => setOverrides(() => ({}))}
          onExport={() => download(`작업내용_${ds.sido}_${new Date().toISOString().slice(0, 10)}.json`,
            JSON.stringify({ app: 'daegu-parking-solar', version: 1, sido: ds.sido, saved: new Date().toISOString(), params: p, overrides }, null, 1), 'application/json')}
          onImport={async (f) => {
            try {
              const j = JSON.parse(await f.text());
              if (j.app !== 'daegu-parking-solar') throw new Error('이 도구에서 저장한 파일이 아닙니다');
              if (j.params) setParams(() => ({ ...defaults, ...j.params }));
              if (j.overrides && j.sido === ds.sido) setOverrides(() => j.overrides);
              setToast(j.sido === ds.sido ? '작업 내용을 불러왔습니다.' : `가정값만 불러왔습니다. 현장 확인 입력은 ${j.sido} 데이터용입니다.`); setPanel('');
            } catch (e) { setToast(`불러오지 못했습니다: ${e instanceof Error ? e.message : e}`); setPanel(''); }
          }} />
      )}
      {panel === 'region' && (
        <RegionLoader onClose={() => setPanel('')} onLoad={(d) => { setUpload(d); setSelected(null); setPanel(''); }} />
      )}
    </div>
  );
}
