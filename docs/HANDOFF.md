# 화면 개발 인수인계 (대구 공영주차장 태양광 대시보드)

분석 세션에서 만든 결과 JSON을 읽기만 하는 정적 대시보드를 만든다. 계산은 화면에서 다시 하지 않는다 (ESS 시뮬레이터의 시나리오 전환만 JSON 값 선택).

## 기술 조건

- React + TypeScript (Vite), GitHub Pages 배포 → `vite.config.ts`에 `base: '/<저장소이름>/'`
- 지도: react-leaflet + OpenStreetMap 타일 (화면에 OSM 출처 표기 필수)
- 차트: Recharts
- 글꼴: Pretendard 또는 Noto Sans KR (상업용 무료 오픈소스)
- 데이터: `out/` 폴더 JSON을 `public/data/`로 복사해 fetch

## 표기 원칙 (심사 대응, 반드시 지킬 것)

- 모든 수치 옆에 성격 라벨: **추정**(발전량·감축량·용량), **검증**(AI 예측 정확도 = 2025 실측 대비), **시뮬레이션**(ESS)
- "성과"라는 말 쓰지 않기. 발전량·감축량은 "기대효과(추정)"
- 각 JSON의 `label` 필드 문구를 섹션 하단 주석으로 노출
- 충전 데이터는 "합성(가상)데이터" 명시

## 화면 4개와 데이터

### 1. 지도 `sites.geojson`
- 점 405개 = 대구 공영 노외·부설 주차장 전체. `group`: `mandate_ge80`(103, 의무 대상 후보) / `threshold_70_79`(15) / `under70`(287)
- 색 = `tier`: `1단계`(29) `2단계`(62) `현장 검토`(12) `문턱(대상 가능)`(2) `문턱(70~79면)`(13), 그 외 null(회색·작게)
- 팝업: name, gu, stalls, cap_kw_upper, gen_mwh.low~high, co2_t_mid, flags(배열), rank, data_date
- 필터: 구·군, 단계. 구 경계: `data/raw/boundary/daegu_sigungu_from_hjd_ver20250701.geojson` (속성 `sggnm`)

### 2. 감축효과 `summary_generation.json`, `summary_priority.json`
- 핵심 카드: 대상 103곳 / 20.55MW(상한) / 연 23.7~27.2GWh / 연 9.9~11.4천tCO2eq (추정)
- 대구시 계획(98곳, 22MW)과 나란히: `city_plan`
- 구별 막대: `by_gu` (sites, cap_mw, gen_gwh_mid, co2_t_mid)
- 단계별 표: `summary_priority.tiers`, 현장 검토 목록: `review_list`
- 문턱 분석: `threshold` (일반형만이면 80면, 확장형 30%면 79면, +장애인 3%면 78면부터 1,000㎡ 초과)

### 3. AI 예측 `forecast_eval.json`, `forecast_timeseries.json`
- 핵심 비교: 공식 예측(동서발전) nMAE 6.91% vs AI 6.26% → 9.4% 개선, 95% 신뢰구간 0.27~1.03%p (검증)
- 월별 막대: `by_month` (ewp_nMAE, ai_nMAE). 3월·6월은 AI가 더 나쁨 → 그대로 보여줄 것
- 시계열: `forecast_timeseries.json` 레코드 {date, hh, actual, ewp, ai} (MWh, 대구 등록설비 113.791MW 기준). 날짜 선택 → 하루 06~19시 3개 선
- 모델 설명: `model.role` 문구 ("공식 예측을 대체하지 않고 보정")

### 4. ESS 시뮬레이터 `ess_simulation.json`, `ess_daily_window.json`, `ess_example_days.json`
- 선택: ESS 규모 `0.5h / 1.0h / 2.0h`, 효율 `eta_base(0.66) / eta_alt(0.71)`
- 계획 방식 비교 표: `scenarios[규모][효율][none|ewp|ai|ewp_q20|ai_q20|actual]` → shortfall_mwh_total, shortfall_days, committed_mwh_total, reliable_mwh_total
- 핵심 메시지: `summary` 문구. 0.5~1시간 규모는 예측 효과 거의 없음, 2시간부터 의미 있음
- 연간(365일) 저녁 공급 가능량: `annual_365d_perfect[규모]` (evening_supply_mwh, loss_mwh, ev_sessions_equiv)
- 하루 운영 예시: `ess_example_days.json` {clear, median, cloudy} → hours[{hh, pv, charge, grid_export, discharge, soc}] 영역·선 차트
- 일별 산점도(선택): `ess_daily_window.json` {date, actual, ewp, ai, ewp_q20, ai_q20, none} (주차장 규모 MWh)

## 출처 (화면 하단 고정)

전국주차장정보표준데이터(행정안전부), 지역별 시간별 태양광 발전량(한국전력거래소), ASOS 시간자료(기상청), 하루 전 시도별 태양광 발전량 예측(한국동서발전), 기상정보 융합 태양광 시계열 발전정보(한국수력원자력), 전기차 충전건별 충전량 합성데이터(한국환경공단), 행정동 경계(통계청 SGIS, vuski/admdongkor CC BY 4.0), 지도 © OpenStreetMap contributors. URL은 `data/DATA_CATALOG.md`.

## 한계 문구 (화면 하단 접기 영역)

`data/DATA_CATALOG.md`의 "한계" 절을 그대로 사용.
