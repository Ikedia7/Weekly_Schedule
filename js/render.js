/**
 * 画面表示（View）層。
 * ここでは「今どの日付を何日分表示するか」という表示状態（viewState）を持ち、
 * App.dataStore から該当データを取り出してテーブルを描画する。
 *
 * 表示状態と実データを分けているので、
 * 「表示する日数を増減する／表示する日付を変える」操作をしても
 * マスタデータ（App.dataStore）は壊れず、後から同じ日付を選べば内容が復元される。
 */
window.App = window.App || {};

App.render = (function () {
  const { dateUtils, dataStore, config } = App;

  // 表示中の日付一覧（5〜9個）。ここが「今週表示している範囲」の唯一の情報源。
  let viewDates = [];
  // 選択中の週の月曜日（表示日数を増減しても、週選択の基準として別に持っておく）
  let weekAnchor = null;

  // 指定した日付が属する週の月曜日を求める
  function getMondayOf(iso) {
    const d = dateUtils.parseISODate(iso);
    const day = d.getDay(); // 0=日曜〜6=土曜
    const diff = day === 0 ? -6 : 1 - day;
    return dateUtils.addDays(iso, diff);
  }

  // 「月〜金＋翌週月曜」の6日間を、指定した週の月曜日から組み立てる
  function computeDefaultWeekDates(monday) {
    const dates = [0, 1, 2, 3, 4].map((i) => dateUtils.addDays(monday, i));
    dates.push(dateUtils.addDays(monday, 7));
    return dates;
  }

  function initViewState() {
    const saved = App.storage.loadViewState();
    if (saved && Array.isArray(saved.dates) && saved.dates.length >= config.minDays) {
      viewDates = saved.dates;
      weekAnchor = saved.weekAnchor || getMondayOf(saved.dates[0]);
    } else {
      weekAnchor = getMondayOf(dateUtils.todayISO());
      viewDates = computeDefaultWeekDates(weekAnchor);
    }
  }

  function persistViewState() {
    App.storage.saveViewState({ dates: viewDates, weekAnchor });
  }

  // 週を選択する＝その週の月〜金＋翌週月曜（6日間）を自動で表示する。
  // 元の日付のデータはマスタ内にそのまま残るため、後で同じ日付に戻せば消えずに復元される。
  function selectWeek(anchorIso) {
    if (!anchorIso) return;
    weekAnchor = getMondayOf(anchorIso);
    viewDates = computeDefaultWeekDates(weekAnchor);
    persistViewState();
    renderAll();
  }

  function updateWeekSelectInput() {
    const input = document.getElementById("weekSelectInput");
    if (input) input.value = weekAnchor;
  }

  function initWeekSelect() {
    const input = document.getElementById("weekSelectInput");
    if (!input) return;
    input.addEventListener("change", () => {
      if (input.value) selectWeek(input.value);
    });
  }

  // タイトル行（クラス名＋表示中の日付範囲）
  function initClassName() {
    const input = document.getElementById("classNameInput");
    if (!input) return;
    input.value = App.storage.loadClassName();
    input.addEventListener("input", () => App.storage.saveClassName(input.value));
  }

  function formatDateRangeLabel(dates) {
    const fmt = (iso) => {
      const d = dateUtils.parseISODate(iso);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    };
    return `${fmt(dates[0])}〜${fmt(dates[dates.length - 1])}の予定`;
  }

  // 「担任より」など、特定の日付にひもづかない週単位のメモ。表示中の週の先頭日付をキーに保存する
  function initWeekNote() {
    const textarea = document.getElementById("weekNoteInput");
    if (!textarea) return;
    textarea.addEventListener("input", () => {
      dataStore.setWeekNote(viewDates[0], textarea.value);
    });
  }

  function updateWeekNote() {
    const textarea = document.getElementById("weekNoteInput");
    if (textarea) textarea.value = dataStore.getWeekNote(viewDates[0]);
  }

  function updateTitleDateRange() {
    const dateRangeEl = document.getElementById("titleDateRange");
    if (dateRangeEl) dateRangeEl.textContent = "　" + formatDateRangeLabel(viewDates);
  }

  function getViewDates() {
    return viewDates;
  }

  // 前後の週へ移動する＝週選択と同様に、その週の月〜金＋翌週月曜（6日間）を組み立て直す
  function shiftWeek(diffDays) {
    selectWeek(dateUtils.addDays(weekAnchor, diffDays));
  }

  // 自動生成された6日間に加えて、先生が追加で表示したい特定の日付を1つ足す
  function addDayColumn(newDate) {
    if (viewDates.length >= config.maxDays) return;
    if (!newDate || viewDates.includes(newDate)) return;
    viewDates.push(newDate);
    viewDates.sort((a, b) => a.localeCompare(b));
    persistViewState();
    renderAll();
  }

  function removeDayColumn(index) {
    if (viewDates.length <= config.minDays) return;
    viewDates.splice(index, 1);
    persistViewState();
    renderAll();
  }

  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      Object.entries(props).forEach(([key, value]) => {
        if (key === "class") node.className = value;
        else if (key.startsWith("on") && typeof value === "function") {
          node.addEventListener(key.slice(2), value);
        } else {
          node.setAttribute(key, value);
        }
      });
    }
    (children || []).forEach((child) => node.appendChild(child));
    return node;
  }

  // その教科セルに実際に表示すべき画像パス（ドラッグで割り当てたcustomImageを優先する）
  function resolveCellImage(cell) {
    if (cell.customImage) return cell.customImage;
    const subject = dataStore.getSubjectById(cell.subject);
    return (subject && subject.image) || "";
  }

  // 教科セルの画像エリア: 表示だけでなく、ドラッグでの画像割り当て・移動の受け皿にもなる
  function buildSubjectImageArea(entry, section) {
    const wrap = el("div", { class: "subject-image-area" }, []);
    const img = el("img", { class: "subject-image" });
    const clearBtn = el("button", { type: "button", class: "image-clear-btn", title: "画像を元に戻す" }, [
      document.createTextNode("×"),
    ]);

    function refresh() {
      const cell = entry.cells[section.id];
      const imagePath = resolveCellImage(cell);
      const subject = dataStore.getSubjectById(cell.subject);
      if (imagePath) {
        img.src = imagePath;
        img.alt = (subject && subject.name) || "";
        img.classList.remove("subject-image--empty");
        img.draggable = true;
      } else {
        img.removeAttribute("src");
        img.alt = "";
        img.classList.add("subject-image--empty");
        img.draggable = false;
      }
      clearBtn.style.display = cell.customImage ? "" : "none";
    }
    refresh();

    img.addEventListener("dragstart", (e) => {
      const cell = entry.cells[section.id];
      const imagePath = resolveCellImage(cell);
      if (!imagePath) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData("text/plain", imagePath);
      e.dataTransfer.effectAllowed = "copy";
    });

    wrap.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      wrap.classList.add("drop-target-active");
    });
    wrap.addEventListener("dragleave", () => wrap.classList.remove("drop-target-active"));
    wrap.addEventListener("drop", (e) => {
      e.preventDefault();
      wrap.classList.remove("drop-target-active");
      const path = e.dataTransfer.getData("text/plain");
      if (!path) return;
      dataStore.updateCell(entry.date, section.id, { customImage: path });
      refresh();
    });

    clearBtn.addEventListener("click", () => {
      dataStore.updateCell(entry.date, section.id, { customImage: "" });
      refresh();
    });

    wrap.appendChild(img);
    wrap.appendChild(clearBtn);
    wrap.refresh = refresh;
    return wrap;
  }

  function buildSubjectSelect(date, sectionId, currentSubjectId, imageArea) {
    const select = el("select", { class: "subject-select" });
    dataStore.getSubjects().forEach((subject) => {
      const opt = el("option", { value: subject.id }, []);
      opt.textContent = subject.name;
      if (subject.id === currentSubjectId) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener("change", () => {
      // 教科を選び直したら、ドラッグで上書きしていた画像はいったんリセットする
      dataStore.updateCell(date, sectionId, { subject: select.value, customImage: "" });
      imageArea.refresh();
      // 選んだ教科に「必ず必要な持ち物」のルールが登録されていれば、その日の持ち物欄に追加する
      dataStore.applySubjectBelongingsRules(date, select.value);
      renderAll();
    });
    return select;
  }

  // 日付を「6/月/23/日」のように分割表示する（参考Excelの見た目に合わせる）。
  // 日付そのものの変更は「週を選択」で行うため、ここは表示専用。
  function buildDateDisplay(dateIso) {
    const d = dateUtils.parseISODate(dateIso);
    return el("div", { class: "date-display" }, [
      el("span", { class: "date-part" }, [document.createTextNode(String(d.getMonth() + 1))]),
      el("span", { class: "date-part date-kanji" }, [document.createTextNode("月")]),
      el("span", { class: "date-part" }, [document.createTextNode(String(d.getDate()))]),
      el("span", { class: "date-part date-kanji" }, [document.createTextNode("日")]),
    ]);
  }

  function buildHeaderRow(entries) {
    const row = el("tr", {}, []);
    row.appendChild(el("th", { class: "corner-cell" }, []));

    entries.forEach((entry, index) => {
      const dayLabel = el("div", { class: "day-of-week" }, [document.createTextNode(entry.dayOfWeek + " 曜日")]);
      const dateDisplay = buildDateDisplay(entry.date);

      const cellChildren = [dayLabel, dateDisplay];

      if (viewDates.length > config.minDays) {
        const removeBtn = el("button", { class: "remove-day-btn", type: "button", title: "この日を表示から外す" }, [
          document.createTextNode("×"),
        ]);
        removeBtn.addEventListener("click", () => removeDayColumn(index));
        cellChildren.push(removeBtn);
      }

      row.appendChild(el("th", { class: entry.dayOfWeek === "土" || entry.dayOfWeek === "日" ? "weekend-cell" : "" }, cellChildren));
    });

    const addCell = el("th", { class: "add-day-cell" }, []);
    if (viewDates.length < config.maxDays) {
      const suggested = dateUtils.addDays(viewDates[viewDates.length - 1], 1);
      const addDateInput = el("input", { type: "date", class: "add-day-date-input", value: suggested });
      const addBtn = el("button", { class: "add-day-btn", type: "button", title: "指定した日を表示に追加する" }, [
        document.createTextNode("＋ 追加"),
      ]);
      addBtn.addEventListener("click", () => addDayColumn(addDateInput.value));
      addCell.appendChild(addDateInput);
      addCell.appendChild(addBtn);
    }
    row.appendChild(addCell);

    return row;
  }

  // 教科（subject）セルの中身: イラスト（ドラッグで差し替え可）＋教科プルダウン＋備考
  function buildSubjectCell(entry, section) {
    const cell = entry.cells[section.id];
    const imageArea = buildSubjectImageArea(entry, section);
    const select = buildSubjectSelect(entry.date, section.id, cell.subject, imageArea);

    const noteInput = el("input", { type: "text", class: "period-note", placeholder: "備考", value: cell.note });
    noteInput.addEventListener("input", () => {
      dataStore.updateCell(entry.date, section.id, { note: noteInput.value });
    });

    return el("td", { class: "period-cell" }, [imageArea, select, noteInput]);
  }

  // 自由記述（text）セルの中身: 複数行のテキストエリア
  function buildTextCell(entry, section) {
    const cell = entry.cells[section.id];
    const textarea = el("textarea", { class: "day-note", rows: "3" }, []);
    textarea.value = cell.value;
    textarea.addEventListener("input", () => {
      dataStore.updateCell(entry.date, section.id, { value: textarea.value });
    });
    return el("td", {}, [textarea]);
  }

  // ○×（check）セルの中身: ○／×のプルダウン（基本○なので空欄は選べない）
  function buildCheckCell(entry, section) {
    const cell = entry.cells[section.id];
    const select = el("select", { class: "check-select" }, []);
    ["○", "×"].forEach((mark) => {
      const opt = el("option", { value: mark }, []);
      opt.textContent = mark;
      if (cell.value === mark) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener("change", () => {
      dataStore.updateCell(entry.date, section.id, { value: select.value });
    });
    return el("td", { class: "check-cell" }, [select]);
  }

  // 持ち物リスト（list）セルの中身: 項目ごとに入力欄＋×削除ボタン、末尾に追加ボタン
  function buildListCell(entry, section) {
    const cell = entry.cells[section.id];
    const td = el("td", { class: "list-cell" }, []);
    const list = el("div", { class: "belongings-list" }, []);

    function saveItems() {
      dataStore.updateCell(entry.date, section.id, { items: cell.items });
    }

    function buildItemRow(index) {
      const input = el("input", { type: "text", class: "belongings-item-input", value: cell.items[index] });
      input.addEventListener("input", () => {
        cell.items[index] = input.value;
        saveItems();
      });
      const removeBtn = el("button", { type: "button", class: "belongings-item-remove", title: "この持ち物を削除" }, [
        document.createTextNode("×"),
      ]);
      removeBtn.addEventListener("click", () => {
        cell.items.splice(index, 1);
        saveItems();
        renderRows();
      });
      return el("div", { class: "belongings-item-row" }, [input, removeBtn]);
    }

    function renderRows() {
      list.innerHTML = "";
      cell.items.forEach((_, index) => list.appendChild(buildItemRow(index)));
    }
    renderRows();

    const addBtn = el("button", { type: "button", class: "belongings-add-btn" }, [document.createTextNode("＋ 持ち物を追加")]);
    addBtn.addEventListener("click", () => {
      cell.items.push("");
      saveItems();
      renderRows();
      const inputs = list.querySelectorAll(".belongings-item-input");
      const last = inputs[inputs.length - 1];
      if (last) last.focus();
    });

    td.appendChild(list);
    td.appendChild(addBtn);
    return td;
  }

  function buildSectionRow(entries, section) {
    const row = el("tr", { class: `layout-row layout-row--${section.type}` }, []);
    row.appendChild(el("td", { class: "period-number" }, [document.createTextNode(section.label)]));

    entries.forEach((entry) => {
      if (section.type === "subject") {
        row.appendChild(buildSubjectCell(entry, section));
      } else if (section.type === "check") {
        row.appendChild(buildCheckCell(entry, section));
      } else if (section.type === "list") {
        row.appendChild(buildListCell(entry, section));
      } else {
        row.appendChild(buildTextCell(entry, section));
      }
    });

    row.appendChild(el("td", { class: "add-day-cell" }, []));
    return row;
  }

  function renderAll() {
    updateTitleDateRange();
    updateWeekNote();
    updateWeekSelectInput();

    const entries = dataStore.getEntriesForDates(viewDates);
    const layout = dataStore.getLayout();

    const table = el("table", { class: "schedule-table" }, []);
    const thead = el("thead", {}, [buildHeaderRow(entries)]);
    const tbody = el(
      "tbody",
      {},
      layout.map((section) => buildSectionRow(entries, section))
    );

    table.appendChild(thead);
    table.appendChild(tbody);

    const container = document.getElementById("scheduleContainer");
    container.innerHTML = "";
    container.appendChild(table);
  }

  return {
    initViewState,
    initClassName,
    initWeekNote,
    initWeekSelect,
    getViewDates,
    selectWeek,
    shiftWeek,
    addDayColumn,
    removeDayColumn,
    renderAll,
  };
})();
