import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, arrayUnion } from "firebase/firestore";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: "AIzaSyAkAe9k628QMEdzwG0kHfwprimbs203MgQ",
  authDomain: "corespeak-4820c.firebaseapp.com",
  projectId: "corespeak-4820c",
  storageBucket: "corespeak-4820c.firebasestorage.app",
  messagingSenderId: "288282228385",
  appId: "1:288282228385:web:d51b28faa61bee950ca2e0",
  measurementId: "G-82Z836XBM4"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// ── App Check: blocks unauthorized origins from using your Firebase config ──
// Step 1: Get a free reCAPTCHA v3 site key: https://www.google.com/recaptcha/admin
// Step 2: Register it in Firebase Console: Project > App Check > Register > reCAPTCHA v3
// Step 3: Paste the site key below (the one from Firebase Console, not Google's admin page)
// Without App Check, your API key works from any domain — this locks it to YOUR domain only.
if (typeof self !== "undefined") {
    try {
        initializeAppCheck(app, {
            provider: new ReCaptchaV3Provider("REPLACE_WITH_YOUR_APP_CHECK_SITE_KEY"),
            isTokenAutoRefreshEnabled: true
        });
    } catch (e) {
        console.warn("App Check not configured — add a reCAPTCHA site key to secure your API key.");
    }
}

let currentSentence = [];
let currentUser = null;
let currentCategory = "Common";
let alarmInterval = null;
let clockInterval = null;

const vocabulary = {
    "Common": { cls: "tile-common", words: ["Yes", "No", "Please", "Thanks", "Wait", "More", "All done", "Maybe", "I don't know", "Hello", "Goodbye", "Good morning", "Good night", "Excuse me", "Sorry", "Again", "Now", "Later", "Here", "There"] },
    "People": { cls: "tile-people", words: ["I", "You", "Mom", "Dad", "Teacher", "Friend", "Doctor", "Brother", "Sister", "Me", "They", "He", "She", "We", "Grandma", "Grandpa", "Baby", "Boy", "Girl", "Man", "Woman"] },
    "Actions": { cls: "tile-actions", words: ["Want", "Go", "Like", "Play", "Eat", "Sleep", "Watch", "Drink", "Read", "Help", "Sit", "Stand", "Walk", "Run", "Jump", "Talk", "Listen", "Look", "Give", "Take"] },
    "Describe": { cls: "tile-describe", words: ["Good", "Bad", "Happy", "Sad", "Angry", "Sick", "Big", "Small", "Hot", "Cold", "Tired", "Hungry", "Thirsty", "New", "Old", "Fast", "Slow", "Loud", "Quiet", "Clean", "Dirty"] },
    "Places": { cls: "tile-places", words: ["Home", "School", "Park", "Store", "Outside", "Kitchen", "Bathroom", "Bedroom", "Garden", "Car", "Bus", "Train", "Plane", "Beach", "Pool", "Restaurant", "Hospital", "Library", "Zoo", "Farm"] },
    "Things": { cls: "tile-things", words: ["Phone", "Tablet", "Book", "Toy", "Water", "Food", "Shoes", "Coat", "Ball", "Clothes", "Computer", "TV", "Music", "Light", "Door", "Window", "Chair", "Table", "Bed", "Bag"] },
    "Feelings": { cls: "tile-feelings", words: ["Happy", "Sad", "Angry", "Scared", "Excited", "Bored", "Confused", "Proud", "Shy", "Calm", "Frustrated", "Surprised", "Worried", "Lonely", "Loved", "Hopeful", "Curious", "Annoyed", "Relaxed", "Content"] },
    "Food": { cls: "tile-food", words: ["Apple", "Banana", "Bread", "Cheese", "Chicken", "Fish", "Rice", "Pasta", "Pizza", "Salad", "Soup", "Egg", "Milk", "Juice", "Water", "Cookie", "Cake", "Candy", "Fruit", "Vegetable"] },
    "Questions": { cls: "tile-questions", words: ["Who?", "What?", "Where?", "When?", "Why?", "How?", "Which?", "Can I?", "Do you?", "Is it?", "Are you?", "Tell me", "Show me", "Explain", "Repeat", "Understand?", "Ready?", "Finished?", "Start?", "End?"] },
    "Time": { cls: "tile-time", words: ["Now", "Later", "Today", "Tomorrow", "Yesterday", "Morning", "Afternoon", "Evening", "Night", "Week", "Month", "Year", "Hour", "Minute", "Second", "Early", "Late", "Always", "Never", "Sometimes"] },
    "Weather": { cls: "tile-weather", words: ["Sunny", "Cloudy", "Rainy", "Snowy", "Windy", "Hot", "Cold", "Warm", "Cool", "Stormy", "Foggy", "Clear", "Wet", "Dry", "Breezy", "Humid", "Freezing", "Thawing", "Drizzling", "Pouring"] },
    "Emergency": { cls: "tile-emergency", words: ["HELP!", "HURT", "INJURY", "DANGER", "PAIN", "SICK", "STOP", "FALL", "LOST", "FIRE", "CALL 911", "DOCTOR", "NURSE", "AMBULANCE", "BREATHE", "CHOKE", "BLEEDING", "FEVER", "DIZZY", "COLD"], isEmergency: true }
};

