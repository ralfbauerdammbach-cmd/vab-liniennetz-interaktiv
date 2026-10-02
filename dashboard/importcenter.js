(() => {
  const fileInput = document.getElementById("import-file");
  const bundleSelect = document.getElementById("import-bundle");
  const operatorSelect = document.getElementById("import-operator");
  const typeSelect = document.getElementById("import-type");
  const monthInput = document.getElementById("import-month");
  const previewButton = document.getElementById("import-preview");
  const message = document.getElementById("import-message");
  const result = document.getElementById("import-preview-result");

  if (!fileInput || !bundleSelect || !operatorSelect || !previewButton) return;

  let masterData = {
    linienbuendel: [],
    verkehrsunternehmen: [],
    zuordnungen: []
  };

  function setMessage(text, type = "") {
    message.textContent = text;
    message.className = "masterdata-message";
    if (type) message.classList.add(type);
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function migrateAssignments(data) {
    if (Array.isArray(data.zuordnungen)) {
      return data.zuordnungen;
    }

    const out = [];

    if (Array.isArray(data.buendel_vu_zuordnungen)) {
      for (const x of data.buendel_vu_zuordnungen) {
        out.push({
          id: x.id || "",
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
        out.push({
          id: x.id || "",
          linienbuendel_id: x.linienbuendel_id || "",
          verkehrsunternehmen_id: x.verkehrsunternehmen_id || "",
          linie: x.linie || "",
          gueltig_von: x.gueltig_von || "",
          gueltig_bis: x.gueltig_bis || "",
          aktiv: x.aktiv !== false
        });
      }
    }

    return out;
  }

  function renderBundles(selected = "") {
    const bundles = masterData.linienbuendel.filter((x) => x.aktiv !== false);

    bundleSelect.innerHTML =
      '<option value="">Bitte wählen</option>' +
      bundles.map((x) =>
        `<option value="${esc(x.id)}"${x.id === selected ? " selected" : ""}>${esc(x.name)}</option>`
      ).join("");

    if (!selected && bundles.length === 1) {
      bundleSelect.value = bundles[0].id;
    }
  }

  function renderOperatorsForBundle(bundleId, selected = "") {
    const operatorsAll = masterData.verkehrsunternehmen.filter((x) => x.aktiv !== false);

    if (!bundleId) {
      operatorSelect.innerHTML = '<option value="">Bitte zuerst Linienbündel wählen</option>';
      operatorSelect.value = "";
      operatorSelect.disabled = true;
      return;
    }

    const allowedIds = new Set(
      masterData.zuordnungen
        .filter((x) =>
          x.aktiv !== false &&
          x.linienbuendel_id === bundleId &&
          x.verkehrsunternehmen_id
        )
        .map((x) => x.verkehrsunternehmen_id)
    );

    const operators = operatorsAll.filter((x) => allowedIds.has(x.id));

    operatorSelect.disabled = false;
    operatorSelect.innerHTML =
      '<option value="">Bitte wählen</option>' +
      operators.map((x) => {
        const label = x.kuerzel ? `${x.name} (${x.kuerzel})` : x.name;
        return `<option value="${esc(x.id)}"${x.id === selected ? " selected" : ""}>${esc(label)}</option>`;
      }).join("");

    if (selected && !operators.some((x) => x.id === selected)) {
      operatorSelect.value = "";
    }

    if (!operatorSelect.value && operators.length === 1) {
      operatorSelect.value = operators[0].id;
    }

    if (operators.length === 0) {
      operatorSelect.innerHTML = '<option value="">Keine VU-Zuordnung vorhanden</option>';
      operatorSelect.value = "";
      setMessage(
        "Für dieses Linienbündel ist noch kein Verkehrsunternehmen zugeordnet. Bitte zuerst unter Stammdaten eine Zuordnung anlegen und speichern.",
        "is-error"
      );
    }
  }

  async function loadMasterData(preserveSelection = true) {
    const oldBundle = preserveSelection ? bundleSelect.value : "";
    const oldOperator = preserveSelection ? operatorSelect.value : "";

    try {
      const response = await fetch(`/api/stammdaten?_=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      masterData = {
        linienbuendel: Array.isArray(data.linienbuendel) ? data.linienbuendel : [],
        verkehrsunternehmen: Array.isArray(data.verkehrsunternehmen) ? data.verkehrsunternehmen : [],
        zuordnungen: migrateAssignments(data)
      };

      renderBundles(oldBundle);
      renderOperatorsForBundle(bundleSelect.value, oldOperator);
    } catch (err) {
      console.error(err);
      setMessage("Stammdaten für den Import konnten nicht geladen werden.", "is-error");
    }
  }

  bundleSelect.addEventListener("change", () => {
    setMessage("");
    renderOperatorsForBundle(bundleSelect.value, "");
  });

  window.addEventListener("amina:stammdaten-saved", () => {
    loadMasterData(false);
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadMasterData(true);
  });

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const value = String(reader.result || "");
        const comma = value.indexOf(",");
        resolve(comma >= 0 ? value.slice(comma + 1) : value);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function renderPreview(data) {
    document.getElementById("import-row-count").textContent =
      Number(data.row_count || 0).toLocaleString("de-DE");
    document.getElementById("import-column-count").textContent =
      Number(data.column_count || 0).toLocaleString("de-DE");
    document.getElementById("import-sheet").textContent =
      data.sheet_name || data.filename || "–";
    document.getElementById("import-format").textContent =
      data.format || "–";

    const head = document.getElementById("import-preview-head");
    const body = document.getElementById("import-preview-body");
    const headers = data.headers || [];
    const rows = data.preview_rows || [];

    head.innerHTML = `<tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>`;
    body.innerHTML = rows.map((row) =>
      `<tr>${headers.map((_, idx) =>
        `<td title="${esc(row[idx] ?? "")}">${esc(row[idx] ?? "")}</td>`
      ).join("")}</tr>`
    ).join("");

    result.hidden = false;
  }

  previewButton.addEventListener("click", async () => {
    await loadMasterData(true);

    const file = fileInput.files[0];

    if (!file) {
      setMessage("Bitte zuerst eine CSV- oder Excel-Datei auswählen.", "is-error");
      return;
    }
    if (!bundleSelect.value) {
      setMessage("Bitte ein Linienbündel auswählen.", "is-error");
      return;
    }
    if (!operatorSelect.value) {
      setMessage("Bitte ein dem Linienbündel zugeordnetes Verkehrsunternehmen auswählen.", "is-error");
      return;
    }
    if (!typeSelect.value) {
      setMessage("Bitte die Datenart auswählen.", "is-error");
      return;
    }
    if (!monthInput.value) {
      setMessage("Bitte den Liefermonat auswählen.", "is-error");
      return;
    }

    setMessage("Datei wird geprüft …");
    result.hidden = true;
    previewButton.disabled = true;

    try {
      const contentBase64 = await fileToBase64(file);
      const response = await fetch("/api/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          content_base64: contentBase64,
          linienbuendel_id: bundleSelect.value,
          verkehrsunternehmen_id: operatorSelect.value,
          datenart: typeSelect.value,
          liefermonat: monthInput.value
        })
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      renderPreview(data);
      setMessage("Datei erfolgreich geprüft. Noch wurden keine Betriebsdaten importiert.", "is-ok");
    } catch (err) {
      console.error(err);
      setMessage(`Prüfung fehlgeschlagen: ${err.message}`, "is-error");
    } finally {
      previewButton.disabled = false;
    }
  });

  loadMasterData(false);
})();
