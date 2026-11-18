// 계산 로직: 파이썬 분석(analysis/s1~s5)과 같은 규칙을 브라우저에서 다시 수행한다.
// 기본값으로 돌린 결과는 calc.test.ts에서 파이썬 결과와 일치하는지 확인한다.

export type RawRow = Record<string, string | number | null | undefined>;

export type YieldKey = 'low' | 'mid' | 'high' | 'custom';

export interface Params {
  stall_m2: number;        // 일반형 주차구획 면적(㎡)
  kw_per_m2: number;       // 설치의무 용량(kW/㎡) = 면적/10
  mandate_m2: number;      // 의무 대상 기준 면적(㎡)
  threshold_m2: number;    // 문턱 구간 하한(㎡) = 70면 x 12.5㎡
  mixed_stall_m2: number;  // 확장형 30% + 장애인 3% 가정 평균 구획 면적
  yields: { low: number; mid: number; high: number };
  yieldKey: YieldKey;
  yieldCustom: number;
  ef: number;              // 전력배출계수 tCO2eq/MWh
  eta: number;             // ESS 종합효율
  ess_ratio: number;       // ESS 용량 = 설비 kW x 시간
  ev_kwh: number;          // 전기차 1회 충전량 kWh
  dedup_radius_m: number;
}

export interface Override {
  status?: 'exclude' | 'confirm';
  area_m2?: number;
}

export type Group = 'mandate' | 'threshold' | 'under';
export type Tier = '1단계' | '2단계' | '현장 검토' | '문턱(대상 가능)' | '문턱 구간' | '제외(현장 확인)';
export const TIERS: Tier[] = ['1단계', '2단계', '현장 검토', '문턱(대상 가능)', '문턱 구간', '제외(현장 확인)'];

export interface Site {
  idx: number;
  id: string;
  name: string;
  gu: string;
  type: string;
  address: string;
  provider: string;
  dataDate: string;
  lat: number;
  lon: number;
  stalls: number;
  flags: string[];
  autoFlags: string[];
  area_m2: number;
  areaActual: boolean;
  cap_kw: number;
  gen_mwh: number;
  co2_t: number;
  group: Group;
  thresholdLikely: boolean;
  tier: Tier | null;
  rank: number | null;
  status?: 'exclude' | 'confirm';
}

export interface DedupLog { dropped: string; dropped_stalls: number; kept: string; kept_stalls: number; kept_provider: string; distance_m: number }

