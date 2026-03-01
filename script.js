/* ===========================
   POMODORO TIMER — script.js
   =========================== */

// ─── Constants ────────────────────────────────────────────────────────────────
const RING_CIRCUMFERENCE = 2 * Math.PI * 108; // r=108

// ─── Default settings ─────────────────────────────────────────────────────────
const DEFAULTS = {
    durations: { pomodoro: 25, short: 5, long: 15 },
    autoBreak: false,
    autoPomodoro: false,
    soundEnabled: true,
    notificationsEnabled: false,
};

// ─── Utility / Helper Functions (defined first so they can be called anywhere) ─
function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getTodayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function loadSettings() {
    try {
        const raw = localStorage.getItem('pm_settings');
        if (!raw) return { ...DEFAULTS, durations: { ...DEFAULTS.durations } };
        const parsed = JSON.parse(raw);
        return {
            durations: { ...DEFAULTS.durations, ...parsed.durations },
            autoBreak: parsed.autoBreak ?? DEFAULTS.autoBreak,
            autoPomodoro: parsed.autoPomodoro ?? DEFAULTS.autoPomodoro,
            soundEnabled: parsed.soundEnabled ?? DEFAULTS.soundEnabled,
            notificationsEnabled: parsed.notificationsEnabled ?? DEFAULTS.notificationsEnabled,
        };
    } catch { return { ...DEFAULTS, durations: { ...DEFAULTS.durations } }; }
}

function saveSettings(s) {
    localStorage.setItem('pm_settings', JSON.stringify(s));
}

function saveStat(key, value) { localStorage.setItem(`pm_${key}`, JSON.stringify(value)); }
function loadStat(key, fallback) {
    try {
        const v = localStorage.getItem(`pm_${key}`);
        return v !== null ? JSON.parse(v) : fallback;
    } catch { return fallback; }
}

// ─── State ────────────────────────────────────────────────────────────────────
let settings = loadSettings();
let mode = 'pomodoro';                // 'pomodoro' | 'short' | 'long'
let timeLeft = settings.durations.pomodoro * 60;
let totalTime = timeLeft;
let sessionCount = 1;                 // 1-4 within the current cycle
let completedPomodoros = loadStat('completedPomodoros', 0);
let totalFocusSeconds = loadStat('totalFocusSeconds', 0);
let streakCount = loadStat('streakCount', 0);
let timerInterval = null;
let isRunning = false;
let lastSaveDate = loadStat('lastSaveDate', getTodayKey());

// Guard: reset daily stats if it's a new day
if (lastSaveDate !== getTodayKey()) {
    completedPomodoros = 0;
    totalFocusSeconds = 0;
    saveStat('completedPomodoros', 0);
    saveStat('totalFocusSeconds', 0);
    saveStat('lastSaveDate', getTodayKey());
}

// ─── DOM References ───────────────────────────────────────────────────────────
const timerDisplay = document.getElementById('timerDisplay');
const timerLabel = document.getElementById('timerLabel');
const ringFill = document.getElementById('ringFill');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const skipBtn = document.getElementById('skipBtn');
const playIcon = document.getElementById('playIcon');
const pauseIcon = document.getElementById('pauseIcon');
const sessionText = document.getElementById('sessionText');
const taskInput = document.getElementById('taskInput');
const themeToggle = document.getElementById('themeToggle');
const sunIcon = document.getElementById('sunIcon');
const moonIcon = document.getElementById('moonIcon');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettings = document.getElementById('closeSettings');
const saveSettingsBtn = document.getElementById('saveSettings');
const toast = document.getElementById('toast');
const mainCard = document.querySelector('.main-card');
const tabs = document.querySelectorAll('.tab');

// Settings inputs
const settingPomodoro = document.getElementById('settingPomodoro');
const settingShort = document.getElementById('settingShort');
const settingLong = document.getElementById('settingLong');
const autoBreakCb = document.getElementById('autoBreak');
const autoPomodoroCb = document.getElementById('autoPomodoro');
const soundEnabledCb = document.getElementById('soundEnabled');
const notifEnabledCb = document.getElementById('notificationsEnabled');

// Stats
const totalPomodorosEl = document.getElementById('totalPomodoros');
const totalFocusTimeEl = document.getElementById('totalFocusTime');
const currentStreakEl = document.getElementById('currentStreak');

// ─── Init ─────────────────────────────────────────────────────────────────────
initTheme();
renderTimer();
renderStats();
renderRing();
renderSessionDots();

// ─── Timer Core ───────────────────────────────────────────────────────────────
function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    isRunning = true;
    togglePlayPause(true);
    timerInterval = setInterval(tick, 1000);
}

function pauseTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    isRunning = false;
    togglePlayPause(false);
}

