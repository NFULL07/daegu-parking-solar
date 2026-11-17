"""2단계: 주차장별 연 발전량·온실가스 감축량 환산 (추정치, 범위 제시)"""
import json
import pandas as pd

A = json.load(open('data/assumptions.json', encoding='utf-8'))
Y = {k: A['yield_kwh_per_kw'][k]['value'] for k in ('low', 'mid', 'high')}
EF = A['emission_factor']['grid_tco2eq_per_mwh_2023']['value']        # tCO2eq/MWh
EV_KWH = A['ev_charging']['kwh_per_session_all']['value']             # 충전 1회 kWh
STALL = {'general': 12.5, 'mix_ext30': 0.7 * 12.5 + 0.3 * 13.52, 'mix_ext30_dis3': 0.67 * 12.5 + 0.30 * 13.52 + 0.03 * 16.5}

pub = pd.read_pickle('analysis/s1_public.pkl')
for k, v in Y.items():
    pub[f'gen_mwh_{k}'] = pub['cap_kw_upper'] * v / 1000
    pub[f'co2_t_{k}'] = pub[f'gen_mwh_{k}'] * EF
pub.to_pickle('analysis/s2_public.pkl')

t = pub[pub.group == 'mandate_ge80']
summ = {
    'sites': int(len(t)), 'sites_offstreet': int((t['주차장유형'] == '노외').sum()),
    'stalls': int(t.stalls.sum()), 'cap_mw_upper': round(t.cap_kw_upper.sum() / 1000, 2),
    'gen_gwh': {k: round(t[f'gen_mwh_{k}'].sum() / 1000, 2) for k in Y},
    'co2_kt': {k: round(t[f'co2_t_{k}'].sum() / 1000, 2) for k in Y},
    'ev_sessions_equiv_mid': int(t['gen_mwh_mid'].sum() * 1000 / EV_KWH),
    'city_plan': {'sites': 98, 'mw': 22,
                  'gen_gwh': {k: round(22 * v / 1000, 2) for k, v in Y.items()},
                  'co2_kt': {k: round(22 * v / 1000 * EF, 2) for k, v in Y.items()}},
}
# 문턱(70~79면): 구획 구성 시나리오별 1,000㎡ 초과 여부
th = pub[pub.group == 'threshold_70_79'].copy()
for k, m2 in STALL.items():
    th[f'over_{k}'] = th.stalls * m2 >= 1000
summ['threshold'] = {
    'sites': int(len(th)),
    'min_stalls_for_1000m2': {k: int(-(-1000 // m2)) for k, m2 in STALL.items()},
    'over_1000m2_count': {k: int(th[f'over_{k}'].sum()) for k in STALL},
    'over_1000m2_names_ext30_dis3': th[th['over_mix_ext30_dis3']]['주차장명'].tolist(),
    'cap_mw_if_all_included': round(th.stalls.sum() * 12.5 * 0.1 / 1000, 2),
}
summ['by_gu'] = (t.groupby('구군').agg(sites=('stalls', 'size'), stalls=('stalls', 'sum'),
                                     cap_mw=('cap_kw_upper', lambda s: round(s.sum() / 1000, 2)),
                                     gen_gwh_mid=('gen_mwh_mid', lambda s: round(s.sum() / 1000, 2)),
                                     co2_t_mid=('co2_t_mid', lambda s: round(s.sum())))
                 .reset_index().to_dict('records'))
summ['assumptions'] = {'yield_kwh_per_kw': Y, 'emission_factor_tco2_per_mwh': EF,
                       'stall_m2': 12.5, 'kw_per_m2': 0.1, 'ev_kwh_per_session': EV_KWH}
summ['label'] = '추정치. 설치 불합리 구획 미차감(상한), 음영 미반영'
json.dump(summ, open('out/summary_generation.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps({k: v for k, v in summ.items() if k != 'by_gu'}, ensure_ascii=False, indent=1))
