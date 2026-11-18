"""6단계: 웹 대시보드 입력 데이터 내보내기 (web/public/data)"""
import json, os
import numpy as np, pandas as pd
from shapely.geometry import shape, mapping
OUT = 'web/public/data'; os.makedirs(OUT, exist_ok=True)
CAP_KPX = 113.791
# 1) 대구 주차장 표준데이터 원행 (브라우저가 같은 선별 로직을 돌린다)
cols = ['주차장관리번호', '주차장명', '주차장구분', '주차장유형', '소재지도로명주소', '소재지지번주소', '주차구획수',
        '특기사항', '제공기관명', '위도', '경도', '데이터기준일자']
c = pd.read_csv('data/raw/daegu_parking_standard.csv', encoding='utf-8-sig')[cols]
c = c.astype(object).where(pd.notna(c), None)
json.dump(c.to_dict('records'), open(f'{OUT}/parking_daegu.json', 'w', encoding='utf-8'), ensure_ascii=False)
# 2) ESS 입력: 1MW당 충전구간(10~17시) 일별 발전량
g = pd.read_pickle('analysis/s4_window.pkl')
d263 = [{'date': r.date.strftime('%Y-%m-%d'), 'actual': r.actual / CAP_KPX, 'ewp': r.ewp / CAP_KPX, 'ai': r.ai_mean / CAP_KPX,
         'ewp_q20': r.ewp_q20 / CAP_KPX, 'ai_q20': r.ai_q20 / CAP_KPX} for r in g.itertuples()]
k = pd.read_csv('data/raw/kpx_daegu_2025.csv', encoding='utf-8-sig'); k['hh'] = k['거래시간'].astype(int) - 1
day = k[k.hh.between(10, 16)].groupby('거래일')['전력거래량(MWh)'].sum() / CAP_KPX
d365 = [float(v) for v in day.values]
# 하루 운영 예시용 시간별 1MW당 발전량(365일)
kk = k.copy(); kk['date'] = pd.to_datetime(kk['거래일']).dt.strftime('%Y-%m-%d')
hourly = {d: [round(float(x) / CAP_KPX, 5) for x in grp.sort_values('hh')['전력거래량(MWh)']] for d, grp in kk.groupby('date')}
json.dump({'days263': d263, 'days365_window_per_mw': d365, 'hourly_per_mw': hourly, 'charge_hours': [10, 16],
           'discharge_hours': [18, 20], 'kpx_capacity_mw': CAP_KPX},
          open(f'{OUT}/ess_inputs.json', 'w', encoding='utf-8'), ensure_ascii=False)
# 3) 예측 결과
for f in ('forecast_eval.json', 'forecast_timeseries.json', 'dedup_log.json', 'ess_simulation.json', 'summary_generation.json', 'summary_priority.json'):
    open(f'{OUT}/{f}', 'w', encoding='utf-8').write(open(f'out/{f}', encoding='utf-8').read())
# 4) 구·군 경계(단순화)
gj = json.load(open('data/raw/boundary/daegu_sigungu_from_hjd_ver20250701.geojson', encoding='utf-8'))
for f in gj['features']:
    f['geometry'] = mapping(shape(f['geometry']).simplify(0.001))
    f['properties'] = {'name': f['properties']['sggnm']}
json.dump(gj, open(f'{OUT}/daegu_sigungu.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
# 5) 기본 가정값·출처
A = json.load(open('data/assumptions.json', encoding='utf-8'))
meta = {
    'defaults': {'stall_m2': 12.5, 'kw_per_m2': 0.1, 'mandate_m2': 1000, 'threshold_m2': 875, 'mixed_stall_m2': 0.67 * 12.5 + 0.30 * 13.52 + 0.03 * 16.5,
                 'yields': {k2: A['yield_kwh_per_kw'][k2]['value'] for k2 in ('low', 'mid', 'high')},
                 'ef': A['emission_factor']['grid_tco2eq_per_mwh_2023']['value'], 'eta': 0.66, 'ess_ratio': 1.0,
                 'ev_kwh': A['ev_charging']['kwh_per_session_all']['value'], 'dedup_radius_m': 300},
    'city_plan': {'sites': 98, 'mw': 22, 'source': '브레이크뉴스 대구', 'url': 'https://dk.breaknews.com/205799'},
    'sources': [
        {'name': '전국주차장정보표준데이터', 'org': '행정안전부·지자체', 'url': 'https://www.data.go.kr/data/15012896/standard.do'},
        {'name': '지역별 시간별 태양광 발전량', 'org': '한국전력거래소', 'url': 'https://www.data.go.kr/data/15065269/fileData.do'},
        {'name': '하루 전 시도별 태양광 발전량 예측', 'org': '한국동서발전', 'url': 'https://www.data.go.kr/data/15144541/openapi.do'},
        {'name': '기상정보 융합 태양광 시계열 발전정보', 'org': '한국수력원자력', 'url': 'https://www.data.go.kr/data/15165984/fileData.do'},
        {'name': 'ASOS 시간자료(대구 143)', 'org': '기상청', 'url': 'https://data.kma.go.kr/data/grnd/selectAsosRltmList.do?pgmNo=36'},
        {'name': '전기차 충전건별 충전량 합성데이터', 'org': '한국환경공단', 'url': 'https://www.data.go.kr/data/15153595/openapi.do'},
        {'name': '행정동 경계', 'org': '통계청 SGIS, vuski/admdongkor(CC BY 4.0)', 'url': 'https://github.com/vuski/admdongkor'},
    ],
    'refs': [
        {'name': '공영주차장 재생e 설치의무화제도', 'org': '신재생에너지센터', 'url': 'https://www.knrec.or.kr/biz/introduce/new_policy/public_parking.do?gubun=A'},
        {'name': '2023년 전력배출계수 공표', 'org': '쿠키뉴스', 'url': 'https://www.kukinews.com/article/view/kuk202512180131'},
        {'name': '계절·시간대별 요금 개편', 'org': '경북매일', 'url': 'https://www.kbmaeil.com/article/20260414500422'},
        {'name': 'ESS 효율 실측(윤금란 외 2019)', 'org': '전기전자학회논문지', 'url': 'https://koreascience.kr/article/JAKO201919263351907.pdf'},
        {'name': '확장형 주차구획 30%', 'org': '정책브리핑', 'url': 'https://www.korea.kr/news/issueQAView.do?newsId=148838703'},
    ],
}
json.dump(meta, open(f'{OUT}/meta.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for f in sorted(os.listdir(OUT)): print(f, os.path.getsize(f'{OUT}/{f}'))
