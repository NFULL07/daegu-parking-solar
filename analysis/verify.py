"""독립 재계산 검증: 파이프라인 코드를 쓰지 않고 원자료에서 핵심 수치를 다시 계산해 out/*.json과 대조"""
import json, csv
from collections import defaultdict
ok = []
def check(name, a, b, tol):
    ok.append((name, a, b, abs(a - b) <= tol)); 
# 1) 주차장: 원본 전국 CSV에서 다시 필터
import os
src = ('data/raw/uploads/fileC.csv', 'cp949') if os.path.exists('data/raw/uploads/fileC.csv') else ('data/raw/daegu_parking_standard.csv', 'utf-8-sig')
rows = list(csv.DictReader(open(src[0], encoding=src[1])))
def daegu(r):
    return r['제공기관명'].startswith('대구광역시') or (' ' + r['소재지지번주소'] + ' ' + r['소재지도로명주소']).find(' 대구광역시') >= 0
dg = [r for r in rows if daegu(r)]
tg = [r for r in dg if r['주차장구분'] == '공영' and r['주차장유형'] in ('노외', '부설') and int(float(r['주차구획수'] or 0)) >= 80]
stalls = sum(int(float(r['주차구획수'])) for r in tg)
S = json.load(open('out/summary_generation.json', encoding='utf-8'))
check('대구 행 수', len(dg), 1086, 0)
check('대상 수', len(tg), S['sites'], 0)
check('대상 구획 합', stalls, S['stalls'], 0)
check('설치용량 MW', stalls * 12.5 * 0.1 / 1000, S['cap_mw_upper'], 0.01)
check('발전량 GWh(mid)', stalls * 1.25 * 1286 / 1e6, S['gen_gwh']['mid'], 0.01)
check('감축 kt(mid)', stalls * 1.25 * 1286 / 1e6 * 0.4173, S['co2_kt']['mid'], 0.01)
# 2) KPX 대구 연간 / 설비용량
k = [r for r in csv.DictReader(open('data/raw/kpx_daegu_2025.csv', encoding='utf-8-sig')) if r['지역'] == '대구시']
tot = sum(float(r['전력거래량(MWh)']) for r in k)
check('KPX 대구 2025 MWh', tot, 150718.1, 0.1)
check('kWh/kW', tot / 113.791, 1324, 1)
# 3) 공식 예측 nMAE (독립 조인)
act = {(r['거래일'].replace('-', ''), int(r['거래시간']) - 1): float(r['전력거래량(MWh)']) for r in k}
seen, err = set(), []
for r in csv.DictReader(open('data/raw/api/ewp_solar_forecast_daegu_2025.csv', encoding='utf-8-sig')):
    key = (r['predDate'], int(r['hh']))
    if key in seen or key not in act: continue
    seen.add(key); err.append(abs(float(r['solgenKpx']) - act[key]))
F = json.load(open('out/forecast_eval.json', encoding='utf-8'))
check('비교 시간 수', len(err), F['n_hours'], 0)
check('공식 예측 nMAE %', sum(err) / len(err) / 113.791 * 100, F['hourly']['official_ewp']['nMAE_pct'], 0.01)
# 4) AI 예측 nMAE를 시계열 파일에서 재계산
ts = json.load(open('out/forecast_timeseries.json', encoding='utf-8'))
check('AI nMAE % (시계열 파일)', sum(abs(t['ai'] - t['actual']) for t in ts) / len(ts) / 113.791 * 100, F['hourly']['ai']['nMAE_pct'], 0.02)
# 5) 충전 합성데이터 평균
ev = list(csv.DictReader(open('data/raw/api/ev_charging_synthetic_daegu.csv', encoding='utf-8-sig')))
uniq = {tuple(r.values()) for r in ev}
q = [float(t[list(ev[0].keys()).index('totChargRcngQnt')]) for t in uniq]
check('EV 중복 제거 건수', len(uniq), 73253, 0)
check('EV 1회 평균 kWh', sum(q) / len(q), 22.5, 0.05)
# 6) ESS 연간(1h) 충전량 재계산
day = defaultdict(float)
for r in k:
    if 10 <= int(r['거래시간']) - 1 <= 16: day[r['거래일']] += float(r['전력거래량(MWh)'])
E = S['cap_mw_upper']
ch = sum(min(E, v / 113.791 * E) for v in day.values())
Ej = json.load(open('out/ess_simulation.json', encoding='utf-8'))
check('ESS 1h 연간 충전 MWh', ch, Ej['annual_365d_perfect']['1.0h']['charged_mwh'], 1)
for n, a, b, g in ok:
    print(('OK ' if g else 'FAIL'), n, round(a, 3), round(b, 3))
print('전체', 'PASS' if all(g for *_, g in ok) else 'FAIL')
