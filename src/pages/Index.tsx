import { useState, useEffect, useCallback, useRef } from 'react';

// ─── API URLS ───────────────────────────────────────────────────────────────
const AUTH_URL = 'https://functions.poehali.dev/038b29c1-7e93-419b-af8a-2c5a40f5ddba';
const GAME_URL = 'https://functions.poehali.dev/ac95416a-ce47-4da2-b4e6-876f21675df9';
const LEADER_URL = 'https://functions.poehali.dev/13dbad51-7a68-4212-88d9-801fea9a36bb';

// ─── TYPES ──────────────────────────────────────────────────────────────────
type Screen = 'boot' | 'auth' | 'menu' | 'game_setup' | 'lobby' | 'game' | 'stats' | 'leaderboard' | 'settings';
type AnimState = 'idle' | 'shooting_self' | 'shooting_other' | 'reloading' | 'dead' | 'win';

interface User { id: number; username: string; coins: number; }
interface Player {
  slot: number; name: string; is_bot: boolean;
  hp: number; max_hp: number; coins: number;
  items: string[]; alive: boolean; is_winner: boolean;
  user_id?: number;
}
interface GameInfo {
  id: number; room_code: string; status: string; mode: string;
  max_players: number; current_turn: number; round: number;
  shells_remaining: number; last_shot: string | null; log: string[];
  is_host?: boolean;
}
interface LobbyInfo {
  game_id: number; room_code: string; status: string; mode: string;
  max_players: number; players: Player[]; is_host: boolean; player_count: number;
}
interface LeaderEntry { rank: number; username: string; score: number; games_played: number; games_won: number; winrate: number; coins: number; }
interface HistoryEntry { result: string; score: number; rounds: number; coins_change: number; players_count: number; played_at: string; room_code: string; }

// ─── ASCII ART ───────────────────────────────────────────────────────────────
const ASCII_SHOTGUN_IDLE = `
    ___________
   |  BUCKSHOT |
   |___________|
   |           |
===|====◉======|===
   |___________|
   ||||||||||||
      ||  ||
`.trim();

const ASCII_SHOTGUN_FIRE = `
    ___________
   |  BUCKSHOT |◄──── BANG!!!
   |___________|
   |           |
===|====◉======|===>>>  💥
   |___________|
   ||||||||||||
      ||  ||
`.trim();

const ASCII_SHOTGUN_BLANK = `
    ___________
   |  BUCKSHOT |◄──── click
   |___________|
   |           |
===|====○======|===
   |___________|
   ||||||||||||
      ||  ||
`.trim();

const ASCII_DEAD = `
  ████████████
  █  X     X █
  █    ___   █
  █  /     \\ █
  ████████████
   [GAME OVER]
`.trim();

const ASCII_WIN = `
  ★★★★★★★★★★★★
  ★            ★
  ★  VICTORY!  ★
  ★            ★
  ★★★★★★★★★★★★
`.trim();

const ASCII_SKULL_FRAMES = [
`  .---.
 /o o  \\
|  ___  |
| /   \\ |
 \\_____/`,
`  .---.
 /X X  \\
|  ___  |
| \\___/ |
 \\_____/`,
];

const ASCII_TITLE = `
 ██████╗ ██╗   ██╗ ██████╗██╗  ██╗███████╗██╗  ██╗ ██████╗ ████████╗
 ██╔══██╗██║   ██║██╔════╝██║ ██╔╝██╔════╝██║  ██║██╔═══██╗╚══██╔══╝
 ██████╔╝██║   ██║██║     █████╔╝ ███████╗███████║██║   ██║   ██║   
 ██╔══██╗██║   ██║██║     ██╔═██╗ ╚════██║██╔══██║██║   ██║   ██║   
 ██████╔╝╚██████╔╝╚██████╗██║  ██╗███████║██║  ██║╚██████╔╝   ██║   
 ╚═════╝  ╚═════╝  ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝    ╚═╝  
`.trim();

// ─── DONUT SPINNER ───────────────────────────────────────────────────────────
function useDonut() {
  const [frame, setFrame] = useState('');
  useEffect(() => {
    let A = 0, B = 0;
    let raf: number;
    const W = 32, H = 16;
    const renderFrame = () => {
      const z: number[] = new Array(W * H).fill(0);
      const b: string[] = new Array(W * H).fill(' ');
      const cosA = Math.cos(A), sinA = Math.sin(A);
      const cosB = Math.cos(B), sinB = Math.sin(B);
      for (let j = 0; j < 6.28; j += 0.07) {
        const cosj = Math.cos(j), sinj = Math.sin(j);
        for (let i = 0; i < 6.28; i += 0.02) {
          const cosi = Math.cos(i), sini = Math.sin(i);
          const h = cosj + 2;
          const D = 1 / (sini * h * sinA + sinj * cosA + 5);
          const t = sini * h * cosA - sinj * sinA;
          const x = Math.floor(W / 2 + 14 * D * (cosi * h * cosB - t * sinB));
          const y = Math.floor(H / 2 + 6 * D * (cosi * h * sinB + t * cosB));
          const o = x + W * y;
          const N = Math.floor(8 * ((sinj * sinA - sini * cosj * cosA) * cosB - sini * cosj * sinA - sinj * cosA - cosi * cosj * sinB));
          if (H > y && y > 0 && x > 0 && W > x && D > z[o]) {
            z[o] = D;
            b[o] = '.,-~:;=!*#$@'[Math.max(0, N)] || '.';
          }
        }
      }
      let out = '';
      for (let r = 0; r < H; r++) {
        out += b.slice(r * W, (r + 1) * W).join('') + '\n';
      }
      setFrame(out);
      A += 0.07;
      B += 0.03;
      raf = requestAnimationFrame(renderFrame);
    };
    raf = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return frame;
}

// ─── HP PIPS ─────────────────────────────────────────────────────────────────
function HpPips({ current, max }: { current: number; max: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <span key={i} style={{
          display: 'inline-block', width: 10, height: 10,
          border: `1px solid ${i < current ? 'var(--green)' : '#1a3a1a'}`,
          background: i < current ? 'var(--green)' : 'transparent',
          boxShadow: i < current ? '0 0 4px var(--green)' : 'none',
        }} />
      ))}
    </span>
  );
}

