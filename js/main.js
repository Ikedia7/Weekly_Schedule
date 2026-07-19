/**
 * アプリの起動処理。各モジュール（config/storage/dataStore/render/excelExport）を
 * 初期化し、画面上のボタンにイベントを結びつける。
 */
(function () {
  function init() {
    App.dataStore.init();
    App.render.initViewState();
    App.render.initClassName();
    App.render.initWeekNote();
    App.render.initWeekSelect();
    App.render.renderAll();
    App.subjectManager.init();
    App.layoutManager.init();
    App.belongingsRulesManager.init();

    document.getElementById("prevWeekBtn").addEventListener("click", () => App.render.shiftWeek(-7));
    document.getElementById("nextWeekBtn").addEventListener("click", () => App.render.shiftWeek(7));

    // イラストパレット（教科セルへドラッグ＆ドロップするための一覧）。開いた時に一度だけ作る
    const paletteContainer = document.getElementById("imagePalette");
    let paletteBuilt = false;
    document.getElementById("toggleImagePaletteBtn").addEventListener("click", () => {
      if (!paletteBuilt) {
        paletteContainer.appendChild(App.galleryUI.buildGallery());
        paletteBuilt = true;
      }
      paletteContainer.classList.toggle("hidden");
    });

    document.getElementById("exportExcelBtn").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = "出力中...";
      try {
        await App.excelExport.exportToExcel(App.render.getViewDates());
      } catch (err) {
        console.error(err);
        alert("Excel出力に失敗しました。詳しくはブラウザのコンソールをご確認ください。");
      } finally {
        btn.disabled = false;
        btn.textContent = "Excel出力";
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
