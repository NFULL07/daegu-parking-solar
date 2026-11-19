import { Params, YieldKey } from '../lib/calc';
import { fmt } from '../lib/store';

interface Props {
  params: Params; defaults: Params; onChange: (u: (p: Params) => Params) => void; onClose: () => void;
  onExport: () => void; onImport: (f: File) => void; sido: string; ovCount: number; onResetOverrides: () => void;
}

const Y_LABEL: Record<YieldKey, string> = { low: '보수', mid: '기준', high: '낙관', custom: '직접 입력' };
const Y_NOTE: Record<Exclude<YieldKey, 'custom'>, string> = {
  low: '한수원 경북 지붕형 발전소 2025 실측',
  mid: '한수원 경북 12개 발전소 2025 중앙값',
  high: '전력거래소 대구 2025 발전량 / 등록설비 113.791MW',
};

export default function AssumptionsPanel({ params: p, defaults, onChange, onClose, onExport, onImport, sido, ovCount, onResetOverrides }: Props) {
  const set = <K extends keyof Params>(k: K, v: Params[K]) => onChange((x) => ({ ...p, ...x, [k]: v }));
  const numIn = (k: 'stall_m2' | 'kw_per_m2' | 'ef' | 'ev_kwh' | 'dedup_radius_m' | 'household_kwh_month', label: string, note: string, step = 0.01) => (
    <label className="field">{label}
      <input type="number" step={step} value={p[k]} onChange={(e) => e.target.value && set(k, Number(e.target.value))} />
      <span className="muted small">{note} (기본 {defaults[k]})</span>
    </label>
  );
  return (
    <div className="drawer-bg" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} aria-label="가정값 조정">
        <div className="drawer-head"><h2>가정값 조정</h2><button className="ghost" onClick={onClose}>닫기</button></div>
        <p className="small muted">바꾸면 지도·표·합계·ESS가 즉시 다시 계산됩니다. 값은 이 브라우저에만 저장됩니다.</p>

        <h3>kW당 연 발전량</h3>
        <div className="seg wrap">
          {(['low', 'mid', 'high', 'custom'] as YieldKey[]).map((k) => (
            <button key={k} className={p.yieldKey === k ? 'on' : ''} onClick={() => set('yieldKey', k)}>
              {Y_LABEL[k]}{k !== 'custom' ? ` ${fmt(p.yields[k])}` : ''}
            </button>
          ))}
        </div>
        {p.yieldKey === 'custom'
          ? <label className="field">직접 입력(kWh/kW)<input type="number" value={p.yieldCustom} onChange={(e) => set('yieldCustom', Number(e.target.value))} /></label>
          : <p className="small muted">{Y_NOTE[p.yieldKey]}</p>}

        <h3>면적·용량</h3>
        {numIn('stall_m2', '일반형 주차구획 면적(㎡)', '주차장법 시행규칙 제3조 2.5m x 5.0m', 0.01)}
        {numIn('kw_per_m2', '설치의무 용량(kW/㎡)', '유효 주차구획 면적 10㎡당 1kW', 0.01)}

        <h3>온실가스·전기차·가구 환산</h3>
        {numIn('ef', '전력배출계수(tCO2eq/MWh)', '2023년 계수, 2025-12 공표', 0.0001)}
        {numIn('household_kwh_month', '4인 가구 월평균 전력사용량(kWh)', '2023년 5월 정부 전기요금 발표 기준', 1)}
        {numIn('ev_kwh', '전기차 1회 충전량(kWh)', '환경공단 합성데이터 대구 평균', 0.1)}

        <h3>데이터 정리</h3>
        {numIn('dedup_radius_m', '시·구 이중 등록 판정 거리(m)', '이름 앞 3글자가 같고 이 거리 안이면 같은 주차장', 10)}

        <div className="drawer-foot">
          <button onClick={() => onChange(() => defaults)}>가정값 기본으로 되돌리기</button>
        </div>

        <h3>작업 내용 파일</h3>
        <p className="small muted">가정값과 현장 확인 입력({sido}, {ovCount}건)을 파일로 저장해 다른 담당자와 나누거나 나중에 다시 불러올 수 있습니다.</p>
        <div className="filters">
          <button className="ghost" onClick={onExport}>작업 내용 저장</button>
          <label className="ghost-file">불러오기<input type="file" accept=".json,application/json" onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} /></label>
          {ovCount > 0 && <button className="ghost" onClick={onResetOverrides}>현장 확인 입력 모두 지우기</button>}
        </div>
      </aside>
    </div>
  );
}
