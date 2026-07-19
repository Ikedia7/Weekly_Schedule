/**
 * 日付まわりの小さなユーティリティ関数。
 * 日付は常に "YYYY-MM-DD" 形式の文字列で扱う（保存・比較のしやすさのため）。
 */
window.App = window.App || {};

App.dateUtils = (function () {
  function toISODate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function parseISODate(isoString) {
    const [y, m, d] = isoString.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(isoString, diff) {
    const date = parseISODate(isoString);
    date.setDate(date.getDate() + diff);
    return toISODate(date);
  }

  function getDayOfWeekLabel(isoString) {
    const date = parseISODate(isoString);
    return App.config.dayOfWeekLabels[date.getDay()];
  }

  function todayISO() {
    return toISODate(new Date());
  }

  return { toISODate, parseISODate, addDays, getDayOfWeekLabel, todayISO };
})();
