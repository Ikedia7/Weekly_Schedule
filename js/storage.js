/**
 * LocalStorage への保存・復元をまとめた層。
 * 「どのキーに何を保存するか」だけをここに集約し、他のファイルは
 * App.storage.loadXxx() / saveXxx() を呼ぶだけで済むようにする。
 */
window.App = window.App || {};

App.storage = (function () {
  const KEYS = {
    masterData: "weeklySchedule_masterData", // 日ごとの予定データ（大量データを想定した配列）
    subjectsMaster: "weeklySchedule_subjectsMaster", // 教科×画像のマスタ設定
    viewState: "weeklySchedule_viewState", // 画面に表示中の日付一覧など
    layout: "weeklySchedule_layout", // 予定表の行構成（レイアウト）
    className: "weeklySchedule_className", // タイトル行に出すクラス名など
    weekNotes: "weeklySchedule_weekNotes", // 「担任より」など、日付にひもづかない週単位のメモ
    belongingsRules: "weeklySchedule_belongingsRules", // 曜日・教科ごとの持ち物自動追加ルール
  };

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn(`LocalStorageの読み込みに失敗しました (${key})`, e);
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn(`LocalStorageへの保存に失敗しました (${key})`, e);
    }
  }

  function loadMasterData() {
    return load(KEYS.masterData, []);
  }

  function saveMasterData(days) {
    save(KEYS.masterData, days);
  }

  function loadSubjectsMaster() {
    return load(KEYS.subjectsMaster, App.config.subjects);
  }

  function saveSubjectsMaster(subjects) {
    save(KEYS.subjectsMaster, subjects);
  }

  function loadViewState() {
    return load(KEYS.viewState, null);
  }

  function saveViewState(state) {
    save(KEYS.viewState, state);
  }

  function loadLayout() {
    return load(KEYS.layout, App.config.defaultLayout);
  }

  function saveLayout(layout) {
    save(KEYS.layout, layout);
  }

  function loadClassName() {
    return load(KEYS.className, "");
  }

  function saveClassName(name) {
    save(KEYS.className, name);
  }

  function loadWeekNotes() {
    return load(KEYS.weekNotes, {});
  }

  function saveWeekNotes(notes) {
    save(KEYS.weekNotes, notes);
  }

  function loadBelongingsRules() {
    return load(KEYS.belongingsRules, App.config.defaultBelongingsRules);
  }

  function saveBelongingsRules(rules) {
    save(KEYS.belongingsRules, rules);
  }

  // アプリが使っているLocalStorageの内容をすべて消す（初期化ボタン用）。
  // 同じオリジンの他のデータを巻き込まないよう、KEYSに登録したキーだけを個別に削除する
  function resetAll() {
    Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
  }

  return {
    loadMasterData,
    saveMasterData,
    loadSubjectsMaster,
    saveSubjectsMaster,
    loadViewState,
    saveViewState,
    loadLayout,
    saveLayout,
    loadClassName,
    saveClassName,
    loadWeekNotes,
    saveWeekNotes,
    loadBelongingsRules,
    saveBelongingsRules,
    resetAll,
  };
})();
