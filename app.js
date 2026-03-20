import { initializeApp }        from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  GoogleAuthProvider,
  signOut,
} from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

// ── Firebase init ─────────────────────────────────────────────────────────
const app       = initializeApp(firebaseConfig);
const auth      = getAuth(app);
const db        = getFirestore(app);
const gProvider = new GoogleAuthProvider();

// ── Shared events config (admin-controlled) ───────────────────────────────
// Это глобальная конфигурация событий бинго. Изменения администратора
// должны быть видны всем пользователям.
const EVENTS_CONFIG_DOC_REF = doc(db, 'config', 'f1bingoEvents');

// ── Default events ────────────────────────────────────────────────────────
const DEFAULT_EVENTS = [
  'Победа Ландо Норриса',
  'Победа Макса Ферстаппена',
  'Победа Льюиса Хэмилтона',
  'Победа на домашней трассе (минимум 2 разные)',
  'Победитель гонки стартовал вне топ-10',
  'Прорыв на подиум с 15-го места и ниже',
  'Шарль Леклер взял подиум в Монако',
  'Mercedes финиширует двумя машинами на подиуме',
  'Audi на подиуме',
  '5 разных победителей за первые 5 Гран-при',
  'Подиум без Red Bull (ни одного пилота)',
  'Haas финиширует в очках двумя машинами',
  'Williams финиширует в топ-5',
  'Alpine набирает очки',
  'Cadillac набирает очки',
  'Франко Колапинто набирает очки',
  'Исак Хаджар финиширует выше Ферстаппена',
  'Отрыв победителя от 2-го места > 30 секунд',
  'Дуэль за последнее очко (10 место) длится 5+ кругов',
  'Авария в первом повороте (3+ Гран-при за сезон)',
  'Авария напарников (контакт/сход)',
  'Столкновение с круговым',
  'Safety Car на первом круге',
  'Safety Car выезжает 3+ раза за одну гонку',
  '5 красных флагов за сезон',
  '5+ машин сошли в одной гонке',
  'Лидер чемпионата сходит на первых 5 кругах',
  'Сальто болида (переворот)',
  'Машину тушат огнетушителем (пожар/дым)',
  'Машина застревает в гравии (вывозят краном)',
  'Двойной вылет в одном повороте',
  'Прокол колеса от обломков',
  'Отлетевшее колесо попало в другую машину',
  'Пилот финиширует на разбитой машине (обломки висят)',
  'Пилот врезается в своего напарника',
  'Пит-стоп Ferrari длится дольше 10 секунд',
  'Пит-стоп любой команды длится дольше 7 секунд',
  'Стратегия Андеркат сработала',
  'Ошибка команды Андеркат не сработал',
  'Пилот использует 3 типа шин за одну гонку',
  'Пилоту ставят не тот тип резины, что он просил',
  'Машина после поломки доезжает до боксов',
  'Финиш под желтыми флагами',
  'FIA штрафует пилота за мат по радио',
  'Наказание пилота после гонки',
  'Пилот показывает средний палец',
  'Гонщик мешает напарнику',
  'Пилот пропускает напарника под клетчатым флагом',
  'Обгон на последнем круге',
  'Двойной обгон в одном повороте',
  'Пилот вылетает, но сохраняет позицию',
  'Пилот финиширует без одного из элементов антикрыла',
  'Драка/потасовка между пилотами после финиша',
  'Замена пилота по ходу сезона',
  'Все пилоты финишировали (3+ гонки за сезон)',
  'Дождевая гонка (3+ Гран-при за сезон)',
  'Пилот плачет на камеру (слезы радости/горя)',
  'Животное выбежало на трассу',
  'Оператор показывает старую легенду F1 в боксах',
  'Обгон одной машины 3 раза',
];

// ── Admin access ─────────────────────────────────────────────────────────
const ADMIN_EMAIL = 'zolbirgwood@gmail.com';
function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}
const isAdmin = () => normalizeEmail(auth.currentUser?.email) === normalizeEmail(ADMIN_EMAIL);

// ── Event object helpers ──────────────────────────────────────────────────
function toEventObj(e) {
  if (typeof e === 'string') return { text: e, forRace: true, forSeason: true, checkboxCount: 0 };
  return {
    text:          e.text,
    forRace:       e.forRace       ?? true,
    forSeason:     e.forSeason     ?? true,
    checkboxCount: e.checkboxCount ?? 0,
  };
}

function normalizeEvents(events) {
  return events.map(toEventObj);
}

// ── Current mode ──────────────────────────────────────────────────────────
let currentMode = 'race';
let pendingModeAfterAuth = null;

// ── Race game state ───────────────────────────────────────────────────────
const state = {
  uid:          null,
  playerName:   '',
  events:       [],
  eventsConfigVersion: 0,
  eventsConfigVersionUsedRace: 0,
  boardEvents:  [],
  checked:      [],
  sessionScore: 0,
  recordScore:  0,
  totalGames:   0,
  totalBingos:  0,
  totalSuperBingos: 0,
  bingoLines:   [],
};

// ── Season game state ─────────────────────────────────────────────────────
const seasonState = {
  boardEvents:  [],
  checked:      [],
  sessionScore: 0,
  recordScore:  0,
  totalGames:   0,
  totalBingos:  0,
  bingoLines:   [],
  eventsConfigVersionUsedSeason: 0,
};

function resetRaceUserState() {
  state.recordScore = 0;
  state.totalGames = 0;
  state.totalBingos = 0;
  state.totalSuperBingos = 0;
  state.boardEvents = [];
  state.checked = [];
  state.sessionScore = 0;
  state.bingoLines = [];
  state.eventsConfigVersionUsedRace = 0;
}

function resetSeasonUserState() {
  seasonState.recordScore = 0;
  seasonState.totalGames = 0;
  seasonState.totalBingos = 0;
  seasonState.boardEvents = [];
  seasonState.checked = [];
  seasonState.sessionScore = 0;
  seasonState.bingoLines = [];
  seasonState.eventsConfigVersionUsedSeason = 0;
}

// ── Events config syncing ─────────────────────────────────────────────────
let eventsConfigLoaded = false;
let eventsConfigDocExists = false;
let didMigrateLegacyEvents = false;
let legacyEventsFromLocalStorage = null;

function isAdminPanelOpen() {
  const overlay = document.getElementById('adminOverlay');
  return overlay && !overlay.classList.contains('hidden');
}

// ── Admin draft & UI state ──────────────────────────────────────────────
let adminDraftEvents = null; // редактируемый в админке массив
let adminDirty       = false; // есть несохраненные изменения
let adminSaving      = false; // идет запись в Firestore
let adminSearchQuery = '';    // текст поиска
let adminSaveStatusTimer = null;

function cloneEventsArray(events) {
  return (events || []).map(e => ({ ...e }));
}

function ensureAdminDraftEvents() {
  if (adminDraftEvents) return;
  const base = state.events?.length ? state.events : normalizeEvents(DEFAULT_EVENTS);
  adminDraftEvents = cloneEventsArray(base);
}

function getAdminEventsForView() {
  if (adminDraftEvents?.length) return adminDraftEvents;
  return state.events?.length ? state.events : normalizeEvents(DEFAULT_EVENTS);
}

function updateAdminSaveBtnState() {
  const btn = document.getElementById('adminSaveBtn');
  if (!btn) return;
  btn.disabled = !adminDirty || adminSaving;
  btn.textContent = adminSaving ? 'Сохранение...' : 'Сохранить';
}

function setAdminSaveStatus(message = '', type = '') {
  const statusEl = document.getElementById('adminSaveStatus');
  if (!statusEl) return;

  if (adminSaveStatusTimer) {
    clearTimeout(adminSaveStatusTimer);
    adminSaveStatusTimer = null;
  }

  statusEl.classList.add('hidden');
  statusEl.classList.remove('admin-save-status--success', 'admin-save-status--error');

  if (!message) return;

  statusEl.textContent = message;
  if (type === 'success') statusEl.classList.add('admin-save-status--success');
  if (type === 'error') statusEl.classList.add('admin-save-status--error');
  statusEl.classList.remove('hidden');

  if (type === 'success') {
    adminSaveStatusTimer = setTimeout(() => {
      setAdminSaveStatus();
    }, 2500);
  }
}

// Поиск по “событиям” (то, что редактирует админка)
const adminSearchInput = document.getElementById('adminSearchInput');
if (adminSearchInput) {
  adminSearchInput.addEventListener('input', () => {
    adminSearchQuery = adminSearchInput.value || '';
    renderAdminEvents();
  });
}

function maybeRefreshActiveBoardOnConfigChange() {
  if (currentMode === 'race') {
    const appPage = document.getElementById('appPage');
    if (appPage && !appPage.classList.contains('hidden')) showApp();
  }
  if (currentMode === 'season') {
    const seasonPage = document.getElementById('seasonPage');
    if (seasonPage && !seasonPage.classList.contains('hidden')) showSeasonGame();
  }
}

function maybeReRenderAdminEvents() {
  if (!isAdminPanelOpen()) return;
  if (!isAdmin()) return;
  // Если пользователь не редактирует в данный момент — синхронизируем черновик с актуальным состоянием.
  if (!adminDraftEvents || !adminDirty) {
    const base = state.events?.length ? state.events : normalizeEvents(DEFAULT_EVENTS);
    adminDraftEvents = cloneEventsArray(base);
  }
  renderAdminEvents();
}

function maybeMigrateLegacyEvents() {
  if (didMigrateLegacyEvents) return;
  if (!isAdmin()) return;
  if (!eventsConfigLoaded) return;
  if (eventsConfigDocExists) return;
  if (!legacyEventsFromLocalStorage?.length) return;

  didMigrateLegacyEvents = true;
  const normalized = normalizeEvents(legacyEventsFromLocalStorage);
  setDoc(EVENTS_CONFIG_DOC_REF, {
    events: normalized,
    version: 1,
    updatedAt: serverTimestamp(),
  }).catch(err => {
    console.error('Failed to migrate legacy events config:', err);
  });
}

onSnapshot(EVENTS_CONFIG_DOC_REF, snap => {
  const prevVersion = state.eventsConfigVersion;

  if (!snap.exists()) {
    eventsConfigDocExists = false;
    state.eventsConfigVersion = 0;
    // Фоллбек: пока админ не создал конфиг в Firestore — используем локальные дефолты.
    state.events = normalizeEvents(DEFAULT_EVENTS);
  } else {
    eventsConfigDocExists = true;
    const data = snap.data() || {};
    state.eventsConfigVersion = Number(data.version ?? 0) || 0;
    const events = Array.isArray(data.events) && data.events.length ? data.events : DEFAULT_EVENTS;
    state.events = normalizeEvents(events);
  }

  eventsConfigLoaded = true;

  if (state.eventsConfigVersion !== prevVersion) {
    maybeRefreshActiveBoardOnConfigChange();
  }
  maybeReRenderAdminEvents();
  maybeMigrateLegacyEvents();
});

