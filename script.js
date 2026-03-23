// ---- 試験設定（各2点）----
const EXAM_CONFIG = { pointsPerQuestion: 2 };

// ---- 分野 ----
const SUBJECTS = {
  physics: { label: "物理", filename: "physics_questions_150.json" },
  chemistry: { label: "化学", filename: "chemistry_questions_150.json" },
  biology: { label: "生物", filename: "biology_questions_150.json" },
  earth: { label: "地学", filename: "earth_science_questions_150.json" }
};

const state = {
  subjectKey: "physics",
  questionCount: 50,
  examQuestions: [],
  currentIndex: 0,
  hasAnswered: false,
  answers: [],
  /** 試験開始・終了（記録・表示用） */
  examStartedAt: null,
  examEndedAt: null,
  elapsedTimerId: null,
  /** 問題表示時刻（回答所要時間 ms 計測用） */
  questionShownAtMs: null,
  /** 各問の回答までの所要時間 */
  questionTimings: []
};

// ---- UI ----
const screenSelect = document.getElementById("screen-select");
const screenQuiz = document.getElementById("screen-quiz");
const screenResult = document.getElementById("screen-result");

const subjectSelect = document.getElementById("subject-select");
const questionCountSelect = document.getElementById("question-count-select");
const startButton = document.getElementById("start-button");
const restartButton = document.getElementById("restart-button");
const nextButton = document.getElementById("next-button");
const elapsedTimeEl = document.getElementById("elapsed-time");

const progressTextEl = document.getElementById("progress-text");
const questionNumberEl = document.getElementById("question-number");
const questionTextEl = document.getElementById("question-text");
const choicesEl = document.getElementById("choices");
const feedbackEl = document.getElementById("feedback");

const examMetaQuestionCountEl = document.getElementById(
  "exam-meta-question-count"
);
const examMetaTotalPointsEl = document.getElementById("exam-meta-total-points");

const historyListEl = document.getElementById("history-list");

const dataStatusEl = document.getElementById("data-status");
const dataFallbackEl = document.getElementById("data-fallback");

const physicsFileInput = document.getElementById("physics-file-input");
const chemistryFileInput = document.getElementById("chemistry-file-input");
const biologyFileInput = document.getElementById("biology-file-input");
const earthFileInput = document.getElementById("earth-file-input");
const dataFilesInput = document.getElementById("data-files-input");

function setLoadingStatus(text) {
  if (dataStatusEl) dataStatusEl.textContent = text;
}

function showDataFallback(show) {
  if (!dataFallbackEl) return;
  if (show) dataFallbackEl.classList.remove("is-hidden");
  else dataFallbackEl.classList.add("is-hidden");
}

function setActiveScreen(which) {
  const map = { select: screenSelect, quiz: screenQuiz, result: screenResult };
  Object.values(map).forEach((el) => el.classList.remove("is-active"));
  map[which].classList.add("is-active");
}

function updateExamMeta() {
  const qCount = Number(questionCountSelect?.value ?? 50);
  state.questionCount = qCount;

  if (examMetaQuestionCountEl) {
    examMetaQuestionCountEl.textContent = `出題：${qCount}問（各${EXAM_CONFIG.pointsPerQuestion}点）`;
  }
  if (examMetaTotalPointsEl) {
    const total = qCount * EXAM_CONFIG.pointsPerQuestion;
    examMetaTotalPointsEl.textContent = `合計：${total}点`;
  }
}