// ─── PLAYER CARD ─────────────────────────────────────────────────────────────
function PlayerCard({ p, isTurn, isMe, skullFrame }: { p: Player; isTurn: boolean; isMe: boolean; skullFrame: number }) {
  const alive = p.alive;
  return (
    <div className="border p-2 font-mono text-xs flex-1 min-w-[110px] max-w-[180px] transition-all duration-200" style={{
      borderColor: !alive ? '#220000' : isTurn ? 'var(--green)' : 'var(--green-dark)',
      background: isTurn && alive ? 'rgba(0,30,0,0.9)' : 'rgba(0,6,0,0.85)',
      opacity: alive ? 1 : 0.5,
      boxShadow: isTurn && alive ? '0 0 12px rgba(0,255,65,0.4), inset 0 0 12px rgba(0,255,65,0.05)' : 'none',
      transform: isTurn && alive ? 'scale(1.02)' : 'scale(1)',
    }}>
      {!alive ? (
        <pre style={{ fontSize: '7px', lineHeight: '1.1', color: 'var(--red)', margin: 0 }}>
          {ASCII_SKULL_FRAMES[skullFrame % 2]}
        </pre>
      ) : (
        <div style={{ fontSize: '28px', textAlign: 'center', lineHeight: 1 }}>
          {p.is_bot ? '🤖' : isMe ? '🧑' : '👤'}
        </div>
      )}
      <div className="font-bold mt-1 truncate" style={{
        color: p.is_bot ? '#ff4444' : isMe ? 'var(--green)' : 'var(--amber)',
        textShadow: isTurn ? '0 0 6px currentColor' : 'none',
        fontSize: '10px'
      }}>
        {isTurn && alive ? '► ' : ''}{p.name?.slice(0, 10)}
        {isMe && alive ? ' [YOU]' : ''}
      </div>
      <div className="mt-1"><HpPips current={p.hp} max={p.max_hp} /></div>
      <div style={{ color: 'var(--amber)', fontSize: '9px' }}>HP {p.hp}/{p.max_hp}</div>
      <div style={{ color: '#aaaa44', fontSize: '9px' }}>💰{p.coins}</div>
      {!alive && <div style={{ color: 'var(--red)', fontSize: '9px', marginTop: 2 }}>✖ DEAD</div>}
      {p.is_winner && <div style={{ color: 'var(--amber)', fontSize: '9px' }}>★ WINNER</div>}
    </div>
  );
}

// ─── SHOTGUN ASCII ANIM ───────────────────────────────────────────────────────
function ShotgunDisplay({ animState, shellsLeft }: { animState: AnimState; shellsLeft: number }) {
  const art = animState === 'shooting_other' ? ASCII_SHOTGUN_FIRE
    : animState === 'shooting_self' ? ASCII_SHOTGUN_FIRE
    : animState === 'reloading' ? ASCII_SHOTGUN_BLANK
    : ASCII_SHOTGUN_IDLE;

  const color = animState === 'shooting_other' || animState === 'shooting_self'
    ? 'var(--red)'
    : animState === 'reloading'
    ? 'var(--amber)'
    : 'var(--green)';

  return (
    <div className="text-center my-2">
      <pre className="inline-block font-mono" style={{
        fontSize: '10px', lineHeight: '1.4',
        color, textShadow: `0 0 8px ${color}`,
        transition: 'color 0.2s'
      }}>{art}</pre>
      <div className="font-mono text-xs mt-1">
        <span style={{ color: 'var(--green-mid)' }}>SHELLS: </span>
        {Array.from({ length: shellsLeft }, (_, i) => (
          <span key={i} style={{ color: 'var(--amber)', textShadow: '0 0 4px var(--amber)', margin: '0 1px', fontSize: '12px' }}>◉</span>
        ))}
        {shellsLeft === 0 && <span style={{ color: 'var(--green-mid)' }}>[ RELOADING... ]</span>}
        <span style={{ color: 'var(--green-dark)', marginLeft: 6 }}>×{shellsLeft}</span>
      </div>
    </div>
  );
}

// ─── SHOT RESULT ANIM ────────────────────────────────────────────────────────
function ShotResult({ shell, target }: { shell: string | null; target: string | null }) {
  if (!shell) return null;
  const isLive = shell === 'live';
  return (
    <div className="text-center my-2 font-mono" style={{
      color: isLive ? 'var(--red)' : 'var(--green)',
      textShadow: `0 0 16px ${isLive ? 'var(--red)' : 'var(--green)'}`,
      fontSize: '14px', fontWeight: 700,
      animation: 'shotResult 0.3s ease-out'
    }}>
      {isLive
        ? `💥 BANG! — ${target === 'self' ? 'СТРЕЛЯЕШЬ В СЕБЯ' : 'СТРЕЛЯЕШЬ В ВРАГА'} — БОЕВОЙ!`
        : `🔘 click... — ${target === 'self' ? 'СТРЕЛЯЕШЬ В СЕБЯ' : 'СТРЕЛЯЕШЬ В ВРАГА'} — ХОЛОСТОЙ`
      }
    </div>
  );
}