// ── Storage keys ──────────────────────────────────────────────────────────
const storageKey       = () => `f1bingo_v2_${state.uid || 'guest'}`;
const seasonStorageKey = () => `f1bingo_season_v1_${state.uid || 'guest'}`;

// ── Race persistence ──────────────────────────────────────────────────────
function loadStorage() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d.events?.length) legacyEventsFromLocalStorage = d.events;
    if (typeof d.eventsConfigVersionUsedRace === 'number') {
      state.eventsConfigVersionUsedRace = d.eventsConfigVersionUsedRace;
    } else if (d.eventsConfigVersionUsedRace != null) {
      state.eventsConfigVersionUsedRace = Number(d.eventsConfigVersionUsedRace) || 0;
    }
    if (d.recordScore)          state.recordScore  = d.recordScore;
    if (d.totalGames)           state.totalGames   = d.totalGames;
    if (d.totalBingos)          state.totalBingos  = d.totalBingos;
    if (d.totalSuperBingos)     state.totalSuperBingos = d.totalSuperBingos;
    if (d.boardEvents?.length)  state.boardEvents  = d.boardEvents;
    if (d.checked?.length)      state.checked      = d.checked.map(v => typeof v === 'boolean' ? (v ? 1 : 0) : (v ?? 0));
    if (d.sessionScore)         state.sessionScore = d.sessionScore;
  } catch (_) {}
}

function saveStorage() {
  localStorage.setItem(storageKey(), JSON.stringify({
    recordScore:  state.recordScore,
    totalGames:   state.totalGames,
    totalBingos:  state.totalBingos,
    totalSuperBingos: state.totalSuperBingos,
    boardEvents:  state.boardEvents,
    checked:      state.checked,
    sessionScore: state.sessionScore,
    eventsConfigVersionUsedRace: state.eventsConfigVersionUsedRace,
  }));
}

// ── Season persistence ────────────────────────────────────────────────────
function loadSeasonStorage() {
  try {
    const raw = localStorage.getItem(seasonStorageKey());
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d.recordScore)          seasonState.recordScore  = d.recordScore;
    if (d.totalGames)           seasonState.totalGames   = d.totalGames;
    if (d.totalBingos)          seasonState.totalBingos  = d.totalBingos;
    if (d.boardEvents?.length)  seasonState.boardEvents  = d.boardEvents;
    if (d.checked?.length)      seasonState.checked      = d.checked.map(v => typeof v === 'boolean' ? (v ? 1 : 0) : (v ?? 0));
    if (d.sessionScore)         seasonState.sessionScore = d.sessionScore;
    if (typeof d.eventsConfigVersionUsedSeason === 'number') {
      seasonState.eventsConfigVersionUsedSeason = d.eventsConfigVersionUsedSeason;
    } else if (d.eventsConfigVersionUsedSeason != null) {
      seasonState.eventsConfigVersionUsedSeason = Number(d.eventsConfigVersionUsedSeason) || 0;
    }
  } catch (_) {}
}

function saveSeasonStorage() {
  localStorage.setItem(seasonStorageKey(), JSON.stringify({
    recordScore:  seasonState.recordScore,
    totalGames:   seasonState.totalGames,
    totalBingos:  seasonState.totalBingos,
    boardEvents:  seasonState.boardEvents,
    checked:      seasonState.checked,
    sessionScore: seasonState.sessionScore,
    eventsConfigVersionUsedSeason: seasonState.eventsConfigVersionUsedSeason,
  }));
}

// ── Helpers ───────────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fillToSize(pool, size) {
  if (!Array.isArray(pool) || pool.length === 0) return [];
  const out = [];
  while (out.length < size) {
    out.push(...shuffle(pool));
  }
  return out.slice(0, size);
}

function pick9() {
  const base = state.events.length ? state.events : normalizeEvents(DEFAULT_EVENTS);
  let racePool = base.filter(e => e.forRace);
  if (racePool.length === 0) {
    // Крайний случай: если в админке выключили всё для гонок,
    // иначе карточка не соберётся вообще.
    console.warn('pick9: no events enabled for race; falling back to all events');
    racePool = base;
  }
  return fillToSize(racePool, 9).map(e => e.text);
}

function pick50() {
  const base = state.events.length ? state.events : normalizeEvents(DEFAULT_EVENTS);
  let seasonPool = base.filter(e => e.forSeason);
  if (seasonPool.length === 0) {
    console.warn('pick50: no events enabled for season; falling back to all events');
    seasonPool = base;
  }
  return fillToSize(seasonPool, 50).map(e => e.text);
}

// ── Win lines ─────────────────────────────────────────────────────────────
const WIN_LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6],
];

// Season win lines: 10 horizontal rows (5 cells) + 5 vertical columns (10 cells)
const SEASON_WIN_LINES = [
  ...Array.from({ length: 10 }, (_, r) => Array.from({ length: 5 }, (_, c) => r * 5 + c)),
  ...Array.from({ length: 5  }, (_, c) => Array.from({ length: 10 }, (_, r) => r * 5 + c)),
];

function calcBingoLines(completed) {
  return WIN_LINES.filter(line => line.every(i => completed[i]));
}

function calcSeasonBingoLines(completed) {
  return SEASON_WIN_LINES.filter(line => line.every(i => completed[i]));
}

// ── Checkbox helpers ──────────────────────────────────────────────────────
function getEventsPool() {
  return state.events.length ? state.events : normalizeEvents(DEFAULT_EVENTS);
}

function normalizeEventText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getCellCheckboxCount(text, mode) {
  const pool = getEventsPool();
  const eventsWithSameText = pool.filter(e => e.text === text);
  const normalizedText = normalizeEventText(text);
  const normalizedMatches = eventsWithSameText.length
    ? eventsWithSameText
    : pool.filter(e => normalizeEventText(e.text) === normalizedText);

  // Основная ветка: берём только события, разрешенные для текущего режима.
  // Это важно при дубликатах одного `text` в конфиге.
  const modeFiltered = mode
    ? normalizedMatches.filter(e => Boolean(e[mode]))
    : normalizedMatches;

  // Если по режиму ничего не нашлось, откатываемся на любые совпадения по `text`.
  const candidates = modeFiltered.length ? modeFiltered : normalizedMatches;

  return candidates.reduce(
    (max, e) => Math.max(max, Number(e.checkboxCount ?? 0)),
    0
  );
}

function getCellRequired(text, mode) {
  const count = getCellCheckboxCount(text, mode);
  return count > 0 ? count : 1;
}

function buildCompleted(boardEvents, checked, mode) {
  return boardEvents.map((text, i) => (checked[i] || 0) >= getCellRequired(text, mode));
}

// ── Auth state observer ───────────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  if (user) {
    resetRaceUserState();
    resetSeasonUserState();
    state.uid        = user.uid;
    state.playerName = user.displayName || user.email?.split('@')[0] || 'Пилот';
    loadStorage();
    loadSeasonStorage();
    maybeMigrateLegacyEvents();
    closeAuthModal();
    showModePage();
    if (pendingModeAfterAuth) {
      const modeToOpen = pendingModeAfterAuth;
      pendingModeAfterAuth = null;
      if (modeToOpen === 'race') {
        showApp();
      } else {
        showSeasonGame();
      }
    }
  } else {
    resetRaceUserState();
    resetSeasonUserState();
    state.uid = null;
    state.playerName = 'Гость';
    showModePage();
  }
});

// ── Page switching ────────────────────────────────────────────────────────
function hideAllPages() {
  document.getElementById('loginPage').classList.add('hidden');
  document.getElementById('modePage').classList.add('hidden');
  document.getElementById('appPage').classList.add('hidden');
  document.getElementById('seasonPage').classList.add('hidden');
}

window.openAuthModal = function(tab = 'login') {
  switchTab(tab);
  setAuthError('');
  document.getElementById('loginPage').classList.remove('hidden');
};

window.closeAuthModal = function() {
  document.getElementById('loginPage').classList.add('hidden');
  setAuthError('');
};

function closeAuthModal() {
  window.closeAuthModal();
}

function updateModeHeaderAuthUI() {
  const isAuthed = Boolean(auth.currentUser);
  const modePlayerName = document.getElementById('modePlayerName');
  const modeLogoutBtn = document.getElementById('modeLogoutBtn');
  const modeAuthBtn = document.getElementById('modeAuthBtn');

  modePlayerName.classList.toggle('hidden', !isAuthed);
  modeLogoutBtn.classList.toggle('hidden', !isAuthed);
  modeAuthBtn.classList.toggle('hidden', isAuthed);
}

function showLogin() {
  openAuthModal('login');
}

window.showModePage = function() {
  hideAllPages();
  document.getElementById('modePage').classList.remove('hidden');
  document.getElementById('modePlayerName').textContent = state.playerName;
  updateModeHeaderAuthUI();
  updateAdminButtons();
};

window.selectMode = function(mode) {
  if (!auth.currentUser) {
    pendingModeAfterAuth = mode;
    openAuthModal('login');
    return;
  }

  currentMode = mode;
  if (mode === 'race') {
    showApp();
  } else {
    showSeasonGame();
  }
};

function showApp() {
  const needsRebuild =
    state.eventsConfigVersionUsedRace !== state.eventsConfigVersion ||
    !state.boardEvents.length ||
    state.boardEvents.length < 9;

  if (needsRebuild) {
    state.boardEvents  = pick9();
    state.checked      = Array(9).fill(0);
    state.sessionScore = 0;
    state.bingoLines   = [];
    state.eventsConfigVersionUsedRace = state.eventsConfigVersion;
  } else {
    state.bingoLines = calcBingoLines(buildCompleted(state.boardEvents, state.checked, 'forRace'));
  }

  hideAllPages();
  document.getElementById('appPage').classList.remove('hidden');
  updateAdminButtons();
  renderPlayerName();
  renderBoard();
  renderScore();
  saveStorage();
}

