
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App, ErrorBoundary } from './App';
import { AppProvider } from './AppContext';
import { AssetCatalogPage } from './components/AssetCatalogPage';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// URL 파라미터로 뷰 분기 (멀티윈도우)
const urlParams = new URLSearchParams(window.location.search);
const viewMode = urlParams.get('view');

const root = ReactDOM.createRoot(rootElement);

if (viewMode === 'asset-catalog') {
  // 에셋 카탈로그 독립 창 — AppProvider 없이 독립 동작
  root.render(
    <React.StrictMode>
      <AssetCatalogPage />
    </React.StrictMode>
  );
} else {
  // 메인 앱
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <AppProvider>
          <App />
        </AppProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
}
