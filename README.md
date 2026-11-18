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
| `web/` | 분석 도구(React + TypeScript, 정적 사이트). 계산 로직 `web/src/lib/calc.ts`, 파이썬 결과 일치 테스트 `calc.test.ts` |

## 재현

```bash
pip install pandas numpy scikit-learn shapely
./run_all.sh
```

## 분석 도구(web)

```bash
cd web && npm install
npm test        # 브라우저 계산 = 파이썬 결과 확인
npm run build   # dist/ 를 GitHub Pages나 기관 내부 정적 서버에 그대로 올리면 동작
```

기능: 설치의무 대상 지도, 가정값 조정, 현장 확인 결과 반영(설치 불가·실제 면적), 결과 CSV 내려받기, 작업 내용 저장·불러오기, 다른 시·도 표준데이터 CSV 업로드, AI 예측 검증 보기, ESS 크기·효율 시뮬레이터. 서버 없이 브라우저 안에서만 계산하며 올린 파일은 전송하지 않는다.

## 결과 성격

발전량·감축량·용량은 추정치(기대효과), AI 예측 정확도는 2025년 실측 대비 검증값, ESS는 시뮬레이션이다.
한수원 원자료(약 93MB)는 용량 문제로 저장소에서 제외하고 `data/derived/`에 집계값만 둔다 (원본: https://www.data.go.kr/data/15165984/fileData.do).
