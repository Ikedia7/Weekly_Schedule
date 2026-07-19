/**
 * 「教科・イラストの管理」画面。
 * 教科名の変更、画像の差し替え（用意したライブラリから選ぶ／パソコンから選ぶ）、
 * 新しい教科の追加・削除ができる。変更は都度 App.dataStore 経由でLocalStorageへ自動保存される。
 */
window.App = window.App || {};

App.subjectManager = (function () {
  const { dataStore } = App;

  // 画像選択パネルを開いている行のindex（nullなら閉じている）
  let openPickerIndex = null;

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function setSubjectImage(index, imagePath) {
    const subjects = dataStore.getSubjects();
    subjects[index].image = imagePath;
    dataStore.setSubjects(subjects);
    openPickerIndex = null;
    renderList();
  }

  // ギャラリーUI本体は galleryUI.js に共通化してある（イラストパレットとも共有）
  function buildGallery(index) {
    return App.galleryUI.buildGallery((item) => setSubjectImage(index, item.path));
  }

  function buildPicker(index) {
    const wrap = document.createElement("div");
    wrap.className = "image-picker";

    wrap.appendChild(buildGallery(index));

    const uploadLabel = document.createElement("label");
    uploadLabel.className = "image-picker-upload";
    uploadLabel.textContent = "パソコンから画像を選ぶ：";
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (!file) return;
      const dataUrl = await readFileAsDataURL(file);
      setSubjectImage(index, dataUrl);
    });
    uploadLabel.appendChild(fileInput);
    wrap.appendChild(uploadLabel);

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "image-picker-clear";
    clearBtn.textContent = "画像なしにする";
    clearBtn.addEventListener("click", () => setSubjectImage(index, ""));
    wrap.appendChild(clearBtn);

    return wrap;
  }

  function buildRow(subject, index) {
    const wrapper = document.createElement("div");
    wrapper.className = "subject-row-wrapper";

    const row = document.createElement("div");
    row.className = "subject-row";

    const thumb = document.createElement("img");
    thumb.className = "subject-row-thumb";
    if (subject.image) {
      thumb.src = subject.image;
    } else {
      thumb.classList.add("subject-row-thumb--empty");
    }
    row.appendChild(thumb);

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "subject-row-name";
    nameInput.value = subject.name;
    nameInput.addEventListener("input", () => {
      const subjects = dataStore.getSubjects();
      subjects[index].name = nameInput.value;
      dataStore.setSubjects(subjects);
    });
    row.appendChild(nameInput);

    const changeBtn = document.createElement("button");
    changeBtn.type = "button";
    changeBtn.textContent = "画像を変更";
    changeBtn.addEventListener("click", () => {
      openPickerIndex = openPickerIndex === index ? null : index;
      renderList();
    });
    row.appendChild(changeBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "subject-row-delete";
    deleteBtn.textContent = "削除";
    deleteBtn.addEventListener("click", () => {
      const ok = confirm(
        `「${subject.name}」を削除しますか？\nすでに時間割で使われている場合、その部分は空欄表示になります。`
      );
      if (!ok) return;
      const subjects = dataStore.getSubjects();
      subjects.splice(index, 1);
      dataStore.setSubjects(subjects);
      openPickerIndex = null;
      renderList();
    });
    row.appendChild(deleteBtn);

    wrapper.appendChild(row);
    if (openPickerIndex === index) {
      wrapper.appendChild(buildPicker(index));
    }
    return wrapper;
  }

  function renderList() {
    const container = document.getElementById("subjectManagerList");
    container.innerHTML = "";
    const subjects = dataStore.getSubjects();
    subjects.forEach((subject, index) => {
      if (subject.id === "") return; // 「（空欄）」は固定の選択肢なので管理対象から除く
      container.appendChild(buildRow(subject, index));
    });
  }

  function handleAdd() {
    const input = document.getElementById("newSubjectName");
    const name = input.value.trim();
    if (!name) return;

    const subjects = dataStore.getSubjects();
    const newSubject = { id: `custom_${Date.now()}`, name, image: "" };
    const emptyIndex = subjects.findIndex((s) => s.id === "");
    if (emptyIndex >= 0) subjects.splice(emptyIndex, 0, newSubject);
    else subjects.push(newSubject);
    dataStore.setSubjects(subjects);

    input.value = "";
    renderList();
  }

  function open() {
    openPickerIndex = null;
    renderList();
    document.getElementById("subjectManagerOverlay").classList.remove("hidden");
  }

  function close() {
    document.getElementById("subjectManagerOverlay").classList.add("hidden");
    App.render.renderAll(); // 変更を予定表側の教科選択にも反映する
  }

  function init() {
    document.getElementById("manageSubjectsBtn").addEventListener("click", open);
    document.getElementById("closeSubjectManagerBtn").addEventListener("click", close);
    document.getElementById("addSubjectBtn").addEventListener("click", handleAdd);
  }

  return { init };
})();
