import { useState } from 'react';
import Papa from 'papaparse';
import { decodeCsv, listSidos, RawRow } from '../lib/calc';
import type { Dataset } from '../App';
import { fmt } from '../lib/store';

export default function RegionLoader({ onClose, onLoad }: { onClose: () => void; onLoad: (d: Dataset) => void }) {
  const [rows, setRows] = useState<RawRow[] | null>(null);
  const [name, setName] = useState('');
  const [sidos, setSidos] = useState<{ sido: string; n: number }[]>([]);
  const [sido, setSido] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const onFile = async (f: File) => {
    setErr(''); setBusy(true); setName(f.name);
    try {
      const text = decodeCsv(await f.arrayBuffer());
      const res = Papa.parse<RawRow>(text, { header: true, skipEmptyLines: true });
      const need = ['주차장명', '주차장구분', '주차장유형', '주차구획수', '제공기관명', '위도', '경도'];
      const miss = need.filter((c) => !(res.meta.fields ?? []).includes(c));
      if (miss.length) throw new Error(`표준데이터 열이 없습니다: ${miss.join(', ')}`);
      const ss = listSidos(res.data);
      setRows(res.data); setSidos(ss); setSido(ss[0]?.sido ?? '');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e)); setRows(null);
    } finally { setBusy(false); }
  };

  return (
    <div className="drawer-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="다른 지역 데이터 불러오기">
        <div className="drawer-head"><h2>다른 지역 데이터 불러오기</h2><button className="ghost" onClick={onClose}>닫기</button></div>
        <ol className="small">
          <li><a href="https://www.data.go.kr/data/15012896/standard.do" target="_blank" rel="noreferrer">공공데이터포털 전국주차장정보표준데이터</a>에서 CSV를 내려받습니다(전국 파일 그대로 가능).</li>
          <li>아래에서 파일을 고르고 시·도를 선택합니다.</li>
          <li>대상 선별, 중복 제거, 설치 순서, 기대효과가 그 지역 기준으로 다시 계산됩니다.</li>
        </ol>
        <p className="small muted">파일은 이 브라우저 안에서만 읽고, 어디에도 전송하지 않습니다. UTF-8과 EUC-KR(CP949) 모두 읽습니다.</p>
        <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        {busy && <p className="small">읽는 중…</p>}
        {err && <p className="err small">{err}</p>}
        {rows && (
          <div className="mt">
            <p className="small">{name}: {fmt(rows.length)}행</p>
            <label className="field">시·도
              <select value={sido} onChange={(e) => setSido(e.target.value)}>
                {sidos.map((s) => <option key={s.sido} value={s.sido}>{s.sido} ({fmt(s.n)}행)</option>)}
              </select>
            </label>
            <button onClick={() => onLoad({ sido, rows, uploaded: true, fileName: name })} disabled={!sido}>이 지역으로 분석</button>
          </div>
        )}
      </div>
    </div>
  );
}
