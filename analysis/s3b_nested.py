"""3단계 보완: 중첩 교차검증 (설정 선택까지 학습 데이터 안에서만 수행 → 낙관 편향 제거)"""
import json, itertools
import numpy as np, pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
df = pd.read_pickle('analysis/s3_df.pkl'); CAP = 113.791
df['ewp_cf'] = df.ewp / CAP
BASE = ['hh', 'doy_s', 'doy_c', 'exSolRad', 'icsrPred', 'dc3tca', 'temp', 'humid', 'ws']
FEATS = {'weather': BASE, 'weather+official': BASE + ['ewp_cf', 'useRate']}
CFGS = [dict(max_iter=400, learning_rate=0.05, max_leaf_nodes=31, min_samples_leaf=20, l2_regularization=1.0),
        dict(max_iter=300, learning_rate=0.03, max_leaf_nodes=15, min_samples_leaf=40, l2_regularization=1.0),
        dict(max_iter=600, learning_rate=0.02, max_depth=4, min_samples_leaf=30)]
def fit(tr, feat, cfg):
    return HistGradientBoostingRegressor(random_state=0, **cfg).fit(tr[feat], tr['y'])
pred = np.zeros(len(df)); chosen = {}
for m in sorted(df.month.unique()):
    outer_tr = df[df.month != m]
    months = sorted(outer_tr.month.unique())
    folds = [months[i::4] for i in range(4)]
    best, bscore = None, 1e9
    for (fn, feat), (ci, cfg) in itertools.product(FEATS.items(), enumerate(CFGS)):
        errs = []
        for f in folds:
            itr, ite = outer_tr[~outer_tr.month.isin(f)], outer_tr[outer_tr.month.isin(f)]
            p = np.clip(fit(itr, feat, cfg).predict(ite[feat]), 0, None)
            errs.append(np.abs(p - ite.y).sum())
        s = sum(errs)
        if s < bscore:
            best, bscore = (fn, ci), s
    fn, ci = best; chosen[int(m)] = f'{fn}/cfg{ci}'
    te = df.month == m
    pred[te.values] = np.clip(fit(outer_tr, FEATS[fn], CFGS[ci]).predict(df.loc[te, FEATS[fn]]), 0, None)
df['ai_nested'] = pred * CAP
err = df.ai_nested - df.actual
r = {'nMAE_pct': round(float(err.abs().mean() / CAP * 100), 2),
     'nRMSE_pct': round(float(np.sqrt((err ** 2).mean()) / CAP * 100), 2),
     'bias_pct': round(float(err.mean() / CAP * 100), 2),
     'r': round(float(np.corrcoef(df.ai_nested, df.actual)[0, 1]), 3)}
ewp = (df.ewp - df.actual).abs().mean() / CAP * 100
d = df.groupby('date')[['actual', 'ewp', 'ai_nested']].sum()
print(json.dumps({'ai_nested': r, 'ewp_nMAE': round(float(ewp), 2),
                  'rel_improve_pct': round(float((1 - r['nMAE_pct'] / ewp) * 100), 1),
                  'daily_nMAE': {n: round(float((d[n] - d.actual).abs().mean() / (CAP * 24) * 100), 2) for n in ('ewp', 'ai_nested')},
                  'chosen': chosen}, ensure_ascii=False, indent=1))
df.to_pickle('analysis/s3_df.pkl')
