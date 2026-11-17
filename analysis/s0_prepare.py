"""0단계: 업로드 원본(전국)에서 대구 분석용 부분집합 생성 (저장소에는 부분집합만 포함)"""
import glob
import pandas as pd
k = pd.read_csv('data/raw/uploads/fileA.csv', encoding='cp949')
k[k['지역'] == '대구시'].to_csv('data/raw/kpx_daegu_2025.csv', index=False, encoding='utf-8-sig')
a = pd.read_csv('data/raw/uploads/asos_raw.csv', encoding='cp949')
a.to_csv('data/raw/asos_143_daegu_2025.csv', index=False, encoding='utf-8-sig')
d = pd.concat([pd.read_csv(f, encoding='utf-8-sig', dtype={'발전기코드': str}) for f in sorted(glob.glob('data/raw/khnp/khnp_*.csv'))])
d['연도'] = d['거래일'].str[:4]
y = d.groupby(['지역', '발전기명', '연도']).agg(설비용량_kW=('설비용량', 'max'), 계량전력량_kWh=('계량전력량', 'sum'), 시간수=('시간', 'size')).reset_index()
y['kWh_per_kW'] = (y['계량전력량_kWh'] / y['설비용량_kW']).round(1)
import os; os.makedirs('data/derived', exist_ok=True)
y.to_csv('data/derived/khnp_yield_by_plant_year.csv', index=False, encoding='utf-8-sig')
print(len(k[k['지역'] == '대구시']), len(a), len(y))
