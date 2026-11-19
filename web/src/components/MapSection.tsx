import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import { Override, Params, Site, Tier } from '../lib/calc';
import { CityGeo } from '../lib/types';
import { fmt, TIER_COLOR, TIER_HEX } from '../lib/store';

const LEGEND: { key: Tier | 'under'; label: string }[] = [
  { key: '1단계', label: '1단계' },
  { key: '2단계', label: '2단계' },
  { key: '현장 검토', label: '현장 검토' },
  { key: '문턱(대상 가능)', label: '문턱(대상 가능)' },
  { key: '문턱 구간', label: '문턱 구간' },
  { key: '제외(현장 확인)', label: '제외(현장 확인)' },
  { key: 'under', label: '대상 아님' },
];

function Fit({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => { if (bounds) map.fitBounds(bounds, { padding: [20, 20] }); }, [bounds, map]);
  return null;
}

function FlyTo({ site }: { site: Site | undefined }) {
  const map = useMap();
  useEffect(() => { if (site && Number.isFinite(site.lat)) map.flyTo([site.lat, site.lon], Math.max(map.getZoom(), 14), { duration: 0.6 }); }, [site, map]);
  return null;
}

interface Props {
  sites: Site[]; geo: CityGeo | null; selected: string | null; onSelect: (id: string | null) => void;
  overrides: Record<string, Override>; setOverrides: (u: (p: Record<string, Override>) => Record<string, Override>) => void; params: Params;
}