function formatElapsed(ms) {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDateTimeForDisplay(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(
    d.getHours()
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(
    d.getSeconds()
  ).padStart(2, "0")}`;
}

function stopElapsedTimerOnly() {
  if (state.elapsedTimerId != null) {
    clearInterval(state.elapsedTimerId);
    state.elapsedTimerId = null;
  }
}

function stopExamTimers() {
  stopElapsedTimerOnly();
}

function startExamTimer() {
  stopExamTimers();
  state.examStartedAt = new Date();
  state.examEndedAt = null;
  if (elapsedTimeEl) {
    elapsedTimeEl.textContent = "経過：0:00";
    state.elapsedTimerId = setInterval(() => {
      if (!state.examStartedAt || !elapsedTimeEl) return;
      const ms = Date.now() - state.examStartedAt.getTime();
      elapsedTimeEl.textContent = `経過：${formatElapsed(ms)}`;
    }, 250);
  }
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function pickRandomUniqueQuestions(pool, count) {
  // 同じ試験内で重複が起きないようにする。
  // dataset上は id重複がない想定だが、「質問文が同じ（テンプレが同じ）」問題は
  // 体感上“同じ問題”に見えやすいので、可能な限り text（正規化後は q.question）重複を避ける。
  const arr = pool.slice();
  shuffleInPlace(arr);

  const selected = [];
  const usedIds = new Set();
  const usedTexts = new Set();

  // 1st pass: 質問文（q.question）重複を避けて可能な限り埋める
  for (const q of arr) {
    if (selected.length >= count) break;
    if (!q) continue;
    if (usedIds.has(q.id)) continue;

    const textKey = q.question ?? "";
    if (usedTexts.has(textKey)) continue;

    selected.push(q);
    usedIds.add(q.id);
    usedTexts.add(textKey);
  }

  // 2nd pass: まだ足りなければ、質問文重複を許して埋める（id重複は回避）
  if (selected.length < count) {
    for (const q of arr) {
      if (selected.length >= count) break;
      if (!q) continue;
      if (usedIds.has(q.id)) continue;
      selected.push(q);
      usedIds.add(q.id);
    }
  }

  return selected;
}

// ---- データロード/キャッシュ（IndexedDB）----
const CACHE_DB_NAME = "scienceQuizDB";
const QUESTION_CACHE_STORE_NAME = "question_cache";
const ATTEMPT_STORE_NAME = "attempts";
const QUESTION_CACHE_KEY = "science_questions_600_v1";

let normalizedBySubject = null;
let isDataLoaded = false;
let dataLoadError = null;

function openScienceDB() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB が利用できません。"));
      return;
    }

    // DBバージョンを上げて objectStore を追加
    const req = indexedDB.open(CACHE_DB_NAME, 2);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUESTION_CACHE_STORE_NAME)) {
        db.createObjectStore(QUESTION_CACHE_STORE_NAME, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(ATTEMPT_STORE_NAME)) {
        db.createObjectStore(ATTEMPT_STORE_NAME, { keyPath: "id" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error ?? new Error("IndexedDB open error"));
  });
}

async function getCachedQuestions() {
  const db = await openScienceDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUESTION_CACHE_STORE_NAME, "readonly");
    const store = tx.objectStore(QUESTION_CACHE_STORE_NAME);
    const req = store.get(QUESTION_CACHE_KEY);
    req.onsuccess = () => resolve(req.result?.json ?? null);
    req.onerror = () =>
      reject(req.error ?? new Error("IndexedDB get error"));
  });
}

async function cacheQuestions(json) {
  const db = await openScienceDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUESTION_CACHE_STORE_NAME, "readwrite");
    const store = tx.objectStore(QUESTION_CACHE_STORE_NAME);
    const req = store.put({ key: QUESTION_CACHE_KEY, json });
    req.onsuccess = () => resolve();
    req.onerror = () =>
      reject(req.error ?? new Error("IndexedDB put error"));
  });
}

function normalizeQuestion(subjectKey, raw) {
  return {
    id: raw.id,
    category: SUBJECTS[subjectKey]?.label ?? subjectKey,
    topic: raw.category ?? "",
    difficulty: "basic",
    question: raw.text,
    choices: raw.choices,
    answerIndex: raw.answer_index,
    explanation: raw.explanation ?? ""
  };
}

async function fetchSubjectJSON(subjectKey) {
  const filename = SUBJECTS[subjectKey].filename;
  const url = new URL(`./data/${filename}`, window.location.href).toString();
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} (${filename})`);
  return res.json();
}

function applyLoadedData(subjectsJsonByKey) {
  normalizedBySubject = {
    physics: (subjectsJsonByKey.physics?.questions ?? []).map((q) =>
      normalizeQuestion("physics", q)
    ),
    chemistry: (subjectsJsonByKey.chemistry?.questions ?? []).map((q) =>
      normalizeQuestion("chemistry", q)
    ),
    biology: (subjectsJsonByKey.biology?.questions ?? []).map((q) =>
      normalizeQuestion("biology", q)
    ),
    earth: (subjectsJsonByKey.earth?.questions ?? []).map((q) =>
      normalizeQuestion("earth", q)
    )
  };

  const hasAny =
    normalizedBySubject.physics.length > 0 ||
    normalizedBySubject.chemistry.length > 0 ||
    normalizedBySubject.biology.length > 0 ||
    normalizedBySubject.earth.length > 0;
  if (!hasAny) throw new Error("science questions が見つかりません。");

  isDataLoaded = true;
  dataLoadError = null;
  setLoadingStatus("データ読み込み完了（キャッシュ/配信）");
  showDataFallback(false);
  startButton.disabled = false;

  cacheQuestions(subjectsJsonByKey).catch((e) => {
    console.warn("質問データのキャッシュ保存に失敗", e);
  });
}