function showSeasonGame() {
  const needsRebuild =
    seasonState.eventsConfigVersionUsedSeason !== state.eventsConfigVersion ||
    !seasonState.boardEvents.length ||
    seasonState.boardEvents.length < 50;

  if (needsRebuild) {
    seasonState.boardEvents  = pick50();
    seasonState.checked      = Array(50).fill(0);
    seasonState.sessionScore = 0;
    seasonState.bingoLines   = [];
    seasonState.eventsConfigVersionUsedSeason = state.eventsConfigVersion;
  } else {
    seasonState.bingoLines = calcSeasonBingoLines(buildCompleted(seasonState.boardEvents, seasonState.checked, 'forSeason'));
  }

  hideAllPages();
  document.getElementById('seasonPage').classList.remove('hidden');
  document.getElementById('seasonPlayerName').textContent = state.playerName;
  document.getElementById('seasonPlayerNameHeader').textContent = state.playerName;
  updateAdminButtons();
  renderSeasonBoard();
  renderSeasonScore();
  saveSeasonStorage();
}

// ── Auth UI helpers ───────────────────────────────────────────────────────
function setAuthError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg;
  el.classList.toggle('hidden', !msg);
}

function setButtonLoading(id, loading) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn.dataset.origText = btn.textContent;
    btn.textContent = '...';
  } else {
    btn.textContent = btn.dataset.origText || btn.textContent;
  }
}

function friendlyError(code) {
  const map = {
    'auth/user-not-found':          'Пользователь с таким email не найден.',
    'auth/wrong-password':          'Неверный пароль.',
    'auth/invalid-credential':      'Неверный email или пароль.',
    'auth/email-already-in-use':    'Этот email уже зарегистрирован.',
    'auth/weak-password':           'Пароль слишком короткий (минимум 6 символов).',
    'auth/invalid-email':           'Неверный формат email.',
    'auth/popup-closed-by-user':    'Окно авторизации было закрыто.',
    'auth/cancelled-popup-request': 'Запрос отменён.',
    'auth/network-request-failed':  'Ошибка сети. Проверьте подключение.',
    'auth/too-many-requests':       'Слишком много попыток. Попробуйте позже.',
  };
  return map[code] || `Ошибка: ${code}`;
}

// ── Tab switching ─────────────────────────────────────────────────────────
window.switchTab = function(tab) {
  const isLogin = tab === 'login';
  document.getElementById('tabLogin').classList.toggle('login-tab--active', isLogin);
  document.getElementById('tabRegister').classList.toggle('login-tab--active', !isLogin);
  document.getElementById('loginForm').classList.toggle('hidden', !isLogin);
  document.getElementById('registerForm').classList.toggle('hidden', isLogin);
  setAuthError('');
};

// ── Email login ───────────────────────────────────────────────────────────
window.handleEmailLogin = async function(e) {
  e.preventDefault();
  setAuthError('');
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  setButtonLoading('btnLogin', true);
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    setAuthError(friendlyError(err.code));
  } finally {
    setButtonLoading('btnLogin', false);
  }
};

// ── Email register ────────────────────────────────────────────────────────
window.handleEmailRegister = async function(e) {
  e.preventDefault();
  setAuthError('');
  const name     = document.getElementById('regName').value.trim();
  const email    = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const consent  = document.getElementById('regConsent')?.checked;
  if (!consent) {
    setAuthError('Для регистрации нужно принять Условия и Политику конфиденциальности.');
    return;
  }
  setButtonLoading('btnRegister', true);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
  } catch (err) {
    setAuthError(friendlyError(err.code));
  } finally {
    setButtonLoading('btnRegister', false);
  }
};

// ── Google login ──────────────────────────────────────────────────────────
window.handleGoogleLogin = async function() {
  setAuthError('');
  try {
    await signInWithPopup(auth, gProvider);
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user') {
      setAuthError(friendlyError(err.code));
    }
  }
};

// ── Logout ────────────────────────────────────────────────────────────────
window.handleLogout = async function() {
  if (!confirm('Выйти из аккаунта?')) return;
  await signOut(auth);
};

// ── Race game logic ───────────────────────────────────────────────────────
const raceFireworks = {
  canvas: null,
  ctx: null,
  particles: [],
  animationFrame: 0,
  burstTimer: 0,
  stopTimer: 0,
  running: false,
};
let raceSuperBingoTimer = 0;

function getRaceFireworksCanvas() {
  if (raceFireworks.canvas) return raceFireworks.canvas;
  raceFireworks.canvas = document.getElementById('raceFireworksCanvas');
  if (raceFireworks.canvas) raceFireworks.ctx = raceFireworks.canvas.getContext('2d');
  return raceFireworks.canvas;
}

