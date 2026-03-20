// 地理分野の問題データ
// difficulty: "easy" | "normal" | "hard"
//
// 注意：これはまず「200問ずつ動作確認できる」ためのサンプル生成です。
// 本番の問題に置き換える場合は makeGeographyQuestion を元にした形のまま差し替えてください。

const GEOGRAPHY_TOPICS = [
  "日本の地形",
  "都道府県",
  "気候",
  "自然環境",
  "産業（農業）",
  "産業（工業）",
  "資源・エネルギー",
  "交通・通信",
  "人口・都市",
  "防災（災害）"
];

const GEOGRAPHY_QUESTION_COUNT = 200;

function makeGeographyQuestion(i) {
  const topic = GEOGRAPHY_TOPICS[(i - 1) % GEOGRAPHY_TOPICS.length];
  const diffCycle = ["easy", "normal", "hard"];
  const difficulty = diffCycle[(i - 1) % diffCycle.length];

  const choices = [
    `${topic}の内容A（${i}）`,
    `${topic}の内容B（${i}）`,
    `${topic}の内容C（${i}）`,
    `${topic}の内容D（${i}）`
  ];

  const answerIndex = (i - 1) % 4;

  return {
    id: `geo-${String(i).padStart(3, "0")}`,
    category: "地理",
    topic,
    difficulty,
    question: `【${topic}】第${i}問：次のうち正しいものを選びなさい。（サンプル）`,
    choices,
    answerIndex,
    explanation: `解説（サンプル）：${topic}について。正答は「${choices[answerIndex]}」です。`
  };
}

const GEOGRAPHY_QUESTIONS = Array.from(
  { length: GEOGRAPHY_QUESTION_COUNT },
  (_, idx) => makeGeographyQuestion(idx + 1)
);

