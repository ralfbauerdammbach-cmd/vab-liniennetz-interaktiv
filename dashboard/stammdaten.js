(() => {
  const state = {
    version: 1,
    linienbuendel: [],
    verkehrsunternehmen: [],
    linienzuordnungen: []
  };

  const bundleBody = document.getElementById("bundle-body");
  const operatorBody = document.getElementById("operator-body");
  const assignmentBody = document.getElementById("assignment-body");
  const message = document.getElementById("masterdata-message");

  if (!bundleBody || !operatorBody || !assignmentBody) return;

  const uid = (prefix) => {
    if (window.crypto && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  function setMessage(text, type = "") {
    message.textContent = text;
    message.className = "masterdata-message";
    if (type) message.classList.add(type);
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function bundleOptions(selected) {
    const options = ['<option value="">Bitte wählen</option>'];
    for (const item of state.linienbuendel) {
      options.push(`<option value="${esc(item.id)}"${item.id === selected ? " selected" : ""}>${esc(item.name)}</option>`);
    }
    return options.join("");
  }

  function operatorOptions(selected) {
    const options = ['<option value="">Bitte wählen</option>'];
    for (const item of state.verkehrsunternehmen) {
      const label = item.kuerzel ? `${item.name} (${item.kuerzel})` : item.name;
      options.push(`<option value="${esc(item.id)}"${item.id === selected ? " selected" : ""}>${esc(label)}</option>`);
    }
    return options.join("");
  }

  function renderBundles() {
    bundleBody.innerHTML = state.linienbuendel.map((item) => `
      <tr data-id="${esc(item.id)}">
        <td><input class="bundle-name" type="text" value="${esc(item.name)}" placeholder="z. B. Hochspessart A"></td>
        <td><input class="bundle-active" type="checkbox"${item.aktiv !== false ? " checked" : ""}></td>
        <td><button class="masterdata-delete delete-bundle" type="button">Entfernen</button></td>
      </tr>
    `).join("");
  }

  function renderOperators() {
    operatorBody.innerHTML = state.verkehrsunternehmen.map((item) => `
      <tr data-id="${esc(item.id)}">
        <td><input class="operator-name" type="text" value="${esc(item.name)}" placeholder="Name des VU"></td>
        <td><input class="operator-code" type="text" value="${esc(item.kuerzel || "")}" placeholder="z. B. STAAB"></td>
        <td><input class="operator-active" type="checkbox"${item.aktiv !== false ? " checked" : ""}></td>
        <td><button class="masterdata-delete delete-operator" type="button">Entfernen</button></td>
      </tr>
    `).join("");
  }

  function renderAssignments() {
    assignmentBody.innerHTML = state.linienzuordnungen.map((item) => `
      <tr data-id="${esc(item.id)}">
        <td><select class="assignment-bundle">${bundleOptions(item.linienbuendel_id)}</select></td>
        <td><select class="assignment-operator">${operatorOptions(item.verkehrsunternehmen_id)}</select></td>
        <td><input class="assignment-line" type="text" value="${esc(item.linie)}" placeholder="Linie"></td>
        <td><input class="assignment-from" type="date" value="${esc(item.gueltig_von || "")}"></td>
        <td><input class="assignment-to" type="date" value="${esc(item.gueltig_bis || "")}"></td>
        <td><input class="assignment-active" type="checkbox"${item.aktiv !== false ? " checked" : ""}></td>
        <td><button class="masterdata-delete delete-assignment" type="button">Entfernen</button></td>
      </tr>
    `).join("");
  }

  function renderAll() {
    renderBundles();
    renderOperators();
    renderAssignments();
  }

  function syncFromDom() {
    state.linienbuendel = [...bundleBody.querySelectorAll("tr")].map((row) => ({
      id: row.dataset.id,
      name: row.querySelector(".bundle-name").value.trim(),
      aktiv: row.querySelector(".bundle-active").checked
    }));

    state.verkehrsunternehmen = [...operatorBody.querySelectorAll("tr")].map((row) => ({
      id: row.dataset.id,
      name: row.querySelector(".operator-name").value.trim(),
      kuerzel: row.querySelector(".operator-code").value.trim(),
      aktiv: row.querySelector(".operator-active").checked
    }));

    state.linienzuordnungen = [...assignmentBody.querySelectorAll("tr")].map((row) => ({
      id: row.dataset.id,
      linienbuendel_id: row.querySelector(".assignment-bundle").value,
      verkehrsunternehmen_id: row.querySelector(".assignment-operator").value,
      linie: row.querySelector(".assignment-line").value.trim(),
      gueltig_von: row.querySelector(".assignment-from").value,
      gueltig_bis: row.querySelector(".assignment-to").value,
      aktiv: row.querySelector(".assignment-active").checked
    }));
  }

  function validate() {
    if (state.linienbuendel.some((x) => !x.name)) return "Bitte alle Linienbündel benennen.";
    if (state.verkehrsunternehmen.some((x) => !x.name)) return "Bitte alle Verkehrsunternehmen benennen.";

    for (const x of state.linienzuordnungen) {
      if (!x.linienbuendel_id || !x.verkehrsunternehmen_id || !x.linie) {
        return "Bitte bei jeder Linienzuordnung Linienbündel, Verkehrsunternehmen und Linie ausfüllen.";
      }
      if (x.gueltig_von && x.gueltig_bis && x.gueltig_bis < x.gueltig_von) {
        return `Bei Linie ${x.linie} liegt "Gültig bis" vor "Gültig von".`;
      }
    }
    return "";
  }

  async function load() {
    setMessage("Stammdaten werden geladen …");
    try {
      const response = await fetch("/api/stammdaten", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      state.version = data.version || 1;
      state.linienbuendel = Array.isArray(data.linienbuendel) ? data.linienbuendel : [];
      state.verkehrsunternehmen = Array.isArray(data.verkehrsunternehmen) ? data.verkehrsunternehmen : [];
      state.linienzuordnungen = Array.isArray(data.linienzuordnungen) ? data.linienzuordnungen : [];

      renderAll();
      setMessage("Stammdaten geladen.", "is-ok");
    } catch (err) {
      console.error(err);
      setMessage("Stammdaten konnten nicht geladen werden. Läuft der neue Dashboard-Server?", "is-error");
    }
  }

  async function save() {
    syncFromDom();
    const validationError = validate();
    if (validationError) {
      setMessage(validationError, "is-error");
      return;
    }

    setMessage("Änderungen werden gespeichert …");
    try {
      const response = await fetch("/api/stammdaten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state)
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setMessage("Änderungen dauerhaft gespeichert.", "is-ok");
    } catch (err) {
      console.error(err);
      setMessage("Speichern fehlgeschlagen.", "is-error");
    }
  }

  document.getElementById("add-bundle").addEventListener("click", () => {
    syncFromDom();
    state.linienbuendel.push({ id: uid("bundle"), name: "", aktiv: true });
    renderAll();
  });

  document.getElementById("add-operator").addEventListener("click", () => {
    syncFromDom();
    state.verkehrsunternehmen.push({ id: uid("vu"), name: "", kuerzel: "", aktiv: true });
    renderAll();
  });

  document.getElementById("add-assignment").addEventListener("click", () => {
    syncFromDom();
    state.linienzuordnungen.push({
      id: uid("line"),
      linienbuendel_id: "",
      verkehrsunternehmen_id: "",
      linie: "",
      gueltig_von: "",
      gueltig_bis: "",
      aktiv: true
    });
    renderAssignments();
  });

  bundleBody.addEventListener("click", (event) => {
    if (!event.target.classList.contains("delete-bundle")) return;
    syncFromDom();
    const id = event.target.closest("tr").dataset.id;
    if (state.linienzuordnungen.some((x) => x.linienbuendel_id === id)) {
      setMessage("Dieses Linienbündel wird noch in einer Linienzuordnung verwendet.", "is-error");
      return;
    }
    state.linienbuendel = state.linienbuendel.filter((x) => x.id !== id);
    renderAll();
  });

  operatorBody.addEventListener("click", (event) => {
    if (!event.target.classList.contains("delete-operator")) return;
    syncFromDom();
    const id = event.target.closest("tr").dataset.id;
    if (state.linienzuordnungen.some((x) => x.verkehrsunternehmen_id === id)) {
      setMessage("Dieses Verkehrsunternehmen wird noch in einer Linienzuordnung verwendet.", "is-error");
      return;
    }
    state.verkehrsunternehmen = state.verkehrsunternehmen.filter((x) => x.id !== id);
    renderAll();
  });

  assignmentBody.addEventListener("click", (event) => {
    if (!event.target.classList.contains("delete-assignment")) return;
    syncFromDom();
    const id = event.target.closest("tr").dataset.id;
    state.linienzuordnungen = state.linienzuordnungen.filter((x) => x.id !== id);
    renderAssignments();
  });

  document.getElementById("masterdata-save").addEventListener("click", save);

  load();
})();