// ── DOM Refs ──
const vocabGrid = document.getElementById('vocab-grid');
const categoryTabs = document.getElementById('category-tabs');
const sentenceStrip = document.getElementById('sentence-strip');
const speakBtn = document.getElementById('speak-btn');
const backspaceBtn = document.getElementById('backspace-btn');
const clearBtn = document.getElementById('clear-btn');
const googleSignInBtn = document.getElementById('google-signin-btn');
const signOutBtn = document.getElementById('signout-btn');
const clockEl = document.getElementById('digital-clock');
const appHeader = document.getElementById('app-header');
const profileAvatar = document.getElementById('profile-avatar');
const avatarInitials = document.getElementById('avatar-initials');
const historyToggleBtn = document.getElementById('history-toggle-btn');
const historySidebar = document.getElementById('history-sidebar');
const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const sidebarList = document.getElementById('sidebar-list');
const authErrorEl = document.getElementById('auth-error');
const darkToggle = document.getElementById('dark-toggle');
const fontToggle = document.getElementById('font-toggle');
const sidebarSignInBtn = document.getElementById('sidebar-signin-btn');
const sidebarGuestCta = document.getElementById('sidebar-guest-cta');
const dyslexicFontLink = document.getElementById('dyslexic-font-link');

const DYSLEXIC_CSS_URL = 'https://cdn.jsdelivr.net/npm/open-dyslexic@1.0.3/open-dyslexic-regular.css';
const DEBOUNCE_MS = 400;
let lastClickTime = 0;

// ── Landing Page Nav ──
const landingNav = document.querySelector('.landing-nav');
const hamburger = document.getElementById('nav-hamburger');
const navLinks = document.querySelector('.nav-links');

if (hamburger) {
    hamburger.addEventListener('click', () => {
        navLinks.classList.toggle('open');
    });
}

document.addEventListener('scroll', () => {
    if (landingNav && window.scrollY > 20) {
        landingNav.classList.add('scrolled');
    } else if (landingNav) {
        landingNav.classList.remove('scrolled');
    }
});

