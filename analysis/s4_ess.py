"""4단계: ESS 운영 시뮬레이션 (규칙 기반, 에너지량 기준)
시나리오: 공영주차장 태양광(설치의무 상한 20.55MW)에 ESS를 붙여
  - 낮 10~17시 태양광으로 ESS 충전 → 저녁 18~21시(2026 개편 최고요금 구간) 방전
  - 전날 14시(예보 발표 시점)에 다음날 저녁 공급 가능량을 '확약'
  - 계획 근거: 예측 없음(월평균) / 동서발전 공식 예측 / AI 예측 / 완전예측(사후 실적)
성과지표: 확약 대비 실제 공급 오차, 부족(저녁에 계통 전력으로 메워야 하는 양)
"""
import json
import numpy as np, pandas as pd

A = json.load(open('data/assumptions.json', encoding='utf-8'))
ETA = A['ess']['round_trip_efficiency']['value']; ETA_ALT = A['ess']['round_trip_efficiency']['alt']
P_MW = json.load(open('out/summary_generation.json', encoding='utf-8'))['cap_mw_upper']
EV_KWH = A['ev_charging']['kwh_per_session_all']['value']
CAP_KPX = 113.791
CH = range(10, 17)            # 충전 구간 시작 시각 10~16시 (=10:00~17:00)

# 충전구간(10~17시) 발전량 일 단위 예측 (s4b_window_model.py 결과, 월 단위 교차검증 값)
g = pd.read_pickle('analysis/s4_window.pkl').set_index('date')
w = g[['actual', 'ewp', 'ai_mean', 'ewp_q20', 'ai_q20']].rename(columns={'ai_mean': 'ai'}) / CAP_KPX * P_MW   # 주차장 규모로 환산
# 예측 없음: 같은 달 다른 날 실적 평균(자기 자신 제외)
m = w.index.month
grp = w.groupby(m)['actual']
w['none'] = (grp.transform('sum') - w.actual) / (grp.transform('count') - 1)

def run(ratio, eta):
    E = P_MW * ratio                     # ESS 용량 MWh
    deliver = np.minimum(E, w.actual) * eta
    res = {}
    for mode in ('none', 'ewp', 'ai', 'ewp_q20', 'ai_q20', 'actual'):
        commit = np.minimum(E, w[mode]) * eta
        diff = commit - deliver
        res[mode] = {'commit_abs_err_mwh_per_day': round(float(diff.abs().mean()), 2),
                     'committed_mwh_total': round(float(commit.sum()), 1),
                     'reliable_mwh_total': round(float(np.minimum(commit, deliver).sum()), 1),
                     'shortfall_mwh_total': round(float(diff.clip(lower=0).sum()), 1),
                     'shortfall_days': int((diff > 0.01 * E).sum()),
                     'unused_mwh_total': round(float((-diff).clip(lower=0).sum()), 1)}
    res['_ess_mwh'] = round(E, 2)
    res['_deliver_mwh_total'] = round(float(deliver.sum()), 1)
    res['_full_charge_day_share'] = round(float((w.actual >= E).mean()), 3)
    return res

out = {'label': '시뮬레이션(추정). 2025년 동서발전 예측이 있는 263일 대상, 에너지량 기준, 요금 단가 미적용. 계획 = 전날 14시 예측으로 다음날 저녁 공급량 확약',
       'pv_mw': P_MW, 'eta': ETA, 'eta_alt': ETA_ALT, 'charge_window': '10~17시', 'discharge_window': '18~21시',
       'n_days': int(len(w)), 'scenarios': {}}
for r in (0.5, 1.0, 2.0):
    out['scenarios'][f'{r}h'] = {'eta_base': run(r, ETA), 'eta_alt': run(r, ETA_ALT)}

