# -*- coding: utf-8 -*-
"""
대구 공영주차장 태양광 분석용 공공데이터 API 2종 수집 스크립트

  1) 한국동서발전 하루 전 시도별 태양광 발전량 예측값 (data.go.kr 15144541) -> 대구
  2) 한국환경공단 전기차 충전건별 충전량 합성데이터 (data.go.kr 15153595) -> 대구

- 인증키는 실행할 때 입력받고 파일에는 저장하지 않습니다.
- 결과: 이 파일과 같은 폴더의 api_out/ 에 CSV + meta JSON 저장
- 표준 라이브러리만 사용 (pip 설치 불필요)
- 실행: python fetch_public_api.py [ewp] [ev]  (생략 시 둘 다)
"""
import csv
import getpass
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "api_out")
EWP_URL = "https://apis.data.go.kr/B552070/forecastService/oamsFile31"
EV_URL = "https://apis.data.go.kr/B552584/elcarChrsChargRcngSyrdt/getList"

EV_SAMPLE_PAGES = 800      # 충전 합성데이터: 전체 페이지 중 고르게 뽑을 페이지 수 (x100건)
SLEEP = 0.15               # 호출 간 대기(초)

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def get_key():
    k = os.environ.get("DATA_GO_KR_KEY") or getpass.getpass(
        "공공데이터포털 일반 인증키를 붙여넣고 Enter (화면에 표시되지 않음): ")
    k = k.strip()
    if not k:
        sys.exit("인증키가 비어 있습니다.")
    # Encoding 키(%포함)는 그대로, Decoding 키는 URL 인코딩
    return k if "%" in k else urllib.parse.quote(k, safe="")


def call(base, key, params, tries=3):
    url = base + "?serviceKey=" + key + "&" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "application/json, application/xml;q=0.9, */*;q=0.8"})
    last = ""
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                raw = r.read().decode("utf-8", "replace")
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return {"_raw": raw[:400]}
        except urllib.error.HTTPError as e:
            try:
                body = e.read().decode("utf-8", "replace").strip().replace("\n", " ")[:300]
            except Exception:
                body = ""
            last = "HTTP %s %s" % (e.code, body)
            if e.code in (401, 403):
                break
        except Exception as e:  # 메시지에 URL(키) 미포함
            last = type(e).__name__
        time.sleep(2 * (i + 1))
    return {"_error": last}


def parse(d):
    """(items list, totalCount, resultCode/msg) 반환"""
    if "_error" in d or "_raw" in d:
        return None, None, d.get("_error") or d.get("_raw")
    root = d.get("response", d)
    head = root.get("header", {}) or {}
    body = root.get("body", {}) or {}
    msg = "%s %s" % (head.get("resultCode", ""), head.get("resultMsg", ""))
    it = body.get("items", [])
    if isinstance(it, dict):
        it = it.get("item", [])
    if isinstance(it, dict):
        it = [it]
    if not isinstance(it, list):
        it = []
    try:
        total = int(body.get("totalCount") or 0)
    except ValueError:
        total = 0
    return it, total, msg.strip()


class Writer:
    def __init__(self, path, resume=False):
        self.path, self.f, self.w, self.n = path, None, None, 0
        if resume and os.path.exists(path):
            with open(path, newline="", encoding="utf-8-sig") as f:
                r = csv.reader(f)
                fields = next(r, None)
                self.n = sum(1 for _ in r)
            if fields:
                self.f = open(path, "a", newline="", encoding="utf-8")
                self.w = csv.DictWriter(self.f, fieldnames=fields, extrasaction="ignore")

    def write(self, rows):
        if not rows:
            return
        if self.w is None:
            self.f = open(self.path, "w", newline="", encoding="utf-8-sig")
            self.fields = list(rows[0].keys())
            self.w = csv.DictWriter(self.f, fieldnames=self.fields, extrasaction="ignore")
            self.w.writeheader()
        self.w.writerows(rows)
        self.n += len(rows)
        self.f.flush()

    def close(self):
        if self.f:
            self.f.close()


def pick(values, word):
    for v in values:
        if v and word in str(v):
            return v
    return None


