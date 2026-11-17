"""1단계: 설치의무 대상 후보 선별 (전국주차장정보표준데이터 대구분)"""
import json, re
import pandas as pd
from shapely.geometry import shape, Point

STALL_M2 = 12.5          # 주차장법 시행규칙 제3조 일반형
KW_PER_M2 = 0.1          # 설치의무 용량 = 면적/10 x 1kW
c = pd.read_csv('data/raw/daegu_parking_standard.csv', encoding='utf-8-sig')
pub = c[(c['주차장구분'] == '공영') & (c['주차장유형'].isin(['노외', '부설']))].copy()

# 구·군 매핑 (경계 폴리곤 포함 판정)
gj = json.load(open('data/raw/boundary/daegu_sigungu_from_hjd_ver20250701.geojson', encoding='utf-8'))
polys = [(f['properties']['sggnm'], shape(f['geometry'])) for f in gj['features']]
def gu(lat, lon):
    p = Point(lon, lat)
    for n, g in polys:
        if g.contains(p):
            return n
    best = min(polys, key=lambda t: t[1].distance(p))
    return best[0] + '*'          # 경계 밖(근접 구로 배정)
pub['구군'] = [gu(a, b) for a, b in zip(pub['위도'], pub['경도'])]
pub['구군_주소'] = pub['소재지도로명주소'].fillna(pub['소재지지번주소']).str.extract(r'대구광역시\s+(\S+[구군])')[0]

# 구조 유형 플래그 (이름·특기사항 기반, 확정 아님)
txt = (pub['주차장명'].fillna('') + ' ' + pub['특기사항'].fillna(''))
pub['flag_building'] = txt.str.contains(r'빌딩|타워|주차장건물|입체|기계식|복합')
pub['flag_underground'] = txt.str.contains(r'지하')
pub['flag_temporary'] = txt.str.contains(r'임시')
pub['flag_riverside'] = txt.str.contains(r'둔치|하천|천변|강변')
pub['stalls'] = pd.to_numeric(pub['주차구획수'], errors='coerce')
pub['area_m2_est'] = pub['stalls'] * STALL_M2
pub['cap_kw_upper'] = pub['area_m2_est'] * KW_PER_M2
pub['group'] = pd.cut(pub['stalls'], [-1, 69, 79, 1e9], labels=['under70', 'threshold_70_79', 'mandate_ge80'])

# 중복 점검 (이름+좌표)
dup = pub.duplicated(['주차장명', '위도', '경도'], keep=False)
print('중복 의심', dup.sum())
print('구군 불일치(폴리곤 vs 주소)', (pub['구군'].str.rstrip('*') != pub['구군_주소']).sum())
print(pub['group'].value_counts())
g = pub[pub.group == 'mandate_ge80']
print('대상', len(g), '구획', int(g.stalls.sum()), 'MW', round(g.cap_kw_upper.sum() / 1000, 2))
print('빌딩', int(g.flag_building.sum()), '지하', int(g.flag_underground.sum()), '임시', int(g.flag_temporary.sum()), '둔치', int(g.flag_riverside.sum()))
print('유형', g['주차장유형'].value_counts().to_dict())
print(g.groupby('구군').agg(n=('stalls', 'size'), stalls=('stalls', 'sum'), mw=('cap_kw_upper', lambda s: round(s.sum() / 1000, 2))))
pub.to_pickle('analysis/s1_public.pkl')
