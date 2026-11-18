import React from 'react';
import ReactDOM from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import App from './App';

// 기본 빌드는 Pretendard(SIL OFL)를 함께 배포. 미리보기 빌드(VITE_NO_LOCAL_FONT=1)는 웹폰트 링크로 대체
if (!import.meta.env.VITE_NO_LOCAL_FONT) import('pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
