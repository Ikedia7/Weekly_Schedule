/**
 * イラストギャラリーの共通UI部品。
 * 「教科・イラストの管理」画面と、予定表上部の「イラストパレット」の両方から使う。
 * App.imageLibraryData（1394件）を大分類タブ→中分類→検索で絞り込み、
 * サムネイルのグリッドを表示する。サムネイルはクリックでもドラッグでも使えるようにしておく
 * （クリック時は onSelect(item) を呼ぶ、ドラッグ時は dataTransfer にパスを積む）。
 */
window.App = window.App || {};

App.galleryUI = (function () {
  // App.imageLibraryData から大分類の一覧を、登場順（番号順）で取り出す
  function getMajors() {
    const seen = new Map();
    App.imageLibraryData.forEach((item) => {
      if (!seen.has(item.major)) seen.set(item.major, item.majorName);
    });
    return Array.from(seen.entries());
  }

  // 指定した大分類に属する中分類の一覧を、登場順で取り出す
  function getSubs(major) {
    const seen = new Map();
    App.imageLibraryData.forEach((item) => {
      if (item.major === major && !seen.has(item.sub)) seen.set(item.sub, item.subName);
    });
    return Array.from(seen.entries());
  }

  // onSelect: サムネイルをクリックしたときに呼ばれる (item) => void
  function buildGallery(onSelect) {
    const gallery = document.createElement("div");
    gallery.className = "gallery";

    const majors = getMajors();
    let currentMajor = majors[0][0];
    let currentSub = null;
    let searchTerm = "";

    const tabsEl = document.createElement("div");
    tabsEl.className = "gallery-tabs";
    const subsEl = document.createElement("div");
    subsEl.className = "gallery-subs";
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.className = "gallery-search";
    searchInput.placeholder = "イラストを名前で検索（例: うさぎ）";
    const gridEl = document.createElement("div");
    gridEl.className = "gallery-grid";

    function renderGrid() {
      gridEl.innerHTML = "";
      const items = searchTerm
        ? App.imageLibraryData.filter((item) => item.label.includes(searchTerm))
        : App.imageLibraryData.filter((item) => item.major === currentMajor && item.sub === currentSub);

      if (items.length === 0) {
        const empty = document.createElement("p");
        empty.className = "gallery-empty";
        empty.textContent = "見つかりませんでした。";
        gridEl.appendChild(empty);
        return;
      }

      items.forEach((item) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "gallery-item";
        btn.title = item.label;
        btn.draggable = true;

        const img = document.createElement("img");
        img.src = item.path;
        img.alt = item.label;
        img.loading = "lazy";
        btn.appendChild(img);

        const caption = document.createElement("span");
        caption.textContent = item.label;
        btn.appendChild(caption);

        btn.addEventListener("click", () => onSelect && onSelect(item));
        btn.addEventListener("dragstart", (e) => {
          e.dataTransfer.setData("text/plain", item.path);
          e.dataTransfer.effectAllowed = "copy";
        });
        gridEl.appendChild(btn);
      });
    }

    function renderSubs() {
      subsEl.innerHTML = "";
      const subList = getSubs(currentMajor);
      if (!subList.some(([code]) => code === currentSub)) currentSub = subList[0][0];
      subList.forEach(([code, name]) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "gallery-sub" + (code === currentSub ? " active" : "");
        btn.textContent = name;
        btn.addEventListener("click", () => {
          currentSub = code;
          searchTerm = "";
          searchInput.value = "";
          renderSubs();
          renderGrid();
        });
        subsEl.appendChild(btn);
      });
    }

    function renderTabs() {
      tabsEl.innerHTML = "";
      majors.forEach(([code, name]) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "gallery-tab" + (code === currentMajor ? " active" : "");
        btn.textContent = name;
        btn.addEventListener("click", () => {
          currentMajor = code;
          currentSub = null;
          searchTerm = "";
          searchInput.value = "";
          renderTabs();
          renderSubs();
          renderGrid();
        });
        tabsEl.appendChild(btn);
      });
    }

    searchInput.addEventListener("input", () => {
      searchTerm = searchInput.value.trim();
      renderGrid();
    });

    renderTabs();
    renderSubs();
    renderGrid();

    gallery.appendChild(tabsEl);
    gallery.appendChild(subsEl);
    gallery.appendChild(searchInput);
    gallery.appendChild(gridEl);
    return gallery;
  }

  return { buildGallery };
})();
