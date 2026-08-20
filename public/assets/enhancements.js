(() => {
  const hi = () => currentLang === "hi";
  const copy = (en, hindi) => hi() ? hindi : en;
  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const safeList = (items) => (Array.isArray(items) ? items : []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let syncTimer;
  let lastSyncedUser = "";
  let activeAnimalIndex = -1;
  let cameraStream;
  let capturedPhoto;
  let ayushMuted = localStorage.getItem("gramunnat_ayush_muted") === "true";
  const ayushMessages = [];

  async function userKey() {
    if (!currentUser?.phone) return null;
    const bytes = new TextEncoder().encode(`gramunnat:${currentUser.phone}`);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function stateSnapshot() {
    return {
      livestock,
      records,
      scanCount,
      language: currentLang,
      mute: ayushMuted,
      lastDiagnosis: store.get("lastDiagnosis", null),
      savedAt: new Date().toISOString(),
    };
  }

  async function pushState() {
    const key = await userKey();
    if (!key) return;
    try {
      const response = await fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-gramunnat-user": key },
        body: JSON.stringify({ data: stateSnapshot() }),
      });
      if (!response.ok) throw new Error("sync unavailable");
      const note = document.getElementById("ayushSyncNote");
      if (note) note.textContent = copy("Saved locally + synced", "स्थानीय रूप से सहेजा + सिंक किया");
    } catch {
      const note = document.getElementById("ayushSyncNote");
      if (note) note.textContent = copy("Saved locally · sync pending", "स्थानीय रूप से सहेजा · सिंक बाकी");
    }
  }

  function queueSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(pushState, 700);
  }

  async function pullState() {
    const key = await userKey();
    if (!key || lastSyncedUser === key) return;
    lastSyncedUser = key;
    try {
      const response = await fetch("/api/state", { headers: { "x-gramunnat-user": key } });
      if (!response.ok) throw new Error("sync unavailable");
      const remote = (await response.json()).data;
      if (remote) {
        livestock = Array.isArray(remote.livestock) ? remote.livestock : livestock;
        records = Array.isArray(remote.records) ? remote.records : records;
        scanCount = Number.isFinite(remote.scanCount) ? remote.scanCount : scanCount;
        ayushMuted = typeof remote.mute === "boolean" ? remote.mute : ayushMuted;
        store.set("livestock", livestock);
        store.set("records", records);
        store.set("scanCount", scanCount);
        if (remote.lastDiagnosis) store.set("lastDiagnosis", remote.lastDiagnosis);
        renderLivestock();
        renderRecords();
        updateStats();
        updateMuteButton();
      } else {
        queueSync();
      }
    } catch {
      lastSyncedUser = "";
    }
  }

  const originalStoreSet = store.set.bind(store);
  store.set = (key, value) => {
    originalStoreSet(key, value);
    if (["livestock", "records", "scanCount", "lastDiagnosis"].includes(key)) queueSync();
  };
  const originalCompleteLogin = completeLogin;
  completeLogin = (user) => {
    originalCompleteLogin(user);
    setTimeout(pullState, 150);
  };

  function optimizeImage(dataUrl, maxSize = 1500, quality = 0.84) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      image.onerror = reject;
      image.src = dataUrl;
    });
  }

  function setCropPhoto(dataUrl) {
    uploadedImageData = dataUrl;
    const image = document.getElementById("previewImg");
    image.src = dataUrl;
    image.style.display = "block";
    document.getElementById("uploadPrompt").style.display = "none";
    document.getElementById("uploadZone").classList.add("has-image");
    document.getElementById("analyzeBtn").disabled = false;
    document.getElementById("analysisResult").style.display = "none";
  }

  function setupDiagnosis() {
    const file = document.getElementById("fileInput");
    file.removeAttribute("capture");
    const zone = document.getElementById("uploadZone");
    const toolbar = document.createElement("div");
    toolbar.className = "diagnosis-toolbar";
    toolbar.innerHTML = `<button class="btn outline" id="chooseCropPhoto">🖼️ ${copy("Upload Image", "चित्र अपलोड करें")}</button><button class="btn outline" id="openCropCamera">📷 ${copy("Open Camera", "कैमरा खोलें")}</button>`;
    zone.after(toolbar);
    toolbar.insertAdjacentHTML("afterend", `<div class="diagnosis-context">
      <div class="field"><label>${copy("Crop (optional)", "फसल (वैकल्पिक)")}</label><input id="diagnosisCrop" placeholder="${copy("e.g. Tomato", "जैसे टमाटर")}"></div>
      <div class="field"><label>${copy("Location (optional)", "स्थान (वैकल्पिक)")}</label><input id="diagnosisLocation" placeholder="${copy("Village / district", "गांव / जिला")}"></div>
      <div class="field"><label>${copy("Symptom duration", "लक्षण की अवधि")}</label><input id="diagnosisDuration" placeholder="${copy("e.g. 5 days", "जैसे 5 दिन")}"></div>
    </div><p class="danger-note">${copy("1 Upload or capture a clear photo. 2 Preview or retake it. 3 Tell us the crop, location, and symptom duration. 4 Press Diagnose.", "1 साफ फोटो अपलोड या कैप्चर करें। 2 देखें या दोबारा लें। 3 हमें फसल, स्थान और लक्षण की अवधि बताएं। 4 निदान दबाएं।")}</p>`);
    document.getElementById("chooseCropPhoto").onclick = () => file.click();
    document.getElementById("openCropCamera").onclick = openCamera;
    file.addEventListener("change", () => {
      const selected = file.files?.[0];
      if (!selected) return;
      if (!selected.type.startsWith("image/")) return toast(copy("Please choose an image.", "कृपया चित्र चुनें।"));
      const reader = new FileReader();
      reader.onload = async () => setCropPhoto(await optimizeImage(reader.result));
      reader.readAsDataURL(selected);
    }, { capture: true });

    const camera = document.createElement("div");
    camera.className = "camera-sheet";
    camera.id = "cameraSheet";
    camera.innerHTML = `<div class="camera-card"><h3>${copy("Capture plant photo", "पौधे की फोटो लें")}</h3><video id="cameraVideo" autoplay playsinline muted></video><canvas id="cameraCanvas" class="hidden"></canvas><div class="camera-actions"><button class="btn gold" id="capturePhoto">📸 ${copy("Capture", "फोटो लें")}</button><button class="btn outline hidden" id="retakePhoto">↻ ${copy("Retake", "दोबारा लें")}</button><button class="btn hidden" id="usePhoto">✓ ${copy("Use Photo", "फोटो उपयोग करें")}</button><button class="btn outline" id="closeCamera">${copy("Cancel", "रद्द करें")}</button></div><p class="danger-note" id="cameraError"></p></div>`;
    document.body.appendChild(camera);
    document.getElementById("capturePhoto").onclick = captureCamera;
    document.getElementById("retakePhoto").onclick = retakeCamera;
    document.getElementById("usePhoto").onclick = async () => {
      setCropPhoto(await optimizeImage(capturedPhoto));
      closeCamera();
    };
    document.getElementById("closeCamera").onclick = closeCamera;
    document.getElementById("analyzeBtn").onclick = diagnoseCrop;
  }

  async function openCamera() {
    const sheet = document.getElementById("cameraSheet");
    const error = document.getElementById("cameraError");
    error.textContent = "";
    sheet.classList.add("show");
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      document.getElementById("cameraVideo").srcObject = cameraStream;
      retakeCamera();
    } catch {
      error.textContent = copy("Camera permission was denied or unavailable. You can still use Upload Image.", "कैमरा अनुमति नहीं मिली या उपलब्ध नहीं है। आप चित्र अपलोड कर सकते हैं।");
    }
  }

  function captureCamera() {
    const video = document.getElementById("cameraVideo");
    if (!video.videoWidth) return;
    const canvas = document.getElementById("cameraCanvas");
    const max = 1500;
    const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = video.videoWidth * scale;
    canvas.height = video.videoHeight * scale;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    capturedPhoto = canvas.toDataURL("image/jpeg", .86);
    video.classList.add("hidden");
    canvas.classList.remove("hidden");
    document.getElementById("capturePhoto").classList.add("hidden");
    document.getElementById("retakePhoto").classList.remove("hidden");
    document.getElementById("usePhoto").classList.remove("hidden");
  }

  function retakeCamera() {
    capturedPhoto = "";
    document.getElementById("cameraVideo").classList.remove("hidden");
    document.getElementById("cameraCanvas").classList.add("hidden");
    document.getElementById("capturePhoto").classList.remove("hidden");
    document.getElementById("retakePhoto").classList.add("hidden");
    document.getElementById("usePhoto").classList.add("hidden");
  }

  function closeCamera() {
    cameraStream?.getTracks().forEach((track) => track.stop());
    cameraStream = null;
    document.getElementById("cameraSheet").classList.remove("show");
  }

  async function diagnoseCrop() {
    const image = uploadedImageData || document.getElementById("previewImg").src;
    if (!image?.startsWith("data:image/")) return;
    const button = document.getElementById("analyzeBtn");
    const result = document.getElementById("analysisResult");
    button.disabled = true;
    button.textContent = copy("Diagnosing…", "निदान हो रहा है…");
    result.style.display = "block";
    document.getElementById("resultBody").innerHTML = `<p>${copy("The live vision model is reviewing the image…", "लाइव विज़न मॉडल चित्र की जांच कर रहा है…")}</p>`;
    try {
      const response = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image,
          crop: document.getElementById("diagnosisCrop").value.trim(),
          location: document.getElementById("diagnosisLocation").value.trim(),
          duration: document.getElementById("diagnosisDuration").value.trim(),
          language: currentLang,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Diagnosis unavailable");
      const diagnosis = payload.result;
      scanCount += 1;
      store.set("scanCount", scanCount);
      store.set("lastDiagnosis", diagnosis);
      updateStats();
      document.getElementById("resultBody").innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><div class="mini-chip">${escapeHtml(diagnosis.crop)}</div><h3 style="margin-top:7px">🔬 ${escapeHtml(diagnosis.disease)}</h3></div><span class="badge ${diagnosis.confidence >= 75 ? "warn" : "ok"}">${diagnosis.confidence}% ${copy("confidence", "विश्वास")}</span></div><div class="confidence-bar"><div class="confidence-fill" style="width:${diagnosis.confidence}%"></div></div><p style="margin-top:12px"><strong>${copy("Likely cause:", "संभावित कारण:")}</strong> ${escapeHtml(diagnosis.likelyCause)}</p><div class="diagnosis-grid"><div class="diagnosis-block"><h4>${copy("Visible symptoms", "दिखने वाले लक्षण")}</h4><ul>${safeList(diagnosis.visibleSymptoms)}</ul></div><div class="diagnosis-block"><h4>${copy("Crop-care steps", "फसल देखभाल")}</h4><ul>${safeList(diagnosis.careSteps)}</ul></div><div class="diagnosis-block"><h4>${copy("Prevention", "रोकथाम")}</h4><ul>${safeList(diagnosis.prevention)}</ul></div><div class="diagnosis-block"><h4>${copy("Monitor next", "आगे निगरानी")}</h4><ul>${safeList(diagnosis.monitoring)}</ul></div></div><p class="danger-note">${escapeHtml(diagnosis.disclaimer || copy("AI-assisted possible match; not a guaranteed diagnosis.", "AI-सहायित संभावित पहचान; पक्का निदान नहीं।"))}</p><button class="btn outline small" id="explainDiagnosis">${copy("Explain with Ayush", "आयुष से समझें")}</button>`;
      document.getElementById("explainDiagnosis").onclick = () => {
        openAyush();
        sendAyush(copy("Explain my latest crop diagnosis and what I should do next.", "मेरे नवीनतम फसल निदान को समझाएं और आगे क्या करना चाहिए बताएं।"));
      };
    } catch (error) {
      document.getElementById("resultBody").innerHTML = `<div class="service-error"><strong>${copy("Live diagnosis unavailable", "लाइव निदान उपलब्ध नहीं")}</strong><p>${escapeHtml(error.message)}</p><p>${copy("No random or simulated disease result was substituted.", "कोई यादृच्छिक या सिम्युलेटेड रोग परिणाम नहीं दिखाया गया।")}</p></div>`;
    } finally {
      button.disabled = false;
      button.textContent = copy("🔍 Diagnose", "🔍 निदान करें");
    }
  }

  function addFieldMarkup() {
    const save = document.getElementById("saveAnimal");
    const details = document.createElement("div");
    details.className = "animal-detail-grid";
    details.innerHTML = `<div class="row"><div class="field"><label>${copy("Breed", "नस्ल")}</label><input id="animalBreed"></div><div class="field"><label>${copy("Sex", "लिंग")}</label><select id="animalSex"><option value="Female">${copy("Female", "मादा")}</option><option value="Male">${copy("Male", "नर")}</option><option value="Unknown">${copy("Unknown", "अज्ञात")}</option></select></div></div><div class="row"><div class="field"><label>${copy("Age", "आयु")}</label><input id="animalAge" placeholder="${copy("e.g. 3 years", "जैसे 3 वर्ष")}"></div><div class="field"><label>${copy("Date of birth", "जन्म तिथि")}</label><input id="animalDob" type="date"></div></div><div class="field"><label>${copy("Tag / ID number", "टैग / ID नंबर")}</label><input id="animalTag"></div><div class="field"><label>${copy("Photo (optional)", "फोटो (वैकल्पिक)")}</label><input id="animalPhoto" type="file" accept="image/*"></div>`;
    save.parentElement.before(details);
    const type = document.getElementById("animalType");
    type.innerHTML = `<option>Cow</option><option>Buffalo</option><option>Goat</option><option>Poultry</option><option>Other</option>`;
    document.querySelector('label[for="animalId"]')?.replaceChildren(document.createTextNode(copy("Animal name", "पशु का नाम")));
    document.getElementById("saveAnimal").onclick = saveEnhancedAnimal;

    const recordSave = document.getElementById("saveRecord");
    const recordExtras = document.createElement("div");
    recordExtras.className = "record-detail-grid";
    recordExtras.innerHTML = `<div class="row"><div class="field"><label>${copy("Date", "तिथि")}</label><input type="date" id="recDate"></div><div class="field"><label>${copy("Treatment", "उपचार")}</label><input id="recTreatment"></div></div>`;
    recordSave.parentElement.before(recordExtras);
    recordSave.onclick = saveEnhancedFarmRecord;
  }

  async function fileAsSmallImage(input) {
    const file = input.files?.[0];
    if (!file) return "";
    const raw = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(file); });
    return optimizeImage(raw, 360, .72);
  }

  async function saveEnhancedAnimal() {
    const type = document.getElementById("animalType").value;
    const name = document.getElementById("animalId").value.trim() || `${type} ${livestock.length + 1}`;
    const symptom = document.getElementById("animalSymptom").value;
    livestock.push({
      uuid: uid(), type, id: name, name, symptom, breed: document.getElementById("animalBreed").value.trim(),
      age: document.getElementById("animalAge").value.trim(), dob: document.getElementById("animalDob").value,
      sex: document.getElementById("animalSex").value, tag: document.getElementById("animalTag").value.trim(),
      photo: await fileAsSmallImage(document.getElementById("animalPhoto")), records: [], date: Date.now(),
    });
    store.set("livestock", livestock);
    document.getElementById("animalModalBg").classList.remove("show");
    document.querySelectorAll("#animalModalBg input").forEach((input) => input.value = "");
    renderLivestock();
    toast(copy("Animal profile saved", "पशु प्रोफ़ाइल सहेजी गई"));
  }

  function animalIcon(type) {
    return ({ Cow: "🐄", Buffalo: "🐃", Goat: "🐐", Poultry: "🐔", Other: "🐾" })[type] || "🐾";
  }

  function enhancedRenderLivestock() {
    const wrap = document.getElementById("livestockList");
    if (!wrap) return;
    if (!livestock.length) {
      wrap.innerHTML = `<div class="card empty-state" style="grid-column:1/-1"><div class="glyph">🐄</div><p>${copy("No animals added yet. Tap Add Animal to create a persistent profile.", "अभी कोई पशु नहीं जोड़ा गया। स्थायी प्रोफ़ाइल बनाने के लिए पशु जोड़ें दबाएं।")}</p></div>`;
      return updateStats();
    }
    wrap.innerHTML = livestock.map((animal, index) => {
      animal.records ||= [];
      const latest = animal.records.at(-1);
      return `<article class="card"><div class="animal-head">${animal.photo ? `<img class="animal-photo" src="${animal.photo}" alt="">` : `<div class="animal-photo" style="display:grid;place-items:center;font-size:28px">${animalIcon(animal.type)}</div>`}<div><h3>${escapeHtml(animal.name || animal.id)}</h3><p>${escapeHtml(animal.type)}${animal.breed ? ` · ${escapeHtml(animal.breed)}` : ""}</p></div></div><div class="animal-meta">${animal.tag ? `<span class="mini-chip">ID ${escapeHtml(animal.tag)}</span>` : ""}${animal.sex ? `<span class="mini-chip">${escapeHtml(animal.sex)}</span>` : ""}${animal.age ? `<span class="mini-chip">${escapeHtml(animal.age)}</span>` : ""}${animal.dob ? `<span class="mini-chip">DOB ${escapeHtml(animal.dob)}</span>` : ""}</div><div class="animal-records"><strong>${copy("Health records", "स्वास्थ्य रिकॉर्ड")} (${animal.records.length})</strong>${latest ? `<div class="animal-record"><b>${escapeHtml(latest.type)}</b> · ${escapeHtml(latest.date || "")}<br>${escapeHtml(latest.summary || latest.notes || "")}</div>` : `<p>${copy("No records yet.", "अभी कोई रिकॉर्ड नहीं।")}</p>`}</div><div class="animal-actions"><button class="btn small" onclick="window.gramunnatAddAnimalRecord(${index})">+ ${copy("Add Record", "रिकॉर्ड जोड़ें")}</button><button class="btn outline small" onclick="removeAnimal(${index})">${copy("Remove", "हटाएं")}</button></div></article>`;
    }).join("");
    updateStats();
  }
  renderLivestock = enhancedRenderLivestock;

  function setupAnimalRecords() {
    const modal = document.createElement("div");
    modal.className = "modal-bg";
    modal.id = "animalRecordModalBg";
    modal.innerHTML = `<div class="modal"><h2>${copy("Add Animal Record", "पशु रिकॉर्ड जोड़ें")}</h2><div class="field"><label>${copy("Record type", "रिकॉर्ड प्रकार")}</label><select id="animalRecordType"><option>Vaccination</option><option>Weight</option><option>Milk yield</option><option>Health issue</option></select></div><div class="row"><div class="field"><label>${copy("Date", "तिथि")}</label><input type="date" id="animalRecordDate"></div><div class="field"><label>${copy("Value / summary", "मान / सारांश")}</label><input id="animalRecordSummary" placeholder="${copy("e.g. 320 kg or FMD vaccine", "जैसे 320 किग्रा या FMD टीका")}"></div></div><div class="field"><label>${copy("Symptoms", "लक्षण")}</label><input id="animalRecordSymptoms"></div><div class="field"><label>${copy("Management / treatment notes", "प्रबंधन / उपचार नोट्स")}</label><textarea id="animalRecordTreatment"></textarea></div><div class="field"><label>${copy("Additional notes", "अतिरिक्त नोट्स")}</label><textarea id="animalRecordNotes"></textarea></div><div style="display:flex;gap:9px;justify-content:flex-end"><button class="btn outline" id="cancelAnimalRecord">${copy("Cancel", "रद्द करें")}</button><button class="btn gold" id="saveAnimalRecord">${copy("Save Record", "रिकॉर्ड सहेजें")}</button></div></div>`;
    document.body.appendChild(modal);
    document.getElementById("cancelAnimalRecord").onclick = () => modal.classList.remove("show");
    document.getElementById("saveAnimalRecord").onclick = () => {
      const animal = livestock[activeAnimalIndex];
      if (!animal) return;
      animal.records ||= [];
      animal.records.push({ id: uid(), type: document.getElementById("animalRecordType").value, date: document.getElementById("animalRecordDate").value || new Date().toISOString().slice(0, 10), summary: document.getElementById("animalRecordSummary").value.trim(), symptoms: document.getElementById("animalRecordSymptoms").value.trim(), treatment: document.getElementById("animalRecordTreatment").value.trim(), notes: document.getElementById("animalRecordNotes").value.trim() });
      store.set("livestock", livestock);
      modal.classList.remove("show");
      renderLivestock();
      toast(copy("Animal record saved", "पशु रिकॉर्ड सहेजा गया"));
    };
    window.gramunnatAddAnimalRecord = (index) => {
      activeAnimalIndex = index;
      document.getElementById("animalRecordDate").value = new Date().toISOString().slice(0, 10);
      modal.classList.add("show");
    };
  }

  function saveEnhancedFarmRecord() {
    const crop = document.getElementById("recCrop").value.trim();
    if (!crop) return toast(copy("Please enter a crop", "कृपया फसल दर्ज करें"));
    records.push({ id: uid(), crop, season: document.getElementById("recSeason").value.trim(), yieldVal: document.getElementById("recYield").value, treatment: document.getElementById("recTreatment").value.trim(), notes: document.getElementById("recNotes").value.trim(), recordDate: document.getElementById("recDate").value, date: Date.now() });
    store.set("records", records);
    document.querySelectorAll("#recordModalBg input,#recordModalBg textarea").forEach((input) => input.value = "");
    document.getElementById("recordModalBg").classList.remove("show");
    renderRecords();
    toast(copy("Farm record saved", "खेत रिकॉर्ड सहेजा गया"));
  }

  function enhancedRenderRecords() {
    const wrap = document.getElementById("recordsTableWrap");
    if (!wrap) return;
    if (!records.length) {
      wrap.innerHTML = `<div class="empty-state"><div class="glyph">📋</div><p>${copy("No farm records yet.", "अभी कोई खेत रिकॉर्ड नहीं।")}</p></div>`;
      return updateStats();
    }
    wrap.innerHTML = `<table><thead><tr><th>${copy("Crop", "फसल")}</th><th>${copy("Season / Date", "सीज़न / तिथि")}</th><th>${copy("Yield", "उपज")}</th><th>${copy("Treatment / Notes", "उपचार / नोट्स")}</th><th></th></tr></thead><tbody>${records.slice().reverse().map((record, reverseIndex) => { const index = records.length - reverseIndex - 1; return `<tr><td><strong>${escapeHtml(record.crop)}</strong></td><td>${escapeHtml(record.season || "—")}<br><small>${escapeHtml(record.recordDate || new Date(record.date).toLocaleDateString())}</small></td><td>${record.yieldVal ? `${escapeHtml(record.yieldVal)} q/acre` : "—"}</td><td>${escapeHtml(record.treatment || "")}${record.treatment && record.notes ? " · " : ""}${escapeHtml(record.notes || "—")}</td><td><button class="btn outline small" onclick="removeRecord(${index})">${copy("Remove", "हटाएं")}</button></td></tr>`; }).join("")}</tbody></table>`;
    updateStats();
  }
  renderRecords = enhancedRenderRecords;

  function setupAyush() {
    const panel = document.querySelector("#panel-chatbot .chat-wrap");
    panel.innerHTML = `<div class="ayush-page-card"><img src="/assets/ayush.png" alt="Ayush"><h3>${copy("Ayush is ready", "आयुष तैयार है")}</h3><p>${copy("Open the side assistant for natural English or Hindi chat, voice input, live weather/news context, and help navigating GramUnnat.", "स्वाभाविक अंग्रेज़ी या हिन्दी चैट, आवाज़, लाइव मौसम/समाचार और ग्रामोन्नत नेविगेशन के लिए साइड सहायक खोलें।")}</p><button class="btn gold" id="openAyushFromPage">${copy("Open Ayush", "आयुष खोलें")}</button></div>`;
    document.getElementById("openAyushFromPage").onclick = openAyush;
    const launcher = document.createElement("button");
    launcher.className = "ayush-launcher";
    launcher.setAttribute("aria-label", "Open Ayush assistant");
    launcher.innerHTML = `<img src="/assets/ayush.png" alt="">`;
    launcher.onclick = () => document.getElementById("ayushDrawer").classList.toggle("show");
    const drawer = document.createElement("aside");
    drawer.className = "ayush-drawer";
    drawer.id = "ayushDrawer";
    drawer.setAttribute("aria-label", "Ayush agricultural assistant");
    drawer.innerHTML = `<div class="ayush-head"><img src="/assets/ayush.png" alt="Ayush"><div class="ayush-head-copy"><strong>${copy("Ayush", "आयुष")}</strong><span>${copy("GramUnnat side assistant", "ग्रामोन्नत साइड सहायक")}</span></div><button class="icon-button" id="ayushMute" title="Mute"></button><button class="icon-button" id="ayushClose" title="Close">✕</button></div><div class="ayush-status" id="ayushStatus">${copy("Ready · English + हिंदी", "तैयार · हिन्दी + English")}</div><div class="ayush-log" id="ayushLog"></div><div class="ayush-suggestions" id="ayushSuggestions"><button>${copy("Diagnose my crop", "मेरी फसल का निदान")}</button><button>${copy("Show weather", "मौसम दिखाएं")}</button><button>${copy("Show my livestock", "मेरे पशु दिखाएं")}</button><button>${copy("Agriculture news today", "आज के कृषि समाचार")}</button></div><div class="ayush-compose"><button class="btn outline" id="ayushMic" aria-label="Voice input">🎤</button><input id="ayushInput" placeholder="${copy("Ask Ayush naturally…", "आयुष से स्वाभाविक रूप से पूछें…")}"><button class="btn" id="ayushSend" aria-label="Send">➤</button></div><div class="sync-note" id="ayushSyncNote">${copy("Saved locally", "स्थानीय रूप से सहेजा")}</div>`;
    document.body.append(launcher, drawer);
    document.getElementById("ayushClose").onclick = () => drawer.classList.remove("show");
    document.getElementById("ayushMute").onclick = () => { ayushMuted = !ayushMuted; localStorage.setItem("gramunnat_ayush_muted", ayushMuted); updateMuteButton(); queueSync(); if (ayushMuted) window.speechSynthesis?.cancel(); };
    document.getElementById("ayushSend").onclick = () => sendAyush();
    document.getElementById("ayushInput").addEventListener("keydown", (event) => { if (event.key === "Enter") sendAyush(); });
    document.querySelectorAll("#ayushSuggestions button").forEach((button) => button.onclick = () => sendAyush(button.textContent));
    document.getElementById("ayushMic").onclick = startAyushVoice;
    updateMuteButton();
    addAyushMessage(copy("Namaste! I’m Ayush. Ask me about farming, crop symptoms, livestock, weather, records, or any GramUnnat section.", "नमस्ते! मैं आयुष हूं। खेती, फसल लक्षण, पशुधन, मौसम, रिकॉर्ड या ग्रामोन्नत के किसी भी भाग के बारे में पूछें।"), "bot");
  }

  function openAyush() {
    document.getElementById("ayushDrawer")?.classList.add("show");
    setTimeout(() => document.getElementById("ayushInput")?.focus(), 100);
  }

  function updateMuteButton() {
    const button = document.getElementById("ayushMute");
    if (!button) return;
    button.textContent = ayushMuted ? "🔇" : "🔊";
    button.title = ayushMuted ? copy("Unmute voice", "आवाज़ चालू करें") : copy("Mute voice", "आवाज़ बंद करें");
  }

  function addAyushMessage(text, who) {
    const log = document.getElementById("ayushLog");
    if (!log) return;
    const message = document.createElement("div");
    message.className = `ayush-message ${who}`;
    message.textContent = text;
    log.appendChild(message);
    log.scrollTop = log.scrollHeight;
  }

  function ayushFarmData() {
    return {
      livestock: livestock.map((animal) => ({ name: animal.name || animal.id, type: animal.type, breed: animal.breed, tag: animal.tag, records: animal.records || [] })),
      farmRecords: records,
      scanCount,
    };
  }

  async function sendAyush(prefilled) {
    const input = document.getElementById("ayushInput");
    const text = (prefilled || input?.value || "").trim();
    if (!text) return;
    openAyush();
    if (input) input.value = "";
    ayushMessages.push({ role: "user", content: text });
    addAyushMessage(text, "user");
    setAyushStatus(copy("Processing…", "समझ रहा हूं…"));
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: ayushMessages, language: currentLang, farmData: ayushFarmData(), diagnosis: store.get("lastDiagnosis", null), location: lastLocation, clientTime: new Date().toString() }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Ayush unavailable");
      ayushMessages.push({ role: "assistant", content: payload.reply });
      addAyushMessage(payload.reply, "bot");
      if (payload.navigate) setTimeout(() => { goTo(payload.navigate); drawerCloseAfterNavigation(); }, 450);
      if (!ayushMuted) speakAyush(payload.reply);
      else setAyushStatus(copy("Ready · muted", "तैयार · आवाज़ बंद"));
    } catch (error) {
      addAyushMessage(error.message, "bot");
      setAyushStatus(copy("Text chat ready · live AI unavailable", "टेक्स्ट चैट तैयार · लाइव AI अनुपलब्ध"));
    }
  }

  function drawerCloseAfterNavigation() {
    if (window.innerWidth < 700) document.getElementById("ayushDrawer").classList.remove("show");
  }

  function setAyushStatus(text) {
    const status = document.getElementById("ayushStatus");
    if (status) status.textContent = text;
  }

  function speakAyush(text) {
    if (!("speechSynthesis" in window) || ayushMuted) return setAyushStatus(copy("Ready", "तैयार"));
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/[*#_`]/g, ""));
    utterance.lang = currentLang === "hi" ? "hi-IN" : "en-IN";
    utterance.rate = .95;
    utterance.onstart = () => setAyushStatus(copy("Speaking…", "बोल रहा हूं…"));
    utterance.onend = () => setAyushStatus(copy("Ready", "तैयार"));
    utterance.onerror = () => setAyushStatus(copy("Ready · voice unavailable", "तैयार · आवाज़ अनुपलब्ध"));
    speechSynthesis.speak(utterance);
  }

  function startAyushVoice() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return setAyushStatus(copy("Voice input unavailable · type instead", "वॉइस इनपुट उपलब्ध नहीं · टाइप करें"));
    const recognition = new Recognition();
    recognition.lang = currentLang === "hi" ? "hi-IN" : "en-IN";
    recognition.interimResults = false;
    const button = document.getElementById("ayushMic");
    button.classList.add("mic-active");
    setAyushStatus(copy("Listening…", "सुन रहा हूं…"));
    recognition.onresult = (event) => sendAyush(event.results[0][0].transcript);
    recognition.onend = () => button.classList.remove("mic-active");
    recognition.onerror = () => { button.classList.remove("mic-active"); setAyushStatus(copy("Voice input unavailable · type instead", "वॉइस इनपुट उपलब्ध नहीं · टाइप करें")); };
    recognition.start();
  }

  setupDiagnosis();
  addFieldMarkup();
  setupAnimalRecords();
  setupAyush();
  const authLanguage = document.createElement("select");
  authLanguage.id = "authLanguage";
  authLanguage.setAttribute("aria-label", "Select language");
  authLanguage.innerHTML = `<option value="en">🇬🇧 English</option><option value="hi">🇮🇳 हिन्दी</option>`;
  authLanguage.value = currentLang;
  authLanguage.style.cssText = "position:absolute;top:16px;right:16px;width:auto;z-index:2";
  document.querySelector(".auth-card")?.appendChild(authLanguage);
  authLanguage.onchange = () => { localStorage.setItem("gramunnat_language", authLanguage.value); location.reload(); };
  renderLivestock();
  renderRecords();
  document.getElementById("langSelect").addEventListener("change", () => {
    localStorage.setItem("gramunnat_language", currentLang);
    setTimeout(() => location.reload(), 50);
  });
  setTimeout(() => { if (currentUser) pullState(); }, 250);
})();
