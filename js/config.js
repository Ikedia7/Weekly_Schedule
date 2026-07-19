/**
 * アプリ全体の設定（マスタデータ）
 * - 教科と画像の紐付け
 * - 表示日数や時限数などの基本ルール
 *
 * ここを編集/LocalStorage経由で上書きすると、教科の追加や画像差し替えができる。
 */
window.App = window.App || {};

App.config = {
  // 表示できる日数の範囲（要件: 最小5日〜最大9日）
  minDays: 5,
  maxDays: 9,
  defaultDays: 6,

  // 曜日の日本語表記（Date.getDay() の 0=日曜 起点）
  dayOfWeekLabels: ["日", "月", "火", "水", "木", "金", "土"],

  // 予定表の行構成（初期レイアウト）。先生が「予定表のレイアウト編集」画面で
  // 自由に追加・削除・並べ替えできる。ここは初回起動時の初期値。
  // type: "text"=自由記述（複数行）/ "subject"=教科プルダウン+イラスト / "check"=○×
  defaultLayout: [
    { id: "section_notice", label: "お知らせ", type: "text" },
    { id: "section_morning", label: "朝", type: "subject" },
    { id: "section_period1", label: "1", type: "subject" },
    { id: "section_period2", label: "2", type: "subject" },
    { id: "section_period3", label: "3", type: "subject" },
    { id: "section_period4", label: "4", type: "subject" },
    { id: "section_lunch", label: "給食", type: "check" },
    { id: "section_cleaning", label: "そうじ", type: "check" },
    { id: "section_period5", label: "5", type: "subject" },
    { id: "section_period6", label: "6", type: "subject" },
    { id: "section_gohome", label: "帰り", type: "subject" },
    { id: "section_belongings", label: "持ち物", type: "text" },
    { id: "section_yotsuba", label: "下校", type: "text" },
  ],

  // 教科マスタ: id, 表示名, 画像パスの組。
  // 実際に使われているLocalStorageの内容（教科の削除・画像差し替え）に合わせた初期値。
  subjects: [
    { id: "kokugo", name: "国語", image: "images/library/2_動き・様子/204_行動・行為/204011勉強する.gif" },
    { id: "sansu", name: "算数", image: "images/library/2_動き・様子/204_行動・行為/204011勉強する.gif" },
    { id: "rika", name: "理科", image: "images/library/6_文化・社会/602_学校/602047理科.gif" },
    { id: "shakai", name: "社会", image: "images/library/6_文化・社会/602_学校/602048社会.gif" },
    { id: "ongaku", name: "音楽", image: "images/library/6_文化・社会/602_学校/602052音楽（科目）.gif" },
    { id: "zukou", name: "図工", image: "images/library/6_文化・社会/602_学校/602051図工（美術）.gif" },
    { id: "taiiku", name: "体育", image: "images/library/6_文化・社会/602_学校/602049体育.gif" },
    { id: "doutoku", name: "道徳", image: "images/library/2_動き・様子/201_感情・感覚/201024気持ち.gif" },
    { id: "gaikokugo", name: "外国語", image: "images/library/6_文化・社会/602_学校/602056英語.gif" },
    { id: "sougou", name: "総合", image: "images/library/2_動き・様子/204_行動・行為/204034考える.gif" },
    { id: "gakkatsu", name: "学活", image: "images/library/1_人・動植物/101_人物/101013友達.gif" },
    { id: "", name: "（空欄）", image: "" },
  ],
};
