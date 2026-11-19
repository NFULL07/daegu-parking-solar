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
import Hero from './components/Hero';
import CitizenSection from './components/CitizenSection';

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
  const ovCount = Object.values(overrides).filter((o) => o.status || o.area_m2).length;

  return (
    <div className="app">
      <header className="bar">
        <div className="bar-inner">
          <div className="brand">
            <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><rect width="28" height="28" rx="5" fill="#1e252b" /><path d="M6 13l3-6h10l3 6z" fill="#3b7ddd" /><rect x="5" y="14" width="18" height="2.5" rx="1" fill="#f2b705" /><rect x="7.5" y="16.5" width="2" height="6" fill="#e9eded" /><rect x="18.5" y="16.5" width="2" height="6" fill="#e9eded" /></svg>
            <div>
              <div className="brand-name">공영주차장 태양광 설치의무 분석 도구</div>
              <div className="brand-sub">{ds.uploaded ? `${ds.sido}, ${ds.fileName}` : `${ds.sido}, 전국주차장정보표준데이터`} 기준</div>
            </div>
          </div>
          <div className="actions">
            <button className="ghost" onClick={() => setPanel('params')}>가정값 조정{defaults && JSON.stringify(p) !== JSON.stringify(defaults) ? ' (변경됨)' : ''}</button>
            <button className="ghost" onClick={() => setPanel('region')}>다른 지역 불러오기</button>
            {ds.uploaded && <button className="ghost" onClick={() => { setUpload(null); setSelected(null); }}>대구로 돌아가기</button>}
          </div>
        </div>
        <nav className="tabs" aria-label="섹션">
          <a href="#local">우리 구·군</a><a href="#map">대상 지도</a><a href="#effect">기대효과와 설치 순서</a><a href="#forecast">AI 예측</a><a href="#ess">ESS 운영</a><a href="#about">출처와 한계</a>
        </nav>
      </header>

      <Hero sites={sites} sm={sm} ev={fc.ev} sido={ds.sido} isDaegu={isDaegu} cityPlan={meta.city_plan}
        onPick={(id) => { setSelected(id); document.getElementById('map')?.scrollIntoView({ behavior: 'smooth' }); }} />

      <main>
        {import.meta.env.VITE_PREVIEW && <div className="banner">미리보기 화면입니다. 지도 배경, CSV·작업 내용 파일 내려받기는 정식 주소(GitHub Pages)에서 동작합니다.</div>}
        {toast && <div className="banner" role="status">{toast} <button className="link" onClick={() => setToast('')}>닫기</button></div>}
        {ovCount > 0 && <div className="banner">현장 확인 결과 {ovCount}건이 반영된 계산입니다. 지도나 표에서 바꾸거나 되돌릴 수 있습니다.</div>}
        {ds.uploaded && <div className="banner">AI 예측과 ESS 운영은 대구 2025년 발전 실적으로 계산한 값이라 {ds.sido}에는 참고용입니다. kW당 발전량은 가정값 조정에서 지역에 맞게 바꿀 수 있습니다.</div>}

        <CitizenSection sites={sites} sido={ds.sido} params={p}
          onPick={(id) => { setSelected(id); document.getElementById('map')?.scrollIntoView({ behavior: 'smooth' }); }} />

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
