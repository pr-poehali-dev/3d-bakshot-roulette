import { useState, useEffect, useCallback } from 'react';

interface LeaderEntry { rank: number; username: string; score: number; games_played: number; games_won: number; winrate: number; coins: number; }
interface StatEntry { rank?: number; username?: string; score: number; games_played: number; games_won: number; winrate?: number; coins?: number; }
interface HistoryEntry { result: string; score: number; rounds: number; coins_change: number; players_count: number; played_at: string; room_code: string; }

const AUTH_URL = 'https://functions.poehali.dev/038b29c1-7e93-419b-af8a-2c5a40f5ddba';
const GAME_URL = 'https://functions.poehali.dev/ac95416a-ce47-4da2-b4e6-876f21675df9';
const LEADER_URL = 'https://functions.poehali.dev/13dbad51-7a68-4212-88d9-801fea9a36bb';

type Screen = 'boot' | 'auth' | 'menu' | 'game_setup' | 'game' | 'stats' | 'leaderboard' | 'settings';

interface User { id: number; username: string; coins: number; }
interface Player {
  slot: number; name: string; is_bot: boolean;
  hp: number; max_hp: number; coins: number;
  items: string[]; alive: boolean; is_winner: boolean;
}
interface GameInfo {
  id: number; room_code: string; status: string; mode: string;
  max_players: number; current_turn: number; round: number;
  shells_remaining: number; last_shot: string | null; log: string[];
}

function HpPips({ current, max }: { current: number; max: number }) {
  return (
    <span>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          style={{
            display: 'inline-block', width: 10, height: 10,
            border: '1px solid var(--green)',
            background: i < current ? 'var(--green)' : 'transparent',
            boxShadow: i < current ? '0 0 4px var(--green)' : 'none',
            margin: '0 1px'
          }}
        />
      ))}
    </span>
  );
}