// ─── LOBBY SCREEN ────────────────────────────────────────────────────────────
function LobbyScreen({
  lobby, user, isHost, onStart, onLeave, loading, pollError
}: {
  lobby: LobbyInfo; user: User | null; isHost: boolean;
  onStart: () => void; onLeave: () => void; loading: boolean; pollError: string;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 500); return () => clearInterval(t); }, []);
  const dots = '.'.repeat((tick % 4));

  const slots = Array.from({ length: lobby.max_players }, (_, i) => {
    return lobby.players[i] || null;
  });

  return (
    <div className="crt-screen min-h-screen bg-black flex flex-col items-center justify-center p-4">
      <div className="scanline-sweep" />
      <div className="w-full max-w-lg">
        <div className="font-mono text-center mb-4">
          <div style={{ color: 'var(--green)', fontSize: '14px', textShadow: '0 0 8px var(--green)', fontWeight: 700 }}>
            ╔══════════════════════════╗
          </div>
          <div style={{ color: 'var(--green)', fontSize: '14px', textShadow: '0 0 8px var(--green)', fontWeight: 700 }}>
            ║   ONLINE LOBBY ROOM      ║
          </div>
          <div style={{ color: 'var(--green)', fontSize: '14px', textShadow: '0 0 8px var(--green)', fontWeight: 700 }}>
            ╚══════════════════════════╝
          </div>
        </div>

        {/* Room code - big like Among Us */}
        <div className="text-center mb-6">
          <div className="font-mono text-xs mb-1" style={{ color: 'var(--green-mid)' }}>КОД КОМНАТЫ — ПОДЕЛИСЬ С ДРУЗЬЯМИ</div>
          <div className="inline-block border-2 px-6 py-3" style={{
            borderColor: 'var(--green)',
            background: 'rgba(0,30,0,0.8)',
            boxShadow: '0 0 20px rgba(0,255,65,0.3)'
          }}>
            <div className="font-mono font-bold tracking-[0.4em]" style={{
              fontSize: '32px', color: 'var(--green)',
              textShadow: '0 0 12px var(--green), 0 0 30px rgba(0,255,65,0.4)',
              letterSpacing: '0.4em'
            }}>
              {lobby.room_code}
            </div>
          </div>
          <div className="font-mono text-xs mt-2" style={{ color: 'var(--green-dark)' }}>
            {lobby.player_count}/{lobby.max_players} игроков
          </div>
        </div>

        {/* Players list */}
        <div className="border p-4 mb-4" style={{ borderColor: 'var(--green-dark)', background: 'rgba(0,10,0,0.95)' }}>
          <div className="font-mono text-xs mb-3" style={{ color: 'var(--green-mid)' }}>
            {'═══ ИГРОКИ В КОМНАТЕ ═══'}
          </div>
          <div className="space-y-2">
            {slots.map((player, i) => (
              <div key={i} className="flex items-center gap-3 font-mono text-sm py-2 px-3 border" style={{
                borderColor: player ? (player.name === user?.username ? 'var(--green)' : 'var(--green-dark)') : '#111',
                background: player ? (player.name === user?.username ? 'rgba(0,40,0,0.6)' : 'rgba(0,15,0,0.4)') : 'rgba(0,5,0,0.3)',
              }}>
                <span style={{ color: 'var(--green-dark)', fontSize: '11px', minWidth: 20 }}>#{i + 1}</span>
                {player ? (
                  <>
                    <span style={{ fontSize: '18px' }}>👤</span>
                    <span style={{
                      color: player.name === user?.username ? 'var(--green)' : 'var(--amber)',
                      fontWeight: player.name === user?.username ? 700 : 400,
                      textShadow: player.name === user?.username ? '0 0 6px var(--green)' : 'none',
                      flex: 1
                    }}>
                      {player.name}
                    </span>
                    {player.name === user?.username && (
                      <span style={{ color: 'var(--green)', fontSize: '10px' }}>[ВЫ]</span>
                    )}
                    {i === 0 && <span style={{ color: 'var(--amber)', fontSize: '10px' }}>★ ХОСТ</span>}
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: '18px', opacity: 0.3 }}>⬜</span>
                    <span style={{ color: '#1a3a1a', flex: 1 }}>
                      {lobby.status === 'waiting' ? `ожидание{dots}` : 'пусто'}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {pollError && (
          <div className="font-mono text-xs mb-3 text-center" style={{ color: 'var(--red)' }}>{pollError}</div>
        )}

        {lobby.status === 'playing' && (
          <div className="font-mono text-sm text-center mb-3" style={{ color: 'var(--green)', textShadow: '0 0 8px var(--green)' }}>
            ▶ ИГРА НАЧИНАЕТСЯ{dots}
          </div>
        )}

        {lobby.status === 'waiting' && (
          <div className="font-mono text-xs text-center mb-3" style={{ color: 'var(--green-mid)' }}>
            {isHost
              ? lobby.player_count < 2
                ? `⏳ Ждём игроков${dots} (нужно минимум 2)`
                : '✅ Можно начинать!'
              : `⏳ Ждём хоста${dots}`
            }
          </div>
        )}

        <div className="flex gap-2">
          {isHost && lobby.status === 'waiting' && (
            <button
              onClick={onStart}
              disabled={loading || lobby.player_count < 2}
              className="flex-1 font-mono text-sm py-3 border-2 transition-all duration-200"
              style={{
                borderColor: lobby.player_count >= 2 ? 'var(--green)' : 'var(--green-dark)',
                color: lobby.player_count >= 2 ? 'var(--green)' : 'var(--green-dark)',
                background: lobby.player_count >= 2 ? 'rgba(0,50,0,0.7)' : 'rgba(0,10,0,0.4)',
                boxShadow: lobby.player_count >= 2 ? '0 0 10px rgba(0,255,65,0.3)' : 'none',
                cursor: lobby.player_count < 2 ? 'not-allowed' : 'pointer',
                fontWeight: 700
              }}
            >
              {loading ? '> ЗАПУСК...' : '[ ▶ НАЧАТЬ ИГРУ ]'}
            </button>
          )}
          <button
            onClick={onLeave}
            className="font-mono text-sm py-3 px-4 border transition-colors"
            style={{ borderColor: '#440000', color: 'var(--red)', background: 'rgba(20,0,0,0.4)' }}
          >[ ✕ ВЫЙТИ ]</button>
        </div>

        {!isHost && lobby.status === 'waiting' && (
          <div className="font-mono text-xs text-center mt-3" style={{ color: 'var(--green-dark)' }}>
            Хост запустит игру когда все будут готовы
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function Index() {
  const [screen, setScreen] = useState<Screen>('boot');
  const [user, setUser] = useState<User | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [bootStep, setBootStep] = useState(0);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({ username: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [menuIndex, setMenuIndex] = useState(0);
  const [gameSetupStep, setGameSetupStep] = useState<'mode' | 'count' | 'join'>('mode');
  const [gameMode, setGameMode] = useState<'solo' | 'online'>('solo');
  const [roomCode, setRoomCode] = useState('');
  const [game, setGame] = useState<GameInfo | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [lobby, setLobby] = useState<LobbyInfo | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [lastShell, setLastShell] = useState<string | null>(null);
  const [lastTarget, setLastTarget] = useState<string | null>(null);
  const [animState, setAnimState] = useState<AnimState>('idle');
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([]);
  const [myStats, setMyStats] = useState<LeaderEntry | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [histStats, setHistStats] = useState<{ games_played: number; games_won: number; score: number } | null>(null);
  const [setupMenuIdx, setSetupMenuIdx] = useState(0);
  const [scanEffect] = useState(true);
  const [skullFrame, setSkullFrame] = useState(0);
  const [shotFlash, setShotFlash] = useState<'live' | 'blank' | null>(null);
  const [pollError, setPollError] = useState('');
  const [gameId, setGameId] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const donut = useDonut();

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

  // skull animation
  useEffect(() => {
    const t = setInterval(() => setSkullFrame(x => x + 1), 600);
    return () => clearInterval(t);
  }, []);

  // boot sequence
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
              setSessionId(sid); setUser(JSON.parse(usr)); setScreen('menu');
            } catch { setScreen('auth'); }
          } else { setScreen('auth'); }
        }, 600);
      }
    }, 280);
    return () => clearInterval(t);
  }, []);

  // keyboard nav for menu
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (screen !== 'menu') return;
      const len = 5;
      if (e.key === 'ArrowUp') { e.preventDefault(); setMenuIndex(i => (i - 1 + len) % len); }
      if (e.key === 'ArrowDown') { e.preventDefault(); setMenuIndex(i => (i + 1) % len); }
      if (e.key === 'Enter') handleMenuSelect(menuIndex);
      ['1','2','3','4','5'].forEach((k, i) => { if (e.key === k) handleMenuSelect(i); });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, menuIndex]);

  // lobby polling
  useEffect(() => {
    if (screen !== 'lobby' || !gameId) { if (pollRef.current) clearInterval(pollRef.current); return; }
    const poll = async () => {
      try {
        const r = await fetch(GAME_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId || '' },
          body: JSON.stringify({ action: 'lobby', game_id: gameId })
        });
        const data = await r.json();
        if (data.ok) {
          setLobby(data);
          setPollError('');
          if (data.status === 'playing') {
            // game started! load state and go to game
            clearInterval(pollRef.current!);
            const stateR = await fetch(GAME_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId || '' },
              body: JSON.stringify({ action: 'state', game_id: gameId })
            });
            const stateData = await stateR.json();
            if (stateData.ok) {
              setGame(stateData.game);
              setPlayers(stateData.players);
              setActionLog(stateData.game.log || []);
              setLastShell(null);
              setAnimState('idle');
              setScreen('game');
            }
          }
        } else { setPollError('> ошибка соединения'); }
      } catch { setPollError('> нет связи с сервером'); }
    };
    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [screen, gameId, sessionId]);

  const apiGame = useCallback(async (body: Record<string, unknown>) => {
    const r = await fetch(GAME_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId || '' },
      body: JSON.stringify(body)
    });
    return r.json();
  }, [sessionId]);

  const apiAuth = useCallback(async (body: Record<string, unknown>) => {
    const r = await fetch(AUTH_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.json();
  }, []);

  const handleAuth = async () => {
    if (!authForm.username.trim() || !authForm.password.trim()) { setAuthError('> ОШИБКА: Заполни все поля'); return; }
    setLoading(true); setAuthError('> CONNECTING...');
    const data = await apiAuth({ action: authMode, ...authForm });
    setLoading(false);
    if (data.ok) {
      setUser(data.user); setSessionId(data.session_id);
      localStorage.setItem('bsr_session', data.session_id);
      localStorage.setItem('bsr_user', JSON.stringify(data.user));
      setScreen('menu'); setAuthError('');
    } else { setAuthError(`> ОШИБКА: ${data.error}`); }
  };

  const handleLogout = async () => {
    await apiAuth({ action: 'logout', session_id: sessionId });
    localStorage.removeItem('bsr_session'); localStorage.removeItem('bsr_user');
    setUser(null); setSessionId(null); setScreen('auth');
  };

  const menuItems = ['[ 1 ] НАЧАТЬ ИГРУ', '[ 2 ] ИСТОРИЯ / СТАТИСТИКА', '[ 3 ] МИРОВОЙ РЕЙТИНГ', '[ 4 ] НАСТРОЙКИ', '[ 5 ] ВЫЙТИ ИЗ АККАУНТА'];

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
      const r = await fetch(LEADER_URL, { method: 'GET', headers: { 'X-Session-Id': sessionId || '' } });
      const data = await r.json();
      setLoading(false);
      if (data.ok) { setLeaderboard(data.leaderboard); setMyStats(data.my_stats); }
      setScreen('leaderboard');
    }
    if (idx === 3) setScreen('settings');
    if (idx === 4) handleLogout();
  };

  const startSoloGame = async (cnt: number) => {
    setLoading(true);
    const data = await apiGame({ action: 'create', mode: 'solo', max_players: cnt, bot_count: cnt - 1 });
    setLoading(false);
    if (data.ok) {
      const stateData = await apiGame({ action: 'state', game_id: data.game_id });
      if (stateData.ok) {
        setGame(stateData.game); setPlayers(stateData.players);
        setActionLog(stateData.game.log || []); setLastShell(null);
        setAnimState('idle'); setGameId(data.game_id);
        setScreen('game');
      }
    }
  };

  const createOnlineRoom = async (cnt: number) => {
    setLoading(true);
    const data = await apiGame({ action: 'create', mode: 'pvp', max_players: cnt, bot_count: 0 });
    setLoading(false);
    if (data.ok) {
      setGameId(data.game_id);
      setIsHost(true);
      setScreen('lobby');
    }
  };

  const joinOnlineRoom = async () => {
    if (!roomCode.trim()) return;
    setLoading(true);
    const data = await apiGame({ action: 'join', room_code: roomCode.trim().toUpperCase() });
    setLoading(false);
    if (data.ok) {
      setGameId(data.game_id);
      setIsHost(data.is_host);
      if (data.status === 'playing') {
        const stateData = await apiGame({ action: 'state', game_id: data.game_id });
        if (stateData.ok) {
          setGame(stateData.game); setPlayers(stateData.players);
          setActionLog(stateData.game.log || []); setLastShell(null);
          setAnimState('idle'); setScreen('game');
        }
      } else {
        setScreen('lobby');
      }
    } else {
      setPollError(data.error || 'Ошибка подключения');
    }
  };

  const startLobbyGame = async () => {
    if (!gameId) return;
    setLoading(true);
    const data = await apiGame({ action: 'start', game_id: gameId });
    setLoading(false);
    if (!data.ok) setPollError(data.error || 'Ошибка запуска');
  };

  const loadGameState = useCallback(async (gId: number) => {
    const data = await apiGame({ action: 'state', game_id: gId });
    if (data.ok) { setGame(data.game); setPlayers(data.players); setActionLog(data.game.log || []); }
    return data;
  }, [apiGame]);

  const shoot = async (target: 'self' | 'other') => {
    if (!game || game.status === 'finished' || loading) return;
    setLoading(true);
    setAnimState(target === 'self' ? 'shooting_self' : 'shooting_other');
    const data = await apiGame({ action: 'shoot', game_id: game.id, target });
    setLoading(false);
    if (data.ok) {
      const isLive = data.shell === 'live';
      setLastShell(data.shell);
      setLastTarget(target);
      setShotFlash(isLive ? 'live' : 'blank');
      setTimeout(() => setShotFlash(null), 600);
      setTimeout(() => setAnimState(isLive ? 'idle' : 'reloading'), 400);
      setTimeout(() => setAnimState('idle'), 900);
      setActionLog(data.log || []);
      await loadGameState(game.id);
    }
  };

  // after bots turn auto-reload
  const myPlayer = players.find(p => !p.is_bot && p.name === user?.username);
  const currentPlayer = players.find(p => p.slot === game?.current_turn);
  const isMyTurn = !!(myPlayer && game && myPlayer.slot === game.current_turn && game.status === 'playing');
  const winner = players.find(p => p.is_winner);
  const isFinished = game?.status === 'finished';

  // ──── SCREENS ────────────────────────────────────────────────────────────

  // BOOT
  if (screen === 'boot') {
    return (
      <div className="crt-screen min-h-screen bg-black flex flex-col items-center justify-center p-8">
        {scanEffect && <div className="scanline-sweep" />}
        <div className="w-full max-w-2xl">
          <div className="font-mono text-xs mb-4" style={{ color: 'var(--green-mid)', textShadow: '0 0 4px #00aa22' }}>
            {'BUCKSHOT ROULETTE TERMINAL v1.0.0\n================================'}
          </div>
          {bootLines.slice(0, bootStep).map((line, i) => (
            <div key={i} className="font-mono text-sm mb-1" style={{
              color: line.includes('100%') ? 'var(--amber)' : line.includes('WELCOME') ? 'var(--green)' : 'var(--green-dim)',
              textShadow: line.includes('WELCOME') ? '0 0 10px var(--green)' : '0 0 4px #00cc33',
              fontWeight: line.includes('WELCOME') ? 700 : 400,
              fontSize: line.includes('WELCOME') ? '1.1rem' : undefined
            }}>{line}</div>
          ))}
        </div>
      </div>
    );
  }

  // AUTH
  if (screen === 'auth') {
    return (
      <div className="crt-screen min-h-screen bg-black flex flex-col items-center justify-center p-4">
        {scanEffect && <div className="scanline-sweep" />}
        <div className="w-full max-w-md">
          <pre className="font-mono text-center mb-6 overflow-hidden" style={{
            fontSize: '6px', lineHeight: '1.15',
            color: 'var(--green)', textShadow: '0 0 8px var(--green), 0 0 20px rgba(0,255,65,0.3)'
          }}>{ASCII_TITLE}</pre>

          <div className="border p-6" style={{ borderColor: 'var(--green-dark)', background: 'rgba(0,15,0,0.92)' }}>
            <div className="font-mono text-xs mb-4" style={{ color: 'var(--green-mid)' }}>
              {'> '}{authMode === 'login' ? 'ВХОД В СИСТЕМУ' : 'СОЗДАНИЕ АККАУНТА'}
            </div>

            <div className="flex gap-2 mb-4">
              {(['login', 'register'] as const).map(m => (
                <button key={m} onClick={() => setAuthMode(m)}
                  className="flex-1 font-mono text-xs py-1 border transition-colors"
                  style={{
                    borderColor: authMode === m ? 'var(--green)' : 'var(--green-dark)',
                    color: authMode === m ? 'var(--green)' : 'var(--green-dim)',
                    background: authMode === m ? 'rgba(0,50,0,0.5)' : 'transparent'
                  }}>
                  {m === 'login' ? 'ВОЙТИ' : 'РЕГИСТРАЦИЯ'}
                </button>
              ))}
            </div>

            {(['username', 'password'] as const).map(field => (
              <div key={field} className="mb-3">
                <div className="font-mono text-xs mb-1" style={{ color: 'var(--green-dim)' }}>
                  {field === 'username' ? '> НИК:' : '> ПАРОЛЬ:'}
                </div>
                <input
                  type={field === 'password' ? 'password' : 'text'}
                  value={authForm[field]}
                  onChange={e => setAuthForm(f => ({ ...f, [field]: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleAuth()}
                  className="w-full font-mono text-sm px-3 py-2 bg-transparent border outline-none"
                  style={{ borderColor: 'var(--green-dark)', color: 'var(--green)', caretColor: 'var(--green)' }}
                  placeholder={field === 'username' ? 'введи_ник' : '••••••••'}
                  maxLength={field === 'username' ? 32 : 128}
                  autoFocus={field === 'username'}
                />
              </div>
            ))}

            {authError && <div className="font-mono text-xs mb-4" style={{ color: 'var(--red)', textShadow: '0 0 6px rgba(255,51,51,0.5)' }}>{authError}</div>}

            <button onClick={handleAuth} disabled={loading}
              className="w-full font-mono text-sm py-2 border-2 transition-colors"
              style={{ borderColor: 'var(--green)', background: 'rgba(0,50,0,0.6)', color: 'var(--green)', cursor: loading ? 'wait' : 'pointer' }}
              onMouseEnter={e => { (e.target as HTMLElement).style.background = 'var(--green)'; (e.target as HTMLElement).style.color = 'var(--black)'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = 'rgba(0,50,0,0.6)'; (e.target as HTMLElement).style.color = 'var(--green)'; }}>
              {loading ? '> CONNECTING...' : authMode === 'login' ? '[ ENTER ] ВОЙТИ В СИСТЕМУ' : '[ ENTER ] СОЗДАТЬ АККАУНТ'}
            </button>
          </div>
          <div className="mt-3 font-mono text-xs text-center" style={{ color: 'var(--green-mid)' }}>{'> СТАРТОВЫЙ БАЛАНС: 💰 100 МОНЕТ'}</div>
        </div>
      </div>
    );
  }

  // MENU
  if (screen === 'menu') {
    return (
      <div className="crt-screen min-h-screen bg-black flex flex-col items-center justify-center p-4">
        {scanEffect && <div className="scanline-sweep" />}
        <div className="w-full max-w-xl">
          <pre className="font-mono text-center mb-2 overflow-hidden" style={{
            fontSize: '6px', lineHeight: '1.2',
            color: 'var(--green)', textShadow: '0 0 10px var(--green), 0 0 30px rgba(0,255,65,0.2)'
          }}>{ASCII_TITLE}</pre>
          <div className="text-center font-mono text-xs mb-1" style={{ color: 'var(--green-dim)' }}>{'═══════════[ R O U L E T T E ]═══════════'}</div>
          <div className="text-center font-mono text-xs mb-6" style={{ color: 'var(--amber)', textShadow: '0 0 6px var(--amber)' }}>
            {'▸ ИГРОК: '}{user?.username}{'  |  💰 '}{user?.coins}{' МОНЕТ'}
          </div>

          <div className="border p-5 mx-auto max-w-sm" style={{ borderColor: 'var(--green-dark)', background: 'rgba(0,10,0,0.95)' }}>
            <div className="font-mono text-xs mb-4" style={{ color: 'var(--green-mid)' }}>{'> ГЛАВНОЕ МЕНЮ  [↑↓] навигация  [ENTER] выбор'}</div>
            {menuItems.map((item, i) => (
              <div key={i}
                className="font-mono text-sm px-3 py-2 mb-1 cursor-pointer transition-colors"
                style={{
                  color: menuIndex === i ? 'var(--black)' : 'var(--green-dim)',
                  background: menuIndex === i ? 'var(--green)' : 'transparent',
                  textShadow: menuIndex === i ? 'none' : '0 0 4px #00cc33'
                }}
                onMouseEnter={() => setMenuIndex(i)}
                onClick={() => handleMenuSelect(i)}>
                {menuIndex === i ? `▶ ${item}` : `  ${item}`}
              </div>
            ))}
          </div>
          <div className="text-center mt-5 font-mono text-xs" style={{ color: 'var(--green-dark)' }}>{'v1.1 — BUCKSHOT ROULETTE ONLINE TERMINAL'}</div>
        </div>
      </div>
    );
  }

  // GAME SETUP
  if (screen === 'game_setup') {
    return (
      <div className="crt-screen min-h-screen bg-black flex flex-col items-center justify-center p-4">
        {scanEffect && <div className="scanline-sweep" />}
        <div className="w-full max-w-md">
          <div className="flex justify-between items-center mb-6">
            <div className="font-mono text-sm" style={{ color: 'var(--green)', textShadow: '0 0 8px var(--green)' }}>{'═══ НАСТРОЙКА ИГРЫ ═══'}</div>
            <button onClick={() => setScreen('menu')} className="font-mono text-xs" style={{ color: 'var(--green-mid)' }}>[ ← НАЗАД ]</button>
          </div>

          {gameSetupStep === 'mode' && (
            <div className="border p-5" style={{ borderColor: 'var(--green-dark)', background: 'rgba(0,10,0,0.95)' }}>
              <div className="font-mono text-sm mb-4" style={{ color: 'var(--green)' }}>{'═══ РЕЖИМ ИГРЫ ═══'}</div>
              {[
                { label: '[ 🤖 ] СОЛО — VS БОТЫ', sub: 'Играй один против ИИ', val: 'solo' as const },
                { label: '[ 🌍 ] ОНЛАЙН — С ЛЮДЬМИ', sub: 'Создай комнату или войди по коду', val: 'online' as const },
              ].map((item, i) => (
                <div key={i}
                  className="cursor-pointer border px-4 py-3 mb-2 transition-colors"
                  style={{
                    borderColor: setupMenuIdx === i ? 'var(--green)' : 'var(--green-dark)',
                    background: setupMenuIdx === i ? 'rgba(0,60,0,0.6)' : 'transparent'
                  }}
                  onMouseEnter={() => setSetupMenuIdx(i)}
                  onClick={() => { setGameMode(item.val); setGameSetupStep(item.val === 'solo' ? 'count' : 'join'); setSetupMenuIdx(0); }}>
                  <div className="font-mono text-sm" style={{ color: setupMenuIdx === i ? 'var(--green)' : 'var(--green-dim)' }}>
                    {setupMenuIdx === i ? '▶ ' : '  '}{item.label}
                  </div>
                  <div className="font-mono text-xs mt-0.5" style={{ color: 'var(--green-mid)' }}>{item.sub}</div>
                </div>
              ))}
            </div>
          )}

          {gameSetupStep === 'count' && gameMode === 'solo' && (
            <div className="border p-5" style={{ borderColor: 'var(--green-dark)', background: 'rgba(0,10,0,0.95)' }}>
              <div className="font-mono text-sm mb-1" style={{ color: 'var(--green)' }}>{'═══ КОЛ-ВО ИГРОКОВ ═══'}</div>
              <div className="font-mono text-xs mb-4" style={{ color: 'var(--green-mid)' }}>{'> Остальные слоты — боты'}</div>
              {[2, 3, 4].map((cnt, i) => (
                <div key={cnt}
                  className="cursor-pointer border px-4 py-2 mb-2 font-mono text-sm transition-colors"
                  style={{
                    borderColor: setupMenuIdx === i ? 'var(--green)' : 'var(--green-dark)',
                    color: setupMenuIdx === i ? 'var(--green)' : 'var(--green-dim)',
                    background: setupMenuIdx === i ? 'rgba(0,60,0,0.6)' : 'transparent'
                  }}
                  onMouseEnter={() => setSetupMenuIdx(i)}
                  onClick={() => startSoloGame(cnt)}>
                  {setupMenuIdx === i ? '▶ ' : '  '}[ {cnt} ИГРОКА ] — ты + {cnt - 1} бот{cnt - 1 > 1 ? 'а' : ''}
                </div>
              ))}
              <button onClick={() => setGameSetupStep('mode')} className="w-full font-mono text-xs py-1 mt-2" style={{ color: 'var(--green-mid)' }}>[ ← НАЗАД ]</button>
              {loading && <div className="font-mono text-xs mt-4 text-center" style={{ color: 'var(--amber)' }}>{'> ЗАГРУЗКА...'}</div>}
            </div>
          )}

          {gameSetupStep === 'join' && gameMode === 'online' && (
            <div className="border p-5" style={{ borderColor: 'var(--green-dark)', background: 'rgba(0,10,0,0.95)' }}>
              <div className="font-mono text-sm mb-4" style={{ color: 'var(--green)' }}>{'═══ ОНЛАЙН ИГРА ═══'}</div>

              <div className="mb-4 border-b pb-4" style={{ borderColor: 'var(--green-dark)' }}>
                <div className="font-mono text-xs mb-3" style={{ color: 'var(--green-mid)' }}>{'> СОЗДАТЬ НОВУЮ КОМНАТУ'}</div>
                {[2, 3, 4].map((cnt, i) => (
                  <div key={cnt}
                    className="cursor-pointer border px-4 py-2 mb-2 font-mono text-sm transition-colors"
                    style={{
                      borderColor: setupMenuIdx === i ? 'var(--green)' : 'var(--green-dark)',
                      color: setupMenuIdx === i ? 'var(--green)' : 'var(--green-dim)',
                      background: setupMenuIdx === i ? 'rgba(0,60,0,0.6)' : 'transparent'
                    }}
                    onMouseEnter={() => setSetupMenuIdx(i)}
                    onClick={() => createOnlineRoom(cnt)}>
                    {setupMenuIdx === i ? '▶ ' : '  '}СОЗДАТЬ на {cnt} игроков
                  </div>
                ))}
              </div>

              <div>
                <div className="font-mono text-xs mb-2" style={{ color: 'var(--green-mid)' }}>{'> ВОЙТИ В КОМНАТУ ПО КОДУ'}</div>
                <input
                  value={roomCode}
                  onChange={e => setRoomCode(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && joinOnlineRoom()}
                  className="w-full font-mono text-center text-lg px-3 py-2 bg-transparent border outline-none mb-2 tracking-widest"
                  style={{ borderColor: 'var(--green-dark)', color: 'var(--green)', caretColor: 'var(--green)', letterSpacing: '0.3em' }}
                  placeholder="XXXXXX"
                  maxLength={6}
                />
                <button onClick={joinOnlineRoom} disabled={loading || !roomCode.trim()}
                  className="w-full font-mono text-sm py-2 border transition-colors"
                  style={{
                    borderColor: roomCode.trim() ? 'var(--green)' : 'var(--green-dark)',
                    color: roomCode.trim() ? 'var(--green)' : 'var(--green-dim)',
                    background: 'rgba(0,30,0,0.6)'
                  }}>
                  {loading ? '> ПОДКЛЮЧЕНИЕ...' : '[ → ВОЙТИ В КОМНАТУ ]'}
                </button>
                {pollError && <div className="font-mono text-xs mt-2 text-center" style={{ color: 'var(--red)' }}>{pollError}</div>}
              </div>

              <button onClick={() => { setGameSetupStep('mode'); setPollError(''); }} className="w-full font-mono text-xs py-1 mt-4" style={{ color: 'var(--green-mid)' }}>[ ← НАЗАД ]</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // LOBBY
  if (screen === 'lobby' && lobby) {
    return (
      <LobbyScreen
        lobby={lobby}
        user={user}
        isHost={isHost}
        onStart={startLobbyGame}
        onLeave={() => { if (pollRef.current) clearInterval(pollRef.current); setLobby(null); setGameId(null); setScreen('menu'); }}
        loading={loading}
        pollError={pollError}
      />
    );
  }
  if (screen === 'lobby' && !lobby) {
    return (
      <div className="crt-screen min-h-screen bg-black flex items-center justify-center">
        <div className="font-mono text-sm" style={{ color: 'var(--green)' }}>
          <pre style={{ fontSize: '10px', lineHeight: '1.3', textAlign: 'center' }}>{donut}</pre>
          <div className="text-center mt-2">ПОДКЛЮЧЕНИЕ К ЛОББИ...</div>
        </div>
      </div>
    );
  }

  // GAME
  if (screen === 'game' && game) {
    return (
      <div className={`crt-screen min-h-screen bg-black flex flex-col`} style={{ maxHeight: '100vh', overflow: 'hidden' }}>
        {scanEffect && <div className="scanline-sweep" />}

        {/* Shot flash overlay */}
        {shotFlash && (
          <div className="fixed inset-0 pointer-events-none z-50" style={{
            background: shotFlash === 'live' ? 'rgba(255,50,0,0.18)' : 'rgba(0,200,50,0.08)',
            animation: 'shotFlashAnim 0.6s ease-out'
          }} />
        )}

        {/* Header */}
        <div className="flex justify-between items-center px-3 py-2 border-b font-mono text-xs flex-shrink-0" style={{ borderColor: 'var(--green-dark)', background: 'rgba(0,4,0,0.98)' }}>
          <span style={{ color: 'var(--green-mid)' }}>
            BSR <span style={{ color: 'var(--amber)', textShadow: '0 0 6px var(--amber)' }}>#{game.room_code}</span>
          </span>
          <span style={{ color: 'var(--green-mid)' }}>
            РАУНД <span style={{ color: 'var(--green)', fontWeight: 700 }}>{game.round}</span>
          </span>
          <button onClick={() => setScreen('menu')} style={{ color: 'var(--red)', textShadow: '0 0 6px var(--red)', fontFamily: 'monospace' }}>[ ✕ ]</button>
        </div>

        {/* Game area */}
        <div className="flex-1 flex flex-col p-2 overflow-hidden">

          {/* Win/Lose banner */}
          {isFinished && winner && (
            <div className="text-center mb-2 border py-3 font-mono" style={{
              borderColor: winner.name === user?.username ? 'var(--green)' : 'var(--red)',
              background: winner.name === user?.username ? 'rgba(0,30,0,0.9)' : 'rgba(30,0,0,0.9)',
              boxShadow: `0 0 20px ${winner.name === user?.username ? 'rgba(0,255,65,0.3)' : 'rgba(255,50,50,0.3)'}`
            }}>
              {winner.name === user?.username ? (
                <pre style={{ fontSize: '9px', color: 'var(--green)', textShadow: '0 0 8px var(--green)', margin: 0 }}>{ASCII_WIN}</pre>
              ) : (
                <pre style={{ fontSize: '9px', color: 'var(--red)', textShadow: '0 0 8px var(--red)', margin: 0 }}>{ASCII_DEAD}</pre>
              )}
              <div className="text-sm font-bold mt-1" style={{
                color: winner.name === user?.username ? 'var(--green)' : 'var(--red)',
                textShadow: `0 0 10px currentColor`
              }}>
                {winner.name === user?.username ? '★ ТЫ ПОБЕДИЛ! ★' : `★ ПОБЕДИТЕЛЬ: ${winner.name} ★`}
              </div>
              <button onClick={() => setScreen('menu')}
                className="font-mono text-xs px-4 py-1 border mt-2 transition-colors"
                style={{ borderColor: 'var(--green)', color: 'var(--green)' }}>
                [ ВЕРНУТЬСЯ В МЕНЮ ]
              </button>
            </div>
          )}

          {/* Players */}
          <div className="flex gap-1 justify-center mb-1 flex-shrink-0 flex-wrap">
            {players.map(p => (
              <PlayerCard
                key={p.slot}
                p={p}
                isTurn={p.slot === game.current_turn && p.alive}
                isMe={p.name === user?.username}
                skullFrame={skullFrame}
              />
            ))}
          </div>

          {/* Shotgun */}
          <ShotgunDisplay animState={animState} shellsLeft={game.shells_remaining} />

          {/* Shot result */}
          {lastShell && <ShotResult shell={lastShell} target={lastTarget} />}

          {/* Turn indicator */}
          {!isFinished && (
            <div className="text-center font-mono text-xs mb-1 flex-shrink-0" style={{ color: 'var(--green-mid)' }}>
              {isMyTurn
                ? <span style={{ color: 'var(--green)', textShadow: '0 0 6px var(--green)', fontWeight: 700 }}>▶ ТВОЙ ХОД — ВЫБИРАЙ!</span>
                : loading
                ? <span style={{ color: 'var(--amber)' }}>⟳ ОБРАБОТКА...</span>
                : <span>⏳ ХОД: <span style={{ color: 'var(--amber)' }}>{currentPlayer?.name || '?'}</span></span>
              }
            </div>
          )}

          {/* Action buttons */}
          {!isFinished && isMyTurn && (
            <div className="flex gap-2 mb-2 flex-shrink-0">
              <button
                onClick={() => shoot('self')}
                disabled={loading}
                className="flex-1 font-mono text-sm py-3 border-2 transition-all duration-150"
                style={{
                  borderColor: 'var(--green)', color: 'var(--green)',
                  background: 'rgba(0,20,0,0.8)',
                  boxShadow: 'inset 0 0 8px rgba(0,255,65,0.05)'
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,60,0,0.9)'; e.currentTarget.style.boxShadow = '0 0 10px rgba(0,255,65,0.3)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,20,0,0.8)'; e.currentTarget.style.boxShadow = 'inset 0 0 8px rgba(0,255,65,0.05)'; }}>
                🔫 В СЕБЯ
                <div className="text-xs opacity-60">(blank = снова твой ход)</div>
              </button>
              <button
                onClick={() => shoot('other')}
                disabled={loading}
                className="flex-1 font-mono text-sm py-3 border-2 transition-all duration-150"
                style={{
                  borderColor: 'var(--red)', color: 'var(--red)',
                  background: 'rgba(30,0,0,0.8)',
                  textShadow: '0 0 4px var(--red)',
                  boxShadow: 'inset 0 0 8px rgba(255,50,50,0.05)'
                }}
                onMouseEnter={e => { (e.currentTarget.style.background = 'rgba(80,0,0,0.9)'); }}
                onMouseLeave={e => { (e.currentTarget.style.background = 'rgba(30,0,0,0.8)'); }}>
                💀 В ПРОТИВНИКА
                <div className="text-xs opacity-60">(ход переходит)</div>
              </button>
            </div>
          )}

          {/* Action log */}
          <div className="border p-2 font-mono text-xs overflow-y-auto flex-1 min-h-0" style={{
            borderColor: 'var(--green-dark)', background: 'rgba(0,3,0,0.96)', maxHeight: '100px'
          }}>
            <div className="mb-1" style={{ color: 'var(--green-dark)' }}>{'> LOG:'}</div>
            {actionLog.length === 0 && <div style={{ color: 'var(--green-dark)' }}>{'> Ожидание первого выстрела...'}</div>}
            {[...actionLog].reverse().map((line, i) => (
              <div key={i} style={{
                color: line.includes('LIVE') || line.includes('live') ? 'var(--red)'
                  : line.includes('blank') || line.includes('BLANK') ? '#448844'
                  : 'var(--green-mid)',
                opacity: i === 0 ? 1 : Math.max(0.3, 1 - i * 0.12)
              }}>{line}</div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // STATS
  if (screen === 'stats') {
    return (
      <div className="crt-screen min-h-screen bg-black flex flex-col items-center justify-center p-4">
        {scanEffect && <div className="scanline-sweep" />}
        <div className="w-full max-w-2xl">
          <div className="flex justify-between items-center mb-5">
            <div className="font-mono text-sm" style={{ color: 'var(--green)', textShadow: '0 0 8px var(--green)' }}>{'═══ ИСТОРИЯ / СТАТИСТИКА ═══'}</div>
            <button onClick={() => setScreen('menu')} className="font-mono text-xs" style={{ color: 'var(--green-mid)' }}>[ ← НАЗАД ]</button>
          </div>

          {histStats && (
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { label: 'ИГР', val: histStats.games_played },
                { label: 'ПОБЕД', val: histStats.games_won },
                { label: 'ОЧКОВ', val: histStats.score },
              ].map(s => (
                <div key={s.label} className="border p-3 text-center font-mono" style={{ borderColor: 'var(--green-dark)', background: 'rgba(0,10,0,0.9)' }}>
                  <div style={{ fontSize: '20px', color: 'var(--green)', textShadow: '0 0 8px var(--green)', fontWeight: 700 }}>{s.val}</div>
                  <div style={{ fontSize: '10px', color: 'var(--green-mid)' }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          <div className="border p-3 font-mono text-xs" style={{ borderColor: 'var(--green-dark)', background: 'rgba(0,5,0,0.95)', maxHeight: '350px', overflowY: 'auto' }}>
            <div className="mb-2" style={{ color: 'var(--green-mid)' }}>{'> ПОСЛЕДНИЕ ИГРЫ:'}</div>
            {history.length === 0 && <div style={{ color: 'var(--green-dark)' }}>Нет игр</div>}
            {history.map((h, i) => (
              <div key={i} className="py-1 border-b flex gap-2" style={{ borderColor: '#0a1a0a' }}>
                <span style={{ color: h.result === 'win' ? 'var(--green)' : 'var(--red)', fontWeight: 700, minWidth: 45 }}>
                  {h.result === 'win' ? '★ WIN' : '✖ LOSE'}
                </span>
                <span style={{ color: 'var(--green-dim)' }}>#{h.room_code}</span>
                <span style={{ color: 'var(--amber)' }}>{h.coins_change > 0 ? '+' : ''}{h.coins_change}💰</span>
                <span style={{ color: 'var(--green-dark)', marginLeft: 'auto' }}>{h.played_at ? new Date(h.played_at).toLocaleDateString('ru') : ''}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // LEADERBOARD
  if (screen === 'leaderboard') {
    return (
      <div className="crt-screen min-h-screen bg-black flex flex-col items-center justify-center p-4">
        {scanEffect && <div className="scanline-sweep" />}
        <div className="w-full max-w-2xl">
          <div className="flex justify-between items-center mb-5">
            <div className="font-mono text-sm" style={{ color: 'var(--green)', textShadow: '0 0 8px var(--green)' }}>{'═══ МИРОВОЙ РЕЙТИНГ ═══'}</div>
            <button onClick={() => setScreen('menu')} className="font-mono text-xs" style={{ color: 'var(--green-mid)' }}>[ ← НАЗАД ]</button>
          </div>

          {myStats && (
            <div className="border px-4 py-2 mb-4 font-mono text-xs" style={{ borderColor: 'var(--amber)', background: 'rgba(20,15,0,0.9)', boxShadow: '0 0 8px rgba(255,180,0,0.2)' }}>
              <span style={{ color: 'var(--amber)' }}>★ ТЫ: #{myStats.rank} — {myStats.username} — {myStats.score} очков — {myStats.winrate}% WR</span>
            </div>
          )}

          <div className="border font-mono text-xs" style={{ borderColor: 'var(--green-dark)', background: 'rgba(0,5,0,0.95)' }}>
            <div className="flex gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--green-dark)', color: 'var(--green-mid)' }}>
              <span style={{ minWidth: 28 }}>#</span>
              <span style={{ flex: 1 }}>НИК</span>
              <span style={{ minWidth: 60, textAlign: 'right' }}>ОЧКИ</span>
              <span style={{ minWidth: 50, textAlign: 'right' }}>WIN%</span>
            </div>
            {leaderboard.map((entry) => (
              <div key={entry.rank} className="flex gap-2 px-3 py-1.5 border-b" style={{
                borderColor: '#060f06',
                background: entry.username === user?.username ? 'rgba(0,30,0,0.6)' : 'transparent'
              }}>
                <span style={{ minWidth: 28, color: entry.rank <= 3 ? 'var(--amber)' : 'var(--green-dim)' }}>
                  {entry.rank <= 3 ? ['★', '☆', '◆'][entry.rank - 1] : entry.rank}
                </span>
                <span style={{ flex: 1, color: entry.username === user?.username ? 'var(--green)' : 'var(--green-dim)', fontWeight: entry.username === user?.username ? 700 : 400 }}>
                  {entry.username}
                </span>
                <span style={{ minWidth: 60, textAlign: 'right', color: 'var(--green)' }}>{entry.score}</span>
                <span style={{ minWidth: 50, textAlign: 'right', color: 'var(--green-dim)' }}>{entry.winrate}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // SETTINGS
  if (screen === 'settings') {
    return (
      <div className="crt-screen min-h-screen bg-black flex flex-col items-center justify-center p-4">
        {scanEffect && <div className="scanline-sweep" />}
        <div className="w-full max-w-md">
          <div className="flex justify-between items-center mb-6">
            <div className="font-mono text-sm" style={{ color: 'var(--green)', textShadow: '0 0 8px var(--green)' }}>{'═══ НАСТРОЙКИ ═══'}</div>
            <button onClick={() => setScreen('menu')} className="font-mono text-xs" style={{ color: 'var(--green-mid)' }}>[ ← НАЗАД ]</button>
          </div>
          <div className="border p-5" style={{ borderColor: 'var(--green-dark)', background: 'rgba(0,10,0,0.95)' }}>
            <div className="font-mono text-xs mb-4" style={{ color: 'var(--green-dim)' }}>
              <div>{'> АККАУНТ: '}<span style={{ color: 'var(--green)' }}>{user?.username}</span></div>
              <div className="mt-1">{'> БАЛАНС: '}<span style={{ color: 'var(--amber)' }}>💰 {user?.coins} монет</span></div>
            </div>
            <div className="border-t pt-4 mt-4" style={{ borderColor: 'var(--green-dark)' }}>
              <div className="font-mono text-xs mb-2" style={{ color: 'var(--green-mid)' }}>{'> CRT ЭФФЕКТЫ: '}<span style={{ color: 'var(--green)' }}>ВКЛ</span></div>
            </div>
          </div>
          <button onClick={handleLogout}
            className="w-full font-mono text-sm py-2 border mt-4 transition-colors"
            style={{ borderColor: '#660000', color: 'var(--red)', background: 'rgba(30,0,0,0.4)' }}>
            {'[ ⏏ ] ВЫЙТИ ИЗ АККАУНТА'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center">
      <pre className="font-mono text-xs" style={{ color: 'var(--green)', fontSize: '9px', lineHeight: '1.2' }}>{donut}</pre>
      <div className="font-mono text-sm mt-2" style={{ color: 'var(--green)', textShadow: '0 0 8px var(--green)' }}>ЗАГРУЗКА...</div>
    </div>
  );
}