function tick() {
    if (timeLeft <= 0) {
        handleComplete();
        return;
    }
    timeLeft--;

    // Accumulate focus time only during pomodoro sessions
    if (mode === 'pomodoro') {
        totalFocusSeconds++;
        saveStat('totalFocusSeconds', totalFocusSeconds);
        renderStats();
    }
    renderTimer();
    renderRing();
}

function resetTimer() {
    pauseTimer();
    timeLeft = settings.durations[mode] * 60;
    totalTime = timeLeft;
    renderTimer();
    renderRing();
}

function skipToNext() {
    pauseTimer();
    advanceSession();
}

function handleComplete() {
    pauseTimer();
    playAlertSound();
    mainCard.classList.add('finished-anim');
    setTimeout(() => mainCard.classList.remove('finished-anim'), 3000);

    if (mode === 'pomodoro') {
        completedPomodoros++;
        streakCount++;
        saveStat('completedPomodoros', completedPomodoros);
        saveStat('streakCount', streakCount);
        saveStat('lastSaveDate', getTodayKey());
        renderStats();
        showNotification('🍅 Pomodoro Complete!', 'Great work! Time for a break.');
        showToast('🎉 Pomodoro complete! Take a break.');
        advanceSession();
    } else {
        showNotification('⏰ Break Over!', 'Ready to focus again?');
        showToast('☕ Break done! Back to work.');
        switchMode('pomodoro');
        if (settings.autoPomodoro) startTimer();
    }
}

function advanceSession() {
    if (mode === 'pomodoro') {
        if (sessionCount >= 4) {
            sessionCount = 1;
            switchMode('long');
            if (settings.autoBreak) startTimer();
        } else {
            sessionCount++;
            switchMode('short');
            if (settings.autoBreak) startTimer();
        }
    } else {
        switchMode('pomodoro');
        if (settings.autoPomodoro) startTimer();
    }
    renderSessionDots();
}

// ─── Mode Switching ───────────────────────────────────────────────────────────
function switchMode(newMode) {
    mode = newMode;
    timeLeft = settings.durations[mode] * 60;
    totalTime = timeLeft;
    renderTimer();
    renderRing();
    updateModeUI();
}

function updateModeUI() {
    // Tab highlighting
    tabs.forEach(t => {
        t.classList.toggle('active', t.dataset.mode === mode);
        t.setAttribute('aria-selected', t.dataset.mode === mode ? 'true' : 'false');
    });
    // Card class for color scheme
    mainCard.className = 'main-card';
    if (mode === 'short') mainCard.classList.add('mode-short');
    if (mode === 'long') mainCard.classList.add('mode-long');

    // Label
    const labels = { pomodoro: 'Focus Time', short: 'Short Break', long: 'Long Break' };
    timerLabel.textContent = labels[mode];

    // Browser tab title
    updatePageTitle();
}

// ─── Render Helpers ───────────────────────────────────────────────────────────
function renderTimer() {
    timerDisplay.textContent = formatTime(timeLeft);
    updatePageTitle();
}

function renderRing() {
    const progress = totalTime > 0 ? timeLeft / totalTime : 1;
    const offset = RING_CIRCUMFERENCE * (1 - progress);
    ringFill.style.strokeDasharray = RING_CIRCUMFERENCE;
    ringFill.style.strokeDashoffset = offset;
}

function renderSessionDots() {
    for (let i = 1; i <= 4; i++) {
        const dot = document.getElementById(`dot-${i}`);
        dot.className = 'session-dot';
        if (mode !== 'pomodoro') {
            // During a break, mark previous sessions as done
            if (i < sessionCount) dot.classList.add('done');
            else if (i === sessionCount) dot.classList.add('done');
        } else {
            if (i < sessionCount) dot.classList.add('done');
            else if (i === sessionCount) dot.classList.add('active');
        }
    }
    const modeLabel = mode === 'pomodoro'
        ? `Session ${sessionCount} of 4`
        : (mode === 'short' ? `Short Break • Session ${Math.min(sessionCount, 4)}` : 'Long Break • Cycle Complete');
    sessionText.textContent = modeLabel;
}

function renderStats() {
    totalPomodorosEl.textContent = completedPomodoros;
    const mins = Math.floor(totalFocusSeconds / 60);
    const hrs = Math.floor(mins / 60);
    totalFocusTimeEl.textContent = hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;
    currentStreakEl.textContent = streakCount;
}

function togglePlayPause(running) {
    playIcon.style.display = running ? 'none' : 'block';
    pauseIcon.style.display = running ? 'block' : 'none';
    startBtn.setAttribute('aria-label', running ? 'Pause timer' : 'Start timer');
}