function resizeRaceFireworksCanvas() {
  const canvas = getRaceFireworksCanvas();
  const ctx = raceFireworks.ctx;
  if (!canvas || !ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const width = Math.floor(window.innerWidth);
  const height = Math.floor(window.innerHeight);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function spawnRaceFireworksBurst() {
  const canvas = getRaceFireworksCanvas();
  if (!canvas) return;

  const width = window.innerWidth;
  const height = window.innerHeight;
  const originX = width * (0.12 + Math.random() * 0.76);
  const originY = height * (0.16 + Math.random() * 0.44);
  const count = 28 + Math.floor(Math.random() * 14);
  const baseHue = Math.floor(Math.random() * 360);

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.18;
    const speed = 2.3 + Math.random() * 3.4;
    raceFireworks.particles.push({
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 36 + Math.random() * 30,
      ttl: 36 + Math.random() * 30,
      hue: (baseHue + Math.floor(Math.random() * 55)) % 360,
      size: 1.8 + Math.random() * 2.5,
    });
  }
}

function stepRaceFireworks() {
  const canvas = raceFireworks.canvas;
  const ctx = raceFireworks.ctx;
  if (!canvas || !ctx || !raceFireworks.running) return;

  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  for (let i = raceFireworks.particles.length - 1; i >= 0; i--) {
    const p = raceFireworks.particles[i];
    p.life -= 1;
    if (p.life <= 0) {
      raceFireworks.particles.splice(i, 1);
      continue;
    }

    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.988;
    p.vy = p.vy * 0.988 + 0.045;

    const alpha = p.life / p.ttl;
    ctx.beginPath();
    ctx.fillStyle = `hsla(${p.hue}, 100%, 62%, ${Math.max(alpha, 0)})`;
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }

  raceFireworks.animationFrame = requestAnimationFrame(stepRaceFireworks);
}

function stopRaceFireworks() {
  raceFireworks.running = false;
  if (raceFireworks.burstTimer) clearInterval(raceFireworks.burstTimer);
  if (raceFireworks.stopTimer) clearTimeout(raceFireworks.stopTimer);
  if (raceFireworks.animationFrame) cancelAnimationFrame(raceFireworks.animationFrame);
  raceFireworks.burstTimer = 0;
  raceFireworks.stopTimer = 0;
  raceFireworks.animationFrame = 0;
  raceFireworks.particles = [];

  const canvas = getRaceFireworksCanvas();
  if (!canvas || !raceFireworks.ctx) return;
  canvas.classList.add('hidden');
  raceFireworks.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
}

function showRaceFireworks() {
  const canvas = getRaceFireworksCanvas();
  if (!canvas || !raceFireworks.ctx) return;

  stopRaceFireworks();
  resizeRaceFireworksCanvas();

  canvas.classList.remove('hidden');
  raceFireworks.running = true;
  spawnRaceFireworksBurst();
  raceFireworks.burstTimer = setInterval(spawnRaceFireworksBurst, 230);
  raceFireworks.animationFrame = requestAnimationFrame(stepRaceFireworks);
  raceFireworks.stopTimer = setTimeout(stopRaceFireworks, 3200);
}

function showRaceSuperBingoFx() {
  const fx = document.getElementById('raceSuperBingoFx');
  if (!fx) return;

  if (raceSuperBingoTimer) clearTimeout(raceSuperBingoTimer);
  fx.classList.add('hidden');
  void fx.offsetWidth;
  fx.classList.remove('hidden');

  raceSuperBingoTimer = setTimeout(() => {
    fx.classList.add('hidden');
    raceSuperBingoTimer = 0;
  }, 1400);
}

function scheduleRaceSuperBingoCountUpdate() {
  setTimeout(() => {
    state.totalSuperBingos++;
    saveStorage();

    const statsOverlay = document.getElementById('statsOverlay');
    if (statsOverlay && !statsOverlay.classList.contains('hidden')) renderStats();
  }, 1400);
}

window.toggleCell = function(idx) {
  const prevCompleted = buildCompleted(state.boardEvents, state.checked, 'forRace');
  const wasAllCompleted = prevCompleted.length > 0 && prevCompleted.every(Boolean);

  const required = getCellRequired(state.boardEvents[idx], 'forRace');
  const current  = state.checked[idx] || 0;

  state.checked[idx] = current >= required ? 0 : current + 1;

  const completed    = buildCompleted(state.boardEvents, state.checked, 'forRace');
  const count        = completed.filter(Boolean).length;
  const isAllCompleted = completed.length > 0 && completed.every(Boolean);
  state.sessionScore = count;
  if (count > state.recordScore) state.recordScore = count;

  const prevBingoCount = state.bingoLines.length;
  state.bingoLines = calcBingoLines(completed);

  renderBoard();
  renderScore();
  saveStorage();

  if (state.bingoLines.length > prevBingoCount) {
    state.totalBingos++;
    saveStorage();
    setTimeout(showBingo, 600);
  }

  if (!wasAllCompleted && isAllCompleted) {
    showRaceFireworks();
    showRaceSuperBingoFx();
    scheduleRaceSuperBingoCountUpdate();
  }
};

window.resetGame = function() {
  state.totalGames++;
  state.boardEvents  = pick9();
  state.checked      = Array(9).fill(0);
  state.sessionScore = 0;
  state.bingoLines   = [];
  state.eventsConfigVersionUsedRace = state.eventsConfigVersion;

  document.getElementById('bingoOverlay').classList.add('hidden');
  document.getElementById('raceSuperBingoFx')?.classList.add('hidden');
  stopRaceFireworks();
  renderBoard();
  renderScore();
  saveStorage();
};

window.closeBingo = function() {
  document.getElementById('bingoOverlay').classList.add('hidden');
};

function showBingo() {
  document.getElementById('bingoSubtitle').textContent =
    `${state.playerName}, вы собрали бинго! Отмечено: ${state.sessionScore}/9`;
  document.getElementById('bingoOverlay').classList.remove('hidden');
}

// ── Race render ───────────────────────────────────────────────────────────
function renderBoard() {
  const grid     = document.getElementById('bingoGrid');
  grid.innerHTML = '';
  const winCells = new Set(state.bingoLines.flat());

  state.boardEvents.forEach((text, idx) => {
    const required  = getCellRequired(text, 'forRace');
    const progress  = state.checked[idx] || 0;
    const completed = progress >= required;

    const cell = document.createElement('div');
    cell.className = 'cell' +
      (completed ? ' checked' : '') +
      (winCells.has(idx) ? ' bingo-line' : '');

    const textEl = document.createElement('span');
    textEl.className   = 'cell__text';
    textEl.textContent = text;
    cell.appendChild(textEl);

    const cbCount = getCellCheckboxCount(text, 'forRace');
    if (cbCount > 0) {
      const row = document.createElement('div');
      row.className = 'cell__checkboxes';
      for (let i = 0; i < cbCount; i++) {
        const box = document.createElement('span');
        box.className = 'cell__checkbox' + (i < progress ? ' cell__checkbox--filled' : '');
        row.appendChild(box);
      }
      cell.appendChild(row);
    }

    cell.addEventListener('click', () => toggleCell(idx));
    grid.appendChild(cell);
  });
}

function renderScore() {
  document.getElementById('sessionScore').textContent = state.sessionScore;
  document.getElementById('recordScore').textContent  = state.recordScore;
}

function renderPlayerName() {
  document.getElementById('playerNameDisplay').textContent = state.playerName;
  document.getElementById('racePlayerName').textContent = state.playerName;
}

// ── Season game logic ─────────────────────────────────────────────────────
const seasonFireworks = {
  canvas: null,
  ctx: null,
  particles: [],
  animationFrame: 0,
  burstTimer: 0,
  stopTimer: 0,
  running: false,
};
let seasonSuperBingoTimer = 0;

function getSeasonFireworksCanvas() {
  if (seasonFireworks.canvas) return seasonFireworks.canvas;
  seasonFireworks.canvas = document.getElementById('seasonFireworksCanvas');
  if (seasonFireworks.canvas) seasonFireworks.ctx = seasonFireworks.canvas.getContext('2d');
  return seasonFireworks.canvas;
}

function resizeSeasonFireworksCanvas() {
  const canvas = getSeasonFireworksCanvas();
  const ctx = seasonFireworks.ctx;
  if (!canvas || !ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const width = Math.floor(window.innerWidth);
  const height = Math.floor(window.innerHeight);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function spawnSeasonFireworksBurst() {
  const canvas = getSeasonFireworksCanvas();
  if (!canvas) return;

  const width = window.innerWidth;
  const height = window.innerHeight;
  const originX = width * (0.12 + Math.random() * 0.76);
  const originY = height * (0.16 + Math.random() * 0.44);
  const count = 28 + Math.floor(Math.random() * 14);
  const baseHue = Math.floor(Math.random() * 360);

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.18;
    const speed = 2.3 + Math.random() * 3.4;
    seasonFireworks.particles.push({
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 36 + Math.random() * 30,
      ttl: 36 + Math.random() * 30,
      hue: (baseHue + Math.floor(Math.random() * 55)) % 360,
      size: 1.8 + Math.random() * 2.5,
    });
  }
}

function stepSeasonFireworks() {
  const canvas = seasonFireworks.canvas;
  const ctx = seasonFireworks.ctx;
  if (!canvas || !ctx || !seasonFireworks.running) return;

  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  for (let i = seasonFireworks.particles.length - 1; i >= 0; i--) {
    const p = seasonFireworks.particles[i];
    p.life -= 1;
    if (p.life <= 0) {
      seasonFireworks.particles.splice(i, 1);
      continue;
    }

    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.988;
    p.vy = p.vy * 0.988 + 0.045;

    const alpha = p.life / p.ttl;
    ctx.beginPath();
    ctx.fillStyle = `hsla(${p.hue}, 100%, 62%, ${Math.max(alpha, 0)})`;
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }

  seasonFireworks.animationFrame = requestAnimationFrame(stepSeasonFireworks);
}

function stopSeasonFireworks() {
  seasonFireworks.running = false;
  if (seasonFireworks.burstTimer) clearInterval(seasonFireworks.burstTimer);
  if (seasonFireworks.stopTimer) clearTimeout(seasonFireworks.stopTimer);
  if (seasonFireworks.animationFrame) cancelAnimationFrame(seasonFireworks.animationFrame);
  seasonFireworks.burstTimer = 0;
  seasonFireworks.stopTimer = 0;
  seasonFireworks.animationFrame = 0;
  seasonFireworks.particles = [];

  const canvas = getSeasonFireworksCanvas();
  if (!canvas || !seasonFireworks.ctx) return;
  canvas.classList.add('hidden');
  seasonFireworks.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
}

function showSeasonFireworks() {
  const canvas = getSeasonFireworksCanvas();
  if (!canvas || !seasonFireworks.ctx) return;

  stopSeasonFireworks();
  resizeSeasonFireworksCanvas();

  canvas.classList.remove('hidden');
  seasonFireworks.running = true;
  spawnSeasonFireworksBurst();
  seasonFireworks.burstTimer = setInterval(spawnSeasonFireworksBurst, 230);
  seasonFireworks.animationFrame = requestAnimationFrame(stepSeasonFireworks);
  seasonFireworks.stopTimer = setTimeout(stopSeasonFireworks, 3200);
}

function showSeasonSuperBingoFx() {
  const fx = document.getElementById('seasonSuperBingoFx');
  if (!fx) return;

  if (seasonSuperBingoTimer) clearTimeout(seasonSuperBingoTimer);
  fx.classList.add('hidden');
  void fx.offsetWidth;
  fx.classList.remove('hidden');

  seasonSuperBingoTimer = setTimeout(() => {
    fx.classList.add('hidden');
    seasonSuperBingoTimer = 0;
  }, 1400);
}

window.addEventListener('resize', () => {
  resizeRaceFireworksCanvas();
  resizeSeasonFireworksCanvas();
});

window.toggleSeasonCell = function(idx) {
  const prevCompleted = buildCompleted(seasonState.boardEvents, seasonState.checked, 'forSeason');
  const wasAllCompleted = prevCompleted.length > 0 && prevCompleted.every(Boolean);

  const required = getCellRequired(seasonState.boardEvents[idx], 'forSeason');
  const current  = seasonState.checked[idx] || 0;

  seasonState.checked[idx] = current >= required ? 0 : current + 1;

  const completed          = buildCompleted(seasonState.boardEvents, seasonState.checked, 'forSeason');
  const count              = completed.filter(Boolean).length;
  const isAllCompleted     = completed.length > 0 && completed.every(Boolean);
  seasonState.sessionScore = count;
  if (count > seasonState.recordScore) seasonState.recordScore = count;

  const prevBingoCount   = seasonState.bingoLines.length;
  seasonState.bingoLines = calcSeasonBingoLines(completed);

  renderSeasonBoard();
  renderSeasonScore();
  saveSeasonStorage();

  if (seasonState.bingoLines.length > prevBingoCount) {
    seasonState.totalBingos++;
    saveSeasonStorage();
    setTimeout(showSeasonBingo, 600);
  }

  if (!wasAllCompleted && isAllCompleted) {
    showSeasonFireworks();
    showSeasonSuperBingoFx();
  }
};

window.closeSeasonBingo = function() {
  document.getElementById('seasonBingoOverlay').classList.add('hidden');
};

function showSeasonBingo() {
  document.getElementById('seasonBingoSubtitle').textContent =
    `${state.playerName}, вы собрали бинго! Отмечено: ${seasonState.sessionScore}/50`;
  document.getElementById('seasonBingoOverlay').classList.remove('hidden');
}

// ── Season render ─────────────────────────────────────────────────────────
function renderSeasonBoard() {
  const grid     = document.getElementById('seasonGrid');
  grid.innerHTML = '';
  const winCells = new Set(seasonState.bingoLines.flat());

  seasonState.boardEvents.forEach((text, idx) => {
    const required  = getCellRequired(text, 'forSeason');
    const progress  = seasonState.checked[idx] || 0;
    const completed = progress >= required;

    const cell = document.createElement('div');
    cell.className = 'cell' +
      (completed ? ' checked' : '') +
      (winCells.has(idx) ? ' bingo-line' : '');

    const textEl = document.createElement('span');
    textEl.className   = 'cell__text';
    textEl.textContent = text;
    cell.appendChild(textEl);

    const cbCount = getCellCheckboxCount(text, 'forSeason');
    if (cbCount > 0) {
      const row = document.createElement('div');
      row.className = 'cell__checkboxes';
      for (let i = 0; i < cbCount; i++) {
        const box = document.createElement('span');
        box.className = 'cell__checkbox' + (i < progress ? ' cell__checkbox--filled' : '');
        row.appendChild(box);
      }
      cell.appendChild(row);
    }

    cell.addEventListener('click', () => toggleSeasonCell(idx));
    grid.appendChild(cell);
  });
}

function renderSeasonScore() {
  document.getElementById('seasonSessionScore').textContent = seasonState.sessionScore;
  document.getElementById('seasonRecordScore').textContent  = seasonState.recordScore;
}

// ── Admin button visibility ───────────────────────────────────────────────
function updateAdminButtons() {
  const hidden = !isAdmin();
  document.querySelectorAll('.admin-btn').forEach(btn => {
    btn.classList.toggle('hidden', hidden);
  });
}

// ── Admin ─────────────────────────────────────────────────────────────────
window.toggleAdmin = function() {
  if (!isAdmin()) return;
  const overlay = document.getElementById('adminOverlay');
  const hidden  = overlay.classList.toggle('hidden');

  if (!hidden) {
    // Открыли админку — стартуем с актуального снимка, вносим изменения в черновик.
    const base = state.events?.length ? state.events : normalizeEvents(DEFAULT_EVENTS);
    adminDraftEvents = cloneEventsArray(base);
    adminDirty = false;
    adminSaving = false;
    adminSearchQuery = '';
    setAdminSaveStatus();

    if (adminSearchInput) adminSearchInput.value = '';
    updateAdminSaveBtnState();
    renderAdminEvents();
  } else {
    // Закрыли админку — просто выкидываем черновик.
    adminDraftEvents = null;
    adminDirty = false;
    adminSaving = false;
    adminSearchQuery = '';
    setAdminSaveStatus();
    updateAdminSaveBtnState();
  }
};

function renderAdminEvents() {
  const listEl = document.getElementById('adminEventsList');
  if (!listEl) return;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));

  const events = getAdminEventsForView();
  const q = adminSearchQuery.trim().toLowerCase();

  const items = events
    .map((e, originalIdx) => ({ e, originalIdx }))
    .filter(({ e }) => !q || (e.text || '').toLowerCase().includes(q));

  if (!items.length) {
    listEl.innerHTML = `
      <div class="admin-event-item" style="justify-content: center; color: var(--text-dim);">
        Ничего не найдено
      </div>
    `;
    return;
  }

  listEl.innerHTML = items.map(({ e, originalIdx }) => `
    <div class="admin-event-item">
      <span class="admin-event-item__text">${escapeHtml(e.text)}</span>
      <div class="admin-event-modes">
        <label class="admin-mode-check" title="Бинго Гонки (3×3)">
          <input type="checkbox" ${e.forRace ? 'checked' : ''} onchange="toggleEventMode(${originalIdx}, 'forRace')" />
          <span class="admin-mode-check__label">🏎</span>
        </label>
        <label class="admin-mode-check" title="Бинго Сезона (5×10)">
          <input type="checkbox" ${e.forSeason ? 'checked' : ''} onchange="toggleEventMode(${originalIdx}, 'forSeason')" />
          <span class="admin-mode-check__label">🏆</span>
        </label>
      </div>
      <div class="admin-cb-count" title="Количество чекбоксов">
        <button class="admin-cb-btn" onclick="changeCheckboxCount(${originalIdx}, -1)">−</button>
        <span class="admin-cb-value">${e.checkboxCount || 0}</span>
        <button class="admin-cb-btn" onclick="changeCheckboxCount(${originalIdx}, 1)">+</button>
      </div>
      <button onclick="deleteEvent(${originalIdx})" title="Удалить">×</button>
    </div>
  `).join('');
}

