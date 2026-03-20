// 画面要素
const screenSelect = document.getElementById("screen-select");
const screenQuiz = document.getElementById("screen-quiz");
const screenResult = document.getElementById("screen-result");

const subjectSelect = document.getElementById("subject-select");
const startButton = document.getElementById("start-button");
const restartButton = document.getElementById("restart-button");

const progressTextEl = document.getElementById("progress-text");
const questionNumberEl = document.getElementById("question-number");
const questionTextEl = document.getElementById("question-text");
const choicesEl = document.getElementById("choices");
const feedbackEl = document.getElementById("feedback");
const nextButton = document.getElementById("next-button");
const dataFallback = document.getElementById("data-fallback");
const dataFileInput = document.getElementById("data-file-input");
const questionCountSelect = document.getElementById("question-count-select");
const examMetaQuestionCountEl = document.getElementById(
  "exam-meta-question-count"
);
const examMetaTotalPointsEl = document.getElementById(
  "exam-meta-total-points"
);

// 試験設定（各問題2点）
const EXAM_CONFIG = {
  pointsPerQuestion: 2
};

const SUBJECT_LABELS = {
  geography: "地理",
  history: "歴史",
  civics: "公民"
};

// どのURL階層で index.html が開かれても data/ から読めるように絶対URL化
const DATA_PATH = new URL(
  "./data/social_questions_j1_j2_600.json",
  window.location.href
).toString();
const DATA_CACHE_KEY = "social_questions_j1_j2_600";

const CACHE_DB_NAME = "socialQuizDB";
const CACHE_STORE_NAME = "files";
const ATTEMPT_STORE_NAME = "attempts";
const HISTORY_LIMIT = 5;

let normalizedBySubject = null;
let isDataLoaded = false;
let dataLoadError = null;

function setLoadingStatus(text) {
  const statusEl = document.getElementById("data-status");
  statusEl.textContent = text;
}

function showDataFallback() {
  if (dataFallback) dataFallback.classList.remove("is-hidden");
}

function hideDataFallback() {
  if (dataFallback) dataFallback.classList.add("is-hidden");
}

function applyLoadedJson(json, options = {}) {
  const subjects = json?.subjects ?? {};

  normalizedBySubject = {
    geography: (subjects.geography ?? []).map(normalizeQuestion),
    history: (subjects.history ?? []).map(normalizeQuestion),
    civics: (subjects.civics ?? []).map(normalizeQuestion)
  };

  const hasAny =
    normalizedBySubject.geography.length > 0 ||
    normalizedBySubject.history.length > 0 ||
    normalizedBySubject.civics.length > 0;

  if (!hasAny) {
    throw new Error("subjects に問題データが見つかりません。");
  }

  isDataLoaded = true;
  dataLoadError = null;
  const sourceText =
    options?.source === "cache"
      ? "データ読み込み完了（キャッシュ）"
      : "データ読み込み完了";
  setLoadingStatus(sourceText);
  hideDataFallback();
  startButton.disabled = false;

  // キャッシュ（待たずに保存）
  cacheJson(json).catch((e) => {
    console.warn("キャッシュ保存に失敗しました", e);
  });
}

function openCacheDB() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB が利用できません。"));
      return;
    }

    const req = indexedDB.open(CACHE_DB_NAME, 2);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
        db.createObjectStore(CACHE_STORE_NAME, { keyPath: "key" });
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

async function getCachedJson() {
  const db = await openCacheDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE_NAME, "readonly");
    const store = tx.objectStore(CACHE_STORE_NAME);
    const req = store.get(DATA_CACHE_KEY);

    req.onsuccess = () => resolve(req.result?.json ?? null);
    req.onerror = () =>
      reject(req.error ?? new Error("IndexedDB get error"));
  });
}

async function cacheJson(json) {
  const db = await openCacheDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE_NAME, "readwrite");
    const store = tx.objectStore(CACHE_STORE_NAME);
    const req = store.put({ key: DATA_CACHE_KEY, json });

    req.onsuccess = () => resolve();
    req.onerror = () =>
      reject(req.error ?? new Error("IndexedDB put error"));
  });
}

