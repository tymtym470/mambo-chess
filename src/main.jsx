import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './theme.css';
import { MAMBO_CAT_FALLBACK_URL, MAMBO_CAT_URL } from './mascot.js';

class ErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main className="recovery"><img src={MAMBO_CAT_URL} width="100" alt="原版哈基米曼波猫" onError={e => { e.currentTarget.src = MAMBO_CAT_FALLBACK_URL; }}/><h1>棋盘暂时走神了</h1><button className="primary-button" onClick={() => { localStorage.removeItem('mambo-current'); window.location.reload(); }}>重新打开棋盘</button></main>;
    return this.props.children;
  }
}
createRoot(document.getElementById('root')).render(<ErrorBoundary><App/></ErrorBoundary>);