// ── Auth ──
async function handleGoogleSignIn(e) {
    if (window.location.protocol === 'file:') {
        alert('Google sign-in requires a web server.\n\nOpen this folder with VS Code Live Server, or run:\n  npx serve .\n  python -m http.server 8080\n\nThen visit http://localhost:3000 or http://localhost:8080');
        return;
    }

    const btn = e ? e.currentTarget : null;
    if (btn) { btn.disabled = true; btn.innerHTML = 'Signing in...'; }

    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        if (btn) { btn.disabled = false; btn.innerHTML = '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt=""> Sign In with Google'; }

        switch (error.code) {
            case 'auth/popup-blocked':
                if (authErrorEl) { authErrorEl.textContent = 'Popup blocked. Allow popups for this site.'; authErrorEl.classList.add('visible'); }
                break;
            case 'auth/popup-closed-by-user':
            case 'auth/cancelled-popup-request':
                break;
            case 'auth/unauthorized-domain':
                if (authErrorEl) { authErrorEl.textContent = 'Domain not authorized. Add it in Firebase Console > Authentication > Settings > Authorized domains.'; authErrorEl.classList.add('visible'); }
                break;
            case 'auth/operation-not-allowed':
                if (authErrorEl) { authErrorEl.textContent = 'Google sign-in not enabled. Enable it in Firebase Console > Authentication > Sign-in method > Google.'; authErrorEl.classList.add('visible'); }
                break;
            default:
                if (authErrorEl) {
                    const domain = window.location.hostname;
                    authErrorEl.textContent = `Sign-in failed (${error.code || 'unknown'}). Make sure "${domain}" is in your Firebase authorized domains.`;
                    authErrorEl.classList.add('visible');
                }
        }
    }
}

// ── Clock ──
function startClock() {
    if (clockInterval && !clockEl) return;
    if (clockInterval) return;
    function tick() {
        if (clockEl) clockEl.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
    }
    tick();
    clockInterval = setInterval(tick, 1000);
}

function stopClock() {
    if (clockInterval) { clearInterval(clockInterval); clockInterval = null; }
}

