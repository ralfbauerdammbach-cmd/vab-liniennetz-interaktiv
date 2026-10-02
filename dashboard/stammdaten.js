(() => {
  const state = {
    version: 3,
    linienbuendel: [],
    verkehrsunternehmen: [],
    zuordnungen: []
  };

  const bundleBody = document.getElementById("bundle-body");
  const operatorBody = document.getElementById("operator-body");
  const assignmentBody = document.getElementById("assignment-body");
  const message = document.getElementById("masterdata-message");

  if (!bundleBody || !operatorBody || !assignmentBody) return;

  const uid = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function setMessage(text, type = "") {
    message.textContent = text;
    message.className = "masterdata-message";
    if (type) message.classList.add(type);
  }

  function syncBaseTables() {
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
  }

  function syncAssignments() {
    state.zuordnungen = [...assignmentBody.querySelectorAll("tr")].map((row) => ({
      id: row.dataset.id,
      linienbuendel_id: row.querySelector(".assignment-bundle").value,
      verkehrsunternehmen_id: row.querySelector(".assignment-operator").value,
      linie: row.querySelector(".assignment-line").value.trim(),
      gueltig_von: row.querySelector(".assignment-from").value,
      gueltig_bis: row.querySelector(".assignment-to").value,
      aktiv: row.querySelector(".assignment-active").checked
    }));
  }

  function syncAll() {
    syncBaseTables();
    syncAssignments();
  }

  function bundleOptions(selected = "") {
    const items = state.linienbuendel.filter((x) => x.aktiv !== false);
    return '<option value="">Bitte wählen</option>' +
      items.map((x) =>
        `<option value="${esc(x.id)}"${x.id === selected ? " selected" : ""}>${esc(x.name)}</option>`
      ).join("");
  }

  function operatorOptions(selected = "") {
    const items = state.verkehrsunternehmen.filter((x) => x.aktiv !== false);
    return '<option value="">Bitte wählen</option>' +
      items.map((x) => {
        const label = x.kuerzel ? `${x.name} (${x.kuerzel})` : x.name;
        return `<option value="${esc(x.id)}"${x.id === selected ? " selected" : ""}>${esc(label)}</option>`;
      }).join("");
  }

  function renderBundles() {
    bundleBody.innerHTML = state.linienbuendel.map((x) => `
      <tr data-id="${esc(x.id)}">
        <td><input class="bundle-name" type="text" value="${esc(x.name)}" placeholder="z. B. Bachgau Mömlingen"></td>
        <td><input class="bundle-active" type="checkbox"${x.aktiv !== false ? " checked" : ""}></td>
        <td><button class="masterdata-delete delete-bundle" type="button">Entfernen</button></td>
      </tr>
    `).join("");
  }

  function renderOperators() {
    operatorBody.innerHTML = state.verkehrsunternehmen.map((x) => `
      <tr data-id="${esc(x.id)}">
        <td><input class="operator-name" type="text" value="${esc(x.name)}" placeholder="Name des VU"></td>
        <td><input class="operator-code" type="text" value="${esc(x.kuerzel || "")}" placeholder="z. B. EH"></td>
        <td><input class="operator-active" type="checkbox"${x.aktiv !== false ? " checked" : ""}></td>
        <td><button class="masterdata-delete delete-operator" type="button">Entfernen</button></td>
      </tr>
    `).join("");
  }

  function renderAssignments() {
    assignmentBody.innerHTML = state.zuordnungen.map((x) => {
      const bundleExists = !x.linienbuendel_id || state.linienbuendel.some((b) => b.id === x.linienbuendel_id);
      const operatorExists = !x.verkehrsunternehmen_id || state.verkehrsunternehmen.some((o) => o.id === x.verkehrsunternehmen_id);

      const bundleSelect = bundleOptions(bundleExists ? x.linienbuendel_id : "");
      const operatorSelect = operatorOptions(operatorExists ? x.verkehrsunternehmen_id : "");

      return `
        <tr data-id="${esc(x.id)}">
          <td><select class="assignment-bundle">${bundleSelect}</select></td>
          <td><select class="assignment-operator">${operatorSelect}</select></td>
          <td><input class="assignment-line" type="text" value="${esc(x.linie || "")}" placeholder="kann leer bleiben"></td>
          <td><input class="assignment-from" type="date" value="${esc(x.gueltig_von || "")}"></td>
          <td><input class="assignment-to" type="date" value="${esc(x.gueltig_bis || "")}"></td>
          <td><input class="assignment-active" type="checkbox"${x.aktiv !== false ? " checked" : ""}></td>
          <td><button class="masterdata-delete delete-assignment" type="button">Entfernen</button></td>
        </tr>
      `;
    }).join("");
  }

  function renderAll() {
    renderBundles();
    renderOperators();
    renderAssignments();
  }

  function migrate(data) {
    const result = [];

    if (Array.isArray(data.zuordnungen)) {
      for (const x of data.zuordnungen) result.push({ ...x });
    }

    if (Array.isArray(data.buendel_vu_zuordnungen)) {
      for (const x of data.buendel_vu_zuordnungen) {
        result.push({
          id: x.id || uid("zuordnung"),
          linienbuendel_id: x.linienbuendel_id || "",
          verkehrsunternehmen_id: x.verkehrsunternehmen_id || "",
          linie: "",
          gueltig_von: x.gueltig_von || "",
          gueltig_bis: x.gueltig_bis || "",
          aktiv: x.aktiv !== false
        });
      }
    }

    if (Array.isArray(data.linienzuordnungen)) {
      for (const x of data.linienzuordnungen) {
        result.push({
          id: x.id || uid("zuordnung"),
          linienbuendel_id: x.linienbuendel_id || "",
          verkehrsunternehmen_id: x.verkehrsunternehmen_id || "",
          linie: x.linie || "",
          gueltig_von: x.gueltig_von || "",
          gueltig_bis: x.gueltig_bis || "",
          aktiv: x.aktiv !== false
        });
      }
    }

    const seen = new Set();
    return result.filter((x) => {
      const key = [
        x.linienbuendel_id,
        x.verkehrsunternehmen_id,
        x.linie || "",
        x.gueltig_von || "",
        x.gueltig_bis || "",
        x.aktiv !== false
      ].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function validate() {
    if (state.linienbuendel.some((x) => !x.name)) return "Bitte alle Linienbündel benennen.";
    if (state.verkehrsunternehmen.some((x) => !x.name)) return "Bitte alle Verkehrsunternehmen benennen.";

    for (const x of state.zuordnungen) {
      if (!x.linienbuendel_id || !x.verkehrsunternehmen_id) {
        return "Bitte bei jeder Zuordnung Linienbündel und Verkehrsunternehmen auswählen.";
      }
      if (x.gueltig_von && x.gueltig_bis && x.gueltig_bis < x.gueltig_von) {
        return 'Bei einer Zuordnung liegt "Gültig bis" vor "Gültig von".';
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

      state.linienbuendel = Array.isArray(data.linienbuendel) ? data.linienbuendel : [];
      state.verkehrsunternehmen = Array.isArray(data.verkehrsunternehmen) ? data.verkehrsunternehmen : [];
      state.zuordnungen = migrate(data);

      renderAll();
      setMessage("Stammdaten geladen.", "is-ok");
    } catch (err) {
      console.error(err);
      setMessage("Stammdaten konnten nicht geladen werden.", "is-error");
    }
  }

  async function save() {
    syncAll();
    const error = validate();
    if (error) {
      setMessage(error, "is-error");
      return;
    }

    const payload = {
      version: 3,
      linienbuendel: state.linienbuendel,
      verkehrsunternehmen: state.verkehrsunternehmen,
      zuordnungen: state.zuordnungen,

      // Kompatibilität für bestehende Funktionen
      buendel_vu_zuordnungen: state.zuordnungen
        .filter((x) => !x.linie)
        .map((x) => ({
          id: x.id,
          linienbuendel_id: x.linienbuendel_id,
          verkehrsunternehmen_id: x.verkehrsunternehmen_id,
          gueltig_von: x.gueltig_von,
          gueltig_bis: x.gueltig_bis,
          aktiv: x.aktiv
        })),

      linienzuordnungen: state.zuordnungen
        .filter((x) => x.linie)
        .map((x) => ({
          id: x.id,
          linienbuendel_id: x.linienbuendel_id,
          verkehrsunternehmen_id: x.verkehrsunternehmen_id,
          linie: x.linie,
          gueltig_von: x.gueltig_von,
          gueltig_bis: x.gueltig_bis,
          aktiv: x.aktiv
        }))
    };

    try {
      const response = await fetch("/api/stammdaten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setMessage("Änderungen dauerhaft gespeichert.", "is-ok");
      window.dispatchEvent(new CustomEvent("amina:stammdaten-saved"));
    } catch (err) {
      console.error(err);
      setMessage("Speichern fehlgeschlagen.", "is-error");
    }
  }

  document.getElementById("add-bundle").addEventListener("click", () => {
    syncAll();
    state.linienbuendel.push({ id: uid("bundle"), name: "", aktiv: true });
    renderAll();
  });

  document.getElementById("add-operator").addEventListener("click", () => {
    syncAll();
    state.verkehrsunternehmen.push({ id: uid("vu"), name: "", kuerzel: "", aktiv: true });
    renderAll();
  });

  document.getElementById("add-assignment").addEventListener("click", () => {
    syncAll();
    state.zuordnungen.push({
      id: uid("zuordnung"),
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
    syncAll();
    const id = event.target.closest("tr").dataset.id;
    if (state.zuordnungen.some((x) => x.linienbuendel_id === id)) {
      setMessage("Dieses Linienbündel wird noch in einer Zuordnung verwendet.", "is-error");
      return;
    }
    state.linienbuendel = state.linienbuendel.filter((x) => x.id !== id);
    renderAll();
  });

  operatorBody.addEventListener("click", (event) => {
    if (!event.target.classList.contains("delete-operator")) return;
    syncAll();
    const id = event.target.closest("tr").dataset.id;
    if (state.zuordnungen.some((x) => x.verkehrsunternehmen_id === id)) {
      setMessage("Dieses Verkehrsunternehmen wird noch in einer Zuordnung verwendet.", "is-error");
      return;
    }
    state.verkehrsunternehmen = state.verkehrsunternehmen.filter((x) => x.id !== id);
    renderAll();
  });

  assignmentBody.addEventListener("click", (event) => {
    if (!event.target.classList.contains("delete-assignment")) return;
    syncAll();
    const id = event.target.closest("tr").dataset.id;
    state.zuordnungen = state.zuordnungen.filter((x) => x.id !== id);
    renderAssignments();
  });

  document.getElementById("masterdata-save").addEventListener("click", save);

  load();
})();

