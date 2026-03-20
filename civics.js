// 公民分野の問題データ
// difficulty: "easy" | "normal" | "hard"
//
// 注意：これはまず「200問ずつ動作確認できる」ためのサンプル生成です。

const CIVICS_TOPICS = [
  "日本国憲法の基本原理",
  "国会",
  "内閣",
  "裁判所",
  "地方自治",
  "私たちの暮らし",
  "契約",
  "税のしくみ",
  "労働と社会",
  "消費者とルール"
];

const CIVICS_QUESTION_COUNT = 200;

function makeCivicsQuestion(i) {
  const topic = CIVICS_TOPICS[(i - 1) % CIVICS_TOPICS.length];
  const diffCycle = ["easy", "normal", "hard"];
  const difficulty = diffCycle[(i - 1) % diffCycle.length];

  const choices = [
    `${topic}の内容A（${i}）`,
    `${topic}の内容B（${i}）`,
    `${topic}の内容C（${i}）`,
    `${topic}の内容D（${i}）`
  ];

  const answerIndex = i % 4;

  return {
    id: `civ-${String(i).padStart(3, "0")}`,
    category: "公民",
    topic,
    difficulty,
    question: `【${topic}】第${i}問：次のうち正しいものを選びなさい。（サンプル）`,
    choices,
    answerIndex,
    explanation: `解説（サンプル）：${topic}について。正答は「${choices[answerIndex]}」です。`
  };
}

const CIVICS_QUESTIONS = Array.from(
  { length: CIVICS_QUESTION_COUNT },
  (_, idx) => makeCivicsQuestion(idx + 1)
);

