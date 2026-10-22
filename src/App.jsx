import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines, BarChart3, Bot, Check, ChevronDown, ChevronRight, CircleHelp, Clock3, Cpu, Flag, Github,
  Lightbulb, LoaderCircle, Maximize2, Minimize2, MonitorSmartphone, Moon, MoreHorizontal, PlugZap, Plus,
  RefreshCw, RotateCcw, RotateCw, Settings2, ShieldCheck, SkipForward, Sparkles, Sun, Swords, Users,
  Volume2, VolumeX, X,
} from 'lucide-react';
import Board, { GameGlyph } from './Board.jsx';
import { advance, CHESS_GLYPHS, freshGame, GAMES, LEVELS, Match, sideName, undo } from './game.js';
import { MAMBO_TAUNT_LINE, sound } from './audio.js';
import { readStorage, validateGame, writeStorage } from './storage.js';
import { MAMBO_CAT_FALLBACK_URL, MAMBO_CAT_SOURCE, MAMBO_CAT_VARIANTS } from './mascot.js';


const DEFAULT_SETTINGS = {
  mode: 'ai', level: 5, side: 1, provider: 'local', enabled: true, voice: true, volume: .55,
  music: true, numbers: false, autoAnalyze: true, refraction: true,
  theme: 'system',   // 'system' 跟随系统 | 'light' | 'dark'
};
const FAKE_PLAYERS = [
  { id: 'yehang', name: '夜航船', level: 3, tag: '刚下晚自习', avatar: '夜', ping: 42, win: 58, room: 'A-107' },
  { id: 'aqiang', name: '阿强不加班', level: 2, tag: '手机在线', avatar: '强', ping: 96, win: 47, room: 'A-112' },
  { id: 'mumu', name: '木木夕', level: 4, tag: '连输三把了', avatar: '木', ping: 31, win: 63, room: 'B-204' },
  { id: 'laowang', name: '隔壁老王', level: 3, tag: '茶还没凉', avatar: '王', ping: 58, win: 52, room: 'B-209' },
  { id: 'qinghe', name: '清和', level: 5, tag: '周末棋摊常客', avatar: '清', ping: 27, win: 71, room: 'C-301' },
  { id: 'xiaoyu', name: '小鱼干', level: 2, tag: '刚学会围棋', avatar: '鱼', ping: 133, win: 41, room: 'A-118' },
  { id: 'shanzhu', name: '山住一宿', level: 4, tag: '在网吧', avatar: '山', ping: 74, win: 60, room: 'C-305' },
  { id: 'lengyue', name: '冷月葬花魂', level: 4, tag: '开了个小窗', avatar: '冷', ping: 49, win: 66, room: 'B-215' },
  { id: 'dabai', name: '大白菜', level: 3, tag: '刚开局', avatar: '白', ping: 88, win: 55, room: 'A-121' },
  { id: 'yeban', name: '夜半敲门', level: 5, tag: '不打了不打了', avatar: '敲', ping: 35, win: 69, room: 'C-308' },
];
// 大厅里飘过的系统消息，让气氛像真的有人在
const LOBBY_TICKER = [
  '「小鱼干」在 A-118 开了新局',
  '「木木夕」刚赢了一盘，连胜 2',
  '「阿强不加班」掉线重连中…',
  '「清和」进入大厅',
  '有人给「隔壁老王」点了个赞',
  '「山住一宿」正在观战 C-301',
];
const RIVAL_CHATTER = ['这步有点东西', '等我一下，回个消息', '再来？', '啧，被你看出来了', '手滑了…', '你这段下得挺稳'];
const DEFAULT_API = { baseUrl: 'https://api.deepseek.com', model: '', key: '' };
const API_PRESETS = [
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com' },
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { id: 'gemini', label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  { id: 'qwen', label: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { id: 'moonshot', label: 'Moonshot / Kimi', baseUrl: 'https://api.moonshot.cn/v1' },
  { id: 'siliconflow', label: 'SiliconFlow', baseUrl: 'https://api.siliconflow.cn/v1' },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'ollama', label: 'Ollama 本地', baseUrl: 'http://127.0.0.1:11434/v1' },
];
function loadGame() { try { return validateGame(readStorage('mambo-current', freshGame())); } catch { return freshGame(); } }
function loadApi() {
  const saved = readStorage('mambo-api', {});
  return { ...DEFAULT_API, ...saved, key: '' };
}
const choiceOf = list => list[Math.floor(Math.random() * list.length)];
const minute = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

function IconButton({ icon: Icon, label, onClick, active, className = '', ...props }) {
  return <button className={`icon-button ${active ? 'active' : ''} ${className}`} title={label} aria-label={label} onClick={onClick} {...props}><Icon size={18} strokeWidth={1.7}/></button>;
}
function Toggle({ value, onChange, label }) {
  return <button type="button" className={`toggle ${value ? 'on' : ''}`} role="switch" aria-label={label} aria-checked={value} onClick={() => onChange(!value)}><span/></button>;
}
function RemoteCat({ className = '', alt = '原版哈基米曼波猫', mood = 'local' }) {
  const source = MAMBO_CAT_VARIANTS[mood] || MAMBO_CAT_VARIANTS.local;
  return <img key={mood} className={`mambo-cat mood-${mood} ${className}`} src={source} alt={alt} title={MAMBO_CAT_SOURCE} onError={e => {
    if (e.currentTarget.src.endsWith(MAMBO_CAT_FALLBACK_URL)) e.currentTarget.style.opacity = '.45';
    else e.currentTarget.src = MAMBO_CAT_FALLBACK_URL;
  }}/>;
}
function Modal({ title, children, onClose, wide = false, className = '', footer }) {
  const ref = useRef(null), close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const before = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    const cancel = e => { e.preventDefault(); close.current(); };
    dialog.addEventListener('cancel', cancel);
    return () => { dialog.removeEventListener('cancel', cancel); dialog.close(); before?.focus?.(); };
  }, []);
  return <dialog ref={ref} className={`modal glass ${wide ? 'wide' : ''} ${className}`} onClick={e => { if (e.target === ref.current) onClose(); }}>
    <div className="modal-body"><div className="modal-heading"><h2>{title}</h2><IconButton icon={X} label="关闭" onClick={onClose}/></div>{children}</div>
    {footer}
  </dialog>;
}
function ApiDiagnostics({ details }) {
  if (!details?.endpoint) return null;
  return <dl className="api-diagnostics">
    <dt>模型</dt><dd>{details.model || '未选择'}</dd>
    <dt>端点</dt><dd>{details.endpoint}</dd>
    <dt>响应</dt><dd>{details.protocol === 'responses' ? 'Responses' : 'Chat Completions'}{details.upstreamStatus ? ` · HTTP ${details.upstreamStatus}` : ''}{details.recovery === 'truncated' ? ' · 截断后重试' : details.repaired ? ' · 已纠正一次' : ''}</dd>
    {details.serverRevision && <><dt>服务版本</dt><dd>{details.serverRevision}</dd></>}
    {details.thinkingRequested === 'disabled' && <><dt>思考模式</dt><dd>已请求关闭</dd></>}
    {details.finishReason && <><dt>结束原因</dt><dd>{details.finishReason}</dd></>}
    {Number.isInteger(details.outputLimit) && <><dt>输出上限</dt><dd>{details.outputLimit} tokens</dd></>}
    {Number.isInteger(details.completionTokens) && <><dt>实际输出</dt><dd>{details.completionTokens} tokens{Number.isInteger(details.reasoningTokens) ? ` · 思考 ${details.reasoningTokens}` : ''}</dd></>}
    {details.sample && <><dt>回复片段</dt><dd>{details.sample}</dd></>}
  </dl>;
}
async function readApiResponse(res) {
  let data;
  try { data = await res.json(); }
  catch { throw new Error(`本地服务返回了无效 JSON（HTTP ${res.status}）`); }
  if (!res.ok) {
    const error = new Error(data.error || `API 请求失败（HTTP ${res.status}）`);
    error.diagnostics = data.diagnostics;
    throw error;
  }
  return data;
}
function ApiModal({ api, serverInfo, onClose, onSaved, testPosition, lastError, lastDetails }) {
  const initialPreset = API_PRESETS.find(item => item.baseUrl === api.baseUrl)?.id || 'custom';
  const initialModels = [...new Set([api.model, serverInfo.configured ? serverInfo.model : ''].filter(Boolean))];
  const [draft, setDraft] = useState(api), [preset, setPreset] = useState(initialPreset), [models, setModels] = useState(initialModels);
  const [testing, setTesting] = useState(false), [modelsLoading, setModelsLoading] = useState(false);
  const [status, setStatus] = useState(lastError ? { type: 'error', text: lastError, details: lastDetails } : null), [tested, setTested] = useState(null);
  const controller = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  const invalidate = () => {
    controller.current?.abort(); setTesting(false); setModelsLoading(false); setTested(null); setStatus(null);
  };
  const set = (key, value) => {
    invalidate();
    setDraft(v => ({ ...v, [key]: value, ...(key === 'baseUrl' ? { model: '' } : {}) }));
    if (key === 'baseUrl') { setModels([]); setPreset('custom'); }
  };
  const serverKey = serverInfo.configured && !draft.key.trim();
  function choosePreset(id) {
    invalidate();
    setPreset(id);
    const selected = API_PRESETS.find(item => item.id === id);
    if (selected) {
      setDraft(v => ({ ...v, baseUrl: selected.baseUrl, model: '' }));
      setModels([]);
    }
  }
  async function loadModels() {
    invalidate(); setModelsLoading(true);
    const request = new AbortController(); controller.current = request;
    try {
      const res = await fetch('/api/models', {
        method: 'POST', signal: request.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: draft.baseUrl, key: draft.key }),
      });
      const data = await readApiResponse(res);
      if (request.signal.aborted) return;
      const next = [...new Set((data.models || []).filter(Boolean))];
      if (!next.length) throw new Error('上游没有返回可用模型');
      setModels(next);
      setDraft(v => ({ ...v, model: next.includes(v.model) ? v.model : next[0] }));
      setStatus({ type: 'success', text: `已从上游获取 ${next.length} 个模型` });
    } catch (error) {
      if (!request.signal.aborted) setStatus({ type: 'error', text: error.message, details: error.diagnostics });
    } finally {
      if (!request.signal.aborted) setModelsLoading(false);
    }
  }
  async function test() {
    invalidate(); setTesting(true);
    const request = new AbortController(); controller.current = request;
    try {
      const res = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...draft, ...testPosition, action: 'test' }), signal: request.signal });
      const data = await readApiResponse(res);
      if (request.signal.aborted) return;
      if (data.verified !== 'legal-move' || !data.move) throw new Error('上游未通过合法落子验证');
      setTested(data);
      setStatus({ type: 'success', text: `落子验证通过 · ${data.model} · ${data.move}`, details: data.diagnostics });
    } catch (e) { if (!request.signal.aborted) setStatus({ type: 'error', text: e.message, details: e.diagnostics }); }
    finally { if (!request.signal.aborted) setTesting(false); }
  }
  const actions = <div className="modal-actions"><button className="secondary-button" onClick={test} disabled={testing || modelsLoading || !(serverKey ? serverInfo.model : draft.model)}>{testing ? <LoaderCircle size={16} className="spin"/> : <PlugZap size={16}/>}测试落子</button><button className="primary-button" disabled={!tested || testing || modelsLoading} onClick={() => {
    const saved = { baseUrl: (serverKey ? serverInfo.baseUrl : draft.baseUrl).trim(), model: serverKey ? serverInfo.model : draft.model, key: draft.key.trim() };
    writeStorage('mambo-api', { baseUrl: saved.baseUrl, model: saved.model }); onSaved(saved, tested); onClose();
  }}>保存并启用<Check size={16}/></button></div>;
  return <Modal title="连接模型 API" onClose={onClose} className="api-modal" footer={actions}>
    <div className="modal-kicker"><PlugZap size={17}/><span>Chat Completions / Responses</span></div>
    <div className="runtime-version" data-testid="server-revision">服务版本：{serverInfo.revision || '未标识，请重新启动'}</div>
    <div className="form-field"><label>常用接口</label><div className="api-preset-list" role="group" aria-label="常用接口">{API_PRESETS.map(item => <button type="button" key={item.id} data-api-preset={item.id} className={preset === item.id ? 'active' : ''} disabled={serverKey} onClick={() => choosePreset(item.id)}>{item.label}</button>)}</div>{serverKey && <small>当前使用服务器 .env 配置</small>}</div>
    <div className="form-field"><label htmlFor="api-url">API 地址</label><input id="api-url" type="url" value={serverKey ? serverInfo.baseUrl : draft.baseUrl} disabled={serverKey} onChange={e => set('baseUrl', e.target.value)} placeholder="https://api.deepseek.com"/></div>
    <div className="form-field"><label htmlFor="api-key">API Key <small>{serverInfo.configured ? '服务器已配置' : '仅保留在本次页面内存'}</small></label><input id="api-key" type="password" autoComplete="off" value={draft.key} onChange={e => set('key', e.target.value)} placeholder={serverInfo.configured ? '留空使用服务器密钥' : 'sk-...'}/></div>
    <div className="form-field"><label htmlFor="api-model">模型选择 <small>{models.length ? `${models.length} 个候选` : '等待上游返回'}</small></label><div className="model-picker"><select id="api-model" value={serverKey ? serverInfo.model : draft.model} disabled={serverKey || !models.length} onChange={e => set('model', e.target.value)}><option value="" disabled>请选择模型</option>{models.map(model => <option key={model} value={model}>{model}</option>)}</select><button type="button" className="secondary-button model-fetch" onClick={loadModels} disabled={modelsLoading || testing || serverKey}>{modelsLoading ? <LoaderCircle size={15} className="spin"/> : <RefreshCw size={15}/>}拉取模型</button></div></div>
    <div className="privacy-note"><ShieldCheck size={17}/><span>密钥不写入浏览器存储。模型请求会将当前棋局发送到所填服务，可能产生 API 费用。</span></div>
    {status && <div role="status" className={`form-status ${status.type}`}>{status.text}<ApiDiagnostics details={status.details}/></div>}
  </Modal>;
}