function formatMonthDayTime(date) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return { monthDay: `${m}月${d}日`, time: `${hh}:${mm}` };
}

async function saveAttempt(attempt) {
  const db = await openCacheDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(ATTEMPT_STORE_NAME, "readwrite");
    const store = tx.objectStore(ATTEMPT_STORE_NAME);
    const req = store.put(attempt);

    req.onsuccess = () => resolve();
    req.onerror = () =>
      reject(req.error ?? new Error("IndexedDB attempt put error"));
  });
}

async function loadAttempts(limit = HISTORY_LIMIT) {
  const db = await openCacheDB();

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
      reject(req.error ?? new Error("IndexedDB attempt get error"));
  });
}

async function refreshHistoryUI() {
  const listEl = document.getElementById("history-list");
  if (!listEl) return;

  try {
    listEl.textContent = "履歴を読み込み中…";
    const attempts = await loadAttempts(HISTORY_LIMIT);

    if (!attempts.length) {
      listEl.textContent = "履歴はありません";
      return;
    }

    listEl.innerHTML = "";
    attempts.forEach((a) => {
      const item = document.createElement("div");
      item.className = "history-item";

      item.innerHTML = `
        <div class="history-item-top">
          ${a.monthDay} ${a.time}・${a.subjectLabel}
        </div>
        <div class="history-item-sub">
          ${a.questionCount}問：${a.correctCount}問正解 / ${a.score}点（${a.accuracy.toFixed(
            1
          )}%）
        </div>
      `;

      listEl.appendChild(item);
    });
  } catch (e) {
    console.error(e);
    const listEl2 = document.getElementById("history-list");
    if (listEl2) listEl2.textContent = "履歴の読み込みに失敗しました";
  }
}

function normalizeQuestion(raw) {
  const subjectKey = raw.category;

  return {
    id: raw.id,
    category: SUBJECT_LABELS[subjectKey] ?? subjectKey,
    topic: raw.subtopic ?? raw.topic ?? "",
    difficulty: raw.difficulty ?? "",
    question: raw.text ?? raw.question ?? "",
    choices: Array.isArray(raw.choices) ? raw.choices : [],
    answerIndex: raw.answer_index ?? raw.answerIndex,
    explanation: raw.explanation ?? ""
  };
}

async function loadQuestionData() {
  startButton.disabled = true;
  dataLoadError = null;
  setLoadingStatus("データを読み込み中…");

  try {
    const res = await fetch(DATA_PATH, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const json = await res.json();
    applyLoadedJson(json, { source: "fetch" });
  } catch (e) {
    console.error(e);
    dataLoadError = e;
    const message = e instanceof Error ? e.message : String(e);
    isDataLoaded = false;
    startButton.disabled = true;
    showDataFallback();
    setLoadingStatus(
      `データの読み込みに失敗しました。(${message})`
    );
  }
}

const state = {
  subjectKey: "geography",
  questionCount: Number(questionCountSelect?.value ?? 50),
  examQuestions: [],
  currentIndex: 0,
  hasAnswered: false,
  // 各問題の選択結果を保持
  answers: []
};

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

function setActiveScreen(which) {
  const map = {
    select: screenSelect,
    quiz: screenQuiz,
    result: screenResult
  };

  Object.values(map).forEach((el) => el.classList.remove("is-active"));
  map[which].classList.add("is-active");
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function pickRandomUniqueQuestions(pool, count) {
  const arr = pool.slice();
  shuffleInPlace(arr);
  return arr.slice(0, count);
}

function startExam() {
  if (!isDataLoaded || !normalizedBySubject) {
    if (dataLoadError) {
      alert(
        "問題データの読み込みに失敗しています。\n" +
          "このページはブラウザの「ファイル直開き」だと `fetch` が失敗することがあります。\n" +
          "ローカルサーバ経由で開いてください。"
      );
      return;
    }
    alert("問題データを読み込み中です。少し待ってから開始してください。");
    return;
  }

  const subjectKey = subjectSelect.value;
  const pool = normalizedBySubject[subjectKey] ?? [];

  state.subjectKey = subjectKey;
  updateExamMeta();
  state.examQuestions = [];
  state.currentIndex = 0;
  state.hasAnswered = false;
  state.answers = [];

  if (pool.length < state.questionCount) {
    // このケースは通常起きない（200問データを用意するため）
    const label = SUBJECT_LABELS[subjectKey] ?? subjectKey;
    alert(
      `問題データが不足しています（${label}：${pool.length}問）。出題数：${state.questionCount}問`
    );
    return;
  }

  // 同じ試験内で重複出題しない：shuffle→sliceでユニークに抽出
  state.examQuestions = pickRandomUniqueQuestions(pool, state.questionCount);
  state.answers = new Array(state.questionCount).fill(null);

  setActiveScreen("quiz");
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

    const label = document.createElement("span");
    label.className = "choice-label";
    label.textContent = choiceText;

    button.appendChild(prefix);
    button.appendChild(label);

    button.addEventListener("click", () => handleChoiceClick(index));

    choicesEl.appendChild(button);
  });
}