async function loadAllData() {
  startButton.disabled = true;
  isDataLoaded = false;
  dataLoadError = null;
  setLoadingStatus("データを読み込み中…");

  const cached = await getCachedQuestions().catch((e) => {
    console.warn("キャッシュ読み込み失敗", e);
    return null;
  });
  if (cached) {
    applyLoadedData(cached);
    return;
  }

  // 未キャッシュならfetchで取得
  const subjectsJsonByKey = {};
  try {
    subjectsJsonByKey.physics = await fetchSubjectJSON("physics");
    subjectsJsonByKey.chemistry = await fetchSubjectJSON("chemistry");
    subjectsJsonByKey.biology = await fetchSubjectJSON("biology");
    subjectsJsonByKey.earth = await fetchSubjectJSON("earth");
  } catch (e) {
    console.error(e);
    dataLoadError = e;
    isDataLoaded = false;
    showDataFallback(true);
    setLoadingStatus(
      `データの読み込みに失敗しました。${e instanceof Error ? e.message : ""}`
    );
    startButton.disabled = true;
    return;
  }

  applyLoadedData(subjectsJsonByKey);
}

// ---- フォールバック（ローカルファイル選択）----
const localSubjects = { physics: null, chemistry: null, biology: null, earth: null };

function tryApplyFromLocal() {
  const ready =
    localSubjects.physics &&
    localSubjects.chemistry &&
    localSubjects.biology &&
    localSubjects.earth;
  if (!ready) return;
  applyLoadedData(localSubjects);
}

function wireLocalInput(inputEl, subjectKey) {
  inputEl?.addEventListener("change", async (ev) => {
    const file = ev.target?.files?.[0];
    if (!file) return;

    setLoadingStatus(`${SUBJECTS[subjectKey].label} JSONを読み込み中…`);
    startButton.disabled = true;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      localSubjects[subjectKey] = json;
      setLoadingStatus("ローカルJSONを読み込み中…（全分野読み込み待ち）");
      tryApplyFromLocal();
    } catch (e) {
      console.error(e);
      setLoadingStatus(`JSONの読み込みに失敗しました。${e instanceof Error ? e.message : ""}`);
      startButton.disabled = true;
    }
  });
}

wireLocalInput(physicsFileInput, "physics");
wireLocalInput(chemistryFileInput, "chemistry");
wireLocalInput(biologyFileInput, "biology");
wireLocalInput(earthFileInput, "earth");

function subjectKeyFromFilename(filename) {
  const lower = String(filename).toLowerCase();
  if (lower.includes("physics_questions")) return "physics";
  if (lower.includes("chemistry_questions")) return "chemistry";
  if (lower.includes("biology_questions")) return "biology";
  if (lower.includes("earth_science_questions")) return "earth";
  return null;
}

// 一括選択（4ファイル）対応
dataFilesInput?.addEventListener("change", async (ev) => {
  const files = Array.from(ev.target?.files ?? []);
  if (!files.length) return;

  // 前回のローカル状態を一旦クリア
  localSubjects.physics = null;
  localSubjects.chemistry = null;
  localSubjects.biology = null;
  localSubjects.earth = null;

  setLoadingStatus("ローカルJSONを一括読み込み中…");
  startButton.disabled = true;

  let recognized = 0;
  for (const file of files) {
    const subjectKey = subjectKeyFromFilename(file.name);
    if (!subjectKey) continue;
    recognized += 1;

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      localSubjects[subjectKey] = json;
    } catch (e) {
      console.error(e);
      setLoadingStatus(
        `JSONの読み込みに失敗しました：${file.name}（${e instanceof Error ? e.message : ""}）`
      );
      startButton.disabled = true;
      return;
    }
  }

  if (recognized === 0) {
    setLoadingStatus("一括選択されたファイル名が想定と一致しません。");
    startButton.disabled = true;
    return;
  }

  setLoadingStatus("ローカルJSONを読み込み中…（全分野読み込み待ち）");
  tryApplyFromLocal();
});

