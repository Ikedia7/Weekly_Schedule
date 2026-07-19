/**
 * 「持ち物の自動追加ルール」画面。
 * 「この曜日は必ずこれが要る」「この教科の日は必ずこれが要る」というルールを登録・削除できる。
 * 実際にその日の持ち物欄へ追加する処理自体は js/dataStore.js 側（曜日は新しい日を作った時、
 * 教科は教科プルダウンを選んだ時、加えてルール登録時にすでにある日程へ遡って適用）で行う。
 * ここは登録・削除のUIだけを担当する。
 */
window.App = window.App || {};

App.belongingsRulesManager = (function () {
  const { dataStore, config } = App;

  function conditionLabel(rule) {
    if (rule.conditionType === "dayOfWeek") return `曜日: ${rule.conditionValue}`;
    const subject = dataStore.getSubjectById(rule.conditionValue);
    return `教科: ${(subject && subject.name) || rule.conditionValue}`;
  }

  function buildRow(rule) {
    const wrapper = document.createElement("div");
    wrapper.className = "belongings-rule-row";

    const conditionSpan = document.createElement("span");
    conditionSpan.className = "belongings-rule-condition";
    conditionSpan.textContent = conditionLabel(rule);
    wrapper.appendChild(conditionSpan);

    const arrow = document.createElement("span");
    arrow.textContent = "→";
    wrapper.appendChild(arrow);

    const itemSpan = document.createElement("span");
    itemSpan.className = "belongings-rule-item";
    itemSpan.textContent = rule.item;
    wrapper.appendChild(itemSpan);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "belongings-rule-delete";
    deleteBtn.textContent = "削除";
    deleteBtn.addEventListener("click", () => {
      const rules = dataStore.getBelongingsRules().filter((r) => r.id !== rule.id);
      dataStore.setBelongingsRules(rules);
      renderList();
    });
    wrapper.appendChild(deleteBtn);

    return wrapper;
  }

  function renderList() {
    const container = document.getElementById("belongingsRulesList");
    container.innerHTML = "";
    dataStore.getBelongingsRules().forEach((rule) => {
      container.appendChild(buildRow(rule));
    });
  }

  // 条件タイプ（曜日／教科）に応じて、値のプルダウンの中身を作り直す
  function refreshConditionValueOptions() {
    const typeSelect = document.getElementById("newRuleConditionType");
    const valueSelect = document.getElementById("newRuleConditionValue");
    valueSelect.innerHTML = "";
    if (typeSelect.value === "dayOfWeek") {
      config.dayOfWeekLabels.forEach((label) => {
        const opt = document.createElement("option");
        opt.value = label;
        opt.textContent = label;
        valueSelect.appendChild(opt);
      });
    } else {
      dataStore.getSubjects().forEach((subject) => {
        if (subject.id === "") return; // 「（空欄）」は条件にできない
        const opt = document.createElement("option");
        opt.value = subject.id;
        opt.textContent = subject.name;
        valueSelect.appendChild(opt);
      });
    }
  }

  function handleAdd() {
    const typeSelect = document.getElementById("newRuleConditionType");
    const valueSelect = document.getElementById("newRuleConditionValue");
    const itemInput = document.getElementById("newRuleItem");
    const item = itemInput.value.trim();
    if (!item || !valueSelect.value) return;

    const rules = dataStore.getBelongingsRules();
    const newRule = {
      id: `rule_${Date.now()}`,
      conditionType: typeSelect.value,
      conditionValue: valueSelect.value,
      item,
    };
    rules.push(newRule);
    dataStore.setBelongingsRules(rules);
    // 登録前からすでにある日程にも、条件が合えばその場で持ち物を反映する
    dataStore.backfillBelongingsRule(newRule);
    App.render.renderAll();

    itemInput.value = "";
    renderList();
  }

  function open() {
    refreshConditionValueOptions();
    renderList();
    document.getElementById("belongingsRulesOverlay").classList.remove("hidden");
  }

  function close() {
    document.getElementById("belongingsRulesOverlay").classList.add("hidden");
  }

  function init() {
    document.getElementById("manageBelongingsRulesBtn").addEventListener("click", open);
    document.getElementById("closeBelongingsRulesBtn").addEventListener("click", close);
    document.getElementById("addBelongingsRuleBtn").addEventListener("click", handleAdd);
    document.getElementById("newRuleConditionType").addEventListener("change", refreshConditionValueOptions);
  }

  return { init };
})();