export default function MapSection({ sites, geo, selected, onSelect, overrides, setOverrides, params }: Props) {
  const [show, setShow] = useState<Record<string, boolean>>({ under: false });
  const [gu, setGu] = useState('');
  const gus = useMemo(() => [...new Set(sites.map((s) => s.gu))].sort(), [sites]);
  const vis = sites.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon) && (!gu || s.gu === gu) && show[s.tier ?? 'under'] !== false);
  const bounds = useMemo<LatLngBoundsExpression | null>(() => {
    const pts = sites.filter((s) => Number.isFinite(s.lat) && s.group !== 'under');
    if (!pts.length) return null;
    const la = pts.map((s) => s.lat), lo = pts.map((s) => s.lon);
    return [[Math.min(...la), Math.min(...lo)], [Math.max(...la), Math.max(...lo)]];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites.length, sites[0]?.id]);
  const sel = sites.find((s) => s.id === selected);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    sites.forEach((s) => { const k = s.tier ?? 'under'; c[k] = (c[k] ?? 0) + 1; });
    return c;
  }, [sites]);
  const r = (s: Site) => (s.group === 'under' ? 3 : Math.max(5, Math.sqrt(s.cap_kw) / 2.2));
  const order = (s: Site) => (s.group === 'under' ? 0 : s.tier === '1단계' ? 3 : 2);

  const setOv = (id: string, o: Override | null) =>
    setOverrides((prev) => { const n = { ...prev }; if (o && (o.status || o.area_m2)) n[id] = o; else delete n[id]; return n; });

  return (
    <section id="map" className="card">
      <div className="sec-head">
        <h2>대상 지도</h2>
        <p>점 크기는 설치용량, 색은 제안 단계입니다. 점을 누르면 오른쪽에 상세 정보와 현장 확인 입력란이 열립니다.</p>
      </div>
      <div className="filters" role="group" aria-label="지도 필터">
        <select value={gu} onChange={(e) => setGu(e.target.value)} aria-label="구·군">
          <option value="">전체 구·군</option>
          {gus.map((g) => <option key={g}>{g}</option>)}
        </select>
        {LEGEND.map((l) => (
          <label key={l.key} className={`chip ${show[l.key] === false ? 'off' : ''}`}>
            <input type="checkbox" checked={show[l.key] !== false} onChange={(e) => setShow({ ...show, [l.key]: e.target.checked })} />
            <span className="dot" style={{ background: l.key === 'under' ? 'var(--c-under)' : TIER_COLOR[l.key] }} />
            {l.label} <span className="muted">{counts[l.key] ?? 0}</span>
          </label>
        ))}
      </div>
      <div className="map-wrap">
        <MapContainer center={[35.87, 128.6]} zoom={11} scrollWheelZoom={false} className="map">
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {geo && <GeoJSON data={geo as unknown as GeoJSON.GeoJsonObject} style={{ color: '#1e252b', weight: 1.2, fillOpacity: 0, dashArray: '4 4' }} />}
          <Fit bounds={bounds} />
          <FlyTo site={sel} />
          {[...vis].sort((a, b) => order(a) - order(b)).map((s) => (
            <CircleMarker key={s.id} center={[s.lat, s.lon]} radius={r(s)}
              pathOptions={{
                color: s.id === selected ? '#1e252b' : '#ffffff', weight: s.id === selected ? 3 : 1.5,
                fillColor: TIER_HEX[s.tier ?? 'under'],
                fillOpacity: s.group === 'under' ? 0.6 : 0.9,
              }}
              eventHandlers={{ click: () => onSelect(s.id) }}>
              <Tooltip direction="top" offset={[0, -4]}>
                <b>{s.name}</b><br />{s.gu}, {fmt(s.stalls)}면, {fmt(s.cap_kw)}kW{s.tier ? `, ${s.tier}` : ''}
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
        <aside className="detail" aria-live="polite">
          {!sel ? (
            <div className="muted">지도에서 주차장을 고르면 여기에 표시됩니다.<br /><br />현장 확인 결과(설치 불가, 실제 면적)를 입력하면 단계와 합계가 바로 다시 계산됩니다.</div>
          ) : (
            <div>
              <div className="d-title">{sel.name}</div>
              <div className="muted small">{sel.address}</div>
              <dl>
                <dt>구·군, 유형</dt><dd>{sel.gu}, 공영 {sel.type}</dd>
                <dt>주차구획</dt><dd>{fmt(sel.stalls)}면</dd>
                <dt>면적</dt><dd>{fmt(sel.area_m2)}㎡ {sel.areaActual ? <span className="tag ok">실측 입력</span> : <span className="tag est">추정</span>}</dd>
                <dt>설치용량</dt><dd>{fmt(sel.cap_kw)}kW</dd>
                <dt>연 발전량</dt><dd>{fmt(sel.gen_mwh)}MWh <span className="tag est">추정</span></dd>
                <dt>연 감축량</dt><dd>{fmt(sel.co2_t)}tCO2eq</dd>
                <dt>단계</dt><dd>{sel.tier ? <><span className="dot" style={{ background: TIER_COLOR[sel.tier] }} /> {sel.tier}{sel.rank ? ` (용량 ${sel.rank}위)` : ''}</> : '대상 아님'}</dd>
                {sel.autoFlags.length > 0 && <><dt>제약 표기</dt><dd>{sel.autoFlags.join(', ')}{sel.status === 'confirm' && ' → 확인 완료'}</dd></>}
                <dt>데이터 기준일</dt><dd>{sel.dataDate}, {sel.provider}</dd>
              </dl>
              <div className="ov">
                <div className="ov-title">현장 확인 결과 입력</div>
                <div className="seg">
                  {([['', '자동 판정'], ['confirm', '설치 가능 확인'], ['exclude', '설치 불가']] as const).map(([k, l]) => (
                    <button key={k} className={(overrides[sel.id]?.status ?? '') === k ? 'on' : ''}
                      onClick={() => setOv(sel.id, { ...overrides[sel.id], status: (k || undefined) as Override['status'] })}>{l}</button>
                  ))}
                </div>
                <label className="field">실제 주차구획 면적(㎡)
                  <input type="number" min={0} placeholder={`추정 ${fmt(sel.stalls * params.stall_m2)}`} value={overrides[sel.id]?.area_m2 ?? ''}
                    onChange={(e) => setOv(sel.id, { ...overrides[sel.id], area_m2: e.target.value ? Number(e.target.value) : undefined })} />
                </label>
                {overrides[sel.id] && <button className="link" onClick={() => setOv(sel.id, null)}>이 주차장 입력 되돌리기</button>}
              </div>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