// ---- クイズ ----
function startExam() {
  if (!isDataLoaded || !normalizedBySubject) {
    if (dataLoadError) {
      alert(
        "問題データの読み込みに失敗しています。\n" +
          "このページは `file://` 直開きだと `fetch` が失敗することがあります。\n" +
          "ローカルJSONを選択してください。"
      );
    } else {
      alert("問題データを読み込み中です。少し待ってから開始してください。");
    }
    return;
  }

  const subjectKey = subjectSelect.value;
  const pool = normalizedBySubject[subjectKey] ?? [];

  if (!pool.length) {
    alert("この分野の問題がありません。");
    return;
  }

  if (pool.length < state.questionCount) {
    alert(
      `問題データが不足しています（${SUBJECTS[subjectKey].label}：${pool.length}問）`
    );
    return;
  }

  state.subjectKey = subjectKey;
  state.examQuestions = pickRandomUniqueQuestions(pool, state.questionCount);
  state.currentIndex = 0;
  state.hasAnswered = false;
  state.answers = new Array(state.questionCount).fill(null);
  state.questionTimings = new Array(state.questionCount).fill(null);
  state.questionShownAtMs = null;

  setActiveScreen("quiz");
  startExamTimer();
  renderQuestion();
}

function renderQuestion() {
  const q = state.examQuestions[state.currentIndex];
  state.hasAnswered = false;

  const now = state.currentIndex + 1;
  progressTextEl.textContent = `${now}/${state.questionCount}`;

  const topic = q.topic ? `：${q.topic}` : "";
  const diff = q.difficulty ? `（${q.difficulty}）` : "";
  questionNumberEl.textContent = `第${now}問${topic}${diff}`;

  questionTextEl.textContent = q.question;
  feedbackEl.textContent = "";
  feedbackEl.className = "feedback";

  nextButton.textContent = "次へ";
  nextButton.disabled = true;

  choicesEl.innerHTML = "";
  const labels = ["A", "B", "C", "D"];

  q.choices.forEach((choiceText, index) => {
    const button = document.createElement("button");
    button.className = "choice";
    button.type = "button";
    button.dataset.index = index.toString();

    const prefix = document.createElement("span");
    prefix.className = "choice-prefix";
    prefix.textContent = labels[index] ?? "?";

    const labelEl = document.createElement("span");
    labelEl.className = "choice-label";
    labelEl.textContent = choiceText;

    button.appendChild(prefix);
    button.appendChild(labelEl);
    button.addEventListener("click", () => handleChoiceClick(index));

    choicesEl.appendChild(button);
  });

  state.questionShownAtMs = Date.now();
}

function handleChoiceClick(selectedIndex) {
  if (state.hasAnswered) return;
  state.hasAnswered = true;

  const q = state.examQuestions[state.currentIndex];
  const choiceButtons = Array.from(choicesEl.querySelectorAll(".choice"));

  choiceButtons.forEach((btn) => {
    btn.classList.add("disabled");
    const index = Number(btn.dataset.index);

    if (index === q.answerIndex) btn.classList.add("correct");
    else if (index === selectedIndex) btn.classList.add("incorrect");
  });

  const isCorrect = selectedIndex === q.answerIndex;

  const clickMs = Date.now();
  const answerMs = Math.max(
    0,
    clickMs - (state.questionShownAtMs ?? clickMs)
  );
  state.questionTimings[state.currentIndex] = {
    questionId: q.id,
    timeMs: answerMs,
    isCorrect
  };

  state.answers[state.currentIndex] = {
    questionId: q.id,
    selectedIndex,
    correctIndex: q.answerIndex,
    isCorrect
  };

  if (isCorrect) {
    feedbackEl.textContent = "正解！よくできました。";
    feedbackEl.classList.add("correct");
  } else {
    const correctText = q.choices[q.answerIndex];
    feedbackEl.textContent = `不正解… 正しい答えは「${correctText}」。`;
    feedbackEl.classList.add("incorrect");
  }

  nextButton.disabled = false;
  const isLast = state.currentIndex === state.questionCount - 1;
  nextButton.textContent = isLast ? "採点結果を見る" : "次へ";
}