# 연간(365일) 저녁 이전 가능량: 전력거래소 실적 프로파일 기준(완전예측 운영 가정)
k = pd.read_csv('data/raw/kpx_daegu_2025.csv', encoding='utf-8-sig'); k = k[k['지역'] == '대구시'].copy()
k['hh'] = k['거래시간'].astype(int) - 1
day = k[k.hh.isin(CH)].groupby('거래일')['전력거래량(MWh)'].sum() / CAP_KPX * P_MW
annual = {}
for r in (0.5, 1.0, 2.0):
    E = P_MW * r
    sh = float(np.minimum(E, day).sum())
    annual[f'{r}h'] = {'charged_mwh': round(sh, 0), 'evening_supply_mwh': round(sh * ETA, 0),
                       'loss_mwh': round(sh * (1 - ETA), 0),
                       'ev_sessions_equiv': int(sh * ETA * 1000 / EV_KWH)}
out['annual_365d_perfect'] = annual
out['note'] = ('ESS는 전력을 시간 이동시키며 충방전 손실(실측 평균 34%)이 있으므로 온실가스 추가 감축으로 계산하지 않음. '
               '저녁 공급량의 EV 환산은 합성데이터 1회 평균 충전량 22.5kWh 기준 환산치')
out['summary'] = ('ESS 0.5~1시간(용량 kWh/설비 kW) 규모에서는 10~17시 태양광으로 만충되는 날이 92~99%라 예측 여부와 관계없이 운영 결과가 거의 같음. '
                  '2시간 규모(만충일 76%)부터 예측이 의미 있음: 예측 없음 대비 저녁 공급 부족량이 공식 예측 45%, AI 32% 감소, '
                  '하위 20% 안전계획 적용 시 공식 59%, AI 67% 감소(대신 확약량 감소)')
json.dump(out, open('out/ess_simulation.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# 대시보드용: 일별 계획·실적 (주차장 규모 MWh)
dd = w.copy(); dd.index = dd.index.strftime('%Y-%m-%d')
dd.round(2).reset_index().rename(columns={'index': 'date'}).to_json('out/ess_daily_window.json', orient='records', force_ascii=False)
# 대시보드용: 맑은 날·흐린 날 시간별 운영 예시 (ESS 1시간 규모, 실적 기준)
kk = k.copy(); kk['date'] = pd.to_datetime(kk['거래일']).dt.strftime('%Y-%m-%d')
kk['pv'] = kk['전력거래량(MWh)'] / CAP_KPX * P_MW
ex = {}
dsum = kk[kk.hh.isin(CH)].groupby('date').pv.sum()
pick = {'clear': dsum.idxmax(), 'median': (dsum - dsum.median()).abs().idxmin(), 'cloudy': P_MW * 0.5}
pick['cloudy'] = (dsum - pick['cloudy']).abs().idxmin()
for tag, day in pick.items():
    E = P_MW * 1.0; soc = 0.0; rows = []
    dayrows = kk[kk.date == day].sort_values('hh')
    stored = min(E, float(dayrows[dayrows.hh.isin(CH)].pv.sum()))
    for _, r in dayrows.iterrows():
        h = int(r.hh); pv = float(r.pv); ch = 0.0; dis = 0.0
        if h in CH and soc < E:
            ch = min(pv, E - soc); soc += ch
        if 18 <= h <= 20:
            dis = stored * ETA / 3; soc = max(0.0, soc - stored / 3)
        rows.append({'hh': h, 'pv': round(pv, 2), 'charge': round(ch, 2), 'grid_export': round(pv - ch, 2),
                     'discharge': round(dis, 2), 'soc': round(soc, 2)})
    ex[tag] = {'date': day, 'ess_mwh': round(E, 2), 'hours': rows}
json.dump(ex, open('out/ess_example_days.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for r in ('0.5h', '1.0h', '2.0h'):
    s = out['scenarios'][r]['eta_base']
    print(r, 'ESS', s['_ess_mwh'], 'MWh, 만충일', s['_full_charge_day_share'])
    print(pd.DataFrame({k: v for k, v in s.items() if not k.startswith('_')}).T.to_string())
print(json.dumps(annual, ensure_ascii=False, indent=1))

