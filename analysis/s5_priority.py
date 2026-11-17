"""5단계: 단계적 설치 순서 제언 + 대시보드용 지도 데이터
규칙(투명성 우선, 가중치 임의 부여 없음):
  - 현장 검토군: 주차빌딩·지하·둔치/천변·임시 표기 또는 부설 → 구조·인허가·존치 확인 후 결정
  - 제약 표기가 없는 노외 대상지는 설치용량 큰 순으로 정렬, 누적 용량 50%까지 1단계, 나머지 2단계
  - 70~79면은 문턱군: 확장형 30%+장애인 3% 구성이면 78면부터 1,000㎡ 초과 → 78~79면은 '대상 가능'
"""
import json
import pandas as pd
p = pd.read_pickle('analysis/s2_public.pkl').copy()
flagcols = {'flag_building': '주차빌딩(옥상층만 가능)', 'flag_underground': '지하(설치 곤란)',
            'flag_riverside': '둔치·천변(하천구역 인허가·침수 검토)', 'flag_temporary': '임시 주차장(존치 여부 확인)'}
p['flags'] = p.apply(lambda r: [v for k, v in flagcols.items() if r[k]] + (['부설 주차장'] if r['주차장유형'] == '부설' else []), axis=1)
t = p[p.group == 'mandate_ge80'].copy()
t['tier'] = '현장 검토'
clean = t[t['flags'].str.len() == 0].sort_values('cap_kw_upper', ascending=False)
cum = clean.cap_kw_upper.cumsum() / clean.cap_kw_upper.sum()
first = cum.index[(cum.shift(fill_value=0) < 0.5)]
t.loc[clean.index, 'tier'] = '2단계'
t.loc[first, 'tier'] = '1단계'
p['tier'] = None
p.loc[t.index, 'tier'] = t.tier
th = p.group == 'threshold_70_79'
p.loc[th, 'tier'] = '문턱(70~79면)'
p.loc[th & (p.stalls >= 78), 'tier'] = '문턱(대상 가능)'
p['rank'] = None
order = t[t.tier != '현장 검토'].sort_values('cap_kw_upper', ascending=False).index
p.loc[order, 'rank'] = range(1, len(order) + 1)

def agg(df):
    return {'sites': int(len(df)), 'stalls': int(df.stalls.sum()), 'cap_mw': round(df.cap_kw_upper.sum() / 1000, 2),
            'gen_gwh_mid': round(df.gen_mwh_mid.sum() / 1000, 2), 'co2_t_mid': int(round(df.co2_t_mid.sum()))}
summ = {'label': '제언(추정). 이름·특기사항 기반 표기는 현장 확인 전 가정',
        'rule': __doc__.strip(),
        'tiers': {k: agg(p[p.tier == k]) for k in ['1단계', '2단계', '현장 검토', '문턱(대상 가능)', '문턱(70~79면)']},
        'tier1_share_of_sites_in_clean_pct': round(len(first) / len(clean) * 100, 1),
        'review_list': p[p.tier == '현장 검토'][['주차장명', '구군', 'stalls', 'flags']].to_dict('records'),
        'by_gu_tier': (p[p.tier.isin(['1단계', '2단계', '현장 검토'])].groupby(['구군', 'tier']).size().unstack(fill_value=0)
                       .reset_index().to_dict('records'))}
json.dump(summ, open('out/summary_priority.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=str)

feats = []
for i, r in p.iterrows():
    feats.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [round(r['경도'], 6), round(r['위도'], 6)]},
                  'properties': {'id': str(r['주차장관리번호']), 'name': r['주차장명'], 'gu': r['구군'], 'type': r['주차장유형'],
                                 'address': r['소재지도로명주소'] if isinstance(r['소재지도로명주소'], str) else r['소재지지번주소'],
                                 'stalls': int(r.stalls), 'area_m2_est': round(float(r.area_m2_est), 1),
                                 'cap_kw_upper': round(float(r.cap_kw_upper), 1),
                                 'gen_mwh': {k: round(float(r[f'gen_mwh_{k}']), 1) for k in ('low', 'mid', 'high')},
                                 'co2_t_mid': round(float(r.co2_t_mid), 1), 'group': r.group, 'tier': r.tier,
                                 'rank': None if pd.isna(r['rank']) else int(r['rank']), 'flags': r['flags'],
                                 'data_date': str(r['데이터기준일자'])}})
json.dump({'type': 'FeatureCollection', 'label': '추정치(설치의무 상한, 불합리 구획 미차감)', 'features': feats},
          open('out/sites.geojson', 'w', encoding='utf-8'), ensure_ascii=False)
print(json.dumps({k: v for k, v in summ.items() if k in ('tiers', 'tier1_share_of_sites_in_clean_pct')}, ensure_ascii=False, indent=1))
print(pd.DataFrame(summ['review_list']).to_string())
print(len(feats), 'features')