function handleNextClick() {
  const isLast = state.currentIndex === state.questionCount - 1;
  if (isLast) {
    renderResults();
    return;
  }
  state.currentIndex += 1;
  renderQuestion();
}

// ---- 結果 + 履歴（IndexedDB）----
function formatMonthDayTime(date) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return { monthDay: `${m}月${d}日`, time: `${hh}:${mm}` };
}

async function saveAttempt(attempt) {
  const db = await openScienceDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ATTEMPT_STORE_NAME, "readwrite");
    const store = tx.objectStore(ATTEMPT_STORE_NAME);
    const req = store.put(attempt);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("attempt put error"));
  });
}

async function loadAttempts(limit = 5) {
  const db = await openScienceDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ATTEMPT_STORE_NAME, "readonly");
    const store = tx.objectStore(ATTEMPT_STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const all = Array.isArray(req.result) ? req.result : [];
      all.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
      resolve(all.slice(0, limit));
    };
    req.onerror = () =>
      reject(req.error ?? new Error("attempt get error"));
  });
}

async function refreshHistoryUI() {
  if (!historyListEl) return;
  try {
    historyListEl.textContent = "履歴を読み込み中…";
    const attempts = await loadAttempts(5);
    if (!attempts.length) {
      historyListEl.textContent = "履歴はありません";
      return;
    }
    historyListEl.innerHTML = "";
    attempts.forEach((a) => {
      const item = document.createElement("div");
      item.className = "history-item";
      const timeLine =
        a.startLabel && a.endLabel
          ? `<div class="history-item-sub">開始 ${a.startLabel} ／ 終了 ${a.endLabel}</div>`
          : "";
      item.innerHTML = `
        <div class="history-item-top">${a.monthDay} ${a.time}・${a.subjectLabel}</div>
        <div class="history-item-sub">${a.questionCount}問：${a.correctCount}問正解 / ${a.score}点（${a.accuracy.toFixed(
        1
      )}%）</div>
        ${timeLine}
      `;
      historyListEl.appendChild(item);
    });
  } catch (e) {
    console.warn("履歴UI更新失敗", e);
    historyListEl.textContent = "履歴の読み込みに失敗しました";
  }
}