window.saveAdminChanges = function() {
  if (!isAdmin()) {
    setAdminSaveStatus('Нет прав администратора для сохранения.', 'error');
    return;
  }
  if (!adminDirty || adminSaving) return;
  ensureAdminDraftEvents();
  setAdminSaveStatus();

  adminSaving = true;
  updateAdminSaveBtnState();

  persistEventsConfigToFirestore(adminDraftEvents)
    .then(() => {
      adminDirty = false;
      updateAdminSaveBtnState();
      setAdminSaveStatus('Изменения успешно сохранены.', 'success');
    })
    .catch(err => {
      const code = err?.code ? ` (${err.code})` : '';
      const details = err?.message ? `: ${err.message}` : '';
      console.error('Persist events failed:', err);
      setAdminSaveStatus(`Ошибка сохранения${code}${details}`, 'error');
      alert(`Не удалось сохранить изменения${code}${details}`);
    })
    .finally(() => {
      adminSaving = false;
      updateAdminSaveBtnState();
    });
};

function persistEventsConfigToFirestore(eventsToPersist) {
  if (!isAdmin()) {
    return Promise.reject(new Error(`Current user is not admin: ${auth.currentUser?.email || 'unknown'}`));
  }
  const nextVersion = Number(state.eventsConfigVersion || 0) + 1;
  const base = Array.isArray(eventsToPersist) && eventsToPersist.length
    ? eventsToPersist
    : (state.events?.length ? state.events : normalizeEvents(DEFAULT_EVENTS));
  const normalized = normalizeEvents(base);
  return setDoc(EVENTS_CONFIG_DOC_REF, {
    events: normalized,
    version: nextVersion,
    updatedAt: serverTimestamp(),
  });
}

window.changeCheckboxCount = function(idx, delta) {
  ensureAdminDraftEvents();
  if (!adminDraftEvents[idx]) return;
  adminDraftEvents[idx].checkboxCount = Math.max(0, (adminDraftEvents[idx].checkboxCount || 0) + delta);
  adminDirty = true;
  setAdminSaveStatus();
  updateAdminSaveBtnState();
  renderAdminEvents();
};

window.toggleEventMode = function(idx, mode) {
  ensureAdminDraftEvents();
  if (!adminDraftEvents[idx]) return;
  adminDraftEvents[idx][mode] = !adminDraftEvents[idx][mode];
  adminDirty = true;
  setAdminSaveStatus();
  updateAdminSaveBtnState();
  renderAdminEvents();
};

window.addEvent = function() {
  const input = document.getElementById('newEventInput');
  const text  = input.value.trim();
  if (!text) return;

  ensureAdminDraftEvents();
  adminDraftEvents.push({ text, forRace: true, forSeason: true, checkboxCount: 0 });
  input.value = '';
  adminDirty = true;
  setAdminSaveStatus();
  updateAdminSaveBtnState();
  renderAdminEvents();
};

window.deleteEvent = function(idx) {
  ensureAdminDraftEvents();
  if (adminDraftEvents.length <= 9) { alert('Необходимо минимум 9 событий.'); return; }
  adminDraftEvents.splice(idx, 1);
  adminDirty = true;
  setAdminSaveStatus();
  updateAdminSaveBtnState();
  renderAdminEvents();
};

// ── Race stats ────────────────────────────────────────────────────────────
window.toggleStats = function() {
  const overlay = document.getElementById('statsOverlay');
  const hidden  = overlay.classList.toggle('hidden');
  if (!hidden) renderStats();
};

function renderStats() {
  const eventsInBase = getEventsPool().length;
  const rows = [
    { label: 'Игрок',             value: state.playerName },
    { label: 'Игр сыграно',       value: state.totalGames },
    { label: 'Бинго получено',    value: state.totalBingos,  accent: true },
    { label: 'Супер бинго',       value: state.totalSuperBingos, accent: true },
    { label: 'Рекорд отмеченных', value: `${state.recordScore}/9`, accent: state.recordScore === 9 },
    { label: 'Событий в базе',    value: eventsInBase },
    { label: 'Текущая сессия',    value: `${state.sessionScore}/9` },
  ];
  document.getElementById('statsContent').innerHTML = rows.map(r => `
    <div class="stats-row">
      <span class="stats-row__label">${r.label}</span>
      <span class="stats-row__value${r.accent ? ' stats-row__value--accent' : ''}">${r.value}</span>
    </div>
  `).join('');
}

// ── Season stats ──────────────────────────────────────────────────────────
window.toggleSeasonStats = function() {
  const overlay = document.getElementById('seasonStatsOverlay');
  const hidden  = overlay.classList.toggle('hidden');
  if (!hidden) renderSeasonStats();
};

function renderSeasonStats() {
  const rows = [
    { label: 'Игрок',             value: state.playerName },
    { label: 'Бинго получено',    value: seasonState.totalBingos, accent: true },
    { label: 'Рекорд отмеченных', value: `${seasonState.recordScore}/50`, accent: seasonState.recordScore === 50 },
    { label: 'Текущая сессия',    value: `${seasonState.sessionScore}/50` },
  ];
  document.getElementById('seasonStatsContent').innerHTML = rows.map(r => `
    <div class="stats-row">
      <span class="stats-row__label">${r.label}</span>
      <span class="stats-row__value${r.accent ? ' stats-row__value--accent' : ''}">${r.value}</span>
    </div>
  `).join('');
}

// ── Close modals on backdrop click ────────────────────────────────────────
['adminOverlay', 'statsOverlay', 'seasonStatsOverlay'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target.id === id) document.getElementById(id).classList.add('hidden');
  });
});

document.getElementById('loginPage').addEventListener('click', e => {
  if (e.target.id === 'loginPage') closeAuthModal();
});