function updatePageTitle() {
    const modeEmoji = { pomodoro: '🍅', short: '☕', long: '🌿' };
    document.title = `${modeEmoji[mode]} ${formatTime(timeLeft)} — Pomodoro`;
}

// ─── Event Listeners ──────────────────────────────────────────────────────────
startBtn.addEventListener('click', () => {
    isRunning ? pauseTimer() : startTimer();
});

resetBtn.addEventListener('click', () => {
    resetTimer();
    showToast('Timer reset');
});

skipBtn.addEventListener('click', () => {
    skipToNext();
    showToast('Skipped to next session');
});

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        if (tab.dataset.mode === mode) return;
        pauseTimer();
        if (tab.dataset.mode === 'pomodoro') { sessionCount = 1; }
        switchMode(tab.dataset.mode);
        renderSessionDots();
    });
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
    if (e.target === taskInput) return;
    if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        isRunning ? pauseTimer() : startTimer();
    }
    if (e.key.toLowerCase() === 'r') resetTimer();
    if (e.key.toLowerCase() === 's') skipToNext();
});

// Theme Toggle
themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('pm_theme', next);
    sunIcon.style.display = next === 'dark' ? 'block' : 'none';
    moonIcon.style.display = next === 'light' ? 'block' : 'none';
});

// Settings
settingsBtn.addEventListener('click', openSettings);
closeSettings.addEventListener('click', closeSettingsModal);
settingsModal.addEventListener('click', e => { if (e.target === settingsModal) closeSettingsModal(); });

saveSettingsBtn.addEventListener('click', () => {
    const newDurations = {
        pomodoro: parseInt(settingPomodoro.value) || 25,
        short: parseInt(settingShort.value) || 5,
        long: parseInt(settingLong.value) || 15,
    };
    settings = {
        durations: newDurations,
        autoBreak: autoBreakCb.checked,
        autoPomodoro: autoPomodoroCb.checked,
        soundEnabled: soundEnabledCb.checked,
        notificationsEnabled: notifEnabledCb.checked,
    };
    saveSettings(settings);

    if (notifEnabledCb.checked) requestNotificationPermission();

    // Reset current timer to new duration
    timeLeft = settings.durations[mode] * 60;
    totalTime = timeLeft;
    pauseTimer();
    renderTimer();
    renderRing();

    closeSettingsModal();
    showToast('✅ Settings saved');
});

// Notification toggle requests permission immediately
notifEnabledCb.addEventListener('change', () => {
    if (notifEnabledCb.checked) requestNotificationPermission();
});

// ─── Settings Modal ───────────────────────────────────────────────────────────
function openSettings() {
    settingPomodoro.value = settings.durations.pomodoro;
    settingShort.value = settings.durations.short;
    settingLong.value = settings.durations.long;
    autoBreakCb.checked = settings.autoBreak;
    autoPomodoroCb.checked = settings.autoPomodoro;
    soundEnabledCb.checked = settings.soundEnabled;
    notifEnabledCb.checked = settings.notificationsEnabled;
    settingsModal.classList.add('open');
}
function closeSettingsModal() {
    settingsModal.classList.remove('open');
}

// ─── Sound (Web Audio API) ────────────────────────────────────────────────────
function playAlertSound() {
    if (!settings.soundEnabled) return;
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.18);
            gain.gain.setValueAtTime(0.35, ctx.currentTime + i * 0.18);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.35);
            osc.start(ctx.currentTime + i * 0.18);
            osc.stop(ctx.currentTime + i * 0.18 + 0.4);
        });
    } catch (e) {
        // Audio not supported, fail silently
    }
}

// ─── Browser Notifications ────────────────────────────────────────────────────
function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    Notification.requestPermission().then(permission => {
        if (permission !== 'granted') {
            notifEnabledCb.checked = false;
            settings.notificationsEnabled = false;
            showToast('⚠️ Notification permission denied');
        }
    });
}

function showNotification(title, body) {
    if (!settings.notificationsEnabled) return;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: '🍅' });
    }
}

// ─── Toast ────────────────────────────────────────────────────────────────────
let toastTimeout;
function showToast(msg) {
    clearTimeout(toastTimeout);
    toast.textContent = msg;
    toast.classList.add('show');
    toastTimeout = setTimeout(() => toast.classList.remove('show'), 2800);
}

// ─── Theme Init ───────────────────────────────────────────────────────────────
function initTheme() {
    const saved = localStorage.getItem('pm_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    sunIcon.style.display = saved === 'dark' ? 'block' : 'none';
    moonIcon.style.display = saved === 'light' ? 'block' : 'none';
}

// (loadSettings, saveSettings, saveStat, loadStat, getTodayKey are defined at the top of the file)
