import { useCallback, useState } from 'react';

// 브라우저 저장(선택 사항): 저장이 막힌 환경에서도 화면은 동작
export function useStored<T>(key: string, init: T): [T, (u: T | ((p: T) => T)) => void] {
  const read = (k: string): T => {
    try {
      const raw = localStorage.getItem(k);
      return raw ? ({ ...init, ...JSON.parse(raw) } as T) : init;
    } catch {
      return init;
    }
  };
  const [st, setSt] = useState(() => ({ key, v: read(key) }));
  const cur = st.key === key ? st : { key, v: read(key) };
  if (st.key !== key) setSt(cur);
  const set = useCallback((u: T | ((p: T) => T)) => {
    setSt((prev) => {
      const base = prev.key === key ? prev.v : read(key);
      const v = typeof u === 'function' ? (u as (p: T) => T)(base) : u;
      try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 저장 불가 */ }
      return { key, v };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [cur.v, set];
}

export const fmt = (n: number, d = 0) => (Number.isFinite(n) ? n.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '-');

export async function getJson<T>(f: string): Promise<T> {
  const r = await fetch(`${import.meta.env.BASE_URL}data/${f}`);
  if (!r.ok) throw new Error(f);
  return r.json();
}

export function download(name: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const TIER_COLOR: Record<string, string> = {
  '1단계': 'var(--c-tier1)',
  '2단계': 'var(--c-tier2)',
  '현장 검토': 'var(--c-review)',
  '문턱(대상 가능)': 'var(--c-thr)',
  '문턱 구간': 'var(--c-thr-weak)',
  '제외(현장 확인)': 'var(--c-excl)',
};

// 지도 점(SVG 속성)은 CSS 변수를 읽지 못하므로 같은 색을 hex로 둔다
export const TIER_HEX: Record<string, string> = {
  '1단계': '#1f63c6',
  '2단계': '#93b6ea',
  '현장 검토': '#e9a400',
  '문턱(대상 가능)': '#23966c',
  '문턱 구간': '#a7d8c3',
  '제외(현장 확인)': '#6b747a',
  under: '#c2c8cb',
};

// 차트(SVG 속성)용 색
export const C = {
  blue: '#1f63c6', blueLight: '#93b6ea', orange: '#e9a400', aqua: '#23966c',
  muted: '#c2c8cb', mutedDark: '#7d878d', ink: '#1b2126', ink2: '#545e66', grid: '#e3e6e7', hover: 'rgba(31,99,198,0.06)',
};