// ── Race info data ─────────────────────────────────────────────────────────
const RACE_INFO = {
  melbourne: {
    name: 'Гран-При Австралии',
    circuit: 'Альберт-Парк · Мельбурн',
    laps: 58, length: '5.278 км',
    flag: 'au', round: 1, dates: 'MAR 06–08', sprint: false,
    map: 'https://commons.wikimedia.org/wiki/Special:FilePath/Albert_Park_Circuit_2021.svg',
    facts: [
      'Традиционно открывает сезон — давление максимальное',
      'Городская трасса в парке: быстрые прямые + технические шиканы',
      'Safety Car здесь выезжает чаще, чем на большинстве трасс',
      'Непредсказуемые результаты — фавориты нередко вылетают здесь',
    ],
  },
  shanghai: {
    name: 'Гран-При Китая',
    circuit: 'Шанхайский автодром',
    laps: 56, length: '5.451 км',
    flag: 'cn', round: 2, dates: 'MAR 13–15', sprint: true,
    map: 'https://commons.wikimedia.org/wiki/Special:FilePath/Shanghai_International_Circuit_Formula_One_track_map.svg',
    facts: [
      'Длинная шпилька в конце — самое опасное место для столкновений',
      'Поверхность асфальта быстро деградирует — стратегия критична',
      'Этап со спринтом в 2026: два заезда за выходные',
      'Один из самых широких питлейнов в календаре',
    ],
  },
  suzuka: {
    name: 'Гран-При Японии',
    circuit: 'Сузука · 8-образная трасса',
    laps: 53, length: '5.807 км',
    flag: 'jp', round: 3, dates: 'MAR 27–29', sprint: false,
    map: 'https://commons.wikimedia.org/wiki/Special:FilePath/Suzuka_circuit_map.svg',
    facts: [
      'Единственная 8-образная трасса в F1 с уникальным переездом',
      'S-образные повороты в начале — настоящий экзамен для пилотов',
      'Фанаты здесь самые преданные — сотни тысяч болельщиков',
      'Часто именно здесь решается судьба чемпионата',
    ],
  },
  sakhir: {
    name: 'Гран-При Бахрейна',
    circuit: 'Бахрейнский международный автодром',
    laps: 57, length: '5.412 км',
    flag: 'bh', round: 4, dates: 'APR 10–12', sprint: false,
    map: 'https://commons.wikimedia.org/wiki/Special:FilePath/Bahrain_International_Circuit--Grand_Prix_layout.svg',
    facts: [
      'Ночная гонка — уникальное освещение трассы прожекторами',
      'Песчаные бури могут резко менять сцепление с трассой',
      'Три DRS-зоны — обгоны здесь частые',
      'Жёсткий износ шин из-за абразивного асфальта и жары',
    ],
  },
  jeddah: {
    name: 'Гран-При Саудовской Аравии',
    circuit: 'Корниш · Джедда',
    laps: 50, length: '6.174 км',
    flag: 'sa', round: 5, dates: 'APR 17–19', sprint: false,
    map: 'https://commons.wikimedia.org/wiki/Special:FilePath/Jeddah_Corniche_Circuit.svg',
    facts: [
      'Вторая по скорости трасса в F1 — средняя скорость ~250 км/ч',
      'Полуулица: стены барьеров прямо вдоль трассы — ошибок нет',
      'Ночная гонка в дрожащем жаре с риском сейфти-кара',
      'Огромное количество слепых поворотов — пилоты едут на памяти',
    ],
  },
  miami: {
    name: 'Гран-При Майами',
    circuit: 'Майами Интернэшнл Автодром · Hard Rock Stadium',
    laps: 57, length: '5.412 км',
    flag: 'us', round: 6, dates: 'MAY 01–03', sprint: true,
    map: 'https://commons.wikimedia.org/wiki/Special:FilePath/Miami_International_Autodrome.svg',
    facts: [
      'Трасса проложена вокруг стадиона НФЛ Майами Долфинс',
      'Искусственная «гавань» и «пирс» — декоративные, но эффектные',
      'Шумный и зрелищный этап с особой атмосферой американского шоу',
      'Быстрый третий сектор с длинной прямой DRS перед финишем',
    ],
  },
  montreal: {
    name: 'Гран-При Канады',
    circuit: 'Трасса Жиля Вильнёва · остров Нотр-Дам',
    laps: 70, length: '4.361 км',
    flag: 'ca', round: 7, dates: 'MAY 22–24', sprint: true,
    map: 'https://commons.wikimedia.org/wiki/Special:FilePath/Circuit_Gilles_Villeneuve.svg',
    facts: [
      '"Стена чемпионов" — барьер в конце пит-лейн собрал не одного победителя',
      'Короткая трасса с жёстким торможением — любимая для обгонов',
      'Погода нестабильна: дождь и смена условий очень вероятны',
      'Самое большое количество кругов в сезоне',
    ],
  },
  monaco: {
    name: 'Гран-При Монако',
    circuit: 'Городские улицы Монте-Карло',
    laps: 78, length: '3.337 км',
    flag: 'mc', round: 8, dates: 'JUN 05–07', sprint: false,
    map: 'https://commons.wikimedia.org/wiki/Special:FilePath/Monte_Carlo_Formula_1_track_map.svg',
    facts: [
      'Самая медленная и самая легендарная трасса в истории F1',
      'Обгон практически невозможен — квалификация решает всё',
      'Туннель, «Casino» и шикана «La Rascasse» — культовые точки',
      'Ошибка даже в 5 см может закончить гонку о барьер',
    ],
  },
  barcelona: {
    name: 'Гран-При Испании',
    circuit: 'Каталунья · Монтмело',
    laps: 66, length: '4.657 км',
    flag: 'es', round: 9, dates: 'JUN 12–14', sprint: false,
    map: 'https://commons.wikimedia.org/wiki/Special:FilePath/Circuit_de_Barcelona_Catalunya.svg',
    facts: [
      'Главный тестовый полигон F1: все команды знают трассу идеально',
      'Поворот 3 — один из самых высокоскоростных в сезоне',
      'Здесь обычно становится ясно, чья машина быстрее в гонке',
      'Сильный ветер может неожиданно изменить балансировку машины',
    ],
  },
  spielberg: {
    name: 'Гран-При Австрии',
    circuit: 'Ред Булл Ринг · Шпильберг',
    laps: 71, length: '4.318 км',
    flag: 'at', round: 10, dates: 'JUN 26–28', sprint: false,
    map: 'https://commons.wikimedia.org/wiki/Special:FilePath/Red_Bull_Ring.svg',
    facts: [
      'Одна из самых коротких трасс — зато насыщенная активностью',
      'Высокогорный воздух снижает прижимную силу — машины нервозны',
      'Трасса проходит через виноградники — вид потрясающий',
      'Виражи 3 и 4 — место постоянных столкновений из-за агрессивной езды',
    ],
  },
  silverstone: {
    name: 'Гран-При Великобритании',
    circuit: 'Сильверстоун · Великобритания',
    laps: 52, length: '5.891 км',
    flag: 'gb', round: 11, dates: 'JUL 03–05', sprint: true,
    map: 'https://commons.wikimedia.org/wiki/Special:FilePath/Silverstone_Circuit_2011.svg',
    facts: [
      'Первая гонка Формулы 1 прошла именно здесь — в 1950 году',
      'Maggots, Becketts, Chapel — лучшая серия быстрых поворотов в F1',
      'Английская погода: жара сменяется ливнем за считанные минуты',
      'Трибуны ломятся — дома у Red Bull и Mercedes огромная поддержка',
    ],
  },
  spa: {
    name: 'Гран-При Бельгии',
    circuit: 'Спа-Франкоршан · Арденнские горы',
    laps: 44, length: '7.004 км',
    flag: 'be', round: 12, dates: 'JUL 17–19', sprint: false,
    map: 'https://commons.wikimedia.org/wiki/Special:FilePath/Spa-Francorchamps_of_Belgium.svg',
    facts: [
      'Самая длинная трасса в современном F1-календаре',
      'Eau Rouge / Raidillon — культовая связка подъёмов на полном газу',
      'Микроклимат трассы: на Eau Rouge может быть дождь, а на прямой — сухо',
      'Трамплинная прямая Кемель — рекорды скорости бьются именно здесь',
    ],
  },
  budapest: {
    name: 'Гран-При Венгрии',
    circuit: 'Хунгароринг · Будапешт',
    laps: 70, length: '4.381 км',
    flag: 'hu', round: 13, dates: 'JUL 24–26', sprint: false,
    map: 'https://commons.wikimedia.org/wiki/Special:FilePath/Hungaroring.svg',
    facts: [
      'Называют "Монако без стен" — тесная, технически сложная трасса',
      'Обгонять крайне тяжело — квалификация снова решает многое',
      'Один из самых жарких этапов: температура трассы до +60°C',
      'Здесь Льюис Хэмилтон выиграл больше всего раз в карьере',
    ],
  },
  zandvoort: {
    name: 'Гран-При Нидерландов',
    circuit: 'Зандворт · Нидерланды',
    laps: 72, length: '4.259 км',
    flag: 'nl', round: 14, dates: 'AUG 21–23', sprint: true,
    map: 'https://commons.wikimedia.org/wiki/Special:FilePath/Zandvoort_track_map.svg',
    facts: [
      'Трасса у моря с банкированными поворотами — уникальная геометрия',
      'Банкированный вираж Hugenholtz — 19° наклон, как NASCAR',
      'Фанаты Ферстаппена превращают этап в оранжевое безумие',
      'Обгоны крайне редки — пит-стоп под Safety Car может решить всё',
    ],
  },
  monza: {
    name: 'Гран-При Италии',
    circuit: 'Монца · "Храм скорости"',
    laps: 53, length: '5.793 км',
    flag: 'it', round: 15, dates: 'SEP 04–06', sprint: false,
    map: 'https://commons.wikimedia.org/wiki/Special:FilePath/Monza_circuit_map.svg',
    facts: [
      'Самая быстрая трасса в F1 — средняя скорость выше 260 км/ч',
      'Минимальный прижим крыльев: машины выглядят почти без антикрыла',
      'Легаси: фанаты-тифози скандируют имена своих героев весь уикенд',
      'Знаменитый параболик — последний поворот с резким торможением',
    ],
  },
  madrid: {
    name: 'Гран-При Испании (Мадрид)',
    circuit: 'IFEMA Мадрид · новая городская трасса',
    laps: 55, length: '5.47 км',
    flag: 'es', round: 16, dates: 'SEP 11–13', sprint: false,
    map: null,
    facts: [
      'Новый этап в 2026 году — первая гонка в Мадриде за 40+ лет',
      'Полугородская, полустационарная трасса вокруг выставочного центра',
      'Ожидается высокая скорость и возможности для обгонов',
      '* При условии финальной гомологации FIA',
    ],
  },
  baku: {
    name: 'Гран-При Азербайджана',
    circuit: 'Баку · городская трасса',
    laps: 51, length: '6.003 км',
    flag: 'az', round: 17, dates: 'SEP 25–27', sprint: false,
    map: 'https://commons.wikimedia.org/wiki/Special:FilePath/Baku_City_Circuit.svg',
    facts: [
      'Самая длинная прямая в F1 — 2.2 км под стенами Старого города',
      'Старый город — замок и крепостные стены буквально у трассы',
      'Узкий замковый сектор: 7.6 метра ширины — уже Монако в этих местах',
      'Проколы шин и Safety Car здесь случаются внезапно и часто',
    ],
  },
  singapore: {
    name: 'Гран-При Сингапура',
    circuit: 'Марина Бэй · городская трасса',
    laps: 62, length: '4.940 км',
    flag: 'sg', round: 18, dates: 'OCT 09–11', sprint: true,
    map: 'https://commons.wikimedia.org/wiki/Special:FilePath/Singapore_Street_Circuit_2023.svg',
    facts: [
      'Единственная ночная гонка в тропиках — влажность и жара выматывают',
      'Самый тяжёлый физически этап: пилоты теряют до 4 кг за гонку',
      'Городская трасса с 23 поворотами — обгонять почти негде',
      'Safety Car появляется здесь стабильно каждый год',
    ],
  },
  austin: {
    name: 'Гран-При США',
    circuit: 'Трасса Америк · COTA · Остин',
    laps: 56, length: '5.513 км',
    flag: 'us', round: 19, dates: 'OCT 23–25', sprint: false,
    map: 'https://commons.wikimedia.org/wiki/Special:FilePath/Circuit_of_the_Americas.svg',
    facts: [
      'Специально спроектирована как смесь лучших поворотов F1',
      'Первый поворот — слепой подъём в гору, самый быстрый старт в F1',
      'В 2023 году прошёл первый спринт на COTA — трасса для этого идеальна',
      'Гонка часто проходит в переменную погоду с жарой и ливнями',
    ],
  },
  mexico: {
    name: 'Гран-При Мексики',
    circuit: 'Аутодромо Эрманос Родригес · Мехико',
    laps: 71, length: '4.304 км',
    flag: 'mx', round: 20, dates: 'OCT/NOV 30–01', sprint: false,
    map: 'https://commons.wikimedia.org/wiki/Special:FilePath/Autodromo_Hermanos_Rodriguez.svg',
    facts: [
      'Высота 2285 м — разрежённый воздух снижает мощность двигателей',
      'Машины теряют до 20% прижимной силы из-за высоты',
      'Стадионный сектор — огромная трибуна прямо у трассы',
      'Самая шумная и атмосферная публика в F1-мире',
    ],
  },
  saopaulo: {
    name: 'Гран-При Бразилии',
    circuit: 'Аутодромо Жозе Карлос Паче · Интерлагос',
    laps: 71, length: '4.309 км',
    flag: 'br', round: 21, dates: 'NOV 06–08', sprint: false,
    map: 'https://commons.wikimedia.org/wiki/Special:FilePath/Interlagos_circuit_map.svg',
    facts: [
      'Трасса едется против обычного направления — по часовой стрелке',
      'Интерлагос — один из немногих автодромов с историей до Формулы 1',
      'Дождь — практически гарантия: Сан-Паулу непредсказуем по погоде',
      'Самые эмоциональные гонки в истории F1 случались именно здесь',
    ],
  },
  lasvegas: {
    name: 'Гран-При Лас-Вегаса',
    circuit: 'Стрип · Лас-Вегас · ночная трасса',
    laps: 50, length: '6.201 км',
    flag: 'us', round: 22, dates: 'NOV 19–21', sprint: false,
    map: 'https://commons.wikimedia.org/wiki/Special:FilePath/Las_Vegas_Street_Circuit.svg',
    facts: [
      'Гонка проходит в 1 час ночи по местному времени — шоу без компромиссов',
      'Самый длинный прямой участок 2026: 1.2 км вдоль знаменитого Strip',
      'Машины несутся мимо казино Bellagio, MGM Grand и отеля Wynn',
      'Холодные ночи снижают сцепление шин — высокий риск слайдов',
    ],
  },
  lusail: {
    name: 'Гран-При Катара',
    circuit: 'Лусаил · Катар',
    laps: 57, length: '5.380 км',
    flag: 'qa', round: 23, dates: 'NOV 27–29', sprint: true,
    map: 'https://commons.wikimedia.org/wiki/Special:FilePath/Lusail_International_Circuit.svg',
    facts: [
      'Ночная гонка под тысячами прожекторов в пустыне',
      'Этап со спринтом в 2026 — суперактивные выходные',
      'Сумасшедший износ шин: Pirelli вынуждена делать специальный выбор',
      'Длинные правые повороты — левые плечи пилотов испытывают перегрузку',
    ],
  },
  yasisland: {
    name: 'Гран-При Абу-Даби',
    circuit: 'Яс Марина · Яс-Айленд',
    laps: 58, length: '5.281 км',
    flag: 'ae', round: 24, dates: 'DEC 04–06', sprint: false,
    map: 'https://commons.wikimedia.org/wiki/Special:FilePath/Yas_Marina_Circuit.svg',
    facts: [
      'Традиционно закрывает сезон — здесь вручают трофеи чемпиона',
      'Ночная гонка под огнями гоночного отеля Яс Отель',
      'После редизайна 2021 трасса стала значительно быстрее',
      'Здесь уже были решены несколько финальных чемпионских интриг',
    ],
  },
};

