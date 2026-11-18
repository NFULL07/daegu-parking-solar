import { Meta } from '../lib/types';

export default function Footer({ meta }: { meta: Meta }) {
  return (
    <footer className="foot">
      <div className="foot-inner">
        <div>
          <h3>데이터 출처</h3>
          <ul>{meta.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.name}</a> · {s.org}</li>)}</ul>
          <h3>참고 자료</h3>
          <ul>{meta.refs.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.name}</a> · {s.org}</li>)}</ul>
        </div>
        <div>
          <h3>수치의 성격</h3>
          <p><span className="tag est">추정</span> 가정값을 곱해 얻은 값(설치용량·발전량·감축량). <span className="tag ver">검증</span> 2025년 실측과 비교한 값(AI 예측 정확도). <span className="tag sim">시뮬레이션</span> 운영 규칙을 가정하고 2025년 실측으로 돌린 값(ESS).</p>
          <details>
            <summary>한계</summary>
            <ul>
              <li>표준데이터에 면적 열이 없어 주차구획수 x 구획 면적으로 추정했고, 표준데이터에 빠진 주차장이 있을 수 있습니다.</li>
              <li>설치 불합리 구획을 빼지 않은 상한값입니다. 주변 건물 그림자는 반영하지 않았습니다.</li>
              <li>시·구 중복과 현장 제약(둔치·임시·주차빌딩 등)은 이름·거리 규칙으로 판정해 누락이나 오판이 있을 수 있습니다.</li>
              <li>kW당 발전량과 AI 검증은 2025년 한 해 자료입니다. 동서발전 예측은 2025년 중 102일이 원천 결측입니다.</li>
              <li>전력거래소 실적은 시장참여 설비만 포함하며 ESS 충방전이 섞여 있습니다.</li>
              <li>전기차 충전 데이터는 합성(가상)데이터이며 시간대 패턴이 없어 1회 충전량 환산에만 썼습니다.</li>
              <li>설치비·수익 등 경제성은 분석하지 않았습니다.</li>
            </ul>
          </details>
          <p className="muted small">지도 © OpenStreetMap contributors · 글꼴 Pretendard(SIL OFL) · 분석 코드와 원자료는 GitHub 저장소에 공개합니다.</p>
        </div>
      </div>
    </footer>
  );
}
