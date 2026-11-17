"""3단계: AI 하루 전 발전량 예측 vs 동서발전 공식 예측
- 입력: 동서발전 API가 제공하는 하루 전 예보 기상값(공식 예측과 같은 입력)
- 정답: 전력거래소 대구 시간별 태양광 거래량 (동서발전 hh+1 = KPX 거래시간)
- 검증: 월 단위 블록 교차검증(한 달씩 빼고 학습 → 그 달 예측)
"""
import json
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import LinearRegression

CAP = 113.791   # MW, 동서발전 pvKpxRst (2025)
e = pd.read_csv('data/raw/api/ewp_solar_forecast_daegu_2025.csv', encoding='utf-8-sig').drop_duplicates(['predDate', 'hh'])
k = pd.read_csv('data/raw/kpx_daegu_2025.csv', encoding='utf-8-sig')
k = k[k['지역'] == '대구시'].copy()
k['predDate'] = pd.to_datetime(k['거래일']).dt.strftime('%Y%m%d').astype(int)
k['hh'] = k['거래시간'].astype(int) - 1
df = e.merge(k[['predDate', 'hh', '전력거래량(MWh)']], on=['predDate', 'hh'], how='inner')
df = df.rename(columns={'전력거래량(MWh)': 'actual'})
df['date'] = pd.to_datetime(df.predDate.astype(str))
df['month'] = df.date.dt.month
doy = df.date.dt.dayofyear
df['doy_s'], df['doy_c'] = np.sin(2 * np.pi * doy / 365), np.cos(2 * np.pi * doy / 365)
df['y'] = df.actual / CAP                       # 이용률(0~1)
FEAT = ['hh', 'doy_s', 'doy_c', 'exSolRad', 'icsrPred', 'dc3tca', 'temp', 'humid', 'ws']

pred_gb, pred_lr = np.zeros(len(df)), np.zeros(len(df))
for m in sorted(df.month.unique()):
    tr, te = df.month != m, df.month == m
    gb = HistGradientBoostingRegressor(max_iter=400, learning_rate=0.05, max_leaf_nodes=31,
                                       min_samples_leaf=20, l2_regularization=1.0, random_state=0)
    gb.fit(df.loc[tr, FEAT], df.loc[tr, 'y'])
    pred_gb[te.values] = gb.predict(df.loc[te, FEAT])
    lr = LinearRegression().fit(df.loc[tr, ['icsrPred', 'exSolRad']], df.loc[tr, 'y'])
    pred_lr[te.values] = lr.predict(df.loc[te, ['icsrPred', 'exSolRad']])
df['ai'] = np.clip(pred_gb, 0, None) * CAP
df['lin'] = np.clip(pred_lr, 0, None) * CAP
df['ewp'] = df.solgenKpx

def metrics(p, a):
    err = p - a
    return {'nMAE_pct': round(float(err.abs().mean() / CAP * 100), 2),
            'nRMSE_pct': round(float(np.sqrt((err ** 2).mean()) / CAP * 100), 2),
            'bias_pct': round(float(err.mean() / CAP * 100), 2),
            'r': round(float(np.corrcoef(p, a)[0, 1]), 3)}

res = {name: metrics(df[name], df.actual) for name in ('ewp', 'lin', 'ai')}
byM = {}
for m, g in df.groupby('month'):
    byM[int(m)] = {'days': int(g.predDate.nunique()),
                   'ewp_nMAE': round(float((g.ewp - g.actual).abs().mean() / CAP * 100), 2),
                   'ai_nMAE': round(float((g.ai - g.actual).abs().mean() / CAP * 100), 2)}
d = df.groupby('date')[['actual', 'ewp', 'ai']].sum()
daily = {n: round(float((d[n] - d.actual).abs().mean() / (CAP * 24) * 100), 2) for n in ('ewp', 'ai')}
win = float(((df.ai - df.actual).abs() < (df.ewp - df.actual).abs()).mean())

out = {
    'label': '검증 결과(2025 실측 대비). 월 단위 블록 교차검증, 같은 날짜·시간 비교',
    'n_hours': int(len(df)), 'n_days': int(df.predDate.nunique()), 'hours': '06~19시 시작 시각(동서발전 제공 구간)',
    'capacity_mw': CAP, 'features': FEAT,
    'hourly': res,
    'improvement_nMAE_pctpt': round(res['ewp']['nMAE_pct'] - res['ai']['nMAE_pct'], 2),
    'improvement_nMAE_rel_pct': round((1 - res['ai']['nMAE_pct'] / res['ewp']['nMAE_pct']) * 100, 1),
    'daily_total_nMAE_pct': daily, 'ai_better_hour_share': round(win, 3), 'by_month': byM,
    'models': {'ewp': '한국동서발전 하루 전 공식 예측(solgenKpx)', 'lin': '선형회귀(예측 일사·대기권밖 일사)',
               'ai': 'Gradient Boosting(HistGradientBoostingRegressor), 예보 기상 9개 변수'},
}
json.dump(out, open('out/forecast_eval.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# 대시보드용 시계열(검증 예측값)
ts = df[['date', 'hh', 'actual', 'ewp', 'ai']].copy()
ts['date'] = ts.date.dt.strftime('%Y-%m-%d')
ts[['actual', 'ewp', 'ai']] = ts[['actual', 'ewp', 'ai']].round(2)
ts.to_json('out/forecast_timeseries.json', orient='records', force_ascii=False)
df.to_pickle('analysis/s3_df.pkl')
print(json.dumps({k: v for k, v in out.items() if k != 'by_month'}, ensure_ascii=False, indent=1))
print(pd.DataFrame(byM).T)