const MONTH_TO_INDEX = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};
const CANCELLED_RACES = new Set(['sakhir', 'jeddah']);

function parseRaceEndDate(dates, seasonYear = 2026) {
  if (!dates || typeof dates !== 'string') return null;

  const [monthPart, dayPart] = dates.trim().split(/\s+/);
  if (!monthPart || !dayPart) return null;

  const months = monthPart.split('/');
  const startMonth = MONTH_TO_INDEX[months[0]];
  const endMonthToken = months[months.length - 1];
  const endMonth = MONTH_TO_INDEX[endMonthToken];
  if (startMonth == null || endMonth == null) return null;

  const dayRange = dayPart.split('–');
  const endDay = Number(dayRange[dayRange.length - 1]);
  if (!Number.isFinite(endDay)) return null;

  const endYear = endMonth < startMonth ? seasonYear + 1 : seasonYear;
  return new Date(endYear, endMonth, endDay, 23, 59, 59, 999);
}

function updateScheduleRowStatesByDate() {
  const rows = Array.from(document.querySelectorAll('.schedule__row[data-race]'));
  if (!rows.length) return;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const raceStates = rows.map(row => {
    const raceKey = row.dataset.race;
    const race = RACE_INFO[raceKey];
    const endDate = parseRaceEndDate(race?.dates);
    const isCancelled = CANCELLED_RACES.has(raceKey);
    return {
      row,
      endDate,
      isPast: endDate ? endDate < todayStart : false,
      isCancelled,
    };
  });

  raceStates.forEach(({ row, isPast, isCancelled }) => {
    row.classList.remove('schedule__row--past', 'schedule__row--next', 'schedule__row--cancelled');
    if (isPast) row.classList.add('schedule__row--past');
    if (isCancelled) row.classList.add('schedule__row--cancelled');
  });

  const nextRace = raceStates.find(item => !item.isPast && !item.isCancelled);
  if (nextRace) nextRace.row.classList.add('schedule__row--next');
}

// ── Circuit metadata (maps + historical data) ──────────────────────────────
const F1_MAP_CDN = 'https://media.formula1.com/image/upload/f_auto/q_auto/v0/content/dam/fom-website/2018-redesign-assets/Circuit%20maps%2016x9/';

const CIRCUIT_META = {
  melbourne:   { map: 'Australia',    firstGP: 1996, lapRecord: '1:19.813 · Леклер (2024)'       },
  shanghai:    { map: 'China',        firstGP: 2004, lapRecord: '1:32.238 · Шумахер (2004)'      },
  suzuka:      { map: 'Japan',        firstGP: 1987, lapRecord: '1:30.983 · Хэмилтон (2019)'     },
  sakhir:      { map: 'Bahrain',      firstGP: 2004, lapRecord: '1:31.447 · Де ла Роса (2005)'   },
  jeddah:      { map: 'Saudi_Arabia', firstGP: 2021, lapRecord: '1:30.734 · Хэмилтон (2021)'     },
  miami:       { map: 'Miami',        firstGP: 2022, lapRecord: '1:27.841 · Ферстаппен (2023)'   },
  montreal:    { map: 'Canada',       firstGP: 1978, lapRecord: '1:13.078 · Боттас (2019)'       },
  monaco:      { map: 'Monaco',       firstGP: 1950, lapRecord: '1:12.909 · Баррикелло (2004)'   },
  barcelona:   { map: 'Spain',        firstGP: 1991, lapRecord: '1:18.149 · Ферстаппен (2021)'   },
  spielberg:   { map: 'Austria',      firstGP: 1970, lapRecord: '1:05.619 · Сайнс (2020)'        },
  silverstone: { map: 'Great_Britain',firstGP: 1950, lapRecord: '1:27.097 · Ферстаппен (2020)'   },
  spa:         { map: 'Belgium',      firstGP: 1950, lapRecord: '1:41.252 · Боттас (2018)'        },
  budapest:    { map: 'Hungary',      firstGP: 1986, lapRecord: '1:16.627 · Хэмилтон (2020)'     },
  zandvoort:   { map: 'Netherlands',  firstGP: 1952, lapRecord: '1:11.097 · Ферстаппен (2021)'   },
  monza:       { map: 'Italy',        firstGP: 1950, lapRecord: '1:21.046 · Баррикелло (2004)'   },
  madrid:      { map: null,           firstGP: 2026, lapRecord: '— (первая гонка)'                },
  baku:        { map: 'Baku',         firstGP: 2016, lapRecord: '1:43.009 · Леклер (2019)'        },
  singapore:   { map: 'Singapore',    firstGP: 2008, lapRecord: '1:35.867 · Магнуссен (2018)'    },
  austin:      { map: 'USA',          firstGP: 2012, lapRecord: '1:36.169 · Леклер (2019)'        },
  mexico:      { map: 'Mexico',       firstGP: 2015, lapRecord: '1:17.774 · Боттас (2021)'        },
  saopaulo:    { map: 'Brazil',       firstGP: 1973, lapRecord: '1:10.540 · Баррикелло (2004)'   },
  lasvegas:    { map: 'Las_Vegas',    firstGP: 2023, lapRecord: '1:35.490 · Ферстаппен (2023)'   },
  lusail:      { map: 'Qatar',        firstGP: 2021, lapRecord: '1:24.319 · Ферстаппен (2023)'   },
  yasisland:   { map: 'Abu_Dhabi',    firstGP: 2009, lapRecord: '1:26.103 · Ферстаппен (2021)'   },
};

// ── Race detail page ───────────────────────────────────────────────────────
(function initRacePage() {
  function openRacePage(key) {
    const info = RACE_INFO[key];
    const meta = CIRCUIT_META[key];
    if (!info || !meta) return;

    const mapWrap = document.getElementById('racePageMapWrap');
    const mapImg  = document.getElementById('racePageMap');
    if (meta.map) {
      mapImg.src = `${F1_MAP_CDN}${meta.map}_Circuit.webp`;
      mapImg.alt = info.name;
      mapWrap.classList.remove('hidden');
    } else {
      mapWrap.classList.add('hidden');
    }

    document.getElementById('racePageMapBadge').textContent =
      info.sprint ? 'SPRINT WEEKEND' : '';

    document.getElementById('racePageFlag').src = `https://flagcdn.com/w80/${info.flag}.png`;
    document.getElementById('racePageFlag').alt = info.name;
    document.getElementById('racePageRound').textContent =
      `РАУНД ${info.round} · 2026`;
    document.getElementById('racePageName').textContent      = info.name;
    document.getElementById('racePageCircuit').textContent   = info.circuit;
    document.getElementById('racePageDates').textContent     = info.dates;
    document.getElementById('racePageLaps').textContent      = info.laps;
    document.getElementById('racePageLength').textContent    = info.length;
    document.getElementById('racePageFirstGP').textContent   = meta.firstGP;
    document.getElementById('racePageLapRecord').textContent = meta.lapRecord;

    const distKm = (info.laps * parseFloat(info.length)).toFixed(1);
    document.getElementById('racePageDistance').textContent = `${distKm} км`;

    document.getElementById('racePageFacts').innerHTML =
      info.facts.map(f => `<li class="race-page__fact">${f}</li>`).join('');

    document.getElementById('modePage').classList.add('hidden');
    document.getElementById('racePage').classList.remove('hidden');
    document.getElementById('racePage').scrollTop = 0;

    window.loadRaceResults?.(info.round, info.sprint);
  }

  function closeRacePage() {
    document.getElementById('racePage').classList.add('hidden');
    document.getElementById('modePage').classList.remove('hidden');
    window.resetRaceResults?.();
    document.getElementById('raceFactsToggle').setAttribute('aria-expanded', 'false');
    document.getElementById('racePageFacts').classList.remove('race-page__facts--open');
  }

  const factsToggle = document.getElementById('raceFactsToggle');
  const factsList   = document.getElementById('racePageFacts');

  factsToggle.addEventListener('click', () => {
    const expanded = factsToggle.getAttribute('aria-expanded') === 'true';
    factsToggle.setAttribute('aria-expanded', String(!expanded));
    factsList.classList.toggle('race-page__facts--open', !expanded);
  });

  window.openRacePage  = openRacePage;
  window.closeRacePage = closeRacePage;
}());