function handleChoiceClick(selectedIndex) {
  if (state.hasAnswered) return;
  state.hasAnswered = true;

  const q = state.examQuestions[state.currentIndex];
  const choiceButtons = Array.from(choicesEl.querySelectorAll(".choice"));

  choiceButtons.forEach((btn) => {
    btn.classList.add("disabled");
    const index = Number(btn.dataset.index);

    if (index === q.answerIndex) {
      btn.classList.add("correct");
    } else if (index === selectedIndex) {
      btn.classList.add("incorrect");
    }
  });

  const isCorrect = selectedIndex === q.answerIndex;
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

function renderResults() {
  setActiveScreen("result");

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

  // 実施履歴を保存（直近表示用）
  const now = new Date();
  const { monthDay, time } = formatMonthDayTime(now);
  const subjectLabel = SUBJECT_LABELS[state.subjectKey] ?? state.subjectKey;
  const wrongQuestionIds = wrongItems.map(({ q }) => q.id);

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
    wrongQuestionIds
  }).catch((e) => console.warn("履歴保存に失敗", e));
}

startButton.addEventListener("click", startExam);
restartButton.addEventListener("click", () => {
  updateExamMeta();
  setActiveScreen("select");
  refreshHistoryUI();
});
nextButton.addEventListener("click", handleNextClick);

// 初期状態：分野選択画面
setActiveScreen("select");
updateExamMeta();
questionCountSelect?.addEventListener("change", updateExamMeta);
refreshHistoryUI();

// JSONを読み込んでから開始できるようにする（キャッシュ優先）
async function initQuestionData() {
  startButton.disabled = true;
  dataLoadError = null;
  setLoadingStatus("データを読み込み中…");

  try {
    const cached = await getCachedJson();
    if (cached) {
      applyLoadedJson(cached, { source: "cache" });
      return;
    }
  } catch (e) {
    // キャッシュが使えなくても fetch フォールバックへ進む
    console.warn("キャッシュ読み込みに失敗", e);
  }

  await loadQuestionData();
}

initQuestionData();

// フォールバック：ローカルファイル選択（file直開き対策）
dataFileInput?.addEventListener("change", async (ev) => {
  const file = ev.target?.files?.[0];
  if (!file) return;

  setLoadingStatus("ローカルJSONを読み込み中…");
  startButton.disabled = true;

  try {
    const text = await file.text();
    const json = JSON.parse(text);
    applyLoadedJson(json, { source: "local" });
  } catch (e) {
    console.error(e);
    startButton.disabled = true;
    dataLoadError = e;
    const message = e instanceof Error ? e.message : String(e);
    setLoadingStatus(`JSONの読み込みに失敗しました。(${message})`);
  }
});

