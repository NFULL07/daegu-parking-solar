"""4단계 보완: ESS 계획용 '충전구간(10~17시) 발전량' 일 단위 예측
- 점예측(평균) + 안전 계획용 하위 20% 분위수 예측(quantile)
- 비교: 동서발전 공식 예측(그대로 / 학습기간 비율로 같은 안전여유 적용)
- 검증: 월 단위 12겹 블록 교차검증 (해당 월은 학습에서 제외)
"""
import json
import numpy as np, pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
CAP = 113.791; Q = 0.2
df = pd.read_pickle('analysis/s3_df.pkl')
win = df[df.hh.between(10, 16)]
g = win.groupby('date').agg(actual=('actual', 'sum'), ewp=('ewp', 'sum'), icsr=('icsrPred', 'sum'), exs=('exSolRad', 'sum'),
                            sky=('dc3tca', 'mean'), sky_max=('dc3tca', 'max'), temp=('temp', 'mean'), humid=('humid', 'mean'),
                            ws=('ws', 'mean'), use=('useRate', 'mean'), n=('hh', 'size')).reset_index()
g = g[g.n == 7].copy()
g['month'] = g.date.dt.month
doy = g.date.dt.dayofyear; g['ds'], g['dc'] = np.sin(2 * np.pi * doy / 365), np.cos(2 * np.pi * doy / 365)
g['y'] = g.actual / (CAP * 7); g['ewp_cf'] = g.ewp / (CAP * 7)
F = ['icsr', 'exs', 'sky', 'sky_max', 'temp', 'humid', 'ws', 'use', 'ewp_cf', 'ds', 'dc']
cfg = dict(max_iter=300, learning_rate=0.03, max_depth=3, min_samples_leaf=15, random_state=0)
for c in ('ai_mean', 'ai_q20', 'ewp_q20'):
    g[c] = np.nan
for m in sorted(g.month.unique()):
    tr, te = g.month != m, g.month == m
    mu = HistGradientBoostingRegressor(**cfg).fit(g.loc[tr, F], g.loc[tr, 'y'])
    qu = HistGradientBoostingRegressor(loss='quantile', quantile=Q, **cfg).fit(g.loc[tr, F], g.loc[tr, 'y'])
    g.loc[te, 'ai_mean'] = np.clip(mu.predict(g.loc[te, F]), 0, None) * CAP * 7
    g.loc[te, 'ai_q20'] = np.clip(qu.predict(g.loc[te, F]), 0, None) * CAP * 7
    ratio = (g.loc[tr, 'actual'] / g.loc[tr, 'ewp'].clip(lower=1)).quantile(Q)     # 공식 예측의 같은 안전여유
    g.loc[te, 'ewp_q20'] = g.loc[te, 'ewp'] * ratio
g['coverage_ai_q20'] = g.actual >= g.ai_q20
g['coverage_ewp_q20'] = g.actual >= g.ewp_q20
g.to_pickle('analysis/s4_window.pkl')
r = {c: {'MAE_MWh': round(float((g[c] - g.actual).abs().mean()), 1), 'bias_MWh': round(float((g[c] - g.actual).mean()), 1)}
     for c in ('ewp', 'ai_mean')}
print('days', len(g), r)
print('cloudy(actual<median) MAE', {c: round(float((g[c] - g.actual).abs()[g.actual < g.actual.median()].mean()), 1) for c in ('ewp', 'ai_mean')})
print('q20 coverage (실적이 계획 이상인 날 비율, 목표 0.8)', round(g.coverage_ai_q20.mean(), 3), round(g.coverage_ewp_q20.mean(), 3))
print('q20 mean plan MWh', round(g.ai_q20.mean(), 1), round(g.ewp_q20.mean(), 1), 'actual mean', round(g.actual.mean(), 1))