# ---------------------------------------------------------------- 1) 동서발전
def fetch_ewp(key):
    print("\n[1/2] 동서발전 하루 전 태양광 예측 (대구)")
    base = {"pageNo": 1, "numOfRows": 100, "apiType": "json"}
    items, total, msg = parse(call(EWP_URL, key, base))
    if items is None or not items:
        print("  - 응답 확인 필요:", msg)
        return {"status": "fail", "msg": str(msg)}
    cities = sorted({str(x.get("city")) for x in items})
    print("  - 응답 OK, totalCount=%s, 시도 예시=%s" % (total, cities[:20]))
    city = pick(cities, "대구")
    if not city:
        # 첫 페이지에 대구가 없으면 흔한 표기로 시도
        for c in ("대구", "대구광역시", "대구시"):
            it, t, _ = parse(call(EWP_URL, key, dict(base, city=c)))
            if it:
                city = c
                break
    if not city:
        print("  - 대구 표기를 찾지 못함")
        return {"status": "fail", "msg": "city not found", "cities": cities}
    sample_pd = str(items[0].get("predDate", ""))
    print("  - city='%s', predDate 형식 예='%s'" % (city, sample_pd))

    # 페이지 순서가 고정되지 않아 중복·누락이 생기므로 예측일자별로 1회씩 조회
    w = Writer(os.path.join(OUT, "ewp_solar_forecast_daegu_2025.csv"))
    mode = "by_date"
    fmt = "%Y-%m-%d" if "-" in sample_pd else "%Y%m%d"
    d, end = date(2025, 1, 1), date(2025, 12, 31)
    empty = []
    while d <= end:
        it, _, msg = parse(call(EWP_URL, key, dict(base, city=city, numOfRows=100,
                                                    predDate=d.strftime(fmt))))
        if not it:
            empty.append(d.isoformat())
        w.write(it or [])
        print("    %s  누적 %d" % (d, w.n), end="\r")
        d += timedelta(days=1)
        time.sleep(SLEEP)
    w.close()
    print("\n  - 저장: %s (%d행)" % (w.path, w.n))
    return {"status": "ok", "city": city, "mode": mode, "rows": w.n, "empty_dates": empty, "file": os.path.basename(w.path)}


# ---------------------------------------------------------------- 2) 충전 합성데이터
def fetch_ev(key):
    print("\n[2/2] 전기차 충전건별 충전량 합성데이터 (대구)")
    base = {"pageNo": 1, "numOfRows": 100, "returnType": "JSON"}
    items, total, msg = parse(call(EV_URL, key, base))
    if items is None or not items:
        print("  - 응답 확인 필요:", msg)
        return {"status": "fail", "msg": str(msg)}
    rgns = sorted({str(x.get("rgnNm")) for x in items})
    print("  - 응답 OK, 전체 totalCount=%s, 지역 예시=%s" % (total, rgns[:20]))
    rgn = pick(rgns, "대구")
    if not rgn:
        for c in ("대구광역시", "대구"):
            it, t, _ = parse(call(EV_URL, key, dict(base, rgnNm=c)))
            if it:
                rgn = c
                break
    if not rgn:
        print("  - 대구 표기를 찾지 못함")
        return {"status": "fail", "msg": "region not found", "regions": rgns}
    it, total_rgn, msg = parse(call(EV_URL, key, dict(base, rgnNm=rgn)))
    pages = math.ceil((total_rgn or 0) / 100)
    print("  - rgnNm='%s', 대구 totalCount=%s (%d페이지)" % (rgn, total_rgn, pages))
    if pages == 0:
        return {"status": "fail", "msg": "no rows for region"}
    n = min(EV_SAMPLE_PAGES, pages)
    targets = sorted({1 + round(i * (pages - 1) / max(n - 1, 1)) for i in range(n)})
    w = Writer(os.path.join(OUT, "ev_charging_synthetic_daegu.csv"), resume=True)
    skip = w.n // 100   # 이전 실행에서 받은 페이지 수 (페이지당 100건)
    if skip:
        print("  - 이어받기: 기존 %d행 → %d번째 페이지부터" % (w.n, skip + 1))
    failed = []
    for k, p in enumerate(targets, 1):
        if k <= skip:
            continue
        it, _, msg = parse(call(EV_URL, key, dict(base, rgnNm=rgn, pageNo=p)))
        if not it:
            failed.append(p)
        w.write(it or [])
        print("    %d/%d (page %d)  누적 %d" % (k, len(targets), p, w.n), end="\r")
        time.sleep(SLEEP)
    w.close()
    print("\n  - 저장: %s (%d행)" % (w.path, w.n))
    return {"status": "ok", "rgnNm": rgn, "total_rows_region": total_rgn,
            "pages_total": pages, "pages_sampled": len(targets),
            "sampling": "전체 페이지 중 균등 간격 추출" if len(targets) < pages else "전체",
            "rows": w.n, "failed_pages": failed, "file": os.path.basename(w.path)}


def main():
    os.makedirs(OUT, exist_ok=True)
    key = get_key()
    meta = {"run_at": datetime.now().isoformat(timespec="seconds"),
            "sources": {"ewp": "https://www.data.go.kr/data/15144541/openapi.do",
                        "ev": "https://www.data.go.kr/data/15153595/openapi.do"}}
    targets = [a.lower() for a in sys.argv[1:]] or ["ewp", "ev"]
    if "ewp" in targets:
        meta["ewp"] = fetch_ewp(key)
    if "ev" in targets:
        meta["ev"] = fetch_ev(key)
    with open(os.path.join(OUT, "api_meta_%s.json" % "_".join(targets)), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print("\n완료. api_out 폴더를 확인하세요. (인증키는 저장되지 않았습니다)")
    print("오류가 SERVICE_KEY_IS_NOT_REGISTERED 이면: 각 API 페이지에서 '활용신청' 후 1~2시간 뒤 재실행")


if __name__ == "__main__":
    main()