export default function App() {
  const [game, setGame] = useState(loadGame);
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS, ...readStorage('mambo-settings', {}) }));
  const [api, setApi] = useState(loadApi);
  const [serverInfo, setServerInfo] = useState({ configured: false });
  const [apiConnected, setApiConnected] = useState(false), [apiError, setApiError] = useState('');
  const [apiDetails, setApiDetails] = useState(null);
  const [selected, setSelected] = useState(null), [hint, setHint] = useState(null);
  const [flipped, setFlipped] = useState(false), [focus, setFocus] = useState(false);
  const [modal, setModal] = useState(null), [confirm, setConfirm] = useState(null);
  const [intro, setIntro] = useState(0), [immersive, setImmersive] = useState(false), [rival, setRival] = useState(null), [nick, setNick] = useState(() => readStorage('mambo-nick', '')), [draftNick, setDraftNick] = useState('');
  const [promotion, setPromotion] = useState(null), [toast, setToast] = useState('');
  const [thinking, setThinking] = useState(false), [analysisBusy, setAnalysisBusy] = useState(false), [apiBusy, setApiBusy] = useState(false);
  const [analysis, setAnalysis] = useState(null), [remoteAnalysis, setRemoteAnalysis] = useState(null);
  const [analysisVersion, setAnalysisVersion] = useState(0), [seconds, setSeconds] = useState(0);
  const [catMood, setCatMood] = useState('idle'), [aiError, setAiError] = useState(false);
  const [taunt, setTaunt] = useState({ text: '盯紧棋盘，曼波正在观察。', mood: 'idle', kind: 'idle', active: false, sequence: 0 });
  const apiController = useRef(null), toastTimeout = useRef(null), tauntTimer = useRef(null), boardWrap = useRef(null), introTimer = useRef(null);
  const leaseToken = useRef(globalThis.crypto?.randomUUID?.() || `mambo-${Date.now()}-${Math.random()}`);
  const liveMatch = useMemo(() => new Match(game), [game]);
  const match = liveMatch;
  const positionKey = JSON.stringify(game);
  const isAiTurn = settings.mode === 'ai' && liveMatch.turn !== settings.side && !liveMatch.result && !liveMatch.scoring;
  const canPlay = !match.result && !match.scoring && !isAiTurn && !thinking;
  const currentAnalysis = remoteAnalysis || analysis;
  const kindInfo = GAMES[game.kind];
  const setting = (key, value) => setSettings(s => ({ ...s, [key]: value }));
  // 全屏：优先用浏览器全屏 API，失败就退回专注模式
  function toggleImmersive() {
    const root = document.documentElement;
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
      setImmersive(false);
      return;
    }
    root.requestFullscreen?.().then(() => setImmersive(true)).catch(() => setImmersive(v => !v));
  }
  const mascotState = match.result ? match.result.winner === 0 ? 'draw' : match.result.winner === settings.side ? 'win' : 'lose' : thinking ? 'think' : match.check ? 'check' : catMood;

  function notify(message) {
    setToast(message); clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(''), 4500);
  }
  function showTaunt(text, mood = 'idle', kind = 'idle', speak = true) {
    clearTimeout(tauntTimer.current);
    setTaunt(value => ({ text, mood, kind, active: true, sequence: value.sequence + 1 }));
    if (speak) sound.comment(text, mood);
    tauntTimer.current = setTimeout(() => setTaunt(value => ({ ...value, active: false })), 7000);
  }
  function maybeTaunt(data, entry) {
    if (settings.mode !== 'ai') return;
    const aiSide = -settings.side;
    const after = new Match(data);
    if (after.result) {
      if (after.result.winner === aiSide) showTaunt(MAMBO_TAUNT_LINE, 'taunt', 'win');
      else if (after.result.winner === settings.side) showTaunt('曼波破防了，下一局再来。', 'lose', 'lose', false);
      else showTaunt('握手言和，下一局再来。', 'draw', 'draw', false);
      return;
    }
    if (entry.capture && entry.side === aiSide) {
      showTaunt(MAMBO_TAUNT_LINE, 'taunt', 'capture');
      return;
    }
    if (entry.capture && entry.side === settings.side) {
      showTaunt('这步很漂亮，曼波正在破防。', 'shock', 'panic', false);
      return;
    }
    if (data.moves.length < 6 || data.moves.length % 4 !== 0) return;
    const balance = analysis?.balance;
    if (typeof balance === 'number') {
      const aiLeading = aiSide === 1 ? balance > 68 : balance < 32;
      const playerLeading = aiSide === 1 ? balance < 32 : balance > 68;
      if (aiLeading) {
        showTaunt(MAMBO_TAUNT_LINE, 'taunt', 'lead');
        return;
      }
      if (playerLeading) {
        showTaunt('局势反转，曼波正在调整。', 'angry', 'panic', false);
        return;
      }
    }
    showTaunt('曼波正在观察下一步。', entry.side === aiSide ? 'laugh' : 'shock', entry.side === aiSide ? 'idle' : 'panic', false);
  }
  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(setServerInfo).catch(() => {});
    return () => { clearTimeout(toastTimeout.current); clearTimeout(tauntTimer.current); apiController.current?.abort(); };
  }, []);
  useEffect(() => { writeStorage('mambo-current', game); }, [game]);
  useEffect(() => {
    apiController.current?.abort(); setApiBusy(false); setRemoteAnalysis(null);
  }, [api]);
  useEffect(() => { writeStorage('mambo-settings', settings); sound.configure(settings); }, [settings]);
  // 主题：把选择写到 <html data-theme>，CSS 侧据此切换配色。
  // 'system' 时不写属性，交给 prefers-color-scheme 决定。
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark' || settings.theme === 'light') root.dataset.theme = settings.theme;
    else delete root.dataset.theme;
  }, [settings.theme]);
  useEffect(() => {
    const token = encodeURIComponent(leaseToken.current);
    const ping = () => fetch(`/api/lease?token=${token}`, { method: 'PUT', cache: 'no-store' }).catch(() => {});
    const close = () => { try { navigator.sendBeacon(`/api/lease/close?token=${token}`, 'close'); } catch {} };
    ping();
    const timer = setInterval(ping, 2500);
    window.addEventListener('pagehide', close);
    return () => { clearInterval(timer); window.removeEventListener('pagehide', close); };
  }, []);
  useEffect(() => {
    if (liveMatch.result || liveMatch.scoring || !game.moves.length) return;
    const id = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [liveMatch.result, liveMatch.scoring, game.moves.length]);
  useEffect(() => {
    setSelected(null); setHint(null); setRemoteAnalysis(null); setAnalysis(null); setApiBusy(false);
    apiController.current?.abort();
    if (!settings.autoAnalyze) return;
    setAnalysisBusy(true);
    const worker = new Worker(new URL('./ai.worker.js', import.meta.url), { type: 'module' });
    const timer = setTimeout(() => worker.postMessage({ game, level: 3, analysis: true }), 120);
    worker.onmessage = ({ data }) => { setAnalysisBusy(false); if (data.result) setAnalysis(data.result); else notify('本地分析暂不可用，请重试'); worker.terminate(); };
    worker.onerror = () => { setAnalysisBusy(false); worker.terminate(); };
    return () => { clearTimeout(timer); worker.terminate(); };
  }, [positionKey, settings.autoAnalyze, analysisVersion]);
  useEffect(() => {
    setAiError(false);
    if (!isAiTurn) { setThinking(false); return; }
    let cancelled = false, worker;
    const controller = new AbortController();
    setThinking(true);
    const finish = id => {
      if (cancelled) return;
      try { const next = advance(game, id); setGame(next.data); setCatMood(moodForEvent(next.entry.event)); sound.play(next.entry.event); maybeTaunt(next.data, next.entry); setThinking(false); }
      catch { setThinking(false); setCatMood('lose'); setAiError(true); notify('AI 走法未通过校验，可重试或切换本地引擎'); }
    };
    const localMove = () => {
      if (cancelled) return;
      worker = new Worker(new URL('./ai.worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => {
        if (cancelled) return;
        if (data.result?.move) finish(data.result.move); else { setThinking(false); setAiError(true); notify('AI 暂时无法落子，请重试'); }
        worker.terminate();
      };
      worker.onerror = () => { if (!cancelled) { setThinking(false); setAiError(true); } worker.terminate(); };
      worker.postMessage({ game, level: settings.level, analysis: false });
    };
    // 假联机：对面是 AI，但按真人节奏磨 5~10 秒再落子
    const thinkMs = rival ? 5000 + Math.random() * 5000 : 350;
    const timer = setTimeout(async () => {
      if (settings.provider === 'local') return localMove();
      try {
        const response = await requestApi('move', liveMatch, controller.signal);
        if (!response.move) throw new Error('API 没有返回当前局面的合法着法');
        if (!cancelled) {
          setApiConnected(true);
          setApiError('');
          setApiDetails(response.diagnostics);
          finish(response.move);
        }
      } catch (error) {
        if (!cancelled && error.name !== 'AbortError') {
          setApiConnected(false);
          setApiError(error.message);
          setApiDetails(error.diagnostics);
          setThinking(false); setAiError(true);
          notify('API 落子失败，对局已暂停');
        }
      }
    }, thinkMs);
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); worker?.terminate(); };
  }, [game, settings.mode, settings.side, settings.level, settings.provider, analysisVersion, api]);

  async function requestApi(action, target = match, signal) {
    const res = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({ ...api, action, level: settings.level, position: target.summary(), legal: target.legalMoves().map(m => ({ id: m.id, label: m.label })) }) });
    return readApiResponse(res);
  }
  async function remoteAnalyze() {
    if (!api.key && !serverInfo.configured && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(api.baseUrl)) { setModal('api'); return; }
    apiController.current?.abort();
    const controller = new AbortController(); apiController.current = controller; setApiBusy(true);
    try {
      const response = await requestApi('analyze', match, controller.signal);
      if (controller.signal.aborted) return;
      const move = match.legalMoves().find(m => m.id === response.move);
      setRemoteAnalysis({ ...response, suggestions: move ? [{ ...move, rank: 1, reason: response.reason }] : [] });
      sound.play('select');
    } catch (e) {
      if (e.name !== 'AbortError') {
        setApiConnected(false);
        setApiError(e.message);
        setApiDetails(e.diagnostics);
        notify(`API 分析失败：${e.message}`);
      }
    }
    finally { if (!controller.signal.aborted) setApiBusy(false); }
  }
  function moodForEvent(event) {
    return {
      move: 'move',
      capture: 'capture',
      check: 'check',
      win: 'win',
      lose: 'lose',
      draw: 'draw',
      promotion: 'win',
      pass: 'think',
      invalid: 'comfort',
      undo: 'comfort',
      start: 'open',
      select: 'move',
      mascot: 'dance',
    }[event] || 'idle';
  }
  function performMove(id) {
    try {
      const next = advance(game, id);
      setGame(next.data); setSelected(null); setHint(null); setPromotion(null); setCatMood(moodForEvent(next.entry.event)); sound.play(next.entry.event); maybeTaunt(next.data, next.entry);
    } catch (e) { notify(e.message); setCatMood('lose'); sound.play('invalid'); }
  }
  function clickCell(point) {
    sound.unlock();
    if (match.scoring && !match.result) {
      if (!match.engine.get(point)) return;
      const group = match.engine.getChain(point).map(p => p.join(','));
      setGame(g => ({ ...g, dead: g.dead.includes(point.join(',')) ? g.dead.filter(p => !group.includes(p)) : [...new Set([...g.dead, ...group])] }));
      setCatMood('move'); sound.play('select'); return;
    }
    if (!canPlay) return;
    const [x, y] = point, piece = match.cells[y][x];
    if (game.kind === 'go' || game.kind === 'gomoku') { performMove(`${x},${y}`); return; }
    if (piece?.side === match.turn) { setSelected(s => s?.[0] === x && s?.[1] === y ? null : point); setCatMood('move'); sound.play('select'); return; }
    if (!selected) return;
    const moves = match.legalMoves().filter(m => m.from?.[0] === selected[0] && m.from?.[1] === selected[1] && m.to?.[0] === x && m.to?.[1] === y);
    if (moves.length > 1) setPromotion(moves);
    else if (moves.length === 1) performMove(moves[0].id);
    else { setCatMood('lose'); sound.play('invalid'); notify(match.check ? '当前被将军，需要先应将' : '这枚棋子不能走到这里'); }
  }
  function guardChange(action, title = '开始新的对局？') {
    if (game.moves.length && !liveMatch.result) setConfirm({ title, message: '当前对局还没有结束，开始后会清空棋盘。', action });
    else action();
  }
  function startGame(kind = game.kind, size = game.size) {
    setGame(freshGame(kind, kind === 'go' ? ([19, 9, 13].includes(size) ? size : 19) : undefined));
    setSeconds(0); setFlipped(settings.side === -1); setModal(null); setIntro(v => v + 1); clearTimeout(introTimer.current); introTimer.current = setTimeout(() => setIntro(0), 2600); setCatMood(moodForEvent('start')); sound.play('start');
  }
  function changeGame(kind) { if (kind !== game.kind) guardChange(() => startGame(kind)); }
  function changeSettingGame(key, value) {
    if (settings[key] === value) return;
    guardChange(() => { setting(key, value); startGame(); if (key === 'side') setFlipped(value === -1); }, '切换对局设置？');
  }
  function undoMove() {
    if (!game.moves.length || match.result) return;
    setGame(g => undo(g, settings.mode, settings.side)); setHint(null); setCatMood(moodForEvent('undo')); sound.play('undo');
  }
  function showHint(candidate = currentAnalysis?.suggestions?.[0]) {
    if (!candidate) { setting('autoAnalyze', true); setAnalysisVersion(v => v + 1); notify('正在分析当前棋盘'); return; }
    setHint(candidate); if (candidate.from) setSelected(candidate.from); sound.play('select'); notify(`${candidate.label} · ${candidate.reason || '推荐走法'}`);
  }
  const playerLabel = side => settings.mode === 'human' ? (side === 1 ? '棋友一' : '棋友二') : side === settings.side ? (nick.trim() || '你') : (rival?.name || '曼波同学');
  const topSide = flipped ? 1 : -1, bottomSide = -topSide;
  function playerRow(side, bottom = false) {
    const isBot = settings.mode === 'ai' && settings.side !== side, active = match.turn === side && !match.result;
    return <div className={`player-row ${active ? 'is-turn' : ''} ${bottom ? 'bottom-player' : ''}`}>
      <div className={`player-avatar ${isBot ? 'bot-avatar' : ''}`}>{isBot ? <RemoteCat mood="avatar"/> : <span>{side === 1 ? '你' : '友'}</span>}<i className={`side-dot ${game.kind === 'chess' ? (side === 1 ? 'white' : 'black') : game.kind === 'xiangqi' ? (side === 1 ? 'red' : 'black') : side === 1 ? 'black' : 'white'}`}/></div>
      <div className="player-identity"><strong>{playerLabel(side)}{isBot && (rival ? <span className="tiny-badge">在线</span> : <span className="tiny-badge">AI</span>)}</strong><span>{sideName(game.kind, side)}<b>·</b>{isBot ? `Lv.${settings.level} ${LEVELS[settings.level - 1]}` : settings.mode === 'human' ? '同屏对弈' : '自在落子'}</span></div>
      <div className="player-state">{active && thinking && isBot ? <><LoaderCircle size={14} className="spin"/>思考中</> : active && !match.scoring ? <><span className="live-dot"/>执棋中</> : <span className="muted">{match.result ? '已结束' : '等待中'}</span>}</div>
      {game.kind === 'go' && <span className="capture-counter">提子 {match.engine.getCaptures(side)}</span>}
    </div>;
  }
  const resultLabel = match.result
    ? match.result.winner === 0
      ? '握手言和'
      : game.kind === 'go' && Number.isFinite(match.result.margin)
        ? `${sideName(game.kind, match.result.winner)}胜 ${match.result.margin.toFixed(1)} 目`
        : `${sideName(game.kind, match.result.winner)}获胜`
    : '';
  const goScore = game.kind === 'go' ? match.areaScore(game.dead) : null;
  const apiStatusLabel = apiError ? 'API 异常' : apiConnected ? '落子已验证' : serverInfo.configured || api.model ? 'API 未验证' : '连接 API';

  return <div className={`app-shell ${immersive ? 'immersive' : ''} ${focus ? 'focus-mode' : ''} ${settings.refraction ? 'refractive' : ''}`} data-kind={game.kind} onPointerDown={() => sound.unlock()}
    onPointerMove={e => {
      if (!settings.refraction || e.pointerType === 'touch' || !boardWrap.current) return;
      const bounds = boardWrap.current.getBoundingClientRect();
      boardWrap.current.style.setProperty('--light-x', `${Math.max(0, Math.min(100, (e.clientX - bounds.left) / bounds.width * 100))}%`);
      boardWrap.current.style.setProperty('--light-y', `${Math.max(0, Math.min(100, (e.clientY - bounds.top) / bounds.height * 100))}%`);
    }}>
    <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}><defs><filter id="glass-refraction"><feTurbulence type="fractalNoise" baseFrequency=".012 .08" numOctaves="2" seed="5" result="noise"/><feGaussianBlur in="noise" stdDeviation="2" result="smooth"/><feDisplacementMap in="SourceGraphic" in2="smooth" scale="9" xChannelSelector="R" yChannelSelector="G"/></filter></defs></svg>
    <div className="ambient-background" aria-hidden="true"><div className="light-ribbon ribbon-one"/><div className="light-ribbon ribbon-two"/><div className="light-ribbon ribbon-three"/></div>
    <header className="topbar">
      <button className="brand" onClick={() => startGame()} aria-label="曼波棋社新对局"><RemoteCat mood="avatar" className="brand-cat"/><span><strong>曼波棋社<span className="brand-dot">.</span></strong><small>MAMBO CHESS CLUB</small></span></button>
      <div className="header-note"><Swords size={15}/>四棋一桌<span className="header-note-dot"/>现在专注对弈</div>
      <div className="header-actions"><button className={`api-status ${apiConnected ? 'connected' : ''} ${apiError ? 'error' : ''}`} title={apiError || '打开 API 设置'} onClick={() => setModal('api')}><span className="status-dot"/><span>{apiStatusLabel}</span><PlugZap size={14}/></button><span className="header-divider"/><button className={`sound-pill ${settings.enabled ? 'on' : ''}`} onClick={() => setting('enabled', !settings.enabled)} title={settings.enabled ? '关闭全部音效' : '开启全部音效'}>{settings.enabled ? <Volume2 size={15}/> : <VolumeX size={15}/>}<span>{settings.enabled ? '声音开' : '静音'}</span></button><IconButton icon={Settings2} label="偏好设置" onClick={() => setModal('settings')}/></div>
    </header>
    <div className="workspace-heading"><div><div className="eyebrow"><span/> A LITTLE PAUSE. A GOOD MOVE.</div><h1>好棋，慢慢下<span>。</span></h1></div><div className="room-label"><span className="live-dot"/>我的休闲棋室<span className="room-number">NO. 001</span></div></div>
    <main className="workspace">
      <aside className="left-sidebar">
        <div className="sidebar-heading"><span>今天，下点什么</span><span className="micro-text">01 / 04</span></div>
        <div className="game-selector" role="tablist" aria-label="棋种">{Object.entries(GAMES).map(([kind, info]) => <button key={kind} role="tab" aria-selected={game.kind === kind} className={`game-option ${game.kind === kind ? 'active' : ''}`} onClick={() => changeGame(kind)}><span className={`game-thumb game-${kind}`}><GameGlyph kind={kind}/></span><span className="game-label"><strong>{info.name}</strong><small>{info.en}</small></span><span className="game-option-end">{game.kind === kind ? <span className="selected-dot"/> : <ChevronRight size={15}/>}</span></button>)}</div>
        <div className="sidebar-separator"/>
        <section className="game-settings">
          <div className="field-heading">与谁对弈<span>PLAY WITH</span></div>
          <div className="segmented mode-switch"><button className={settings.mode === 'ai' ? 'active' : ''} onClick={() => changeSettingGame('mode', 'ai')}><Bot size={17}/>曼波 AI</button><button className={settings.mode === 'human' ? 'active' : ''} onClick={() => changeSettingGame('mode', 'human')}><Users size={16}/>双人</button></div>
          <button className="lobby-button" onClick={() => { setDraftNick(nick); setModal('lobby'); }}><Users size={16}/>{rival ? `对手：${rival.name} · 换人` : '联机大厅'}<ChevronRight size={15}/></button>
          <div className="field-heading difficulty-heading">棋力等级<span className="level-label">Lv.{settings.level} {LEVELS[settings.level - 1]}</span></div>
          <div className="top-level-badge"><Cpu size={14}/>顶级模型 · Lv.5 大师</div>
          <div className="range-labels"><span>轻松一点</span><span>认真一点</span></div>
          {settings.mode === 'ai' && <><div className="field-heading small">我的执子</div><div className="side-selector">{[1, -1].map(side => <button key={side} className={settings.side === side ? 'active' : ''} onClick={() => changeSettingGame('side', side)}><span className={`stone-sample ${game.kind === 'chess' ? side === 1 ? 'white' : 'black' : game.kind === 'xiangqi' ? side === 1 ? 'red' : 'black' : side === 1 ? 'black' : 'white'}`}/>{sideName(game.kind, side)}{side === 1 && <small>先手</small>}</button>)}</div></>}
          {game.kind === 'go' && <div className="size-row"><span>棋盘路数</span><select aria-label="围棋棋盘大小" value={game.size} onChange={e => guardChange(() => startGame('go', Number(e.target.value)))}>{[[19, '19 路（标准）'], [13, '13 路'], [9, '9 路']].map(([n, label]) => <option key={n} value={n}>{label}</option>)}</select></div>}
          <button className="primary-button new-game" onClick={() => guardChange(() => startGame())}><Plus size={18}/>开启新对局<ChevronRight size={17}/></button>
          <button className="engine-button" onClick={() => setModal('engine')}><Cpu size={14}/>{settings.provider === 'local' ? '本地战术引擎' : 'API 模型对弈'}<ChevronDown size={13}/></button>
        </section>
        <div className="sidebar-bottom"><span className="tiny-paw">✦</span><p>胜负之外，<br/>还有一声曼波。</p><span className="micro-text">MAKE A MOVE, MAKE A MOMENT.</span></div>
      </aside>
      <section className="play-area" aria-label="对弈区">
        <div className="board-heading"><div><h2>{kindInfo.name}</h2><span>{game.kind === 'go' ? `${game.size} × ${game.size}` : game.kind === 'xiangqi' ? '9 × 10' : `${game.size} × ${game.size}`}</span><span className="rule-tag">{game.kind === 'gomoku' ? '自由规则' : game.kind === 'go' ? '数子规则' : '标准棋局'}</span></div><div className="board-top-actions"><IconButton icon={Maximize2} label="全屏对弈" onClick={toggleImmersive}/><IconButton icon={CircleHelp} label="棋局规则" onClick={() => setModal('rules')}/><IconButton icon={focus ? Minimize2 : Maximize2} label={focus ? '退出专注模式' : '专注模式'} onClick={() => setFocus(!focus)}/></div></div>
        <div className={`taunt-panel taunt-${taunt.kind} ${taunt.active ? 'is-active' : ''}`} key={taunt.sequence} aria-live="polite">
          <div className="taunt-panel-image"><RemoteCat mood={taunt.mood}/></div>
          <div className="taunt-panel-copy"><span>哈基米研究所 · 实时观察</span><strong>{taunt.text}</strong><small>{taunt.active ? '刚刚触发 · 音效同步' : '实时跟随棋局状态'}</small></div>
        </div>
        {playerRow(topSide)}
        <div ref={boardWrap} className={`board-glass glass ${thinking ? 'thinking' : ''}`}><div className="glass-edge" aria-hidden="true"/><Board match={match} selected={selected} onCell={clickCell} hint={hint} flipped={flipped} numbers={settings.numbers} disabled={!canPlay} dead={game.dead}/>
          {match.result && <div className={`result-banner result-${match.result.winner === settings.side ? 'win' : match.result.winner === 0 ? 'draw' : 'lose'}`} role="status"><Sparkles size={18}/><strong>{resultLabel}</strong><span>{match.result.reason}</span><button onClick={() => guardChange(() => startGame())}>再来一局<ChevronRight size={14}/></button></div>}
        </div>
        {playerRow(bottomSide, true)}
        {match.scoring && !match.result && goScore && <div className="scoring-bar"><div><strong>终局数子</strong><span>黑 {goScore.black.toFixed(1)}（地 {goScore.territory.black} + 提 {goScore.prisoners.black}） · 白 {goScore.white.toFixed(1)}（地 {goScore.territory.white} + 提 {goScore.prisoners.white}，含贴目）</span></div><button className="secondary-button" onClick={() => setGame(g => ({ ...g, moves: g.moves.slice(0, -2), dead: [] }))}>继续对弈</button><button className="primary-button" onClick={() => setConfirm({ title: '双方确认数子结果？', message: '已标记的死子将移除，按地盘与提子计算，白方贴 6.5 目。', action: () => { setGame(g => ({ ...g, scoreAccepted: true })); sound.play('win'); } })}>确认结果</button></div>}
        <div className="board-toolbar"><div className="toolbar-group"><IconButton icon={RotateCcw} label="悔棋" onClick={undoMove} disabled={!game.moves.length || !!match.result}/><IconButton icon={RotateCw} label="翻转棋盘" onClick={() => setFlipped(f => !f)}/><IconButton icon={Lightbulb} label="显示提示" onClick={() => showHint()} active={!!hint} disabled={!!match.result || match.scoring}/></div><div className="board-turn-status" aria-live="polite">{thinking ? <><span className="thinking-dots"><i/><i/><i/></span>{rival ? `${rival.name} 正在想…` : '曼波正在想下一步'}</> : match.result ? `${resultLabel} · ${match.result.reason}` : match.scoring ? '双方停着 · 点选死子' : <><span className="live-dot"/>{sideName(game.kind, match.turn)}落子{match.check ? ' · 将军！' : ''}</>}</div><div className="toolbar-group"><IconButton icon={Flag} label="认输" disabled={!!match.result || thinking || !game.moves.length} onClick={() => setConfirm({ title: '确定认输？', message: '结束当前对局，结果会清晰显示在棋盘下方。', action: () => { setGame(g => ({ ...g, resigned: settings.mode === 'ai' ? settings.side : match.turn })); sound.play('win'); } })}/><IconButton icon={MoreHorizontal} label="更多棋盘操作" onClick={() => setModal('board')}/></div></div>
        {apiError && <section className="api-error-panel" role="alert">
          <strong>{aiError ? 'API 落子暂停' : 'API 请求失败'}</strong><p>{apiError}</p><ApiDiagnostics details={apiDetails}/>
          <div className="api-error-actions">
            {aiError && <button className="secondary-button" disabled={thinking} onClick={() => setAnalysisVersion(v => v + 1)}><RefreshCw size={14}/>重试落子</button>}
            <button className="secondary-button" onClick={() => setModal('api')}><PlugZap size={14}/>检查配置</button>
            {settings.provider === 'api' && <button className="secondary-button" onClick={() => { setting('provider', 'local'); setApiError(''); }}><Cpu size={14}/>改用本地 AI</button>}
          </div>
        </section>}
        {aiError && !apiError && <button className="retry-ai" onClick={() => setAnalysisVersion(v => v + 1)}><RefreshCw size={14}/>重新请求 AI 落子</button>}
        <div className="board-footnote"><span><ShieldCheck size={12}/>合法落子校验</span><span><Clock3 size={12}/>{minute(seconds)}</span><span>{kindInfo.rule}</span></div>
      </section>
      <aside className="right-sidebar">
      <div className={`analyst-intro mascot-${mascotState}`}><div className="analyst-label"><span className="eyebrow">YOUR SIDEKICK</span><span className="small-badge"><span className="live-dot"/>在你身边</span></div><div className="cat-greeting"><div><h2>哈基米研究所<span>✦</span></h2><p>{match.result ? resultLabel : thinking ? '等一下，猫脑正在运转。' : match.check ? '将军了，先稳住。' : '不着急，陪你想下一步。'}</p></div><button className="mascot-button" title={`${MAMBO_CAT_SOURCE} · 听一声曼波`} aria-label="听一声曼波" onClick={() => { sound.play('mascot', true); setCatMood('dance'); setTimeout(() => setCatMood('idle'), 700); }}><RemoteCat mood={mascotState}/></button></div></div>
        <div className="panel-tabs single"><button className="active"><Sparkles size={15}/>棋盘分析</button><span className="micro-text">{analysisBusy ? '计算中' : 'LOCAL EVALUATION'}</span></div>
        <div className="analysis-content">
          <div className="analysis-heading"><span>局势观察</span><span className="micro-text">{analysisBusy ? '计算中' : 'TACTICAL ENGINE'}</span></div>
          <div className="evaluation-title"><strong>{match.result ? resultLabel : analysisBusy && !analysis ? '正在观察棋盘…' : analysis?.title || '静候一手好棋'}</strong><span className="evaluation-icon"><BarChart3 size={20}/></span></div>
          <div className="evaluation-bar" title="本地局势指数，非胜率"><div style={{ width: `${analysis?.balance ?? 50}%` }}/><span/></div>
          <div className="evaluation-labels"><span><i className={`mini-stone ${game.kind === 'chess' ? 'white' : game.kind === 'xiangqi' ? 'red' : 'black'}`}/>{kindInfo.first}</span><small>局势指数 · 非胜率</small><span>{kindInfo.second}<i className={`mini-stone ${game.kind === 'chess' || game.kind === 'xiangqi' ? 'black' : 'white'}`}/></span></div>
          <div className="analysis-note"><div><Sparkles size={15}/><strong>{remoteAnalysis ? `${remoteAnalysis.model} 的观察` : '曼波的观察'}</strong>{apiBusy && <LoaderCircle size={14} className="spin"/>}</div><p>{match.result ? `${resultLabel}，${match.result.reason}。` : currentAnalysis?.summary || (analysisBusy ? '看看棋形，也看看对手的打算。' : '本地分析已暂停。')}</p><span className="analysis-source">{remoteAnalysis ? '模型 API' : '本地战术引擎'}{analysis?.depth ? ` · ${analysis.depth} 层搜索` : ''}</span></div>
          <div className="analysis-heading candidate-heading"><span>下一步灵感</span><IconButton icon={RefreshCw} label="刷新本地分析" disabled={analysisBusy} onClick={() => { setting('autoAnalyze', true); setAnalysisVersion(v => v + 1); }}/></div>
          <div className="candidate-list">{currentAnalysis?.suggestions?.length ? currentAnalysis.suggestions.map((move, i) => <button className={`candidate ${i === 0 ? 'best' : ''}`} key={move.id} onClick={() => showHint(move)}><span className="candidate-rank">{String(i + 1).padStart(2, '0')}</span><div><strong>{move.label}</strong><span>{i === 0 ? '优先考虑' : i === 1 ? '稳健候选' : '另一种思路'}</span></div>{i === 0 ? <Sparkles size={14}/> : <ChevronRight size={15}/>}</button>) : <div className="no-candidates">{match.result ? '这一局，已经圆满。' : match.scoring ? '双方确认死子后即可数子。' : analysisBusy ? '正在寻找合适的落点…' : '暂无候选着'}</div>}</div>
          <button className="api-analyze-button" onClick={remoteAnalyze} disabled={apiBusy}><Sparkles size={15}/>{apiBusy ? '模型正在分析' : 'AI 深度解读'}{apiBusy ? <LoaderCircle size={14} className="spin"/> : <ChevronRight size={15}/>}</button>
        </div>
        <div className="sound-strip"><span className="sound-strip-icon"><AudioLines size={18}/></span><div><strong>曼波声音</strong><small>{settings.enabled && settings.voice ? '语音、评论与棋局音效已启用' : '安静下棋，也很好'}</small></div><div className="sound-strip-controls"><Toggle value={settings.music} label="曼波背景音乐" onChange={v => setting('music', v)}/><Toggle value={settings.enabled && settings.voice} label="曼波语音开关" onChange={v => { setting('voice', v); if (v) setting('enabled', true); }}/></div></div>
        {/* 作者署名与视频入口：放在「曼波声音」下面，页脚只留站点标语。 */}
        <div className="creator-strip">
          <a className="footer-author" href="https://github.com/tymtym470" target="_blank" rel="noreferrer noopener" title="作者 TYM · 点击打开 GitHub 主页"><Github size={18} aria-hidden="true"/>作者 TYM</a>
        </div>
      </aside>
    </main>
    <footer className="page-footer"><span>MAMBO CLUB <i/> 落子有声，陪伴无声。</span><span>把这一刻，留给棋盘。</span></footer>
    <div className="toast-host">{toast && <div role="status" className="toast"><span>{toast}</span><button aria-label="关闭提示" onClick={() => setToast('')}><X size={14}/></button></div>}</div>
    {modal === 'api' && <ApiModal api={api} serverInfo={serverInfo} lastError={apiError} lastDetails={apiDetails}
      testPosition={{ position: match.summary(), legal: match.legalMoves().map(move => ({ id: move.id, label: move.label })) }}
      onSaved={(saved, tested) => {
        setApi(saved); setApiConnected(true); setApiError(''); setApiDetails(tested.diagnostics);
        setting('provider', 'api'); notify('已保存并启用通过落子验证的 API');
      }} onClose={() => setModal(null)}/>}
    {modal === 'settings' && <Modal title="偏好设置" onClose={() => setModal(null)}>
      <div className="setting-row"><div><Volume2 size={18}/><span>所有音效</span></div><Toggle label="所有音效" value={settings.enabled} onChange={v => setting('enabled', v)}/></div>
      <div className="setting-row"><div><AudioLines size={18}/><span>曼波背景音乐</span></div><Toggle label="曼波背景音乐" value={settings.music} onChange={v => setting('music', v)}/></div>
      <div className="setting-row"><div><AudioLines size={18}/><span>曼波语音</span></div><Toggle label="曼波语音" value={settings.voice} onChange={v => setting('voice', v)}/></div>
      <div className="setting-row"><label htmlFor="volume">音量</label><div className="volume-control"><input id="volume" type="range" min="0" max="1" step=".05" value={settings.volume} onChange={e => setting('volume', Number(e.target.value))}/><span>{Math.round(settings.volume * 100)}%</span></div></div>
      <div className="setting-row theme-row"><div><Moon size={18}/><span>外观主题</span></div>
        <div className="segmented theme-switch" role="group" aria-label="外观主题">
          {[['system', '跟随系统', MonitorSmartphone], ['light', '浅色', Sun], ['dark', '深色', Moon]].map(([value, label, Icon]) => (
            <button key={value} className={settings.theme === value ? 'active' : ''} aria-pressed={settings.theme === value}
              title={label} onClick={() => setting('theme', value)}><Icon size={14}/>{label}</button>
          ))}
        </div>
      </div>
      <div className="setting-row"><div><Sparkles size={18}/><span>光感折射</span></div><Toggle label="光感折射" value={settings.refraction} onChange={v => setting('refraction', v)}/></div>
      <div className="setting-row"><div><BarChart3 size={18}/><span>自动本地分析</span></div><Toggle label="自动本地分析" value={settings.autoAnalyze} onChange={v => setting('autoAnalyze', v)}/></div>
      <div className="setting-row"><div><BarChart3 size={18}/><span>显示落子序号</span></div><Toggle label="显示落子序号" value={settings.numbers} onChange={v => setting('numbers', v)}/></div>
      <button className="secondary-button full-width sound-test" onClick={() => sound.play('capture', true)}><AudioLines size={16}/>试听吃子音效</button>
    </Modal>}
    {modal === 'engine' && <Modal title="选择 AI 引擎" onClose={() => setModal(null)}><div className="engine-options"><button className={settings.provider === 'local' ? 'active' : ''} onClick={() => { setting('provider', 'local'); setModal(null); }}><Cpu size={23}/><div><strong>内置本地战术引擎</strong><span>已嵌入项目 · 五级难度 · 无需密钥</span></div>{settings.provider === 'local' && <Check size={18}/>}</button><button className={settings.provider === 'api' ? 'active' : ''} onClick={() => { if (!api.key && !serverInfo.configured && !api.baseUrl.startsWith('http://localhost') && !api.baseUrl.startsWith('http://127.0.0.1')) { setModal('api'); return; } setting('provider', 'api'); setModal(null); }}><PlugZap size={23}/><div><strong>模型 API 对弈</strong><span>{api.model} · 合法着校验</span></div>{settings.provider === 'api' && <Check size={18}/>}</button></div><button className="text-button full-width" onClick={() => setModal('api')}>配置模型连接<ChevronRight size={15}/></button></Modal>}
    {modal === 'board' && <Modal title="棋盘操作" onClose={() => setModal(null)}><div className="board-menu"><button onClick={() => { setModal(null); guardChange(() => startGame()); }}><Plus size={18}/>开始新对局<ChevronRight size={16}/></button><button onClick={() => { setFlipped(f => !f); setModal(null); }}><RotateCw size={18}/>翻转棋盘<ChevronRight size={16}/></button>{game.kind === 'go' && <button onClick={() => { setModal(null); performMove('pass'); }} disabled={!!match.result || match.scoring || thinking}><SkipForward size={18}/>停一手<ChevronRight size={16}/></button>}<button onClick={() => { setModal(null); setConfirm({ title: '确定认输？', message: '结束当前对局，结果会清晰显示在棋盘下方。', action: () => setGame(g => ({ ...g, resigned: settings.mode === 'ai' ? settings.side : match.turn })) }); }} disabled={!!match.result || thinking || !game.moves.length}><Flag size={18}/>认输<ChevronRight size={16}/></button></div></Modal>}
    {intro > 0 && <div className="intro-veil" key={intro} aria-hidden="true">
      <div className="intro-ring r1"/><div className="intro-ring r2"/><div className="intro-ring up"/>
      <div className="intro-outline"/><div className="intro-glow"/>
      <div className="intro-piece">{[game.kind === 'xiangqi' ? '帥' : game.kind === 'chess' ? '♞' : '●'][0]}</div>
      <div className="intro-general left">{game.kind === 'xiangqi' ? '将' : '黑'}</div>
      <div className="intro-general right">{game.kind === 'xiangqi' ? '帥' : '白'}</div>
    </div>}
    {modal === 'lobby' && <Modal title="联机大厅" onClose={() => setModal(null)} wide>
      <div className="lobby-nick"><label htmlFor="nick-input">我的昵称</label><input id="nick-input" maxLength={12} value={draftNick} placeholder="输个名字，对手才认得出你" onChange={e => setDraftNick(e.target.value)}/></div>
      <div className="lobby-meta"><span className="live-dot"/>在线 {88 + FAKE_PLAYERS.length} 人 · 空闲桌 {FAKE_PLAYERS.length - 1} 张<span className="lobby-ms">延迟 {18 + (Date.now() % 23)}ms</span></div>
      <div className="lobby-ticker">{LOBBY_TICKER[Math.floor(Date.now() / 1000) % LOBBY_TICKER.length]}</div>
      <div className="lobby-list">{FAKE_PLAYERS.map(p => (
        <button key={p.id} className={`lobby-row ${rival?.id === p.id ? 'active' : ''}`} onClick={() => {
          setNick(draftNick.trim()); writeStorage('mambo-nick', draftNick.trim());
          setRival(p); setting('mode', 'ai'); setting('level', 5); setModal(null);
          setGame(freshGame(game.kind, game.kind === 'go' ? game.size : undefined));
          setSeconds(0); setFlipped(p.id % 2 === 1); notify(`已和 ${p.name} 开局`);
        }}>
          <span className="lobby-avatar">{p.avatar}</span>
          <span className="lobby-name"><strong>{p.name}</strong><small>{p.tag} · 房间 {p.room}</small></span>
          <span className="lobby-stat"><b>{p.ping}ms</b><small>胜率 {p.win}%</small></span><span className="lobby-level">Lv.5 {LEVELS[4]}</span>
        </button>
      ))}</div>
      {rival && <button className="text-button full-width" onClick={() => { setRival(null); setModal(null); notify('已退出联机，回到和曼波下棋'); }}>退出联机，自己练</button>}
    </Modal>}
    {modal === 'rules' && <Modal title={`${kindInfo.name} · 对局约定`} onClose={() => setModal(null)}><div className="rules-copy">
      {game.kind === 'gomoku' && <p>黑棋先行，双方轮流在交叉点落子。横、竖、斜线连续五子或以上获胜。本棋室采用自由五子棋，不设三三、四四和长连禁手。</p>}
      {game.kind === 'go' && <><p>黑棋先行。标准 19×19 棋盘，也可切 13 路 / 9 路。棋块没有气时被提走，禁止自杀与重复全盘局面。双方连续停一手进入数子，白贴 6.5 目。</p><p>本地 AI 是内置战术引擎（提子、打吃、气与势力的启发式搜索），不代替专业围棋引擎。</p></>}
      {game.kind === 'xiangqi' && <p>红先黑后。支持蹩马腿、塞象眼、炮隔子吃子、九宫、不过河象及将帅不能照面等规则。将死或困毙判负。</p>}
      {game.kind === 'chess' && <p>白先黑后。支持王车易位、吃过路兵与兵升变，不能走出让己方王受攻击的着法。</p>}
      <p>局势条是本地启发式评价，不是统计胜率。API 分析是模型建议，实际走法仍以规则校验为准。</p>
    </div></Modal>}
    {confirm && <Modal title={confirm.title} onClose={() => setConfirm(null)}><p className="confirm-copy">{confirm.message}</p><div className="modal-actions"><button className="secondary-button" onClick={() => setConfirm(null)}>继续当前对局</button><button className="primary-button" onClick={() => { confirm.action(); setConfirm(null); }}>确认<Check size={16}/></button></div></Modal>}
    {promotion && <Modal title="兵升变" onClose={() => setPromotion(null)}><div className="promotion-options">{promotion.map(m => <button key={m.id} onClick={() => performMove(m.id)}><span>{CHESS_GLYPHS[m.promotion]}</span><strong>{{ q: '后', r: '车', b: '象', n: '马' }[m.promotion]}</strong></button>)}</div></Modal>}
  </div>;
}