export default function Index() {
  const [screen, setScreen] = useState<Screen>('boot');
  const [user, setUser] = useState<User | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [bootStep, setBootStep] = useState(0);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({ username: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [menuIndex, setMenuIndex] = useState(0);
  const [gameSetupStep, setGameSetupStep] = useState<'mode' | 'count'>('mode');
  const [gameMode, setGameMode] = useState<'solo' | 'online'>('solo');
  const [playerCount, setPlayerCount] = useState(2);
  const [roomCode, setRoomCode] = useState('');
  const [game, setGame] = useState<GameInfo | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [lastShot, setLastShot] = useState<string | null>(null);
  const [shotFlash, setShotFlash] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([]);
  const [myStats, setMyStats] = useState<LeaderEntry | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [histStats, setHistStats] = useState<StatEntry | null>(null);
  const [setupMenuIdx, setSetupMenuIdx] = useState(0);
  const [sfxEnabled, setSfxEnabled] = useState(true);
  const [scanEffect, setScanEffect] = useState(true);

  const bootLines = [
    '> BIOS v2.08 .......... OK',
    '> RAM 640K ............ OK',
    '> LOADING BUCKSHOT_ROULETTE.EXE',
    '> ████████████████████ 100%',
    '> INITIALIZING GAME ENGINE...',
    '> CONNECTING TO SERVER...',
    '> WELCOME, PLAYER.',
    '',
  ];

  useEffect(() => {
    if (screen !== 'boot') return;
    let step = 0;
    const t = setInterval(() => {
      setBootStep(s => s + 1);
      step++;
      if (step >= bootLines.length) {
        clearInterval(t);
        setTimeout(() => {
          const sid = localStorage.getItem('bsr_session');
          const usr = localStorage.getItem('bsr_user');
          if (sid && usr) {
            try {
              const parsed = JSON.parse(usr);
              setSessionId(sid);
              setUser(parsed);
              setScreen('menu');
            } catch { setScreen('auth'); }
          } else {
            setScreen('auth');
          }
        }, 600);
      }
    }, 280);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (screen === 'menu') {
        const len = 5;
        if (e.key === 'ArrowUp') { e.preventDefault(); setMenuIndex(i => (i - 1 + len) % len); }
        if (e.key === 'ArrowDown') { e.preventDefault(); setMenuIndex(i => (i + 1) % len); }
        if (e.key === 'Enter') handleMenuSelect(menuIndex);
        if (e.key === '1') handleMenuSelect(0);
        if (e.key === '2') handleMenuSelect(1);
        if (e.key === '3') handleMenuSelect(2);
        if (e.key === '4') handleMenuSelect(3);
        if (e.key === '5') handleMenuSelect(4);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, menuIndex]);

  const apiAuth = useCallback(async (body: Record<string, unknown>) => {
    const r = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return r.json();
  }, []);

  const apiGame = useCallback(async (body: Record<string, unknown>, sid?: string) => {
    const s = sid || sessionId || '';
    const r = await fetch(GAME_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Id': s },
      body: JSON.stringify(body)
    });
    return r.json();
  }, [sessionId]);

  const apiLeader = useCallback(async () => {
    const r = await fetch(LEADER_URL, {
      method: 'GET',
      headers: { 'X-Session-Id': sessionId || '' }
    });
    return r.json();
  }, [sessionId]);

  const handleAuth = async () => {
    if (!authForm.username.trim() || !authForm.password.trim()) {
      setAuthError('> ОШИБКА: Заполни все поля'); return;
    }
    setLoading(true);
    setAuthError('> CONNECTING...');
    const data = await apiAuth({ action: authMode, ...authForm });
    setLoading(false);
    if (data.ok) {
      setUser(data.user);
      setSessionId(data.session_id);
      localStorage.setItem('bsr_session', data.session_id);
      localStorage.setItem('bsr_user', JSON.stringify(data.user));
      setScreen('menu');
      setAuthError('');
    } else {
      setAuthError(`> ОШИБКА: ${data.error}`);
    }
  };

  const handleLogout = async () => {
    await apiAuth({ action: 'logout', session_id: sessionId });
    localStorage.removeItem('bsr_session');
    localStorage.removeItem('bsr_user');
    setUser(null); setSessionId(null);
    setScreen('auth');
  };

  const menuItems = [
    '[ 1 ] НАЧАТЬ ИГРУ',
    '[ 2 ] ИСТОРИЯ / СТАТИСТИКА',
    '[ 3 ] МИРОВОЙ РЕЙТИНГ',
    '[ 4 ] НАСТРОЙКИ',
    '[ 5 ] ВЫЙТИ ИЗ АККАУНТА'
  ];

  const handleMenuSelect = async (idx: number) => {
    if (idx === 0) { setScreen('game_setup'); setGameSetupStep('mode'); setSetupMenuIdx(0); }
    if (idx === 1) {
      setLoading(true);
      const data = await apiGame({ action: 'history' });
      setLoading(false);
      if (data.ok) { setHistory(data.history); setHistStats(data.stats); }
      setScreen('stats');
    }
    if (idx === 2) {
      setLoading(true);
      const data = await apiLeader();
      setLoading(false);
      if (data.ok) { setLeaderboard(data.leaderboard); setMyStats(data.my_stats); }
      setScreen('leaderboard');
    }
    if (idx === 3) setScreen('settings');
    if (idx === 4) handleLogout();
  };

  const loadGameState = useCallback(async (gameId: number, sid?: string) => {
    const data = await apiGame({ action: 'state', game_id: gameId }, sid);
    if (data.ok) {
      setGame(data.game);
      setPlayers(data.players);
      setActionLog(data.game.log || []);
    }
    return data;
  }, [apiGame]);

  const startGame = async (cnt: number, bots: number) => {
    setLoading(true);
    const data = await apiGame({
      action: 'create',
      mode: 'solo',
      max_players: cnt,
      bot_count: bots
    });
    setLoading(false);
    if (data.ok) {
      setLastShot(null); setActionLog([]);
      await loadGameState(data.game_id);
      setScreen('game');
    }
  };

  const joinRoom = async () => {
    if (!roomCode.trim()) return;
    setLoading(true);
    const data = await apiGame({ action: 'join', room_code: roomCode.trim() });
    setLoading(false);
    if (data.ok) {
      setLastShot(null); setActionLog([]);
      await loadGameState(data.game_id);
      setScreen('game');
    }
  };

  const shoot = async (target: 'self' | 'other') => {
    if (!game || game.status === 'finished' || loading) return;
    setLoading(true);
    const data = await apiGame({ action: 'shoot', game_id: game.id, target });
    setLoading(false);
    if (data.ok) {
      const isLive = data.shell === 'live';
      setShotFlash(true);
      if (isLive) setIsShaking(true);
      setTimeout(() => setShotFlash(false), 500);
      setTimeout(() => setIsShaking(false), 400);
      setLastShot(data.shell);
      setActionLog(data.log || []);
      await loadGameState(game.id);
    }
  };

  const myPlayer = players.find(p => !p.is_bot && p.name === user?.username);
  const currentPlayer = players.find(p => p.slot === game?.current_turn);
  const isMyTurn = myPlayer && game && myPlayer.slot === game.current_turn && game.status === 'playing';

  // ═══════════════ BOOT ═══════════════
  if (screen === 'boot') {
    return (
      <div className="crt-screen min-h-screen bg-black flex flex-col items-center justify-center p-8">
        <div className="scanline-sweep" />
        <div className="w-full max-w-2xl">
          <div className="font-mono text-xs mb-4" style={{ color: 'var(--green-mid)', textShadow: '0 0 4px #00aa22' }}>
            {'BUCKSHOT ROULETTE TERMINAL v1.0.0\n================================'}
          </div>
          {bootLines.slice(0, bootStep).map((line, i) => (
            <div key={i} className="font-mono text-sm mb-1 type-in" style={{
              color: line.includes('100%') ? 'var(--amber)' : line.includes('WELCOME') ? 'var(--green)' : 'var(--green-dim)',
              textShadow: line.includes('WELCOME') ? '0 0 10px var(--green)' : '0 0 4px #00cc33',
              fontWeight: line.includes('WELCOME') ? 700 : 400,
              fontSize: line.includes('WELCOME') ? '1.1rem' : undefined
            }}>
              {line}
            </div>
          ))}
          {bootStep >= 4 && bootStep < 7 && (
            <div className="mt-4 h-px w-64" style={{ background: 'var(--green-dark)' }}>
              <div className="boot-progress-bar h-px" />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════ AUTH ═══════════════
  if (screen === 'auth') {
    return (
      <div className="crt-screen min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <div className="scanline-sweep" />
        <div className="w-full max-w-md">
          <pre className="font-mono text-center mb-6 overflow-hidden" style={{
            fontSize: '7px', lineHeight: '1.15',
            color: 'var(--green)', textShadow: '0 0 8px var(--green), 0 0 20px rgba(0,255,65,0.3)'
          }}>{`
 ██████╗ ██╗   ██╗ ██████╗██╗  ██╗███████╗██╗  ██╗ ██████╗ ████████╗
 ██╔══██╗██║   ██║██╔════╝██║ ██╔╝██╔════╝██║  ██║██╔═══██╗╚══██╔══╝
 ██████╔╝██║   ██║██║     █████╔╝ ███████╗███████║██║   ██║   ██║   
 ██╔══██╗██║   ██║██║     ██╔═██╗ ╚════██║██╔══██║██║   ██║   ██║   
 ██████╔╝╚██████╔╝╚██████╗██║  ██╗███████║██║  ██║╚██████╔╝   ██║   
 ╚═════╝  ╚═════╝  ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝    ╚═╝  `}</pre>

          <div className="border p-6" style={{ borderColor: 'var(--green-dark)', background: 'rgba(0,15,0,0.92)' }}>
            <div className="font-mono text-xs mb-5" style={{ color: 'var(--green-mid)' }}>
              {'> TERMINAL AUTH SYSTEM — ВВЕДИ ДАННЫЕ ДЛЯ ВХОДА'}
            </div>

            <div className="flex gap-3 mb-5">
              {(['login', 'register'] as const).map(m => (
                <button
                  key={m}
                  className="flex-1 font-mono text-xs py-1.5 border transition-colors"
                  style={{
                    borderColor: authMode === m ? 'var(--green)' : 'var(--green-dark)',
                    background: authMode === m ? 'var(--green)' : 'transparent',
                    color: authMode === m ? 'var(--black)' : 'var(--green-mid)'
                  }}
                  onClick={() => { setAuthMode(m); setAuthError(''); }}
                >
                  {m === 'login' ? '[ ВОЙТИ ]' : '[ РЕГИСТРАЦИЯ ]'}
                </button>
              ))}
            </div>

            {['username', 'password'].map(field => (
              <div key={field} className="mb-4">
                <div className="font-mono text-xs mb-1" style={{ color: 'var(--green-mid)' }}>
                  {'> '}{field === 'username' ? 'НИК_ИГРОКА' : 'ПАРОЛЬ'}:
                </div>
                <div className="flex items-center border px-2 py-1.5" style={{ borderColor: 'var(--green-dark)' }}>
                  <span className="font-mono mr-2" style={{ color: 'var(--green)', textShadow: '0 0 6px var(--green)' }}>$</span>
                  <input
                    className="term-input text-sm"
                    type={field === 'password' ? 'password' : 'text'}
                    value={authForm[field as keyof typeof authForm]}
                    onChange={e => setAuthForm(f => ({ ...f, [field]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleAuth()}
                    placeholder={field === 'username' ? 'введи_ник' : '••••••••'}
                    maxLength={field === 'username' ? 32 : 128}
                    autoFocus={field === 'username'}
                  />
                </div>
              </div>
            ))}

            {authError && (
              <div className="font-mono text-xs mb-4" style={{ color: 'var(--red)', textShadow: '0 0 6px rgba(255,51,51,0.5)' }}>
                {authError}
              </div>
            )}

            <button
              onClick={handleAuth}
              disabled={loading}
              className="w-full font-mono text-sm py-2 border-2 transition-colors"
              style={{
                borderColor: 'var(--green)', background: 'rgba(0,50,0,0.6)',
                color: 'var(--green)', cursor: loading ? 'wait' : 'pointer'
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.background = 'var(--green)'; (e.target as HTMLElement).style.color = 'var(--black)'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = 'rgba(0,50,0,0.6)'; (e.target as HTMLElement).style.color = 'var(--green)'; }}
            >
              {loading ? '> CONNECTING...' : authMode === 'login' ? '[ ENTER ] ВОЙТИ В СИСТЕМУ' : '[ ENTER ] СОЗДАТЬ АККАУНТ'}
            </button>

            <div className="mt-3 font-mono text-xs text-center" style={{ color: 'var(--green-mid)' }}>
              {authMode === 'login' ? 'Нет аккаунта? Нажми → РЕГИСТРАЦИЯ' : 'Уже есть? → ВОЙТИ'}
            </div>
          </div>

          <div className="mt-3 font-mono text-xs text-center" style={{ color: 'var(--green-mid)' }}>
            {'> СТАРТОВЫЙ БАЛАНС: 💰 100 МОНЕТ'}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════ MENU ═══════════════
  if (screen === 'menu') {
    return (
      <div className="crt-screen min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <div className="scanline-sweep" />
        <div className="w-full max-w-xl">
          <pre className="font-mono text-center mb-2 overflow-hidden" style={{
            fontSize: '6px', lineHeight: '1.2',
            color: 'var(--green)', textShadow: '0 0 10px var(--green), 0 0 30px rgba(0,255,65,0.2)'
          }}>{`
 ██████╗ ██╗   ██╗ ██████╗██╗  ██╗███████╗██╗  ██╗ ██████╗ ████████╗
 ██╔══██╗██║   ██║██╔════╝██║ ██╔╝██╔════╝██║  ██║██╔═══██╗╚══██╔══╝
 ██████╔╝██║   ██║██║     █████╔╝ ███████╗███████║██║   ██║   ██║   
 ██╔══██╗██║   ██║██║     ██╔═██╗ ╚════██║██╔══██║██║   ██║   ██║   
 ██████╔╝╚██████╔╝╚██████╗██║  ██╗███████║██║  ██║╚██████╔╝   ██║   
 ╚═════╝  ╚═════╝  ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝    ╚═╝  `}</pre>

          <div className="text-center font-mono text-xs mb-1" style={{ color: 'var(--green-dim)' }}>
            {'═══════════[ R O U L E T T E ]═══════════'}
          </div>
          <div className="text-center font-mono text-xs mb-6" style={{ color: 'var(--amber)', textShadow: '0 0 6px var(--amber)' }}>
            {'▸ ИГРОК: '}{user?.username}{'  |  💰 '}{user?.coins}{' МОНЕТ'}
          </div>

          <div className="border p-5 mx-auto max-w-sm" style={{ borderColor: 'var(--green-dark)', background: 'rgba(0,10,0,0.95)' }}>
            <div className="font-mono text-xs mb-4" style={{ color: 'var(--green-mid)' }}>
              {'> ГЛАВНОЕ МЕНЮ  [↑↓] навигация  [ENTER] выбор'}
            </div>
            {menuItems.map((item, i) => (
              <div
                key={i}
                className="font-mono text-sm px-3 py-2 mb-1 cursor-pointer transition-colors"
                style={{
                  color: menuIndex === i ? 'var(--black)' : 'var(--green-dim)',
                  background: menuIndex === i ? 'var(--green)' : 'transparent',
                  textShadow: menuIndex === i ? 'none' : '0 0 4px #00cc33'
                }}
                onMouseEnter={() => setMenuIndex(i)}
                onClick={() => handleMenuSelect(i)}
              >
                {menuIndex === i ? `▶ ${item}` : `  ${item}`}
              </div>
            ))}
          </div>

          <div className="text-center mt-5 font-mono text-xs" style={{ color: 'var(--green-dark)' }}>
            {'v1.0 — BUCKSHOT ROULETTE ONLINE TERMINAL — 2024'}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════ GAME SETUP ═══════════════
  if (screen === 'game_setup') {
    return (
      <div className="crt-screen min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <div className="scanline-sweep" />
        <div className="w-full max-w-md">
          <div className="flex justify-between items-center mb-6">
            <div className="font-mono text-sm" style={{ color: 'var(--green)', textShadow: '0 0 8px var(--green)' }}>
              {'═══ НАСТРОЙКА ИГРЫ ═══'}
            </div>
            <button
              onClick={() => setScreen('menu')}
              className="font-mono text-xs"
              style={{ color: 'var(--green-mid)' }}
            >[ ← НАЗАД ]</button>
          </div>

          {gameSetupStep === 'mode' && (
            <div className="border p-5" style={{ borderColor: 'var(--green-dark)', background: 'rgba(0,10,0,0.95)' }}>
              <div className="font-mono text-sm mb-4" style={{ color: 'var(--green)' }}>{'═══ РЕЖИМ ИГРЫ ═══'}</div>
              {[
                { label: '[ 🤖 ] СОЛО — vs БОТЫ', sub: 'Играй против ИИ-ботов', val: 'solo' as const },
                { label: '[ 🌍 ] ОНЛАЙН — с ЛЮДЬМИ', sub: 'Создай комнату и жди друзей', val: 'online' as const },
              ].map((item, i) => (
                <div
                  key={i}
                  className="cursor-pointer border px-4 py-3 mb-2 transition-colors"
                  style={{
                    borderColor: setupMenuIdx === i ? 'var(--green)' : 'var(--green-dark)',
                    background: setupMenuIdx === i ? 'rgba(0,60,0,0.6)' : 'transparent'
                  }}
                  onMouseEnter={() => setSetupMenuIdx(i)}
                  onClick={() => {
                    setGameMode(item.val);
                    setGameSetupStep('count');
                    setSetupMenuIdx(0);
                  }}
                >
                  <div className="font-mono text-sm" style={{ color: setupMenuIdx === i ? 'var(--green)' : 'var(--green-dim)' }}>
                    {setupMenuIdx === i ? '▶ ' : '  '}{item.label}
                  </div>
                  <div className="font-mono text-xs mt-0.5" style={{ color: 'var(--green-mid)' }}>{item.sub}</div>
                </div>
              ))}
            </div>
          )}

          {gameSetupStep === 'count' && (
            <div className="border p-5" style={{ borderColor: 'var(--green-dark)', background: 'rgba(0,10,0,0.95)' }}>
              <div className="font-mono text-sm mb-1" style={{ color: 'var(--green)' }}>{'═══ КОЛ-ВО ИГРОКОВ ═══'}</div>
              <div className="font-mono text-xs mb-4" style={{ color: 'var(--green-mid)' }}>
                {gameMode === 'solo' ? '> Остальные слоты — боты' : '> Ты хост, остальные подключатся по коду'}
              </div>

              {[2, 3, 4].map((cnt, i) => (
                <div
                  key={cnt}
                  className="cursor-pointer border px-4 py-2 mb-2 font-mono text-sm transition-colors"
                  style={{
                    borderColor: setupMenuIdx === i ? 'var(--green)' : 'var(--green-dark)',
                    color: setupMenuIdx === i ? 'var(--green)' : 'var(--green-dim)',
                    background: setupMenuIdx === i ? 'rgba(0,60,0,0.6)' : 'transparent'
                  }}
                  onMouseEnter={() => setSetupMenuIdx(i)}
                  onClick={() => {
                    setPlayerCount(cnt);
                    if (gameMode === 'solo') {
                      startGame(cnt, cnt - 1);
                    } else {
                      startGame(cnt, 0);
                    }
                  }}
                >
                  {setupMenuIdx === i ? '▶ ' : '  '}[ {cnt} ИГРОКА{cnt > 1 ? '' : ''} ] {gameMode === 'solo' ? `— ты + ${cnt - 1} бот${cnt - 1 > 1 ? 'а' : ''}` : ''}
                </div>
              ))}

              <button
                onClick={() => setGameSetupStep('mode')}
                className="w-full font-mono text-xs py-1 mt-2"
                style={{ color: 'var(--green-mid)' }}
              >[ ← НАЗАД ]</button>

              {gameMode === 'online' && (
                <div className="mt-5 border-t pt-4" style={{ borderColor: 'var(--green-dark)' }}>
                  <div className="font-mono text-xs mb-2" style={{ color: 'var(--green-mid)' }}>{'> ИЛИ ВОЙТИ В КОМНАТУ ПО КОДУ:'}</div>
                  <div className="flex gap-2">
                    <div className="flex-1 border flex items-center px-2 py-1" style={{ borderColor: 'var(--green-dark)' }}>
                      <span className="font-mono mr-2" style={{ color: 'var(--green)' }}>$</span>
                      <input
                        className="term-input text-sm uppercase"
                        placeholder="КОД КОМНАТЫ"
                        value={roomCode}
                        onChange={e => setRoomCode(e.target.value.toUpperCase())}
                        onKeyDown={e => e.key === 'Enter' && joinRoom()}
                        maxLength={8}
                      />
                    </div>
                    <button
                      onClick={joinRoom}
                      disabled={loading}
                      className="font-mono text-xs px-3 border transition-colors"
                      style={{ borderColor: 'var(--green)', color: 'var(--green)' }}
                    >ВОЙТИ</button>
                  </div>
                </div>
              )}

              {loading && (
                <div className="font-mono text-xs mt-4" style={{ color: 'var(--amber)', textShadow: '0 0 6px var(--amber)' }}>
                  {'> ЗАГРУЗКА ИГРЫ...'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════ GAME ═══════════════
  if (screen === 'game' && game) {
    const winner = players.find(p => p.is_winner);
    const isFinished = game.status === 'finished';

    return (
      <div className={`crt-screen min-h-screen bg-black flex flex-col p-2 sm:p-3 ${isShaking ? 'shake' : ''}`} style={{ maxHeight: '100vh', overflow: 'hidden' }}>
        <div className="scanline-sweep" />
        {shotFlash && (
          <div className="fixed inset-0 pointer-events-none z-50 shot-flash" style={{ background: 'rgba(255,255,255,0.15)' }} />
        )}

        {/* Header */}
        <div className="flex justify-between items-center mb-2 pb-1 border-b font-mono text-xs" style={{ borderColor: 'var(--green-dark)', color: 'var(--green-mid)' }}>
          <span>BUCKSHOT ROULETTE <span style={{ color: 'var(--amber)' }}>#{game.room_code}</span></span>
          <span>РАУНД <span style={{ color: 'var(--green)' }}>{game.round}</span></span>
          <button
            onClick={() => setScreen('menu')}
            className="font-mono"
            style={{ color: 'var(--red)', textShadow: '0 0 6px var(--red)' }}
          >[ ✕ ВЫЙТИ ]</button>
        </div>

        {/* TABLE */}
        <div className="table-felt rounded p-3 mb-2 flex-shrink-0">
          {/* Players row */}
          <div className="flex gap-2 justify-center mb-3">
            {players.map((p) => (
              <div
                key={p.slot}
                className="border p-2 font-mono text-xs flex-1 max-w-[160px]"
                style={{
                  borderColor: !p.alive ? '#330000' : p.slot === game.current_turn ? 'var(--green)' : 'var(--green-dark)',
                  background: 'rgba(0,6,0,0.9)',
                  opacity: p.alive ? 1 : 0.4,
                  boxShadow: p.slot === game.current_turn && p.alive ? '0 0 8px var(--green)' : 'none'
                }}
              >
                <div className="font-bold mb-1 truncate" style={{
                  color: p.is_bot ? 'var(--red)' : p.name === user?.username ? 'var(--green)' : 'var(--amber)',
                  textShadow: p.slot === game.current_turn ? '0 0 6px currentColor' : 'none',
                  fontSize: '11px'
                }}>
                  {p.is_bot ? '🤖' : '👤'} {p.name?.substring(0, 10)}
                  {p.slot === game.current_turn && p.alive && ' ◄'}
                </div>
                <div className="mb-1">
                  <HpPips current={p.hp} max={p.max_hp} />
                  <span className="ml-1" style={{ color: 'var(--green-mid)' }}>{p.hp}/{p.max_hp}</span>
                </div>
                <div style={{ color: 'var(--amber)' }}>💰{p.coins}</div>
                {!p.alive && <div style={{ color: 'var(--red)', fontSize: '10px' }}>✖ ВЫБЫЛ</div>}
                {p.is_winner && <div style={{ color: 'var(--amber)', fontSize: '10px' }}>★ ПОБЕДА</div>}
              </div>
            ))}
          </div>

          {/* Shotgun */}
          <div className="text-center mb-2">
            <pre className="inline-block font-mono" style={{ fontSize: '11px', lineHeight: '1.3', color: 'var(--amber)', textShadow: '0 0 6px var(--amber)' }}>{`   _____
  |  ◉  |
.-|_____|-.
( | === | )
 '|_____|'`}</pre>
            <div className="font-mono text-xs mt-1">
              <span style={{ color: 'var(--green-mid)' }}>ПАТРОНЫ: </span>
              {Array.from({ length: game.shells_remaining }, (_, i) => (
                <span key={i} style={{ color: 'var(--amber)', textShadow: '0 0 4px var(--amber)', margin: '0 1px' }}>◉</span>
              ))}
              {game.shells_remaining === 0 && <span style={{ color: 'var(--green-mid)' }}>[ ПЕРЕЗАРЯДКА... ]</span>}
            </div>
          </div>

          {/* Last shot */}
          {lastShot && (
            <div className="text-center font-mono text-sm font-bold" style={{
              color: lastShot === 'live' ? 'var(--red)' : 'var(--green)',
              textShadow: `0 0 10px ${lastShot === 'live' ? 'var(--red)' : 'var(--green)'}`,
            }}>
              {lastShot === 'live' ? '🔴 БАХ! — БОЕВОЙ ПАТРОН' : '⬜ КЛИК — ХОЛОСТОЙ'}
            </div>
          )}
        </div>

        {/* GAME OVER */}
        {isFinished && winner && (
          <div className="border p-3 mb-2 text-center font-mono" style={{
            borderColor: 'var(--green)', background: 'rgba(0,30,0,0.9)',
            boxShadow: '0 0 20px rgba(0,255,65,0.3)'
          }}>
            <div className="text-lg font-bold mb-1" style={{ color: 'var(--green)', textShadow: '0 0 12px var(--green)' }}>
              ★ ПОБЕДИТЕЛЬ: {winner.name} ★
            </div>
            <div className="text-xs mb-2" style={{ color: 'var(--green-mid)' }}>Игра завершена. Раунд {game.round}.</div>
            <button
              onClick={() => setScreen('menu')}
              className="font-mono text-sm px-4 py-1 border transition-colors"
              style={{ borderColor: 'var(--green)', color: 'var(--green)' }}
            >[ ВЕРНУТЬСЯ В МЕНЮ ]</button>
          </div>
        )}

        {/* ACTIONS */}
        {!isFinished && (
          <div className="flex gap-2 mb-2 flex-shrink-0">
            {isMyTurn ? (
              <>
                <button
                  onClick={() => shoot('self')}
                  disabled={loading}
                  className="flex-1 font-mono text-xs py-2 border transition-colors"
                  style={{
                    borderColor: 'var(--green-dark)', color: 'var(--green)',
                    background: 'rgba(0,20,0,0.8)'
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,60,0,0.8)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,20,0,0.8)')}
                >
                  🔫 В СЕБЯ
                  <div className="text-xs opacity-60">(холостой = снова твой ход)</div>
                </button>
                <button
                  onClick={() => shoot('other')}
                  disabled={loading}
                  className="flex-1 font-mono text-xs py-2 border-2 transition-colors"
                  style={{
                    borderColor: 'var(--red)', color: 'var(--red)',
                    background: 'rgba(30,0,0,0.8)',
                    textShadow: '0 0 6px var(--red)'
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(80,0,0,0.8)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(30,0,0,0.8)')}
                >
                  💀 В ПРОТИВНИКА
                  <div className="text-xs opacity-60">(ход переходит)</div>
                </button>
              </>
            ) : (
              <div
                className="flex-1 text-center font-mono text-xs py-3 border"
                style={{ borderColor: 'var(--green-dark)', color: 'var(--green-mid)' }}
              >
                {loading ? '▸ ОБРАБОТКА...' : `⏳ ХОД: ${currentPlayer?.name || '?'}`}
              </div>
            )}
          </div>
        )}

        {/* LOG */}
        <div className="border p-2 font-mono text-xs overflow-y-auto flex-1 min-h-0" style={{
          borderColor: 'var(--green-dark)', background: 'rgba(0,4,0,0.95)', maxHeight: '120px'
        }}>
          <div className="mb-1" style={{ color: 'var(--green-mid)' }}>{'> ЛОГ СОБЫТИЙ:'}</div>
          {actionLog.length === 0 && <div style={{ color: 'var(--green-dark)' }}>{'> Ожидание первого выстрела...'}</div>}
          {[...actionLog].reverse().map((line, i) => (
            <div key={i} style={{
              color: line.includes('LIVE') || line.includes('live') ? 'var(--red)' :
                     line.includes('blank') || line.includes('BLANK') ? 'var(--green-dim)' : 'var(--green-mid)'
            }}>{line}</div>
          ))}
        </div>
      </div>
    );
  }

  // ═══════════════ STATS ═══════════════
  if (screen === 'stats') {
    return (
      <div className="crt-screen min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <div className="scanline-sweep" />
        <div className="w-full max-w-2xl">
          <div className="flex justify-between items-center mb-5">
            <div className="font-mono text-sm" style={{ color: 'var(--green)', textShadow: '0 0 8px var(--green)' }}>
              {'═══ ТВОЯ СТАТИСТИКА ═══'}
            </div>
            <button onClick={() => setScreen('menu')} className="font-mono text-xs" style={{ color: 'var(--green-mid)' }}>[ ← НАЗАД ]</button>
          </div>

          {histStats && (
            <div className="grid grid-cols-4 gap-2 mb-5">
              {[
                { label: 'ИГРЫ', val: histStats.games_played, color: 'var(--green)' },
                { label: 'ПОБЕДЫ', val: histStats.games_won, color: 'var(--amber)' },
                { label: 'ОЧКИ', val: histStats.score, color: 'var(--green)' },
                { label: 'МОНЕТЫ', val: user?.coins, color: 'var(--amber)' },
              ].map((s, i) => (
                <div key={i} className="border p-3 text-center" style={{ borderColor: 'var(--green-dark)', background: 'rgba(0,8,0,0.9)' }}>
                  <div className="font-mono text-2xl font-bold" style={{ color: s.color, textShadow: `0 0 8px ${s.color}` }}>{s.val ?? 0}</div>
                  <div className="font-mono text-xs mt-1" style={{ color: 'var(--green-mid)' }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          <div className="border p-4" style={{ borderColor: 'var(--green-dark)', background: 'rgba(0,6,0,0.95)' }}>
            <div className="font-mono text-xs mb-3" style={{ color: 'var(--green-mid)' }}>{'> ИСТОРИЯ ИГР (последние 20):'}</div>
            {history.length === 0 && (
              <div className="font-mono text-xs text-center py-6" style={{ color: 'var(--green-dark)' }}>
                {'> Игр пока нет. Нажми [ НАЧАТЬ ИГРУ ] !'}
              </div>
            )}
            <div className="font-mono text-xs space-y-1 max-h-64 overflow-y-auto">
              <div className="flex gap-2 pb-1 mb-1 border-b" style={{ borderColor: 'var(--green-dark)', color: 'var(--green-mid)' }}>
                <span className="w-24">ИТОГ</span>
                <span className="w-20">КОД</span>
                <span className="w-16">РАУНДЫ</span>
                <span className="w-16">МОНЕТЫ</span>
                <span className="flex-1">ДАТА</span>
              </div>
              {history.map((h, i) => (
                <div key={i} className="flex gap-2" style={{ color: h.result === 'win' ? 'var(--green)' : 'var(--red)' }}>
                  <span className="w-24">{h.result === 'win' ? '★ ПОБЕДА' : '✖ ПОРАЖЕНИЕ'}</span>
                  <span className="w-20" style={{ color: 'var(--amber)' }}>{h.room_code || '—'}</span>
                  <span className="w-16" style={{ color: 'var(--green-mid)' }}>R{h.rounds}</span>
                  <span className="w-16" style={{ color: h.coins_change >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {h.coins_change >= 0 ? '+' : ''}{h.coins_change}💰
                  </span>
                  <span className="flex-1" style={{ color: 'var(--green-mid)' }}>{h.played_at?.slice(0, 10)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════ LEADERBOARD ═══════════════
  if (screen === 'leaderboard') {
    return (
      <div className="crt-screen min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <div className="scanline-sweep" />
        <div className="w-full max-w-2xl">
          <div className="flex justify-between items-center mb-5">
            <div className="font-mono text-sm" style={{ color: 'var(--green)', textShadow: '0 0 8px var(--green)' }}>
              {'═══ МИРОВОЙ РЕЙТИНГ ═══'}
            </div>
            <button onClick={() => setScreen('menu')} className="font-mono text-xs" style={{ color: 'var(--green-mid)' }}>[ ← НАЗАД ]</button>
          </div>

          {myStats && (
            <div className="border p-3 mb-4" style={{ borderColor: 'var(--green)', background: 'rgba(0,20,0,0.9)' }}>
              <span className="font-mono text-xs" style={{ color: 'var(--amber)', textShadow: '0 0 6px var(--amber)' }}>
                {'▸ ТВОЯ ПОЗИЦИЯ: #'}{myStats.rank}
                {'  |  '}{myStats.username}
                {'  |  ОЧКИ: '}{myStats.score}
                {'  |  ПОБЕДЫ: '}{myStats.games_won}{'/'}{myStats.games_played}
                {'  |  ВИНРЕЙТ: '}{myStats.winrate}{'%'}
              </span>
            </div>
          )}

          <div className="border p-3" style={{ borderColor: 'var(--green-dark)', background: 'rgba(0,6,0,0.95)' }}>
            <div className="font-mono text-xs" style={{ color: 'var(--green-mid)' }}>
              <div className="flex gap-2 pb-1 mb-2 border-b" style={{ borderColor: 'var(--green-dark)' }}>
                <span className="w-10">#</span>
                <span className="flex-1">НИК</span>
                <span className="w-16 text-right">ОЧКИ</span>
                <span className="w-16 text-right">ПОБЕДЫ</span>
                <span className="w-16 text-right">ВИНРЕЙТ</span>
              </div>
              {leaderboard.length === 0 && (
                <div className="text-center py-8" style={{ color: 'var(--green-dark)' }}>
                  {'> Пока нет игроков. Стань первым в рейтинге!'}
                </div>
              )}
              {leaderboard.map((p, i) => (
                <div
                  key={i}
                  className="flex gap-2 py-0.5"
                  style={{
                    color: p.username === user?.username ? 'var(--green)' :
                           i < 3 ? 'var(--amber)' : 'var(--green-mid)',
                    fontWeight: p.username === user?.username ? 700 : 400,
                    textShadow: p.username === user?.username ? '0 0 6px var(--green)' : 'none'
                  }}
                >
                  <span className="w-10">{p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `${p.rank}.`}</span>
                  <span className="flex-1 truncate">{p.username}{p.username === user?.username ? ' ◄ ВЫ' : ''}</span>
                  <span className="w-16 text-right">{p.score}</span>
                  <span className="w-16 text-right">{p.games_won}</span>
                  <span className="w-16 text-right">{p.winrate}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════ SETTINGS ═══════════════
  if (screen === 'settings') {
    return (
      <div className="crt-screen min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <div className="scanline-sweep" />
        <div className="w-full max-w-md">
          <div className="flex justify-between items-center mb-6">
            <div className="font-mono text-sm" style={{ color: 'var(--green)', textShadow: '0 0 8px var(--green)' }}>
              {'═══ НАСТРОЙКИ ═══'}
            </div>
            <button onClick={() => setScreen('menu')} className="font-mono text-xs" style={{ color: 'var(--green-mid)' }}>[ ← НАЗАД ]</button>
          </div>

          <div className="border p-5 space-y-4" style={{ borderColor: 'var(--green-dark)', background: 'rgba(0,8,0,0.95)' }}>
            {[
              { label: 'ЗВУКОВЫЕ ЭФФЕКТЫ', state: sfxEnabled, toggle: () => setSfxEnabled(s => !s) },
              { label: 'CRT СКАНЛАЙН', state: scanEffect, toggle: () => setScanEffect(s => !s) },
            ].map((item, i) => (
              <div key={i} className="flex justify-between items-center">
                <span className="font-mono text-sm" style={{ color: 'var(--green-mid)' }}>{'> '}{item.label}:</span>
                <button
                  onClick={item.toggle}
                  className="font-mono text-xs px-3 py-1 border transition-colors"
                  style={{
                    borderColor: item.state ? 'var(--green)' : 'var(--green-dark)',
                    background: item.state ? 'rgba(0,60,0,0.6)' : 'transparent',
                    color: item.state ? 'var(--green)' : 'var(--green-mid)'
                  }}
                >
                  {item.state ? '[ ВКЛ ✓ ]' : '[ ВЫКЛ  ]'}
                </button>
              </div>
            ))}

            <div className="border-t pt-4" style={{ borderColor: 'var(--green-dark)' }}>
              <div className="font-mono text-xs space-y-1" style={{ color: 'var(--green-mid)' }}>
                <div>{'> АККАУНТ: '}<span style={{ color: 'var(--green)', textShadow: '0 0 4px var(--green)' }}>{user?.username}</span></div>
                <div>{'> БАЛАНС: '}<span style={{ color: 'var(--amber)', textShadow: '0 0 4px var(--amber)' }}>💰 {user?.coins} МОНЕТ</span></div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full font-mono text-sm py-2 border transition-colors"
              style={{ borderColor: '#660000', color: 'var(--red)', background: 'rgba(30,0,0,0.4)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(80,0,0,0.6)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(30,0,0,0.4)')}
            >
              {'[ ⏏ ] ВЫЙТИ ИЗ АККАУНТА'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="font-mono text-sm" style={{ color: 'var(--green)', textShadow: '0 0 8px var(--green)' }}>
        ЗАГРУЗКА<span className="cursor" />
      </div>
    </div>
  );
}