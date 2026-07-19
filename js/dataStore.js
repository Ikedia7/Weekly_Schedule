/**
 * データストア層（マスタデータ・レイアウトの管理と抽出）
 *
 * 設計方針:
 * - マスタデータは「1日分のオブジェクト」を集めた1つの配列（日付固定の連想配列ではない）。
 *   将来Excel/PDF/Googleスプレッドシートから週・月・年単位でまとめて取り込んでも、
 *   この配列に追加していくだけで済む。
 * - 予定表の「行構成（レイアウト）」は先生が自由に編集できる別のデータとして持ち、
 *   日データは行のid（セクションid）をキーにした`cells`で内容を持つ。
 *   これにより「どんな行があるか」と「各日の中身」が分離され、レイアウトを
 *   変えても既存データを壊さずに済む。
 * - 画面（render.js）やExcel出力（excelExport.js）は、このストアから
 *   「表示したい日付の配列」を渡して該当データだけを取り出す（getEntriesForDates）。
 *   表示・出力ロジックとデータ管理を分離するため、直接localStorageやDOMには触れない。
 */
window.App = window.App || {};

App.dataStore = (function () {
  let masterData = []; // { date, dayOfWeek, cells: { [sectionId]: {...} } } の配列
  let subjects = [];
  let layout = [];
  let weekNotes = {}; // { [週の開始日]: "担任よりメモなど、日付にひもづかない週単位の文章" }
  let belongingsRules = []; // 曜日・教科ごとの持ち物自動追加ルール

  function init() {
    masterData = App.storage.loadMasterData();
    subjects = App.storage.loadSubjectsMaster();
    layout = App.storage.loadLayout();
    weekNotes = App.storage.loadWeekNotes();
    belongingsRules = App.storage.loadBelongingsRules();
    upgradeLayoutTypes();
    normalizeCheckCellValues();
    normalizeDefaultSubjects();
  }

  function persist() {
    App.storage.saveMasterData(masterData);
  }

  // 「朝」「帰り」を自由記述から教科選択に、「持ち物」を自由記述からリストに変更した際、
  // すでに保存済みのレイアウトにも追従させるための一度きりの移行。
  // 各日のセルの中身は findDayEntry 側で自動的に付け替わる
  function upgradeLayoutTypes() {
    const upgrades = { section_morning: "subject", section_gohome: "subject", section_belongings: "list" };
    let changed = false;
    layout.forEach((section) => {
      const targetType = upgrades[section.id];
      if (targetType && section.type !== targetType) {
        section.type = targetType;
        changed = true;
      }
    });
    if (changed) App.storage.saveLayout(layout);
  }

  // 給食・そうじなどのcheck欄は基本○のため、空欄のまま保存されている既存データを
  // 一度だけ○に揃える（新規セルの初期値は createEmptyCell 側ですでに○にしている）
  function normalizeCheckCellValues() {
    let changed = false;
    masterData.forEach((entry) => {
      Object.values(entry.cells || {}).forEach((cell) => {
        if (cell.type === "check" && cell.value !== "○" && cell.value !== "×") {
          cell.value = "○";
          changed = true;
        }
      });
    });
    if (changed) persist();
  }

  // 「帰り」は基本「勇気付けタイム」、「1限目」は基本「朝の会」なので、
  // まだ何も選ばれていない（空欄の）既存セルを一度だけこの初期値に揃える
  // （新規セルの初期値は createEmptyCell 側ですでにこの初期値にしている）
  function normalizeDefaultSubjects() {
    let changed = false;
    masterData.forEach((entry) => {
      Object.entries(DEFAULT_SUBJECT_BY_SECTION).forEach(([sectionId, defaultSubject]) => {
        const cell = entry.cells && entry.cells[sectionId];
        if (cell && cell.type === "subject" && cell.subject === "") {
          cell.subject = defaultSubject;
          changed = true;
        }
      });
    });
    if (changed) persist();
  }

  // ---- 教科マスタ ----

  function getSubjects() {
    return subjects;
  }

  function getSubjectById(id) {
    return subjects.find((s) => s.id === id) || null;
  }

  function setSubjects(newSubjects) {
    subjects = newSubjects;
    App.storage.saveSubjectsMaster(subjects);
  }

  // ---- レイアウト（予定表の行構成） ----

  function getLayout() {
    return layout;
  }

  function setLayout(newLayout) {
    layout = newLayout;
    App.storage.saveLayout(layout);
  }

  // 「帰り」「1限目」は先生の運用上ほぼ固定なので、未選択時の初期値を教科マスタの
  // 特定の教科に固定する（他のsubject型セクションは従来通り空欄が初期値）
  const DEFAULT_SUBJECT_BY_SECTION = {
    section_gohome: "yuukizuke",
    section_period1: "asanokai",
  };

  function createEmptyCell(type, sectionId) {
    if (type === "subject") return { type, subject: DEFAULT_SUBJECT_BY_SECTION[sectionId] || "", note: "" };
    if (type === "check") return { type, value: "○" }; // 給食・そうじなどは基本○
    if (type === "list") return { type, items: [] };
    return { type: "text", value: "" };
  }

  // レイアウト側で行の種類が変わった場合（例: 「朝」を自由記述→教科に変更、
  // 「持ち物」を自由記述→リストに変更）に、既存データを作り直す際、
  // 元の内容をできるだけ引き継ぐための軽い変換
  function reconcileCellType(existingCell, section) {
    if (existingCell.type === section.type) return existingCell;
    if (section.type === "subject") {
      return {
        type: "subject",
        subject: DEFAULT_SUBJECT_BY_SECTION[section.id] || "",
        note: existingCell.value || existingCell.note || "",
      };
    }
    if (section.type === "text") {
      const source = existingCell.type === "list" ? (existingCell.items || []).join("\n") : existingCell.value || existingCell.note || "";
      return { type: "text", value: source };
    }
    if (section.type === "list") {
      const source = existingCell.value || existingCell.note || "";
      const items = source
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      return { type: "list", items };
    }
    return createEmptyCell(section.type, section.id);
  }

  // ---- 持ち物の自動追加ルール ----

  function getBelongingsRules() {
    return belongingsRules;
  }

  function setBelongingsRules(newRules) {
    belongingsRules = newRules;
    App.storage.saveBelongingsRules(belongingsRules);
  }

  // 指定した条件タイプ・値に一致するルールの持ち物名を、その日の「リスト型」セクションすべてに
  // 重複無しで追加する（項目名の完全一致は追加しない）
  function addMatchingBelongingsItems(cells, conditionType, conditionValue) {
    const items = belongingsRules
      .filter((rule) => rule.conditionType === conditionType && rule.conditionValue === conditionValue)
      .map((rule) => rule.item);
    if (items.length === 0) return;
    layout.forEach((section) => {
      if (section.type !== "list") return;
      const cell = cells[section.id];
      if (!cell) return;
      items.forEach((item) => {
        if (!cell.items.includes(item)) cell.items.push(item);
      });
    });
  }

  // ---- 日データ ----

  function createEmptyDayEntry(date) {
    const cells = {};
    layout.forEach((section) => {
      cells[section.id] = createEmptyCell(section.type, section.id);
    });
    const dayOfWeek = App.dateUtils.getDayOfWeekLabel(date);
    // 新しい日を作った時点の曜日で、曜日条件の持ち物ルールを一度だけ適用する
    // （後から手動で消しても、この日が再び曜日ルールで復活することはない）
    addMatchingBelongingsItems(cells, "dayOfWeek", dayOfWeek);
    return {
      date,
      dayOfWeek,
      cells,
    };
  }

  // 教科プルダウンで選び直した時に呼ぶ: 一致する教科条件の持ち物ルールを、
  // その場限りでその日の持ち物欄に追加する（自動での取り消しはしない＝手動で消せる）
  function applySubjectBelongingsRules(date, subjectId) {
    const entry = ensureDayEntry(date);
    addMatchingBelongingsItems(entry.cells, "subject", subjectId);
    persist();
    return entry;
  }

  // 新しいルールを登録した時に呼ぶ: すでにマスタに存在する日のうち、
  // このルールの条件（曜日 or 教科）に合致する日にも、その場で一度だけ持ち物を反映する
  // （ルール登録前から既に画面に表示されていた日にも、編集画面・Excel出力の両方に出るように）
  function backfillBelongingsRule(rule) {
    let changed = false;
    masterData.forEach((entry) => {
      const matches =
        (rule.conditionType === "dayOfWeek" && entry.dayOfWeek === rule.conditionValue) ||
        (rule.conditionType === "subject" &&
          Object.values(entry.cells || {}).some((cell) => cell.type === "subject" && cell.subject === rule.conditionValue));
      if (!matches) return;
      layout.forEach((section) => {
        if (section.type !== "list") return;
        const cell = entry.cells[section.id];
        if (!cell || cell.items.includes(rule.item)) return;
        cell.items.push(rule.item);
        changed = true;
      });
    });
    if (changed) persist();
  }

  // 旧スキーマ（periods配列+note固定欄）のデータを、現在のレイアウトに合わせて
  // 極力引き継ぐための軽い移行処理。完全な再現は狙わず、テスト入力程度を救済する。
  function migrateLegacyEntry(entry) {
    const cells = {};
    layout.forEach((section) => {
      cells[section.id] = createEmptyCell(section.type, section.id);
    });

    const subjectSections = layout.filter((s) => s.type === "subject");
    if (Array.isArray(entry.periods)) {
      entry.periods.forEach((period, index) => {
        const section = subjectSections[index];
        if (section && period) {
          cells[section.id] = { type: "subject", subject: period.subject || "", note: period.note || "" };
        }
      });
    }

    const firstTextSection = layout.find((s) => s.type === "text");
    if (firstTextSection && entry.note) {
      cells[firstTextSection.id] = { type: "text", value: entry.note };
    }

    return {
      date: entry.date,
      dayOfWeek: entry.dayOfWeek || App.dateUtils.getDayOfWeekLabel(entry.date),
      cells,
    };
  }

  function findDayEntry(date) {
    const entry = masterData.find((d) => d.date === date);
    if (!entry) return null;
    if (!entry.cells) {
      const migrated = migrateLegacyEntry(entry);
      Object.assign(entry, migrated);
      persist();
      return entry;
    }
    // レイアウトに後から行を追加した場合は対応するセルを補い、
    // 行の種類が変わった場合（自由記述→教科など）は内容を引き継ぎつつ作り直す
    let changed = false;
    layout.forEach((section) => {
      const existing = entry.cells[section.id];
      if (!existing) {
        entry.cells[section.id] = createEmptyCell(section.type, section.id);
        changed = true;
      } else if (existing.type !== section.type) {
        entry.cells[section.id] = reconcileCellType(existing, section);
        changed = true;
      }
    });
    if (changed) persist();
    return entry;
  }

  // 指定日のデータがマスタに無ければ空データを作って追加する（自動フィルタリング抽出の起点）
  function ensureDayEntry(date) {
    let entry = findDayEntry(date);
    if (!entry) {
      entry = createEmptyDayEntry(date);
      masterData.push(entry);
      masterData.sort((a, b) => a.date.localeCompare(b.date));
      persist();
    }
    return entry;
  }

  // 指定した日付配列に対応するデータをマスタから抽出する（無ければ自動生成）
  function getEntriesForDates(dates) {
    return dates.map((date) => ensureDayEntry(date));
  }

  function updateDayEntry(date, patch) {
    const entry = ensureDayEntry(date);
    Object.assign(entry, patch);
    persist();
    return entry;
  }

  function updateCell(date, sectionId, patch) {
    const entry = ensureDayEntry(date);
    if (!entry.cells[sectionId]) return entry;
    Object.assign(entry.cells[sectionId], patch);
    persist();
    return entry;
  }

  // 日付そのものを変更する（カレンダーで日付を選び直した場合）。
  // 曜日はDate.getDay()から自動で再計算する。
  function changeDayDate(oldDate, newDate) {
    const entry = findDayEntry(oldDate);
    if (!entry) return ensureDayEntry(newDate);
    entry.date = newDate;
    entry.dayOfWeek = App.dateUtils.getDayOfWeekLabel(newDate);
    masterData.sort((a, b) => a.date.localeCompare(b.date));
    persist();
    return entry;
  }

  // 将来のインポート機能向け: 外部データ（週/月/年分）をマスタへ一括反映する。
  // 同じ日付のデータは上書きし、新しい日付は追加する。
  function importDayEntries(entries) {
    entries.forEach((incoming) => {
      const index = masterData.findIndex((d) => d.date === incoming.date);
      if (index >= 0) {
        masterData[index] = incoming;
      } else {
        masterData.push(incoming);
      }
    });
    masterData.sort((a, b) => a.date.localeCompare(b.date));
    persist();
  }

  function getAllMasterData() {
    return masterData;
  }

  // ---- 週単位のメモ（「担任より」など、特定の日付にひもづかない文章） ----
  // 表示中の週の先頭日付をキーにして保存する（週が変われば別のメモになる）

  function getWeekNote(weekStartDate) {
    return weekNotes[weekStartDate] || "";
  }

  function setWeekNote(weekStartDate, text) {
    weekNotes[weekStartDate] = text;
    App.storage.saveWeekNotes(weekNotes);
  }

  return {
    init,
    getSubjects,
    getSubjectById,
    setSubjects,
    getLayout,
    setLayout,
    ensureDayEntry,
    getEntriesForDates,
    updateDayEntry,
    updateCell,
    changeDayDate,
    importDayEntries,
    getAllMasterData,
    getWeekNote,
    setWeekNote,
    getBelongingsRules,
    setBelongingsRules,
    applySubjectBelongingsRules,
    backfillBelongingsRule,
  };
})();