const s = (v: RawRow[string]) => (v === null || v === undefined ? '' : String(v).trim());
const num = (v: RawRow[string]) => {
  if (v === null || v === undefined || v === '') return NaN;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

export function yieldValue(p: Params): number {
  return p.yieldKey === 'custom' ? p.yieldCustom : p.yields[p.yieldKey];
}

// 시·도 목록: 제공기관명 첫 단어 기준
export function listSidos(rows: RawRow[]): { sido: string; n: number }[] {
  const cnt = new Map<string, number>();
  for (const r of rows) {
    const t = s(r['제공기관명']).split(/\s+/)[0];
    if (t && /(특별시|광역시|특별자치시|특별자치도|도)$/.test(t)) cnt.set(t, (cnt.get(t) ?? 0) + 1);
  }
  return [...cnt.entries()].map(([sido, n]) => ({ sido, n })).sort((a, b) => b.n - a.n);
}

// 해당 시·도 행: 제공기관명이 시·도로 시작하거나 주소에 시·도명이 단어로 들어간 행
export function selectSido(rows: RawRow[], sido: string): RawRow[] {
  return rows.filter((r) => {
    const addr = ' ' + s(r['소재지지번주소']) + ' ' + s(r['소재지도로명주소']);
    return s(r['제공기관명']).startsWith(sido) || addr.includes(' ' + sido);
  });
}

function distM(aLat: number, aLon: number, bLat: number, bLon: number) {
  const rad = Math.PI / 180;
  return 6371000 * Math.hypot((aLat - bLat) * rad, (aLon - bLon) * rad * Math.cos(aLat * rad));
}

// 공영 노외·부설 + 시·구 이중 등록 제거
export function publicLots(rows: RawRow[], sido: string, radius = 300): { lots: RawRow[]; log: DedupLog[] } {
  const pub = rows.filter((r) => s(r['주차장구분']) === '공영' && ['노외', '부설'].includes(s(r['주차장유형'])));
  const nm3 = (r: RawRow) => s(r['주차장명']).replace(/ /g, '').slice(0, 3);
  const drop = new Set<RawRow>();
  const log: DedupLog[] = [];
  const city = pub.filter((r) => s(r['제공기관명']) === sido);
  const others = pub.filter((r) => s(r['제공기관명']) !== sido);
  for (const a of city) {
    for (const b of others) {
      if (nm3(a) !== nm3(b)) continue;
      const d = distM(num(a['위도']), num(a['경도']), num(b['위도']), num(b['경도']));
      if (d < radius) {
        drop.add(a);
        log.push({ dropped: s(a['주차장명']), dropped_stalls: num(a['주차구획수']), kept: s(b['주차장명']),
          kept_stalls: num(b['주차구획수']), kept_provider: s(b['제공기관명']), distance_m: Math.round(d) });
        break;
      }
    }
  }
  return { lots: pub.filter((r) => !drop.has(r)), log };
}

export function guOf(r: RawRow, sido: string): string {
  const addr = s(r['소재지도로명주소']) || s(r['소재지지번주소']);
  const esc = sido.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = addr.match(new RegExp(esc + '\\s+(\\S+?[시군구])(?:\\s|$)'));
  if (m) return m[1];
  const t = s(r['제공기관명']).split(/\s+/);
  return t[1] ?? '(미상)';
}

const FLAG_RULES: [RegExp, string][] = [
  [/빌딩|타워|주차장건물|입체|기계식|복합/, '주차빌딩(옥상층만 가능)'],
  [/지하/, '지하(설치 곤란)'],
  [/둔치|하천|천변|강변/, '둔치·천변(하천구역 인허가·침수 검토)'],
  [/임시/, '임시 주차장(존치 여부 확인)'],
];

export function autoFlags(r: RawRow): string[] {
  const txt = s(r['주차장명']) + ' ' + s(r['특기사항']);
  const f = FLAG_RULES.filter(([re]) => re.test(txt)).map(([, l]) => l);
  if (s(r['주차장유형']) === '부설') f.push('부설 주차장');
  return f;
}

export function buildSites(lots: RawRow[], sido: string): Site[] {
  return lots
    .map((r, idx) => ({ r, idx }))
    .filter(({ r }) => Number.isFinite(num(r['주차구획수'])))
    .map(({ r, idx }) => ({
      idx,
      id: s(r['주차장관리번호']) || `row-${idx}`,
      name: s(r['주차장명']),
      gu: guOf(r, sido),
      type: s(r['주차장유형']),
      address: s(r['소재지도로명주소']) || s(r['소재지지번주소']),
      provider: s(r['제공기관명']),
      dataDate: s(r['데이터기준일자']),
      lat: num(r['위도']),
      lon: num(r['경도']),
      stalls: num(r['주차구획수']),
      autoFlags: autoFlags(r),
      flags: [], area_m2: 0, areaActual: false, cap_kw: 0, gen_mwh: 0, co2_t: 0,
      group: 'under' as Group, thresholdLikely: false, tier: null, rank: null,
    }));
}

// 가정값·현장 확인 결과를 반영해 그룹·단계·발전량을 다시 계산
export function classify(base: Site[], p: Params, overrides: Record<string, Override> = {}): Site[] {
  const y = yieldValue(p);
  const sites = base.map((b) => {
    const o = overrides[b.id] ?? {};
    const areaActual = typeof o.area_m2 === 'number' && o.area_m2 > 0;
    const area = areaActual ? (o.area_m2 as number) : b.stalls * p.stall_m2;
    const cap = area * p.kw_per_m2;
    const gen = (cap * y) / 1000;
    const group: Group = area >= p.mandate_m2 ? 'mandate' : area >= p.threshold_m2 ? 'threshold' : 'under';
    return {
      ...b,
      status: o.status,
      flags: o.status === 'confirm' ? [] : b.autoFlags,
      area_m2: area, areaActual, cap_kw: cap, gen_mwh: gen, co2_t: gen * p.ef,
      group,
      thresholdLikely: !areaActual && b.stalls * p.mixed_stall_m2 >= p.mandate_m2,
      tier: null as Tier | null, rank: null as number | null,
    };
  });
  for (const x of sites) {
    if (x.group === 'mandate') x.tier = x.status === 'exclude' ? '제외(현장 확인)' : x.flags.length ? '현장 검토' : null;
    else if (x.group === 'threshold') x.tier = x.status === 'exclude' ? '제외(현장 확인)' : x.thresholdLikely ? '문턱(대상 가능)' : '문턱 구간';
  }
  const clean = sites.filter((x) => x.group === 'mandate' && x.tier === null).sort((a, b) => b.cap_kw - a.cap_kw || a.idx - b.idx);
  const total = clean.reduce((t, x) => t + x.cap_kw, 0);
  let cum = 0;
  clean.forEach((x, i) => {
    x.tier = cum / total < 0.5 ? '1단계' : '2단계';
    cum += x.cap_kw;
    x.rank = i + 1;
  });
  return sites;
}

export interface Agg { sites: number; stalls: number; cap_mw: number; gen_gwh: number; co2_t: number }
const agg = (xs: Site[]): Agg => ({
  sites: xs.length,
  stalls: xs.reduce((t, x) => t + x.stalls, 0),
  cap_mw: xs.reduce((t, x) => t + x.cap_kw, 0) / 1000,
  gen_gwh: xs.reduce((t, x) => t + x.gen_mwh, 0) / 1000,
  co2_t: xs.reduce((t, x) => t + x.co2_t, 0),
});

export interface Summary {
  mandate: Agg;            // 의무 대상(현장 확인 제외 반영)
  byTier: Record<Tier, Agg>;
  byGu: (Agg & { gu: string })[];
  tier1ShareOfClean: number;
}

export function summarize(sites: Site[]): Summary {
  const m = sites.filter((x) => x.group === 'mandate' && x.tier !== '제외(현장 확인)');
  const byTier = Object.fromEntries(TIERS.map((t) => [t, agg(sites.filter((x) => x.tier === t))])) as Record<Tier, Agg>;
  const gus = [...new Set(m.map((x) => x.gu))];
  const byGu = gus.map((gu) => ({ gu, ...agg(m.filter((x) => x.gu === gu)) })).sort((a, b) => b.cap_mw - a.cap_mw);
  const clean = byTier['1단계'].sites + byTier['2단계'].sites;
  return { mandate: agg(m), byTier, byGu, tier1ShareOfClean: clean ? byTier['1단계'].sites / clean : 0 };
}

// ---------------- ESS ----------------
export interface EssDay { date: string; actual: number; ewp: number; ai: number; ewp_q20: number; ai_q20: number }
export type EssMode = 'none' | 'ewp' | 'ai' | 'ewp_q20' | 'ai_q20' | 'actual';
export const ESS_MODES: { key: EssMode; label: string }[] = [
  { key: 'none', label: '예측 없음(같은 달 평균)' },
  { key: 'ewp', label: '공식 예측' },
  { key: 'ai', label: 'AI 예측' },
  { key: 'ewp_q20', label: '공식 예측 + 안전 계획' },
  { key: 'ai_q20', label: 'AI 예측 + 안전 계획' },
];
export interface EssModeResult { commit_abs_err: number; committed: number; reliable: number; shortfall: number; shortfall_days: number; unused: number }
export interface EssResult { ess_mwh: number; full_charge_share: number; deliver_total: number; modes: Record<EssMode, EssModeResult>; n_days: number }

export function essSimulate(days: EssDay[], P_MW: number, ratio: number, eta: number): EssResult {
  const E = P_MW * ratio;
  const month = days.map((d) => d.date.slice(0, 7));
  const sum = new Map<string, number>(), cnt = new Map<string, number>();
  days.forEach((d, i) => { sum.set(month[i], (sum.get(month[i]) ?? 0) + d.actual * P_MW); cnt.set(month[i], (cnt.get(month[i]) ?? 0) + 1); });
  const plan = (d: EssDay, i: number, m: EssMode) =>
    m === 'none' ? ((sum.get(month[i]) as number) - d.actual * P_MW) / ((cnt.get(month[i]) as number) - 1) : (d[m] as number) * P_MW;
  const deliver = days.map((d) => Math.min(E, d.actual * P_MW) * eta);
  const modes = {} as Record<EssMode, EssModeResult>;
  for (const m of ['none', 'ewp', 'ai', 'ewp_q20', 'ai_q20', 'actual'] as EssMode[]) {
    let ae = 0, com = 0, rel = 0, sf = 0, sfd = 0, un = 0;
    days.forEach((d, i) => {
      const c = Math.min(E, plan(d, i, m)) * eta;
      const diff = c - deliver[i];
      ae += Math.abs(diff); com += c; rel += Math.min(c, deliver[i]);
      if (diff > 0) sf += diff; else un += -diff;
      if (diff > 0.01 * E) sfd += 1;
    });
    modes[m] = { commit_abs_err: ae / days.length, committed: com, reliable: rel, shortfall: sf, shortfall_days: sfd, unused: un };
  }
  return {
    ess_mwh: E,
    full_charge_share: days.filter((d) => d.actual * P_MW >= E).length / days.length,
    deliver_total: deliver.reduce((t, v) => t + v, 0),
    modes, n_days: days.length,
  };
}

export function essAnnual(windowPerMw: number[], P_MW: number, ratio: number, eta: number, evKwh: number) {
  const E = P_MW * ratio;
  const charged = windowPerMw.reduce((t, v) => t + Math.min(E, v * P_MW), 0);
  return { charged, supply: charged * eta, loss: charged * (1 - eta), ev_sessions: (charged * eta * 1000) / evKwh };
}

export function essDay(hourlyPerMw: number[], P_MW: number, ratio: number, eta: number, chargeHours = [10, 16], dis = [18, 20]) {
  const E = P_MW * ratio;
  const pv = hourlyPerMw.map((v) => v * P_MW);
  const stored = Math.min(E, pv.slice(chargeHours[0], chargeHours[1] + 1).reduce((t, v) => t + v, 0));
  const nDis = dis[1] - dis[0] + 1;
  let soc = 0;
  return pv.map((v, hh) => {
    let charge = 0, discharge = 0;
    if (hh >= chargeHours[0] && hh <= chargeHours[1] && soc < E) { charge = Math.min(v, E - soc); soc += charge; }
    if (hh >= dis[0] && hh <= dis[1]) { discharge = (stored * eta) / nDis; soc = Math.max(0, soc - stored / nDis); }
    return { hh, pv: v, charge, export: v - charge, discharge, soc };
  });
}

// ---------------- CSV ----------------
export function toCsv(rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const t = String(v);
    return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

// 업로드 파일 인코딩 판별: UTF-8로 읽어 헤더가 깨지면 EUC-KR(CP949)로 다시 읽는다
export function decodeCsv(buf: ArrayBuffer): string {
  const u = new TextDecoder('utf-8').decode(buf);
  if (u.includes('주차장명') && !u.slice(0, 2000).includes('�')) return u.replace(/^﻿/, '');
  return new TextDecoder('euc-kr').decode(buf);
}
