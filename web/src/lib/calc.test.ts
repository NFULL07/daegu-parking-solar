// 브라우저 계산이 파이썬 분석 결과(out/*.json)와 같은지 확인
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildSites, classify, essAnnual, essSimulate, Params, publicLots, selectSido, summarize, listSidos, RawRow } from './calc';

const load = (f: string) => JSON.parse(readFileSync(new URL('../../public/data/' + f, import.meta.url), 'utf-8'));
const meta = load('meta.json');
const rows: RawRow[] = load('parking_daegu.json');
const gen = load('summary_generation.json');
const pri = load('summary_priority.json');
const ess = load('ess_simulation.json');
const essIn = load('ess_inputs.json');
const dedupPy = load('dedup_log.json');

const P: Params = { ...meta.defaults, yieldKey: 'mid', yieldCustom: 1286 };

describe('대상 선별(대구, 기본값)', () => {
  const sel = selectSido(rows, '대구광역시');
  const { lots, log } = publicLots(sel, '대구광역시', 300);
  const sites = classify(buildSites(lots, '대구광역시'), P);
  const sm = summarize(sites);
  it('시도 목록', () => expect(listSidos(rows)[0].sido).toBe('대구광역시'));
  it('대구 행 수', () => expect(sel.length).toBe(1086));
  it('중복 제거', () => {
    expect(log.length).toBe(dedupPy.length);
    expect(log.map((l) => l.dropped).sort()).toEqual(dedupPy.map((l: { dropped: string }) => l.dropped).sort());
  });
  it('대상 수·구획·용량', () => {
    expect(sm.mandate.sites).toBe(gen.sites);
    expect(sm.mandate.stalls).toBe(gen.stalls);
    expect(sm.mandate.cap_mw).toBeCloseTo(gen.cap_mw_upper, 2);
    expect(sm.mandate.gen_gwh).toBeCloseTo(gen.gen_gwh.mid, 2);
    expect(sm.mandate.co2_t / 1000).toBeCloseTo(gen.co2_kt.mid, 2);
  });
  it('단계별', () => {
    expect(sm.byTier['1단계'].sites).toBe(pri.tiers['1단계'].sites);
    expect(sm.byTier['2단계'].sites).toBe(pri.tiers['2단계'].sites);
    expect(sm.byTier['현장 검토'].sites).toBe(pri.tiers['현장 검토'].sites);
    expect(sm.byTier['문턱(대상 가능)'].sites).toBe(pri.tiers['문턱(대상 가능)'].sites);
    expect(sm.byTier['문턱 구간'].sites).toBe(pri.tiers['문턱(70~79면)'].sites);
    expect(sm.byTier['1단계'].cap_mw).toBeCloseTo(pri.tiers['1단계'].cap_mw, 2);
  });
  it('구별', () => {
    for (const g of gen.by_gu) {
      const j = sm.byGu.find((x) => x.gu === g['구군']);
      expect(j?.sites).toBe(g.sites);
      expect(j?.stalls).toBe(g.stalls);
    }
  });
  it('현장 확인 반영', () => {
    const t = sites.find((x) => x.tier === '현장 검토')!;
    const s2 = summarize(classify(buildSites(lots, '대구광역시'), P, { [t.id]: { status: 'exclude' } }));
    expect(s2.mandate.sites).toBe(gen.sites - 1);
  });
});

describe('ESS 시뮬레이션(파이썬과 동일)', () => {
  for (const r of ['0.5', '1.0', '2.0']) {
    it(`${r}시간분`, () => {
      const js = essSimulate(essIn.days263, ess.pv_mw, Number(r), ess.eta);
      const py = ess.scenarios[`${r}h`].eta_base;
      expect(js.full_charge_share).toBeCloseTo(py._full_charge_day_share, 3);
      for (const m of ['none', 'ewp', 'ai', 'ewp_q20', 'ai_q20'] as const) {
        expect(js.modes[m].shortfall).toBeCloseTo(py[m].shortfall_mwh_total, 0);
        expect(js.modes[m].shortfall_days).toBe(py[m].shortfall_days);
        expect(js.modes[m].committed).toBeCloseTo(py[m].committed_mwh_total, 0);
      }
      const an = essAnnual(essIn.days365_window_per_mw, ess.pv_mw, Number(r), ess.eta, 22.5);
      expect(Math.round(an.charged)).toBe(ess.annual_365d_perfect[`${r}h`].charged_mwh);
    });
  }
});
