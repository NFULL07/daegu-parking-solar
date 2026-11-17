# 대구 공영주차장 태양광 설치의무 분석 + AI 발전량 예측 기반 ESS 운영 시뮬레이션

2026 대구광역시 기후·환경·탄소중립 공공데이터 AI 활용대회 (공공데이터 분석·시각화 부문) 출품작 작업 저장소.

## 구성

| 폴더 | 내용 |
|---|---|
| `data/raw/` | 대구 부분집합 원자료 (주차장, KPX, ASOS, 동서발전 API, 환경공단 API, 경계) |
| `data/derived/` | 한수원 발전소별 연간 kWh/kW |
| `data/assumptions.json` | 계산 기준값과 출처 (status: confirmed / derived / todo) |
| `data/DATA_CATALOG.md` | 데이터 목록, URL, 한계 |
| `analysis/` | 분석 코드 s1~s5, 독립 재계산 검증 `verify.py` |
| `scripts/fetch_public_api.py` | 공공데이터포털 API 수집 (인증키는 실행 시 입력) |
| `out/` | 대시보드용 결과 JSON |
| `docs/HANDOFF.md` | 화면 개발 인수인계 |

## 재현

```bash
pip install pandas numpy scikit-learn shapely
./run_all.sh
```

## 결과 성격

발전량·감축량·용량은 추정치(기대효과), AI 예측 정확도는 2025년 실측 대비 검증값, ESS는 시뮬레이션이다.
한수원 원자료(약 93MB)는 용량 문제로 저장소에서 제외하고 `data/derived/`에 집계값만 둔다 (원본: https://www.data.go.kr/data/15165984/fileData.do).
