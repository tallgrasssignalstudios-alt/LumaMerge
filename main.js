// Luma Merge – Dual Mode (Infinite + Campaign)
// Tallgrass Signal Studios

const BOARD_W = 6;
const BOARD_H = 7;
const MAX_TIER = 8;

// ---------- State ----------
let currentMode = "infinite"; // "infinite" | "campaign"
let board = [];
let selected = [];
let lumens = 0;
let lives = 3;
let difficulty = 1;
let mergesThisRun = 0;
let highestTierThisRun = 1;
let campaignStage = 1;
let campaignProgress = 0; // 0–100 toward next stage

// ---------- DOM ----------
const termsScreen = document.getElementById("terms-screen");
const homeScreen = document.getElementById("home-screen");
const gameEl = document.getElementById("game");
const gameover = document.getElementById("gameover");
const boardEl = document.getElementById("board");
const lumensEl = document.getElementById("lumens");
const modeLabel = document.getElementById("mode-label");
const difficultyEl = document.getElementById("difficulty");
const livesEl = document.getElementById("lives");
const messageEl = document.getElementById("message");
const modeSwitch = document.getElementById("mode-switch");
const celebration = document.getElementById("celebration");
const bigText = document.getElementById("big-text");
const goStats = document.getElementById("go-stats");

// ---------- Init ----------
function init() {
  const termsAccepted = localStorage.getItem("luma_terms") === "1";
  if (!termsAccepted) {
    termsScreen.classList.remove("hidden");
  } else {
    termsScreen.classList.add("hidden");
    showHome();
  }

  document.getElementById("terms-check").addEventListener("change", (e) => {
    document.getElementById("accept-terms").disabled = !e.target.checked;
  });

  document.getElementById("accept-terms").addEventListener("click", () => {
    localStorage.setItem("luma_terms", "1");
    termsScreen.classList.add("hidden");
    showHome();
  });

  document.getElementById("play-infinite").addEventListener("click", () => startMode("infinite"));
  document.getElementById("play-campaign").addEventListener("click", () => startMode("campaign"));

  modeSwitch.addEventListener("click", switchMode);
  document.getElementById("btn-merge").addEventListener("click", tryMerge);
  document.getElementById("btn-boost").addEventListener("click", useBoost);
  document.getElementById("btn-home").addEventListener("click", showHome);
  document.getElementById("btn-retry").addEventListener("click", () => startMode(currentMode));
  document.getElementById("btn-go-home").addEventListener("click", showHome);

  loadProgress();
}

function showHome() {
  gameEl.classList.add("hidden");
  gameover.classList.add("hidden");
  homeScreen.classList.remove("hidden");
  saveProgress();
}

function startMode(mode) {
  currentMode = mode;
  homeScreen.classList.add("hidden");
  gameover.classList.add("hidden");
  gameEl.classList.remove("hidden");

  // Reset run state
  lives = mode === "infinite" ? 3 : 5;
  difficulty = 1;
  mergesThisRun = 0;
  highestTierThisRun = 1;
  selected = [];
  messageEl.textContent = "";

  updateModeUI();
  createBoard(mode === "infinite" ? 0.55 : 0.45);
  renderBoard();
  updateHUD();
}

function switchMode() {
  // Tab always shows the *other* mode
  const next = currentMode === "infinite" ? "campaign" : "infinite";
  startMode(next);
}

function updateModeUI() {
  modeLabel.textContent = currentMode === "infinite" ? "Infinite" : "Campaign";
  // Tab shows the opposite mode
  modeSwitch.textContent = currentMode === "infinite" ? "Campaign Mode" : "Infinite Mode";
}

// ---------- Board ----------
function createBoard(fillChance = 0.5) {
  board = [];
  for (let y = 0; y < BOARD_H; y++) {
    const row = [];
    for (let x = 0; x < BOARD_W; x++) {
      row.push(Math.random() < fillChance ? Math.floor(Math.random() * 2) + 1 : 0);
    }
    board.push(row);
  }
}