// ── Race info tooltip (hover) ──────────────────────────────────────────────
(function initRaceTooltip() {
  const tooltip = document.getElementById('raceTooltip');
  const tooltipHint = tooltip?.querySelector('.race-tooltip__hint');
  let hideTimer = null;
  let activeRaceKey = null;
  const isTouchDevice = window.matchMedia('(hover: none), (pointer: coarse)').matches;

  updateScheduleRowStatesByDate();

  function showTooltip(key, row) {
    const info = RACE_INFO[key];
    if (!info) return;
    activeRaceKey = key;

    document.getElementById('raceTooltipFlag').src = `https://flagcdn.com/w40/${info.flag}.png`;
    document.getElementById('raceTooltipFlag').alt = info.name;
    document.getElementById('raceTooltipRound').textContent =
      `РАУНД ${info.round} · ${info.dates}`;
    document.getElementById('raceTooltipName').textContent = info.name;
    document.getElementById('raceTooltipMeta').textContent =
      `${info.circuit} · ${info.laps} кр · ${info.length}`;
    document.getElementById('raceTooltipFacts').innerHTML =
      info.facts.slice(0, 2).map(f => `<li class="race-popup__fact">${f}</li>`).join('');

    positionTooltip(row);
    tooltip.classList.remove('hidden');
  }

  function positionTooltip(row) {
    const rect      = row.getBoundingClientRect();
    const tipW      = 280;
    const tipH      = 200;
    const margin    = 10;

    let top  = rect.top + rect.height / 2 - tipH / 2;
    top = Math.max(8, Math.min(top, window.innerHeight - tipH - 8));

    const midX = window.innerWidth / 2;
    let left;
    if (rect.left < midX) {
      left = rect.right + margin;
    } else {
      left = rect.left - tipW - margin;
    }
    left = Math.max(8, Math.min(left, window.innerWidth - tipW - 8));

    tooltip.style.top  = top  + 'px';
    tooltip.style.left = left + 'px';
  }

  function hideTooltip() {
    tooltip.classList.add('hidden');
    activeRaceKey = null;
  }

  function openActiveRaceFromTooltip() {
    if (!activeRaceKey) return;
    const raceKey = activeRaceKey;
    hideTooltip();
    window.openRacePage(raceKey);
  }

  document.querySelectorAll('.schedule__row[data-race]').forEach(row => {
    row.style.cursor = 'pointer';

    if (!isTouchDevice) {
      row.addEventListener('mouseenter', () => {
        clearTimeout(hideTimer);
        showTooltip(row.dataset.race, row);
      });
      row.addEventListener('mouseleave', () => {
        hideTimer = setTimeout(hideTooltip, 120);
      });
      row.addEventListener('click', () => {
        hideTooltip();
        window.openRacePage(row.dataset.race);
      });
      return;
    }

    row.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      clearTimeout(hideTimer);
      const raceKey = row.dataset.race;
      activeRaceKey = raceKey;
      showTooltip(raceKey, row);
    });
  });

  if (!isTouchDevice) {
    tooltip.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    tooltip.addEventListener('mouseleave', () => {
      hideTimer = setTimeout(hideTooltip, 120);
    });
  } else {
    tooltip.style.cursor = 'pointer';
    tooltip.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      openActiveRaceFromTooltip();
    });
    document.addEventListener('click', () => hideTooltip());
  }

  if (tooltipHint) {
    tooltipHint.style.cursor = 'pointer';
    tooltipHint.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      openActiveRaceFromTooltip();
    });
  }
}());

// ── Race Results ───────────────────────────────────────────────────────────
(function initRaceResults() {
  const JOLPICA_BASE = 'https://api.jolpi.ca/ergast/f1';
  const VISIBLE_ROWS = 10;

  const TEAM_COLORS = {
    mercedes:       '#00D2BE',
    ferrari:        '#E8002D',
    red_bull:       '#3671C6',
    mclaren:        '#FF8000',
    alpine:         '#FF87BC',
    aston_martin:   '#229971',
    haas:           '#B6BABD',
    williams:       '#64C4FF',
    rb:             '#6692FF',
    sauber:         '#52E252',
    cadillac:       '#C8E02B',
    kick_sauber:    '#52E252',
    racing_bulls:   '#6692FF',
  };

  const SESSION_LABELS = {
    race:       'ГОНКА',
    qualifying: 'КВАЛИФИКАЦИЯ',
    sprint:     'СПРИНТ',
  };

  const cache = new Map();
  let currentRound   = null;
  let currentSession = 'race';

  function getTeamColor(constructorId) {
    const id = (constructorId || '').toLowerCase().replace(/[^a-z_]/g, '_');
    return TEAM_COLORS[id] || TEAM_COLORS[id.replace(/_/g, '')] || '#888';
  }

  function showLoading(on) {
    document.getElementById('raceResultsLoading').classList.toggle('hidden', !on);
    document.getElementById('raceResultsTable').classList.toggle('hidden', on);
  }

  function renderEmpty(message) {
    showLoading(false);
    const table = document.getElementById('raceResultsTable');
    table.innerHTML = `<tbody><tr><td colspan="4" class="race-results__empty">${message}</td></tr></tbody>`;
    document.getElementById('raceResultsShowAll').classList.add('hidden');
  }

  function renderRaceResults(results) {
    const thead = `<thead><tr>
      <th class="race-results__th race-results__th--pos">ПОЗ</th>
      <th class="race-results__th">ГОНЩИК</th>
      <th class="race-results__th">ВРЕМЯ / ОТРЫВ</th>
      <th class="race-results__th race-results__th--pts">ОЧКИ</th>
    </tr></thead>`;

    const rows = results.map((r, i) => {
      const color   = getTeamColor(r.Constructor?.constructorId);
      const name    = `${r.Driver.givenName} ${r.Driver.familyName}`;
      const code    = r.Driver.code || r.Driver.familyName.slice(0, 3).toUpperCase();
      const time    = r.Time?.time || r.status || '—';
      const points  = r.points ?? '—';
      const hidden  = i >= VISIBLE_ROWS ? ' class="race-results__row--hidden"' : '';
      return `<tr${hidden}>
        <td class="race-results__td race-results__td--pos">${r.position}</td>
        <td class="race-results__td race-results__td--driver">
          <span class="race-results__team-bar" style="background:${color}"></span>
          <span class="race-results__driver-name">${name}</span>
          <span class="race-results__driver-code">${code}</span>
        </td>
        <td class="race-results__td race-results__td--time">${time}</td>
        <td class="race-results__td race-results__td--pts">${points}</td>
      </tr>`;
    }).join('');

    return thead + `<tbody>${rows}</tbody>`;
  }

  function renderQualiResults(results) {
    const thead = `<thead><tr>
      <th class="race-results__th race-results__th--pos">ПОЗ</th>
      <th class="race-results__th">ГОНЩИК</th>
      <th class="race-results__th">Q1</th>
      <th class="race-results__th">Q2</th>
      <th class="race-results__th">Q3</th>
    </tr></thead>`;

    const rows = results.map((r, i) => {
      const color  = getTeamColor(r.Constructor?.constructorId);
      const name   = `${r.Driver.givenName} ${r.Driver.familyName}`;
      const code   = r.Driver.code || r.Driver.familyName.slice(0, 3).toUpperCase();
      const hidden = i >= VISIBLE_ROWS ? ' class="race-results__row--hidden"' : '';
      return `<tr${hidden}>
        <td class="race-results__td race-results__td--pos">${r.position}</td>
        <td class="race-results__td race-results__td--driver">
          <span class="race-results__team-bar" style="background:${color}"></span>
          <span class="race-results__driver-name">${name}</span>
          <span class="race-results__driver-code">${code}</span>
        </td>
        <td class="race-results__td race-results__td--time">${r.Q1 || '—'}</td>
        <td class="race-results__td race-results__td--time">${r.Q2 || '—'}</td>
        <td class="race-results__td race-results__td--time">${r.Q3 || '—'}</td>
      </tr>`;
    }).join('');

    return thead + `<tbody>${rows}</tbody>`;
  }

  function applyResultsToDOM(results, session) {
    showLoading(false);
    const table   = document.getElementById('raceResultsTable');
    const showAll = document.getElementById('raceResultsShowAll');

    if (!results || results.length === 0) {
      renderEmpty('Результаты появятся после гонки');
      return;
    }

    table.innerHTML = session === 'qualifying'
      ? renderQualiResults(results)
      : renderRaceResults(results);

    const hiddenRows = table.querySelectorAll('.race-results__row--hidden');
    if (hiddenRows.length > 0) {
      showAll.classList.remove('hidden');
      showAll.onclick = () => {
        hiddenRows.forEach(row => row.classList.remove('race-results__row--hidden'));
        showAll.classList.add('hidden');
      };
    } else {
      showAll.classList.add('hidden');
    }
  }

  async function fetchAndRender(round, session) {
    const cacheKey = `${round}:${session}`;
    if (cache.has(cacheKey)) {
      applyResultsToDOM(cache.get(cacheKey), session);
      return;
    }

    showLoading(true);

    const endpoint = session === 'qualifying'
      ? `${JOLPICA_BASE}/2026/${round}/qualifying.json`
      : session === 'sprint'
        ? `${JOLPICA_BASE}/2026/${round}/sprint.json`
        : `${JOLPICA_BASE}/2026/${round}/results.json`;

    try {
      const res  = await fetch(endpoint);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const race = json?.MRData?.RaceTable?.Races?.[0];
      let results = null;

      if (race) {
        results = session === 'qualifying'
          ? race.QualifyingResults
          : session === 'sprint'
            ? race.SprintResults
            : race.Results;
      }

      cache.set(cacheKey, results || []);
      applyResultsToDOM(results || [], session);
    } catch {
      showLoading(false);
      renderEmpty('Не удалось загрузить результаты');
    }
  }

  function buildTabs(isSprint) {
    const tabsEl = document.getElementById('raceResultsTabs');
    const sessions = ['race', 'qualifying'];
    if (isSprint) sessions.push('sprint');

    tabsEl.innerHTML = sessions.map(s => `
      <button class="race-results__tab${s === currentSession ? ' race-results__tab--active' : ''}"
              data-session="${s}">${SESSION_LABELS[s]}</button>
    `).join('');

    tabsEl.querySelectorAll('.race-results__tab').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.session === currentSession) return;
        currentSession = btn.dataset.session;
        tabsEl.querySelectorAll('.race-results__tab').forEach(b =>
          b.classList.toggle('race-results__tab--active', b === btn)
        );
        fetchAndRender(currentRound, currentSession);
      });
    });
  }

  function loadRaceResults(round, isSprint) {
    currentRound   = round;
    currentSession = 'race';

    document.getElementById('racePageResults').classList.remove('hidden');
    document.getElementById('raceResultsShowAll').classList.add('hidden');

    buildTabs(isSprint);
    fetchAndRender(round, currentSession);
  }

  function resetRaceResults() {
    document.getElementById('racePageResults').classList.add('hidden');
    document.getElementById('raceResultsTable').innerHTML = '';
    document.getElementById('raceResultsShowAll').classList.add('hidden');
    currentRound   = null;
    currentSession = 'race';
  }

  window.loadRaceResults  = loadRaceResults;
  window.resetRaceResults = resetRaceResults;
}());
