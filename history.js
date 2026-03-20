// 歴史分野の問題データ
// difficulty: "easy" | "normal" | "hard"
//
// 注意：これはまず「200問ずつ動作確認できる」ためのサンプル生成です。

const HISTORY_TOPICS = [
  "縄文・弥生",
  "古墳と飛鳥",
  "奈良時代",
  "平安時代",
  "鎌倉時代",
  "室町時代",
  "戦国・安土桃山",
  "江戸時代",
  "明治・大正",
  "昭和（戦後含む）"
];

const HISTORY_QUESTION_COUNT = 200;

function makeHistoryQuestion(i) {
  const topic = HISTORY_TOPICS[(i - 1) % HISTORY_TOPICS.length];
  const diffCycle = ["easy", "normal", "hard"];
  const difficulty = diffCycle[(i - 1) % diffCycle.length];

  const choices = [
    `${topic}の内容A（${i}）`,
    `${topic}の内容B（${i}）`,
    `${topic}の内容C（${i}）`,
    `${topic}の内容D（${i}）`
  ];

  const answerIndex = (i + 1) % 4;

  return {
    id: `his-${String(i).padStart(3, "0")}`,
    category: "歴史",
    topic,
    difficulty,
    question: `【${topic}】第${i}問：次のうち正しいものを選びなさい。（サンプル）`,
    choices,
    answerIndex,
    explanation: `解説（サンプル）：${topic}について。正答は「${choices[answerIndex]}」です。`
  };
}

const HISTORY_QUESTIONS = Array.from(
  { length: HISTORY_QUESTION_COUNT },
  (_, idx) => makeHistoryQuestion(idx + 1)
);

