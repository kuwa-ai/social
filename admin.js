/**
 * 理科クイズ — 実施データ管理（script.js と同じ IndexedDB）
 */
const CACHE_DB_NAME = "scienceQuizDB";
const QUESTION_CACHE_STORE_NAME = "question_cache";
const ATTEMPT_STORE_NAME = "attempts";

let cachedAttempts = [];
const expandedIds = new Set();

function openScienceAdminDB() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB が利用できません。"));
      return;
    }

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

function loadAllAttempts() {
  return openScienceAdminDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(ATTEMPT_STORE_NAME, "readonly");
        const store = tx.objectStore(ATTEMPT_STORE_NAME);
        const req = store.getAll();

        req.onsuccess = () => {
          const all = Array.isArray(req.result) ? req.result : [];
          all.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
          resolve(all);
        };
        req.onerror = () =>
          reject(req.error ?? new Error("IndexedDB getAll error"));
      })
  );
}

function clearAllAttempts() {
  return openScienceAdminDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(ATTEMPT_STORE_NAME, "readwrite");
        tx.objectStore(ATTEMPT_STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

function formatMs(ms) {
  if (ms == null || Number.isNaN(Number(ms))) return "—";
  const n = Number(ms);
  const totalSec = Math.round(n / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

function formatMsShort(ms) {
  if (ms == null || Number.isNaN(Number(ms))) return "—";
  const sec = (Number(ms) / 1000).toFixed(1);
  return `${sec}秒`;
}

function avgAnswerMs(questionTimings) {
  if (!Array.isArray(questionTimings) || !questionTimings.length) return null;
  const sum = questionTimings.reduce((a, x) => a + (Number(x.timeMs) || 0), 0);
  return sum / questionTimings.length;
}

function downloadText(filename, text, mime) {
  const blob = new Blob([text], {
    type: mime || "text/plain;charset=utf-8"
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function escapeCsvField(s) {
  const str = s == null ? "" : String(s);
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function rowToCsv(fields) {
  return fields.map(escapeCsvField).join(",");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 展開パネル用：不正解の問題文・選択・正解・解説 */
function buildWrongDetailsSectionHtml(a) {
  const wd = Array.isArray(a.wrongDetails) ? a.wrongDetails : [];
  const ids = Array.isArray(a.wrongQuestionIds) ? a.wrongQuestionIds : [];
  let inner = '<div class="admin-wrong-section">';
  inner += '<h4 class="admin-subheading">間違えた問題</h4>';

  if (wd.length > 0) {
    wd.forEach((w) => {
      inner += "<article class=\"wrong-block\">";
      inner += `<div class="wrong-block-head">第${escapeHtml(
        String(w.questionIndex ?? "")
      )}問`;
      if (w.topic) inner += ` · ${escapeHtml(w.topic)}`;
      inner += ` <span class="mono">id:${escapeHtml(
        String(w.questionId ?? "")
      )}</span></div>`;
      if (w.category) {
        inner += `<div class="wrong-block-meta">${escapeHtml(w.category)}</div>`;
      }
      inner += `<p class="wrong-block-q"><strong>問題</strong> ${escapeHtml(
        w.question ?? ""
      )}</p>`;
      inner += `<p class="wrong-block-ans wrong"><strong>選択した答え</strong> ${escapeHtml(
        w.selectedLabel ?? ""
      )}（${escapeHtml(w.selectedText ?? "")}）</p>`;
      inner += `<p class="wrong-block-ans correct"><strong>正解</strong> ${escapeHtml(
        w.correctLabel ?? ""
      )}（${escapeHtml(w.correctText ?? "")}）</p>`;
      if (w.explanation) {
        inner += `<div class="wrong-block-exp"><strong>解説</strong> ${escapeHtml(
          w.explanation
        )}</div>`;
      }
      inner += "</article>";
    });
  } else if (ids.length > 0) {
    inner += `<p>詳細文は未保存です。問題ID: <span class="mono">${ids
      .map((id) => escapeHtml(String(id)))
      .join(", ")}</span></p>`;
  } else if ((a.incorrectCount ?? 0) > 0) {
    inner += `<p>不正解は ${escapeHtml(
      String(a.incorrectCount)
    )} 問ありますが、この記録には問題文などの詳細がありません（古い記録の可能性があります）。</p>`;
  } else {
    inner += '<p class="wrong-none">不正解はありません。</p>';
  }
  inner += "</div>";
  return inner;
}

function getFilteredList() {
  const filter = document.getElementById("filter-subject").value;
  if (!filter) return cachedAttempts;
  return cachedAttempts.filter((a) => a.subjectKey === filter);
}

function showMessage(text, isError) {
  const el = document.getElementById("admin-message");
  el.textContent = text;
  el.classList.toggle("error", !!isError);
  el.classList.remove("is-hidden");
}

function hideMessage() {
  document.getElementById("admin-message").classList.add("is-hidden");
}

function render() {
  const list = getFilteredList();
  const statsEl = document.getElementById("admin-stats");

  const totalDuration = list.reduce(
    (s, a) => s + (Number(a.durationMs) || 0),
    0
  );
  const withTiming = list.filter(
    (a) => Array.isArray(a.questionTimings) && a.questionTimings.length
  );
  let avgAllMs = null;
  if (withTiming.length) {
    const avgs = withTiming.map((a) => avgAnswerMs(a.questionTimings));
    avgAllMs = avgs.reduce((x, y) => x + y, 0) / avgs.length;
  }

  statsEl.innerHTML = `
    <div class="stat-card">
      <div class="label">記録件数</div>
      <div class="value">${list.length}</div>
      <div class="sub">フィルタ後</div>
    </div>
    <div class="stat-card">
      <div class="label">合計試験時間</div>
      <div class="value">${formatMs(totalDuration)}</div>
      <div class="sub">${Math.round(totalDuration / 1000)}秒</div>
    </div>
    <div class="stat-card">
      <div class="label">平均・問あたり回答</div>
      <div class="value">${avgAllMs != null ? formatMsShort(avgAllMs) : "—"}</div>
      <div class="sub">表示〜選択まで</div>
    </div>
  `;

  const tbody = document.getElementById("attempts-tbody");
  tbody.innerHTML = "";

  if (!list.length) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td colspan="7">データがありません。クイズを最後まで完了すると記録されます。</td>';
    tbody.appendChild(tr);
    return;
  }

  list.forEach((a) => {
    const tr = document.createElement("tr");
    const recordLabel =
      a.startLabel && a.endLabel
        ? `${a.startLabel} 〜 ${a.endLabel}`
        : `${a.monthDay ?? ""} ${a.time ?? ""}`.trim() || String(a.at ?? "");

    const avg = avgAnswerMs(a.questionTimings);

    const wrongN =
      a.incorrectCount != null
        ? a.incorrectCount
        : Array.isArray(a.wrongDetails)
          ? a.wrongDetails.length
          : Array.isArray(a.wrongQuestionIds)
            ? a.wrongQuestionIds.length
            : "—";

    tr.innerHTML = `
      <td class="mono">${escapeHtml(recordLabel)}</td>
      <td>${escapeHtml(a.subjectLabel ?? a.subjectKey ?? "")}</td>
      <td>${a.correctCount ?? "?"}/${a.questionCount ?? "?"} 正解 · ${
        a.score ?? "?"
      }点（${Number(a.accuracy ?? 0).toFixed(1)}%）</td>
      <td class="mono wrong-count-cell${
        Number(wrongN) > 0 ? " has-wrong" : ""
      }">${wrongN === "—" ? "—" : `${wrongN}問`}</td>
      <td class="mono">${
        a.durationMs != null ? formatMs(a.durationMs) : "—"
      }</td>
      <td class="mono">${avg != null ? formatMsShort(avg) : "—"}</td>
      <td><button type="button" class="btn-toggle" data-id="${a.id}">${
        expandedIds.has(a.id) ? "閉じる" : "開く"
      }</button></td>
    `;
    tbody.appendChild(tr);

    if (expandedIds.has(a.id)) {
      const detailTr = document.createElement("tr");
      detailTr.className = "detail-row";
      const qt = a.questionTimings || [];
      let inner = `<div class="detail-inner"><p><strong>記録ID</strong> <span class="mono">${escapeHtml(
        String(a.id)
      )}</span></p>`;
      inner += `<p class="mono">開始: ${escapeHtml(
        a.startedAtIso ?? "—"
      )}<br>終了: ${escapeHtml(a.endedAtIso ?? "—")}</p>`;

      inner += buildWrongDetailsSectionHtml(a);

      inner += '<h4 class="admin-subheading">回答時間の内訳</h4>';

      if (qt.length) {
        inner +=
          "<table><thead><tr><th>問</th><th>問題ID</th><th>回答まで</th><th>正誤</th></tr></thead><tbody>";
        qt.forEach((q) => {
          inner += `<tr><td>${escapeHtml(String(q.questionIndex))}</td><td class="mono">${escapeHtml(
            String(q.questionId)
          )}</td><td>${formatMs(q.timeMs)}</td><td>${
            q.isCorrect ? "○" : "×"
          }</td></tr>`;
        });
        inner += "</tbody></table>";
      } else {
        inner +=
          "<p>この記録には問ごとの時間がありません（実装前のデータ、または未保存です）。</p>";
      }
      inner += "</div>";
      detailTr.innerHTML = `<td colspan="7">${inner}</td>`;
      tbody.appendChild(detailTr);
    }
  });
}

function exportCsvSummary(list) {
  const headers = [
    "id",
    "at",
    "subjectKey",
    "subjectLabel",
    "questionCount",
    "correctCount",
    "score",
    "accuracy",
    "startedAtIso",
    "endedAtIso",
    "durationMs",
    "durationSec",
    "avgAnswerTimeMs",
    "recordMonthDay",
    "recordTime"
  ];
  const lines = [rowToCsv(headers)];
  list.forEach((a) => {
    const avg = avgAnswerMs(a.questionTimings);
    lines.push(
      rowToCsv([
        a.id,
        a.at,
        a.subjectKey,
        a.subjectLabel,
        a.questionCount,
        a.correctCount,
        a.score,
        a.accuracy,
        a.startedAtIso,
        a.endedAtIso,
        a.durationMs,
        a.durationMs != null ? (a.durationMs / 1000).toFixed(2) : "",
        avg != null ? Math.round(avg) : "",
        a.monthDay,
        a.time
      ])
    );
  });
  return "\uFEFF" + lines.join("\r\n");
}

function exportCsvDetail(list) {
  const headers = [
    "attemptId",
    "subjectKey",
    "subjectLabel",
    "questionIndex",
    "questionId",
    "timeMs",
    "timeSec",
    "isCorrect",
    "startedAtIso",
    "endedAtIso",
    "examDurationMs"
  ];
  const lines = [rowToCsv(headers)];
  list.forEach((a) => {
    const qt = a.questionTimings || [];
    if (!qt.length) {
      lines.push(
        rowToCsv([
          a.id,
          a.subjectKey,
          a.subjectLabel,
          "",
          "",
          "",
          "",
          "",
          a.startedAtIso,
          a.endedAtIso,
          a.durationMs
        ])
      );
      return;
    }
    qt.forEach((q) => {
      lines.push(
        rowToCsv([
          a.id,
          a.subjectKey,
          a.subjectLabel,
          q.questionIndex,
          q.questionId,
          q.timeMs,
          q.timeMs != null ? (q.timeMs / 1000).toFixed(3) : "",
          q.isCorrect,
          a.startedAtIso,
          a.endedAtIso,
          a.durationMs
        ])
      );
    });
  });
  return "\uFEFF" + lines.join("\r\n");
}

function exportCsvWrong(list) {
  const headers = [
    "attemptId",
    "subjectKey",
    "subjectLabel",
    "questionIndex",
    "questionId",
    "topic",
    "category",
    "question",
    "selectedLabel",
    "selectedText",
    "correctLabel",
    "correctText",
    "explanation"
  ];
  const lines = [rowToCsv(headers)];
  list.forEach((a) => {
    const wd = Array.isArray(a.wrongDetails) ? a.wrongDetails : [];
    wd.forEach((w) => {
      lines.push(
        rowToCsv([
          a.id,
          a.subjectKey,
          a.subjectLabel,
          w.questionIndex,
          w.questionId,
          w.topic,
          w.category,
          w.question,
          w.selectedLabel,
          w.selectedText,
          w.correctLabel,
          w.correctText,
          w.explanation
        ])
      );
    });
  });
  return "\uFEFF" + lines.join("\r\n");
}

async function load() {
  hideMessage();
  try {
    cachedAttempts = await loadAllAttempts();
    render();
  } catch (e) {
    console.error(e);
    showMessage(
      "IndexedDB の読み込みに失敗しました: " + (e?.message || String(e)),
      true
    );
  }
}

document.getElementById("btn-reload").addEventListener("click", () => {
  expandedIds.clear();
  load();
});

document.getElementById("filter-subject").addEventListener("change", () => {
  render();
});

document.getElementById("attempts-tbody").addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-toggle");
  if (!btn) return;
  const id = Number(btn.dataset.id);
  if (Number.isNaN(id)) return;
  if (expandedIds.has(id)) expandedIds.delete(id);
  else expandedIds.add(id);
  render();
});

document.getElementById("btn-export-json").addEventListener("click", () => {
  const list = getFilteredList();
  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
  downloadText(
    `science-quiz-attempts-${stamp}.json`,
    JSON.stringify(list, null, 2),
    "application/json;charset=utf-8"
  );
});

document.getElementById("btn-export-csv-summary").addEventListener("click", () => {
  const list = getFilteredList();
  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
  downloadText(
    `science-quiz-summary-${stamp}.csv`,
    exportCsvSummary(list),
    "text/csv;charset=utf-8"
  );
});

document.getElementById("btn-export-csv-detail").addEventListener("click", () => {
  const list = getFilteredList();
  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
  downloadText(
    `science-quiz-per-question-${stamp}.csv`,
    exportCsvDetail(list),
    "text/csv;charset=utf-8"
  );
});

document.getElementById("btn-export-csv-wrong").addEventListener("click", () => {
  const list = getFilteredList();
  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
  downloadText(
    `science-quiz-wrong-${stamp}.csv`,
    exportCsvWrong(list),
    "text/csv;charset=utf-8"
  );
});

document.getElementById("btn-clear-all").addEventListener("click", async () => {
  if (
    !confirm(
      "保存されている試験記録をすべて削除します。よろしいですか？（元に戻せません）"
    )
  ) {
    return;
  }
  if (!confirm("本当に全削除しますか？")) return;
  try {
    await clearAllAttempts();
    expandedIds.clear();
    cachedAttempts = [];
    render();
    showMessage("すべての記録を削除しました。", false);
  } catch (e) {
    console.error(e);
    showMessage("削除に失敗しました: " + (e?.message || String(e)), true);
  }
});

load();