function renderResults() {
  stopElapsedTimerOnly();
  state.examEndedAt = new Date();

  const durationMs =
    state.examStartedAt && state.examEndedAt
      ? state.examEndedAt.getTime() - state.examStartedAt.getTime()
      : 0;

  setActiveScreen("result");

  const timeSummaryEl = document.getElementById("exam-time-summary");
  if (timeSummaryEl && state.examStartedAt && state.examEndedAt) {
    timeSummaryEl.innerHTML = `
      <div><strong>開始</strong>：${formatDateTimeForDisplay(state.examStartedAt)}</div>
      <div><strong>終了</strong>：${formatDateTimeForDisplay(state.examEndedAt)}</div>
      <div><strong>所要時間</strong>：${formatElapsed(durationMs)}（${Math.round(
        durationMs / 1000
      )}秒）</div>
    `;
  } else if (timeSummaryEl) {
    timeSummaryEl.innerHTML = "";
  }

  const labels = ["A", "B", "C", "D"];
  const correctCount = state.answers.filter((a) => a?.isCorrect).length;
  const incorrectCount = state.questionCount - correctCount;
  const score = correctCount * EXAM_CONFIG.pointsPerQuestion;
  const total = state.questionCount * EXAM_CONFIG.pointsPerQuestion;
  const accuracy = (correctCount / state.questionCount) * 100;

  const resultStatsEl = document.getElementById("result-stats");
  resultStatsEl.innerHTML = `
    <div>
      <div class="result-big">${score}点</div>
      <div class="result-sub">合計${total}点</div>
    </div>
    <div>
      <div class="result-big">${accuracy.toFixed(1)}%</div>
      <div class="result-sub">正答率</div>
    </div>
    <div>
      <div class="result-big">${correctCount}問</div>
      <div class="result-sub">正解数</div>
    </div>
    <div>
      <div class="result-big">${incorrectCount}問</div>
      <div class="result-sub">不正解数</div>
    </div>
  `;

  const wrongEl = document.getElementById("wrong-questions");
  const wrongItems = state.answers
    .map((a, idx) => ({ a, idx, q: state.examQuestions[idx] }))
    .filter(({ a }) => a && !a.isCorrect);

  if (wrongItems.length === 0) {
    wrongEl.innerHTML = `<div class="wrong-item">全問正解！お見事です。</div>`;
  } else {
    wrongEl.innerHTML = "";
    wrongItems.forEach(({ a, idx, q }) => {
      const wrongChoiceText = q.choices[a.selectedIndex];
      const correctChoiceText = q.choices[a.correctIndex];

      const item = document.createElement("div");
      item.className = "wrong-item";
      item.innerHTML = `
        <div class="wrong-q-head">
          <div class="wrong-q-title">第${idx + 1}問：${q.topic}</div>
          <div class="wrong-meta">${q.category} / ${q.difficulty}</div>
        </div>
        <div class="explanation">
          <div class="wrong-choice">問題：${q.question}</div>
          <div class="wrong-choice">あなたの選択：${labels[a.selectedIndex]}（${wrongChoiceText}）</div>
          <div class="wrong-choice">正解：${labels[a.correctIndex]}（${correctChoiceText}）</div>
          <div class="explanation" style="margin-top: 8px;">${q.explanation}</div>
        </div>
      `;
      wrongEl.appendChild(item);
    });
  }

  // 履歴保存（attempts ストアは keyPath = id）
  const now = new Date();
  const { monthDay, time } = formatMonthDayTime(now);
  const subjectLabel = SUBJECTS[state.subjectKey]?.label ?? state.subjectKey;
  const wrongQuestionIds = wrongItems.map(({ q }) => q.id);
  const wrongDetails = wrongItems.map(({ a, idx, q }) => ({
    questionIndex: idx + 1,
    questionId: q.id,
    topic: q.topic ?? "",
    category: q.category ?? "",
    question: q.question ?? "",
    selectedLabel: labels[a.selectedIndex] ?? "?",
    selectedText: q.choices?.[a.selectedIndex] ?? "",
    correctLabel: labels[a.correctIndex] ?? "?",
    correctText: q.choices?.[a.correctIndex] ?? "",
    explanation: q.explanation ?? ""
  }));

  saveAttempt({
    id: now.getTime(),
    at: now.getTime(),
    subjectKey: state.subjectKey,
    subjectLabel,
    questionCount: state.questionCount,
    correctCount,
    incorrectCount,
    score,
    accuracy,
    monthDay,
    time,
    wrongQuestionIds,
    wrongDetails,
    startedAtIso: state.examStartedAt
      ? state.examStartedAt.toISOString()
      : null,
    endedAtIso: state.examEndedAt ? state.examEndedAt.toISOString() : null,
    startLabel: state.examStartedAt
      ? formatDateTimeForDisplay(state.examStartedAt)
      : null,
    endLabel: state.examEndedAt
      ? formatDateTimeForDisplay(state.examEndedAt)
      : null,
    durationMs:
      state.examStartedAt && state.examEndedAt
        ? state.examEndedAt.getTime() - state.examStartedAt.getTime()
        : null,
    questionTimings: (state.questionTimings ?? [])
      .map((t, i) =>
        t
          ? {
              questionIndex: i + 1,
              questionId: t.questionId,
              timeMs: t.timeMs,
              isCorrect: t.isCorrect
            }
          : null
      )
      .filter(Boolean)
  }).catch((e) => console.warn("履歴保存に失敗", e));

  state.examStartedAt = null;
  state.examEndedAt = null;

  refreshHistoryUI();
}

// ---- イベント ----
startButton.addEventListener("click", startExam);
restartButton.addEventListener("click", () => {
  stopExamTimers();
  state.examStartedAt = null;
  state.examEndedAt = null;
  state.questionShownAtMs = null;
  state.questionTimings = [];
  if (elapsedTimeEl) elapsedTimeEl.textContent = "経過：0:00";
  updateExamMeta();
  setActiveScreen("select");
  refreshHistoryUI();
});
nextButton.addEventListener("click", handleNextClick);
questionCountSelect?.addEventListener("change", updateExamMeta);

setActiveScreen("select");
updateExamMeta();
refreshHistoryUI();

// データロード開始（キャッシュ優先）
loadAllData();

