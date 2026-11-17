"""3단계 결과 정리: 중첩 교차검증 AI 예측을 대표 결과로 저장 + 일 단위 부트스트랩 신뢰구간"""
import json
import numpy as np, pandas as pd
df = pd.read_pickle('analysis/s3_df.pkl'); CAP = 113.791
def met(p, a):
    e = p - a
    return {'nMAE_pct': round(float(e.abs().mean() / CAP * 100), 2), 'nRMSE_pct': round(float(np.sqrt((e ** 2).mean()) / CAP * 100), 2),
            'bias_pct': round(float(e.mean() / CAP * 100), 2), 'r': round(float(np.corrcoef(p, a)[0, 1]), 3)}
df['ae_ewp'] = (df.ewp - df.actual).abs(); df['ae_ai'] = (df.ai_nested - df.actual).abs()
day = df.groupby('date')[['ae_ewp', 'ae_ai']].sum(); cnt = df.groupby('date').size()
rng = np.random.default_rng(0); diffs = []
for _ in range(2000):
    idx = rng.integers(0, len(day), len(day))
    s, n = day.iloc[idx].sum(), cnt.iloc[idx].sum()
    diffs.append((s.ae_ewp - s.ae_ai) / n / CAP * 100)
lo, hi = np.percentile(diffs, [2.5, 97.5])
byM = {int(m): {'days': int(g.predDate.nunique()),
                'ewp_nMAE': round(float(g.ae_ewp.mean() / CAP * 100), 2),
                'ai_nMAE': round(float(g.ae_ai.mean() / CAP * 100), 2)} for m, g in df.groupby('month')}
d = df.groupby('date')[['actual', 'ewp', 'ai_nested']].sum()
ewp_m, ai_m = met(df.ewp, df.actual), met(df.ai_nested, df.actual)
out = {
    'label': '검증 결과(2025 실측 대비, 추정 아님). 중첩 교차검증: 바깥 = 월 단위 12겹, 안쪽 = 설정 선택 4겹',
    'n_hours': int(len(df)), 'n_days': int(df.predDate.nunique()),
    'hours': '동서발전 제공 06~19시(시작 시각) 구간만 비교. 2025년 102일은 원천 결측으로 제외',
    'capacity_mw': CAP, 'target': '전력거래소 대구 시간별 태양광 거래량(MWh)',
    'hourly': {'official_ewp': ewp_m, 'ai': ai_m},
    'improvement': {'nMAE_pctpt': round(ewp_m['nMAE_pct'] - ai_m['nMAE_pct'], 2),
                    'relative_pct': round((1 - ai_m['nMAE_pct'] / ewp_m['nMAE_pct']) * 100, 1),
                    'pctpt_95ci_day_bootstrap': [round(float(lo), 2), round(float(hi), 2)]},
    'daily_total_nMAE_pct': {n: round(float((d[n] - d.actual).abs().mean() / (CAP * 24) * 100), 2) for n in ('ewp', 'ai_nested')},
    'ai_better_hour_share': round(float((df.ae_ai < df.ae_ewp).mean()), 3),
    'by_month': byM,
    'model': {'type': 'Gradient Boosting (scikit-learn HistGradientBoostingRegressor)',
              'inputs': '하루 전 예보 기상(예측 일사, 대기권밖 일사, 하늘상태, 기온, 습도, 풍속) + 시각·계절 + 공식 예측 이용률',
              'role': '공식 예측을 대체하지 않고 보정하는 모델. 입력은 모두 전날 14시 발표 시점에 확보 가능한 값'},
}
json.dump(out, open('out/forecast_eval.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
ts = df[['date', 'hh', 'actual', 'ewp', 'ai_nested']].rename(columns={'ai_nested': 'ai'}).copy()
ts['date'] = ts.date.dt.strftime('%Y-%m-%d'); ts['hh'] = ts.hh.astype(int)
ts[['actual', 'ewp', 'ai']] = ts[['actual', 'ewp', 'ai']].round(2)
ts.sort_values(['date', 'hh']).to_json('out/forecast_timeseries.json', orient='records', force_ascii=False)
print(json.dumps(out, ensure_ascii=False, indent=1))