function renderBoard() {
  boardEl.innerHTML = "";
  boardEl.style.gridTemplateColumns = `repeat(${BOARD_W}, 1fr)`;

  for (let y = 0; y < BOARD_H; y++) {
    for (let x = 0; x < BOARD_W; x++) {
      const tier = board[y][x];
      const cell = document.createElement("div");
      cell.className = "crystal";
      if (tier > 0) {
        cell.classList.add(`tier-${Math.min(tier, 8)}`);
        cell.textContent = tier;
        cell.dataset.x = x;
        cell.dataset.y = y;
        cell.addEventListener("click", () => selectCrystal(x, y));
      } else {
        cell.style.visibility = "hidden";
      }
      boardEl.appendChild(cell);
    }
  }
  highlightSelected();
}

function selectCrystal(x, y) {
  const idx = selected.findIndex(s => s.x === x && s.y === y);
  if (idx >= 0) selected.splice(idx, 1);
  else {
    if (selected.length >= 2) selected.shift();
    selected.push({ x, y });
  }
  highlightSelected();
}

function highlightSelected() {
  document.querySelectorAll(".crystal").forEach(c => c.classList.remove("selected"));
  selected.forEach(({ x, y }) => {
    const el = document.querySelector(`.crystal[data-x="${x}"][data-y="${y}"]`);
    if (el) el.classList.add("selected");
  });
}

// ---------- Core Merge ----------
function tryMerge() {
  if (selected.length !== 2) {
    flashMessage("Select 2 matching crystals");
    return;
  }

  const [a, b] = selected;
  const t1 = board[a.y][a.x];
  const t2 = board[b.y][b.x];

  if (t1 === 0 || t2 === 0 || t1 !== t2) {
    flashMessage("No match");
    selected = [];
    highlightSelected();
    // Small penalty in Infinite
    if (currentMode === "infinite") loseLife(0); // just feedback
    return;
  }

  const newTier = Math.min(t1 + 1, MAX_TIER);
  board[a.y][a.x] = 0;
  board[b.y][b.x] = newTier;

  mergesThisRun++;
  highestTierThisRun = Math.max(highestTierThisRun, newTier);

  const baseReward = 10 * Math.pow(2, newTier - 1);
  const reward = Math.floor(baseReward * (1 + difficulty * 0.08));
  addLumens(reward);

  selected = [];
  renderBoard();

  // Feedback
  if (newTier >= 7) celebrate("LUMA!", 8);
  else if (newTier >= 5) celebrate("BIG!", 5);
  else celebrate("Merge", 3);

  // Mode-specific progression
  if (currentMode === "infinite") {
    infiniteAfterMerge(newTier);
  } else {
    campaignAfterMerge(newTier);
  }

  // Spawn pressure
  maybeSpawnThreat();
  updateHUD();
}

// ---------- Infinite Mode ----------
function infiniteAfterMerge(tier) {
  // Difficulty rises slowly with merges and high tiers
  if (mergesThisRun % 8 === 0) {
    difficulty++;
    flashMessage(`Difficulty up → ${difficulty}`);
    celebrate("LEVEL UP", 6);
  }

  // Occasional reward drops
  if (Math.random() < 0.12 + tier * 0.02) {
    const bonus = 25 * difficulty;
    addLumens(bonus);
    flashMessage(`+${bonus} bonus!`);
  }
}

function maybeSpawnThreat() {
  // Fill empty cells more aggressively as difficulty rises
  const empty = [];
  for (let y = 0; y < BOARD_H; y++) {
    for (let x = 0; x < BOARD_W; x++) {
      if (board[y][x] === 0) empty.push({ x, y });
    }
  }

  if (empty.length === 0) {
    // Board full → lose a life
    loseLife(1);
    return;
  }

  // Spawn chance scales with difficulty
  const spawnChance = Math.min(0.35 + difficulty * 0.04, 0.75);
  if (Math.random() < spawnChance) {
    const spot = empty[Math.floor(Math.random() * empty.length)];
    // Higher difficulty can spawn slightly higher base crystals
    const maxStart = Math.min(2 + Math.floor(difficulty / 5), 4);
    board[spot.y][spot.x] = Math.floor(Math.random() * maxStart) + 1;
    renderBoard();
  }
}

