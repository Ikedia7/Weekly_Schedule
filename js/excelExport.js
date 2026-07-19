/**
 * Excel（.xlsx）出力層。ExcelJS（CDN経由）を使ってブラウザ内だけでファイルを生成し、
 * そのままローカルにダウンロードする（サーバーへは何も送信しない）。
 *
 * 表示日数がちょうど6日のときは、参考Excelから作った雛形ファイル
 * （templates/schedule_template.xlsx）をそのまま読み込んで値を書き込む
 * （1日＝1列。雛形はB,C,D,E,F,H列の6日固定）。
 * 6日以外（5・7〜9日）は雛形の列数と合わないため、雛形から罫線・フォント・
 * 列幅などの「見た目」だけを取り出し、日数に合わせてコードで組み立てる。
 *
 * 教科の画像はPNG/JPEG/GIFのみ埋め込み可能（ExcelJSブラウザ版の制約。SVGは非対応）。
 */
window.App = window.App || {};

App.excelExport = (function () {
  const { dataStore } = App;

  const TEMPLATE_PATH = "templates/schedule_template.xlsx";
  // 雛形ファイルは「1日＝1列」（B,C,D,E,F,H列の6日固定。G列は区切りの空列）
  const TEMPLATE_DAY_COLS = [2, 3, 4, 5, 6, 8];
  // レイアウトのセクションid → 雛形ファイル内の行番号（先生が既定のレイアウトを使っている前提の対応表）
  const TEMPLATE_ROW_MAP = {
    section_notice: [6],
    section_morning: [7],
    section_period1: [8],
    section_period2: [9],
    section_period3: [10],
    section_period4: [11],
    section_lunch: [12],
    section_cleaning: [13],
    section_period5: [14],
    section_period6: [15],
    section_gohome: [16],
    section_belongings: [17, 18, 19, 20, 21], // 持ち物は5行に分けて1行ずつ書き込む
    section_yotsuba: [22],
  };
  const TEMPLATE_WEEK_NOTE_ROW = 24; // 「担任より」（日付にひもづかない週単位のメモ）
  const TEMPLATE_LAST_ROW = 26; // これ以降の行は先生が追加した独自セクション用に空けておく

  // 行の種類ごとの既定の高さ（雛形が無い場合や追加行に使う）
  const ROW_HEIGHT_BY_TYPE = { text: 60, subject: 46, check: 20, list: 60 };
  // 「担任より」欄（ラベル無し・1行結合）の高さ。雛形側の実際の高さに合わせている
  const WEEK_NOTE_ROW_HEIGHT = 70.8;

  // 特定の教科だけ、イラストの高さ・縦位置を既定（高さ3/4・上下中央）から変えたい場合の例外設定。
  // 「勇気付けタイム」は、セルの下から高さ6/10までに収まるよう小さめ・下寄せにする
  const SUBJECT_IMAGE_OVERRIDES = {
    yuukizuke: { maxHeightRatio: 0.6, alignBottom: true },
  };

  async function fetchImageAsBase64(url) {
    // アップロード画像はすでにdata URL（base64）なのでそのまま使う
    if (url.startsWith("data:")) return url;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn("画像の読み込みに失敗しました:", url, e);
      return null;
    }
  }

  function getEmbeddableExtension(url) {
    // ExcelJS(ブラウザ版)はpng/jpeg/gifのみ埋め込み対応（SVGは非対応）
    if (url.startsWith("data:")) {
      const match = url.match(/^data:image\/(png|jpeg|jpg|gif)/i);
      if (!match) return null;
      const ext = match[1].toLowerCase();
      return ext === "jpg" ? "jpeg" : ext;
    }
    const ext = (url.split(".").pop() || "").toLowerCase();
    if (["png", "jpeg", "jpg", "gif"].includes(ext)) return ext === "jpg" ? "jpeg" : ext;
    return null;
  }

  function borderAll() {
    const style = { style: "thin" };
    return { top: style, bottom: style, left: style, right: style };
  }

  function buildFileName(dates) {
    const first = dates[0].replace(/-/g, "");
    return `週の予定表_${first}.xlsx`;
  }

  function formatDateRangeLabel(dates) {
    const fmt = (iso) => {
      const [, m, d] = iso.split("-");
      return `${Number(m)}月${Number(d)}日`;
    };
    return `${fmt(dates[0])}〜${fmt(dates[dates.length - 1])}の予定`;
  }

  function downloadBuffer(buffer, filename) {
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---- 雛形ファイルの読み込み・見た目の抽出 ----

  async function loadTemplateWorkbook() {
    // 先生がExcelでテンプレートを直接更新した場合に、ブラウザのキャッシュ経由で
    // 古い内容のまま読み込んでしまわないよう、毎回キャッシュを使わず取得し直す
    const res = await fetch(TEMPLATE_PATH, { cache: "no-store" });
    if (!res.ok) throw new Error(`テンプレートファイル(${TEMPLATE_PATH})の読み込みに失敗しました`);
    const buffer = await res.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    return workbook;
  }

  function cloneStyle(cell) {
    return {
      font: cell.font ? { ...cell.font } : undefined,
      border: cell.border ? JSON.parse(JSON.stringify(cell.border)) : undefined,
      fill: cell.fill ? JSON.parse(JSON.stringify(cell.fill)) : undefined,
    };
  }

  function applyStyle(cell, style) {
    if (!style) return;
    if (style.font) cell.font = { ...style.font };
    if (style.border) cell.border = JSON.parse(JSON.stringify(style.border));
    if (style.fill) cell.fill = JSON.parse(JSON.stringify(style.fill));
  }

  // 6日以外の表示日数のときに使う「見た目」を雛形ファイルから抜き出す
  // （色・罫線・フォント・列幅など。日数が違うので構成そのものはコードで組み立てる）
  function extractTemplateLook(templateSheet) {
    const rowStyles = {
      text: cloneStyle(templateSheet.getRow(6).getCell(2)),
      subject: cloneStyle(templateSheet.getRow(8).getCell(2)),
      check: cloneStyle(templateSheet.getRow(12).getCell(2)),
    };
    return {
      title: cloneStyle(templateSheet.getCell("A1")),
      date: cloneStyle(templateSheet.getRow(4).getCell(2)),
      weekday: cloneStyle(templateSheet.getRow(5).getCell(2)),
      rowStyles,
      rowHeights: {
        text: templateSheet.getRow(6).height,
        subject: templateSheet.getRow(8).height,
        check: templateSheet.getRow(12).height,
      },
      dayColumnWidth: templateSheet.getColumn(2).width,
      labelColumnWidth: templateSheet.getColumn(1).width,
      // 雛形の印刷設定（縦/横・用紙サイズ・余白など）。6日以外の出力でもA4に収まるよう流用する
      pageSetup: { ...templateSheet.pageSetup },
    };
  }

  // ---- セルへの書き込み（雛形利用時・コード組み立て時の両方から呼ばれる） ----

  // Excelの列幅（文字数単位）・行の高さ（pt）を、おおよそのピクセル数に変換する
  // （画像をセル右側にできるだけ大きく配置するためのサイズ計算に使う。厳密な値ではなく目安）
  function excelColumnWidthToPixels(width) {
    return Math.round((width || 8.43) * 7 + 5);
  }

  function excelRowHeightToPixels(points) {
    return Math.round(((points || 15) * 96) / 72);
  }

  const EMU_PER_PIXEL = 9525;

  // 特定のセクションだけ、教科名のフォントサイズを雛形の既定値から変えたい場合の例外設定
  const SECTION_FONT_SIZE_OVERRIDES = {
    section_gohome: 10, // 帰り
  };

  // 持ち物リストの中で、特定の項目名だけフォントサイズを変えたい場合の例外設定
  const BELONGINGS_ITEM_FONT_SIZE_OVERRIDES = {
    "給食袋(マスク)": 9,
  };

  // 持ち物の項目名配列をリッチテキストのrunsに組み立てる（例外指定の項目だけサイズを変える）
  function buildListRichText(items, baseFont) {
    const runs = [];
    items.forEach((item, index) => {
      if (index > 0) runs.push({ font: baseFont ? { ...baseFont } : undefined, text: "\n" });
      const overrideSize = BELONGINGS_ITEM_FONT_SIZE_OVERRIDES[item];
      const font = baseFont ? { ...baseFont } : {};
      if (overrideSize) font.size = overrideSize;
      runs.push({ font, text: item });
    });
    return runs;
  }

  // 教科名＋備考をリッチテキストで組み立てる。備考は同じセルの中で改行し、
  // フォントサイズ8だけ小さくして「テキストボックス風」に見せる
  // （ExcelJSには独立したテキストボックス図形を挿入する機能が無いため）
  function buildSubjectRichText(cell, subject, baseFont, sectionId) {
    const runs = [];
    const nameFontSize = SECTION_FONT_SIZE_OVERRIDES[sectionId];
    if (subject && subject.id) {
      const nameFont = baseFont ? { ...baseFont } : {};
      if (nameFontSize) nameFont.size = nameFontSize;
      runs.push({ font: nameFont, text: subject.name });
    }
    if (cell.note) {
      if (runs.length > 0) runs.push({ font: baseFont ? { ...baseFont } : undefined, text: "\n" });
      runs.push({ font: baseFont ? { ...baseFont, size: 8 } : { size: 8 }, text: cell.note });
    }
    return runs;
  }

  async function writeSubjectCell(workbook, sheet, cell, colIndex, rowIndex, style, sectionId) {
    const subject = dataStore.getSubjectById(cell.subject);
    const excelCell = sheet.getRow(rowIndex).getCell(colIndex);

    const baseFont = excelCell.font;
    const runs = buildSubjectRichText(cell, subject, baseFont, sectionId);
    excelCell.value = runs.length > 0 ? { richText: runs } : null;

    if (style) {
      // 6日以外のコード組み立て時は、雛形と同じ「左上揃え」を明示的に設定する
      excelCell.alignment = { horizontal: "left", vertical: "top", wrapText: true };
      applyStyle(excelCell, style);
    } else {
      // 雛形をそのまま使う場合は、雛形側にすでに設定されている配置（左上揃えなど）を
      // 上書きしない。折り返しだけ有効にする
      excelCell.alignment = { ...excelCell.alignment, wrapText: true };
    }

    // 教科が未選択（プルダウンで何も選んでいない）セルは空欄として、
    // 左上から右下への斜線を引く
    // （ExcelJSは斜線の向きをdiagonal.up/downに持たせる必要があり、
    // 直下のdiagonalUp/diagonalDownは無視される点に注意）
    if (!(subject && subject.id)) {
      // 雛形から読み込んだセルは、同じ見た目のセル同士でstyleオブジェクトの参照を
      // 共有していることがある。excelCell.border=...だけで書き換えると、本来
      // 斜線を引きたくない他のセルにまで伝播してしまうため、styleごと新しいオブジェクトに
      // 差し替えて、このセル専用の独立したスタイルにする
      excelCell.style = {
        ...excelCell.style,
        border: { ...excelCell.border, diagonal: { style: "thin", up: false, down: true } },
      };
    }

    // ドラッグで割り当てたcustomImageがあればそちらを優先する（画面側と同じルール）。
    // 参考Excelと同じく、セルの右側になるべく大きく配置する
    const imageSource = cell.customImage || (subject && subject.image) || "";
    if (imageSource) {
      const ext = getEmbeddableExtension(imageSource);
      if (ext) {
        const base64 = await fetchImageAsBase64(imageSource);
        if (base64) {
          const colWidthPx = excelColumnWidthToPixels(sheet.getColumn(colIndex).width);
          const rowHeightPx = excelRowHeightToPixels(sheet.getRow(rowIndex).height);
          const margin = 2;
          const override = SUBJECT_IMAGE_OVERRIDES[cell.subject];
          // 文字（左側）と重ならないよう、幅はセルの半分・高さはセルの3/4（教科ごとの例外があれば
          // そちらの比率）を上限にし、縦横比を保ったまま小さい方に合わせて正方形にする
          const maxWidth = colWidthPx / 2;
          const maxHeight = rowHeightPx * (override ? override.maxHeightRatio : 3 / 4);
          const size = Math.max(12, Math.min(maxWidth, maxHeight) - margin);
          const midpoint = colWidthPx / 2;
          const leftEdgePx = Math.max(midpoint, colWidthPx - size - margin);
          // 通常は上下中央だが、例外指定があればセルの下端に揃える
          const topEdgePx = override && override.alignBottom
            ? Math.max(0, rowHeightPx - size - margin)
            : Math.max(0, (rowHeightPx - size) / 2);
          const imageId = workbook.addImage({ base64, extension: ext });
          // ExcelJSの`tl.col`小数指定は列幅に比例しないバグがあり、狙った位置に置けない
          // （実測で確認済み）。nativeColOff/nativeRowOffで実ピクセル→EMU換算した
          // オフセットを直接渡すことで回避する
          sheet.addImage(imageId, {
            tl: {
              nativeCol: colIndex - 1,
              nativeColOff: Math.round(leftEdgePx * EMU_PER_PIXEL),
              nativeRow: rowIndex - 1,
              nativeRowOff: Math.round(topEdgePx * EMU_PER_PIXEL),
            },
            ext: { width: size, height: size },
          });
        }
      }
    }
  }

  function writeTextCell(sheet, cell, colIndex, rowIndex, style) {
    const excelCell = sheet.getRow(rowIndex).getCell(colIndex);
    excelCell.value = cell.value;
    if (style) {
      excelCell.alignment = { horizontal: "left", vertical: "top", wrapText: true };
      applyStyle(excelCell, style);
    } else {
      // 雛形をそのまま使う場合は、雛形側の配置（縦横）を尊重し、折り返しだけ有効にする
      excelCell.alignment = { ...excelCell.alignment, wrapText: true };
    }
  }

  function writeCheckCell(sheet, cell, colIndex, rowIndex, style) {
    const excelCell = sheet.getRow(rowIndex).getCell(colIndex);
    excelCell.value = cell.value;
    if (style) {
      excelCell.alignment = { horizontal: "center", vertical: "middle" };
      applyStyle(excelCell, style);
    }
  }

  // 持ち物リスト（list）セル: 項目を改行区切りのリッチテキストとして1セルにまとめる
  // （特定の項目だけフォントサイズを変えられるよう、通常のtextセルとは別に組み立てる）
  function writeListCell(sheet, cell, colIndex, rowIndex, style) {
    const excelCell = sheet.getRow(rowIndex).getCell(colIndex);
    const items = cell.items || [];
    const baseFont = excelCell.font;
    excelCell.value = items.length > 0 ? { richText: buildListRichText(items, baseFont) } : null;
    if (style) {
      excelCell.alignment = { horizontal: "left", vertical: "top", wrapText: true };
      applyStyle(excelCell, style);
    } else {
      excelCell.alignment = { ...excelCell.alignment, wrapText: true };
    }
  }

  // 持ち物のように複数行の雛形セル（例: 17〜21行目）へ、リストの項目を1行ずつ振り分ける
  // （5行を超える項目は現状の雛形の行数に収まらないため切り捨てられる）
  function writeMultiLineTemplateCell(sheet, cell, colIndex, rowIndices) {
    const lines = cell.items || [];
    rowIndices.forEach((rowIndex, i) => {
      const excelCell = sheet.getRow(rowIndex).getCell(colIndex);
      const text = lines[i] || "";
      const overrideSize = BELONGINGS_ITEM_FONT_SIZE_OVERRIDES[text];
      if (text && overrideSize) {
        excelCell.value = { richText: [{ font: { ...excelCell.font, size: overrideSize }, text }] };
      } else {
        excelCell.value = text;
      }
      excelCell.alignment = { ...excelCell.alignment, wrapText: true };
    });
  }

  // ExcelJSはDateのUTC値をそのままシリアル値に変換するため、ローカル時刻でDateを作ると
  // タイムゾーンによって前後の日付にずれてしまう。UTC基準で組み立てて回避する
  function toExcelDate(isoDate) {
    const [y, m, d] = isoDate.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  function writeDateCell(sheet, colIndex, rowIndex, isoDate) {
    const cell = sheet.getRow(rowIndex).getCell(colIndex);
    cell.value = toExcelDate(isoDate);
    cell.numFmt = 'm"月"d"日"';
    return cell;
  }

  // ---- 表示日数がちょうど6日: 雛形ファイルをそのまま使う ----

  async function exportUsingTemplate(dates, entries, layout, className) {
    const workbook = await loadTemplateWorkbook();
    const sheet = workbook.getWorksheet(1);

    sheet.getCell("A1").value = className ? `${className}　${formatDateRangeLabel(dates)}` : formatDateRangeLabel(dates);

    entries.forEach((entry, dayIndex) => {
      const col = TEMPLATE_DAY_COLS[dayIndex];
      writeDateCell(sheet, col, 4, entry.date);
      sheet.getRow(5).getCell(col).value = `${entry.dayOfWeek} 曜日`;
    });

    // レイアウトの各行を、対応する雛形の行に書き込む。対応が無い行（先生が独自に追加した行）は
    // 後で雛形の下に追記する
    const extraSections = [];
    for (const section of layout) {
      const rows = TEMPLATE_ROW_MAP[section.id];
      if (!rows) {
        extraSections.push(section);
        continue;
      }
      for (let dayIndex = 0; dayIndex < entries.length; dayIndex++) {
        const col = TEMPLATE_DAY_COLS[dayIndex];
        const cell = entries[dayIndex].cells[section.id];
        if (rows.length > 1) {
          writeMultiLineTemplateCell(sheet, cell, col, rows);
        } else if (section.type === "subject") {
          await writeSubjectCell(workbook, sheet, cell, col, rows[0], undefined, section.id);
        } else if (section.type === "check") {
          writeCheckCell(sheet, cell, col, rows[0]);
        } else if (section.type === "list") {
          writeListCell(sheet, cell, col, rows[0]);
        } else {
          writeTextCell(sheet, cell, col, rows[0]);
        }
      }
    }

    // 担任より（日付にひもづかない週単位のメモ）: 日の列をまたいで1つのセルに書く
    const weekNote = dataStore.getWeekNote(dates[0]);
    if (weekNote) {
      const firstCol = TEMPLATE_DAY_COLS[0];
      const lastCol = TEMPLATE_DAY_COLS[TEMPLATE_DAY_COLS.length - 1];
      const startCell = sheet.getRow(TEMPLATE_WEEK_NOTE_ROW).getCell(firstCol);
      // 雛形側ですでにこの行が結合済み（先生がA列まで含めて結合し直した等）の場合は
      // 二重結合でエラーになるため、未結合のときだけこちらで結合する。結合済みなら
      // 結合の親セル（左上のセル）に書き込む
      const cell = startCell.isMerged
        ? startCell.master
        : (sheet.mergeCells(TEMPLATE_WEEK_NOTE_ROW, firstCol, TEMPLATE_WEEK_NOTE_ROW, lastCol), startCell);
      cell.value = weekNote;
      cell.alignment = { ...cell.alignment, wrapText: true };
    }

    if (extraSections.length > 0) {
      let rowIndex = TEMPLATE_LAST_ROW + 2;
      for (const section of extraSections) {
        sheet.getRow(rowIndex).getCell(1).value = section.label;
        sheet.getRow(rowIndex).height = ROW_HEIGHT_BY_TYPE[section.type] || 40;
        for (let dayIndex = 0; dayIndex < entries.length; dayIndex++) {
          const col = TEMPLATE_DAY_COLS[dayIndex];
          const cell = entries[dayIndex].cells[section.id];
          if (section.type === "subject") {
            await writeSubjectCell(workbook, sheet, cell, col, rowIndex, undefined, section.id);
          } else if (section.type === "check") {
            writeCheckCell(sheet, cell, col, rowIndex);
          } else if (section.type === "list") {
            writeListCell(sheet, cell, col, rowIndex);
          } else {
            writeTextCell(sheet, cell, col, rowIndex);
          }
        }
        sheet.getRow(rowIndex).eachCell({ includeEmpty: true }, (c) => (c.border = borderAll()));
        rowIndex += 1;
      }
    }

    return workbook;
  }

  // ---- 表示日数が6日以外: 雛形の見た目を使いつつコードで組み立てる（1日＝1列） ----

  async function exportProgrammatic(dates, entries, layout, className, look) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("週の予定");

    const totalCols = 1 + dates.length;
    sheet.getColumn(1).width = look.labelColumnWidth || 10;
    dates.forEach((_, dayIndex) => {
      sheet.getColumn(dayIndex + 2).width = look.dayColumnWidth || 12;
    });

    sheet.mergeCells(1, 1, 1, totalCols);
    const titleCell = sheet.getRow(1).getCell(1);
    const titlePrefix = className ? `${className}　` : "";
    titleCell.value = `${titlePrefix}${formatDateRangeLabel(dates)}`;
    applyStyle(titleCell, look.title);
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(1).height = 26;

    entries.forEach((entry, dayIndex) => {
      const col = dayIndex + 2;
      const dateCell = writeDateCell(sheet, col, 2, entry.date);
      dateCell.alignment = { horizontal: "center" };
      applyStyle(dateCell, look.date);
      dateCell.border = borderAll();

      const weekdayCell = sheet.getRow(3).getCell(col);
      weekdayCell.value = `${entry.dayOfWeek} 曜日`;
      weekdayCell.alignment = { horizontal: "center" };
      applyStyle(weekdayCell, look.weekday);
    });

    for (let sectionIndex = 0; sectionIndex < layout.length; sectionIndex++) {
      const section = layout[sectionIndex];
      const rowIndex = sectionIndex + 4;
      const row = sheet.getRow(rowIndex);
      row.getCell(1).value = section.label;
      row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
      row.height = (look.rowHeights && look.rowHeights[section.type]) || ROW_HEIGHT_BY_TYPE[section.type] || 40;

      const style = look.rowStyles && look.rowStyles[section.type];
      for (let dayIndex = 0; dayIndex < entries.length; dayIndex++) {
        const cell = entries[dayIndex].cells[section.id];
        const col = dayIndex + 2;
        if (section.type === "subject") {
          await writeSubjectCell(workbook, sheet, cell, col, rowIndex, style, section.id);
        } else if (section.type === "check") {
          writeCheckCell(sheet, cell, col, rowIndex, style);
        } else if (section.type === "list") {
          writeListCell(sheet, cell, col, rowIndex, style);
        } else {
          writeTextCell(sheet, cell, col, rowIndex, style);
        }
      }
      row.eachCell({ includeEmpty: true }, (cell) => (cell.border = borderAll()));
    }

    // 担任より（日付にひもづかない週単位のメモ）。雛形と同じく、ラベルの行は設けず
    // 全列を結合した1行にそのままメモを書き込む（高さも雛形に合わせて広めに取る）
    const weekNote = dataStore.getWeekNote(dates[0]);
    const noteRowIndex = layout.length + 4;
    sheet.mergeCells(noteRowIndex, 1, noteRowIndex, totalCols);
    sheet.getRow(noteRowIndex).height = WEEK_NOTE_ROW_HEIGHT;
    const noteCell = sheet.getRow(noteRowIndex).getCell(1);
    noteCell.value = weekNote;
    noteCell.alignment = { horizontal: "left", vertical: "top", wrapText: true };
    sheet.getRow(noteRowIndex).eachCell({ includeEmpty: true }, (cell) => (cell.border = borderAll()));

    // 雛形の印刷設定（縦/横・用紙サイズ・余白）を引き継ぐ。日数が違うので幅だけ1ページに収める
    sheet.pageSetup = {
      ...look.pageSetup,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    };

    return workbook;
  }

  // ---- 入口 ----

  async function exportToExcel(dates) {
    const entries = dataStore.getEntriesForDates(dates);
    const layout = dataStore.getLayout();
    const className = App.storage.loadClassName();

    let workbook;
    if (dates.length === TEMPLATE_DAY_COLS.length) {
      // 雛形をそのまま使う場合は、雛形にすでに設定されている印刷設定（縦/横・余白など）を
      // そのまま尊重し、こちらからは一切上書きしない
      workbook = await exportUsingTemplate(dates, entries, layout, className);
    } else {
      const templateWorkbook = await loadTemplateWorkbook();
      const look = extractTemplateLook(templateWorkbook.getWorksheet(1));
      workbook = await exportProgrammatic(dates, entries, layout, className, look);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    downloadBuffer(buffer, buildFileName(dates));
  }

  return { exportToExcel };
})();