// ── View ──
function showView(id) {
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

// ── Profile ──
function updateProfile(user) {
    if (!user) {
        if (profileAvatar) profileAvatar.style.display = 'none';
        if (signOutBtn) signOutBtn.style.display = 'none';
        return;
    }
    if (profileAvatar) profileAvatar.style.display = 'flex';
    if (signOutBtn) signOutBtn.style.display = 'block';

    if (user.photoURL && profileAvatar) {
        profileAvatar.innerHTML = `<img src="${user.photoURL}" alt="">`;
    } else if (profileAvatar) {
        const initial = (user.displayName || user.email || 'U').charAt(0).toUpperCase();
        avatarInitials.textContent = initial;
        profileAvatar.innerHTML = '';
        profileAvatar.appendChild(avatarInitials);
    }
}

// ── Categories ──
function renderCategories() {
    if (!categoryTabs) return;
    categoryTabs.innerHTML = '';
    Object.keys(vocabulary).forEach(cat => {
        const btn = document.createElement('button');
        const isEmerg = cat === 'Emergency';
        btn.className = `category-btn ${cat === currentCategory ? 'active' : ''} ${isEmerg ? 'emergency-tab' : ''}`;
        btn.textContent = cat;
        btn.addEventListener('click', () => {
            currentCategory = cat;
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderGrid(cat);
        });
        categoryTabs.appendChild(btn);
    });
}

// ── Grid ──
function renderGrid(cat) {
    if (!vocabGrid) return;
    vocabGrid.innerHTML = '';
    const data = vocabulary[cat];
    if (!data) return;

    if (data.isEmergency) {
        const alarm = document.createElement('div');
        alarm.className = 'vocab-tile alarm-btn';
        alarm.innerHTML = '🚨 SEVERE EMERGENCY 🚨';
        alarm.onclick = toggleEmergencyAlarm;
        vocabGrid.appendChild(alarm);
    }

    const frag = document.createDocumentFragment();
    data.words.forEach(word => {
        const tile = document.createElement('div');
        tile.className = `vocab-tile ${data.cls}`;
        tile.textContent = word;
        tile.role = 'button';
        tile.addEventListener('click', () => handleWordClick(word));
        frag.appendChild(tile);
    });
    vocabGrid.appendChild(frag);
}

// ── Emergency Alarm ──
function toggleEmergencyAlarm() {
    const btn = document.querySelector('.alarm-btn');
    if (alarmInterval) {
        clearInterval(alarmInterval);
        alarmInterval = null;
        if (btn) btn.classList.remove('active');
        window.speechSynthesis.cancel();
    } else {
        if (btn) btn.classList.add('active');
        alarmInterval = setInterval(() => {
            const u = new SpeechSynthesisUtterance('EMERGENCY! EMERGENCY!');
            u.pitch = 2; u.rate = 1.3;
            window.speechSynthesis.speak(u);
        }, 1200);
    }
}

// ── Sentence ──
function handleWordClick(word) {
    const now = Date.now();
    if (now - lastClickTime < DEBOUNCE_MS) return;
    lastClickTime = now;
    currentSentence.push(word);
    speak(word);
    renderSentence();
}

function renderSentence() {
    if (!sentenceStrip) return;
    if (currentSentence.length === 0) {
        sentenceStrip.innerHTML = '<span class="placeholder">Tap words below to build a sentence...</span>';
        return;
    }
    sentenceStrip.innerHTML = '';
    currentSentence.forEach(w => {
        const t = document.createElement('span');
        t.className = 'word-token';
        t.textContent = w;
        sentenceStrip.appendChild(t);
    });
    sentenceStrip.scrollLeft = sentenceStrip.scrollWidth;
}

function handleBackspace() {
    if (currentSentence.length === 0) return;
    currentSentence.pop();
    renderSentence();
}

function handleClear() {
    currentSentence = [];
    renderSentence();
    window.speechSynthesis.cancel();
}

async function handleSpeakPhrase() {
    if (currentSentence.length === 0) return;
    const phrase = currentSentence.join(' ');
    speak(phrase);
    const entry = { text: phrase, timestamp: new Date().toISOString() };
    if (currentUser) {
        try {
            await setDoc(doc(db, "user_logs", currentUser.uid), {
                history: arrayUnion(entry),
                lastUpdated: new Date().toISOString()
            }, { merge: true });
        } catch (e) { console.error("Log error:", e); }
    } else {
        addLocalHistory(entry);
    }
}

// ── Speech ──
function speak(text) {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9; u.pitch = 1.1;
    window.speechSynthesis.speak(u);
}

// ── Sidebar ──
function openSidebar() {
    if (historySidebar) historySidebar.classList.add('open');
    if (sidebarOverlay) sidebarOverlay.classList.add('visible');
    renderSidebar();
}

function closeSidebar() {
    if (historySidebar) historySidebar.classList.remove('open');
    if (sidebarOverlay) sidebarOverlay.classList.remove('visible');
}

function renderHistoryList(history) {
    if (!sidebarList) return;
    if (!history || history.length === 0) {
        sidebarList.innerHTML = '<p class="sidebar-placeholder">No saved phrases yet. Tap "Speak Phrase" to save one!</p>';
        return;
    }
    history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    sidebarList.innerHTML = '';
    history.forEach(entry => {
        const item = document.createElement('div');
        item.className = 'sidebar-item';
        item.innerHTML = `
            <span class="sidebar-item-text">${escHtml(entry.text)}</span>
            <span class="sidebar-item-date">${relTime(entry.timestamp)}</span>
            <button class="sidebar-replay" data-phrase="${escHtml(entry.text)}">▶</button>
        `;
        item.querySelector('.sidebar-replay').addEventListener('click', (e) => {
            e.stopPropagation();
            speak(entry.text);
        });
        sidebarList.appendChild(item);
    });
}

async function renderSidebar() {
    if (!sidebarList) return;
    if (!currentUser) {
        renderHistoryList(getLocalHistory());
        return;
    }
    try {
        const snap = await getDoc(doc(db, "user_logs", currentUser.uid));
        if (!snap.exists() || !snap.data().history) {
            renderHistoryList([]);
            return;
        }
        renderHistoryList(snap.data().history);
    } catch (e) {
        sidebarList.innerHTML = '<p class="sidebar-placeholder">Error loading history.</p>';
    }
}

function escHtml(t) {
    const d = document.createElement('div');
    d.textContent = t; return d.innerHTML;
}

function relTime(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d`;
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Local Storage History (Guest Mode) ──
function getLocalHistory() {
    try { return JSON.parse(localStorage.getItem('corespeak_history') || '[]'); }
    catch { return []; }
}

function addLocalHistory(entry) {
    const history = getLocalHistory();
    history.unshift(entry);
    localStorage.setItem('corespeak_history', JSON.stringify(history.slice(0, 200)));
}

function clearLocalHistory() {
    localStorage.removeItem('corespeak_history');
}

// ── Data Migration: localStorage → Firestore ──
async function migrateLocalToCloud() {
    const localHistory = getLocalHistory();
    if (localHistory.length === 0) return;
    try {
        for (const entry of localHistory) {
            await setDoc(doc(db, "user_logs", currentUser.uid), {
                history: arrayUnion(entry),
                lastUpdated: new Date().toISOString()
            }, { merge: true });
        }
        clearLocalHistory();
    } catch (e) {
        console.error("Migration error:", e);
    }
}

// ── Accessibility Toggles ──
function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('corespeak_dark', isDark ? '1' : '0');
    if (darkToggle) darkToggle.textContent = isDark ? '☀️' : '🌙';
}

function toggleDyslexicFont() {
    const isOn = document.body.classList.toggle('dyslexic-font');
    localStorage.setItem('corespeak_dyslexic', isOn ? '1' : '0');
    if (fontToggle) fontToggle.classList.toggle('active', isOn);
    if (dyslexicFontLink) dyslexicFontLink.href = isOn ? DYSLEXIC_CSS_URL : '';
}

function loadToggleStates() {
    if (localStorage.getItem('corespeak_dark') === '1') {
        document.body.classList.add('dark-mode');
        if (darkToggle) darkToggle.textContent = '☀️';
    }
    if (localStorage.getItem('corespeak_dyslexic') === '1') {
        document.body.classList.add('dyslexic-font');
        if (fontToggle) fontToggle.classList.add('active');
        if (dyslexicFontLink) dyslexicFontLink.href = DYSLEXIC_CSS_URL;
    }
}

function showGuestCTA() {
    if (sidebarGuestCta) sidebarGuestCta.classList.remove('hidden');
}

function hideGuestCTA() {
    if (sidebarGuestCta) sidebarGuestCta.classList.add('hidden');
}

// ── Init ──
function init() {
    renderCategories();
    renderGrid(currentCategory);
    attachEvents();
}

function attachEvents() {
    if (speakBtn) speakBtn.addEventListener('click', handleSpeakPhrase);
    if (backspaceBtn) backspaceBtn.addEventListener('click', handleBackspace);
    if (clearBtn) clearBtn.addEventListener('click', handleClear);
    if (historyToggleBtn) historyToggleBtn.addEventListener('click', openSidebar);
    if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', closeSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);
    if (googleSignInBtn) googleSignInBtn.addEventListener('click', handleGoogleSignIn);
    if (sidebarSignInBtn) sidebarSignInBtn.addEventListener('click', handleGoogleSignIn);
    if (signOutBtn) signOutBtn.addEventListener('click', async () => { await signOut(auth); closeSidebar(); });
    if (darkToggle) darkToggle.addEventListener('click', toggleDarkMode);
    if (fontToggle) fontToggle.addEventListener('click', toggleDyslexicFont);

    onAuthStateChanged(auth, (user) => {
        const wasGuest = currentUser === null && user !== null;
        currentUser = user;
        if (appHeader) appHeader.style.display = 'block';
        if (landingNav) landingNav.style.display = 'none';
        startClock();
        if (user) {
            updateProfile(user);
            if (wasGuest) migrateLocalToCloud();
            hideGuestCTA();
        } else {
            updateProfile(null);
            showGuestCTA();
        }
        showView('speak-page');
    });
}

document.addEventListener('DOMContentLoaded', () => {
    loadToggleStates();
    init();
});
