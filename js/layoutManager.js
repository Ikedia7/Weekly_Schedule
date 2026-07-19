/**
 * 「予定表のレイアウト編集」画面。
 * 予定表の行（お知らせ・教科・給食など）を先生が自由に追加・削除・並べ替えできる。
 * ここで編集するのは「行の構成（レイアウト）」だけで、各日の中身は
 * メインの予定表画面（render.js）で編集する。変更は都度LocalStorageへ自動保存される。
 */
window.App = window.App || {};

App.layoutManager = (function () {
  const { dataStore } = App;

  const TYPE_LABELS = {
    text: "自由記述",
    subject: "教科",
    check: "○×",
    list: "持ち物リスト",
  };

  function buildRow(section, index, layout) {
    const wrapper = document.createElement("div");
    wrapper.className = "layout-row-wrapper";

    const badge = document.createElement("span");
    badge.className = "layout-type-badge";
    badge.textContent = TYPE_LABELS[section.type] || section.type;
    wrapper.appendChild(badge);

    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.className = "layout-row-label";
    labelInput.value = section.label;
    labelInput.addEventListener("input", () => {
      layout[index].label = labelInput.value;
      dataStore.setLayout(layout);
    });
    wrapper.appendChild(labelInput);

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.textContent = "▲";
    upBtn.title = "上に移動";
    upBtn.disabled = index === 0;
    upBtn.addEventListener("click", () => {
      if (index === 0) return;
      [layout[index - 1], layout[index]] = [layout[index], layout[index - 1]];
      dataStore.setLayout(layout);
      renderList();
    });
    wrapper.appendChild(upBtn);

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.textContent = "▼";
    downBtn.title = "下に移動";
    downBtn.disabled = index === layout.length - 1;
    downBtn.addEventListener("click", () => {
      if (index === layout.length - 1) return;
      [layout[index + 1], layout[index]] = [layout[index], layout[index + 1]];
      dataStore.setLayout(layout);
      renderList();
    });
    wrapper.appendChild(downBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "layout-row-delete";
    deleteBtn.textContent = "削除";
    deleteBtn.addEventListener("click", () => {
      const ok = confirm(`「${section.label}」の行を削除しますか？\nこの行に入力済みの内容は表示されなくなります。`);
      if (!ok) return;
      layout.splice(index, 1);
      dataStore.setLayout(layout);
      renderList();
    });
    wrapper.appendChild(deleteBtn);

    return wrapper;
  }

  function renderList() {
    const container = document.getElementById("layoutManagerList");
    container.innerHTML = "";
    const layout = dataStore.getLayout();
    layout.forEach((section, index) => {
      container.appendChild(buildRow(section, index, layout));
    });
  }

  function handleAdd() {
    const labelInput = document.getElementById("newLayoutLabel");
    const typeSelect = document.getElementById("newLayoutType");
    const label = labelInput.value.trim();
    if (!label) return;

    const layout = dataStore.getLayout();
    const newSection = { id: `section_${Date.now()}`, label, type: typeSelect.value };
    layout.push(newSection);
    dataStore.setLayout(layout);

    labelInput.value = "";
    renderList();
  }

  function open() {
    renderList();
    document.getElementById("layoutManagerOverlay").classList.remove("hidden");
  }

  function close() {
    document.getElementById("layoutManagerOverlay").classList.add("hidden");
    App.render.renderAll(); // 変更を予定表画面に反映する
  }

  function init() {
    document.getElementById("editLayoutBtn").addEventListener("click", open);
    document.getElementById("closeLayoutManagerBtn").addEventListener("click", close);
    document.getElementById("addLayoutRowBtn").addEventListener("click", handleAdd);
  }

  return { init };
})();