function loseLife(amount = 1) {
  lives -= amount;
  updateHUD();
  if (lives <= 0) {
    endRun();
  } else {
    flashMessage(`♥ ${lives} left`);
    // Clear a few cells as mercy
    let cleared = 0;
    for (let y = 0; y < BOARD_H && cleared < 4; y++) {
      for (let x = 0; x < BOARD_W && cleared < 4; x++) {
        if (board[y][x] > 0 && Math.random() < 0.4) {
          board[y][x] = 0;
          cleared++;
        }
      }
    }
    renderBoard();
  }
}

function endRun() {
  gameEl.classList.add("hidden");
  gameover.classList.remove("hidden");
  goStats.textContent = `Merges: ${mergesThisRun} • Highest Tier: ${highestTierThisRun} • Difficulty: ${difficulty}`;
  saveProgress();
}

// ---------- Campaign Mode (long progression) ----------
function campaignAfterMerge(tier) {
  // Progress toward next stage
  campaignProgress += 2 + tier;
  if (campaignProgress >= 100) {
    campaignProgress = 0;
    campaignStage++;
    difficulty = Math.floor(campaignStage / 3) + 1;
    celebrate("STAGE CLEAR!", 8);
    flashMessage(`Stage ${campaignStage} unlocked`);
    // Soft board refresh
    createBoard(0.4);
    renderBoard();
  }

  // Slow, satisfying upgrade feel
  if (mergesThisRun % 15 === 0) {
    addLumens(100 * campaignStage);
    celebrate("UPGRADE", 6);
  }
}

// ---------- Shared helpers ----------
function useBoost() {
  // Simple clear of low tiers (costs nothing for now – later can cost Lumens or ad)
  let cleared = 0;
  for (let y = 0; y < BOARD_H; y++) {
    for (let x = 0; x < BOARD_W; x++) {
      if (board[y][x] > 0 && board[y][x] <= 2) {
        board[y][x] = 0;
        cleared++;
      }
    }
  }
  if (cleared > 0) {
    renderBoard();
    flashMessage("Boost used");
    celebrate("BOOST", 4);
  } else {
    flashMessage("Nothing to boost");
  }
}

function addLumens(amount) {
  lumens += amount;
  updateHUD();
}

function updateHUD() {
  lumensEl.textContent = lumens.toLocaleString();
  difficultyEl.textContent = `Diff ${difficulty}`;
  livesEl.textContent = currentMode === "infinite" ? `♥ ${lives}` : `Stage ${campaignStage}`;
}

function flashMessage(text) {
  messageEl.textContent = text;
  setTimeout(() => { if (messageEl.textContent === text) messageEl.textContent = ""; }, 1800);
}

function celebrate(text, intensity = 3) {
  bigText.textContent = text;
  celebration.classList.remove("hidden");
  if (navigator.vibrate) {
    navigator.vibrate(intensity >= 6 ? [30, 40, 50] : 25);
  }
  setTimeout(() => celebration.classList.add("hidden"), intensity >= 7 ? 1000 : 650);
}

// ---------- Save / Load (local for now) ----------
function saveProgress() {
  const data = {
    lumens,
    campaignStage,
    campaignProgress,
    infiniteBestDiff: Math.max(difficulty, parseInt(localStorage.getItem("luma_best_diff") || "1"))
  };
  localStorage.setItem("luma_save", JSON.stringify(data));
  if (currentMode === "infinite") {
    localStorage.setItem("luma_best_diff", data.infiniteBestDiff);
  }
}

function loadProgress() {
  try {
    const raw = localStorage.getItem("luma_save");
    if (raw) {
      const data = JSON.parse(raw);
      lumens = data.lumens || 0;
      campaignStage = data.campaignStage || 1;
      campaignProgress = data.campaignProgress || 0;
    }
  } catch (e) {}
  updateHUD();
}

// ---------- Start ----------
init();
