(() => {
  "use strict";

  const main = document.querySelector("main.dashboard");
  const nav = document.querySelector(".dashboard-sidebar .sidebar-menu");
  const intro = main?.querySelector(".intro");

  if (!main || !nav || !intro) return;

  const views = {
    "uebersicht": {
      title: "Übersicht",
      eyebrow: "CONTROLLING",
      text: "Datenstand und zentrale Kennzahlen des Verkehrsvertragscontrollings."
    },
    "betrieb-qualitaet": {
      title: "Betrieb & Qualität",
      eyebrow: "VERKEHRSVERTRAGSCONTROLLING",
      text: "Pünktlichkeit, Ausfälle, Fahrleistung und betriebliche Auffälligkeiten. Vertragskennzahlen werden auf Basis importierter ITCS-Daten berechnet."
    },
    "fahrgaeste-auslastung": {
      title: "Fahrgäste & Auslastung",
      eyebrow: "AFZS",
      text: "Einsteiger, Aussteiger, Besetzung und Auslastung auf Basis importierter Fahrgastzähldaten."
    },
    "netz-fahrplan": {
      title: "Netz & Fahrplan",
      eyebrow: "NETZ- UND ANGEBOTSDATEN",
      text: "Netzstruktur, Fahrplanangebot, planmäßige Betriebszeiten und Fahrplandokumente."
    },
    "datenimport": {
      title: "Datenimport",
      eyebrow: "DATENMANAGEMENT",
      text: "Quelldateien prüfen, einem Linienbündel und Verkehrsunternehmen zuordnen und vor dem verbindlichen Import validieren."
    },
    "stammdaten": {
      title: "Verwaltung",
      eyebrow: "STAMMDATEN",
      text: "Linienbündel, Verkehrsunternehmen, Zuordnungen und Gültigkeiten verwalten."
    }
  };

  function topSection(node) {
    if (!node) return null;
    const section = node.matches?.("section") ? node : node.closest?.("section");
    return section && section.parentElement === main ? section : null;
  }

  function mark(selector, viewName, netSubview = "") {
    document.querySelectorAll(selector).forEach((node) => {
      const section = topSection(node);
      if (!section || section === intro) return;
      section.dataset.dashboardView = viewName;
      if (netSubview) section.dataset.netSubview = netSubview;
    });
  }

  function replaceLeafText(root, from, to) {
    root.querySelectorAll("*").forEach((el) => {
      if (el.children.length === 0 && (el.textContent || "").trim() === from) {
        el.textContent = to;
      }
    });
  }

  // ---------- Fachtexte ----------
  replaceLeafText(document, "Servicekalender", "Fahrplankalender");
  replaceLeafText(document, "Abfahrtspositionen im Index", "Planmäßige Haltestellenabfahrten");
  replaceLeafText(document, "Linien im Fahrplanindex", "Linien im Fahrplanbestand");
  replaceLeafText(document, "LIEFERMONAT", "LIEFERPERIODE");

  // ---------- Hauptzuordnung ----------
  main.querySelectorAll(":scope > .kpi-grid").forEach((node) => {
    node.dataset.dashboardView = "netz-fahrplan";
    node.dataset.netSubview = "netzstruktur";
  });

  mark(".documents-panel", "netz-fahrplan", "dokumente");
  mark(".line-analysis-panel", "netz-fahrplan", "netzstruktur");
  mark(".network-structure-panel", "netz-fahrplan", "netzstruktur");
  mark("#netzstruktur", "netz-fahrplan", "netzstruktur");
  mark(".timetable-panel", "netz-fahrplan", "fahrplanangebot");
  mark("#fahrplanangebot", "netz-fahrplan", "fahrplanangebot");

  mark(".realtime-panel", "betrieb-qualitaet");
  mark("#defas-echtzeit", "betrieb-qualitaet");
  mark("#fahrgaeste-auslastung", "fahrgaeste-auslastung");
  mark(".import-panel", "datenimport");
  mark("#datenimport", "datenimport");
  mark(".masterdata-panel", "stammdaten");
  mark("#stammdaten", "stammdaten");

  // Fallback: Unbekannte Top-Level-Fachpanels nicht auf die Übersicht legen.
  main.querySelectorAll(":scope > section.panel:not([data-dashboard-view])").forEach((section) => {
    const txt = (section.textContent || "").toLowerCase();

    if (txt.includes("defas") || txt.includes("echtzeit") || txt.includes("verspät") || txt.includes("ausfall")) {
      section.dataset.dashboardView = "betrieb-qualitaet";
    } else if (txt.includes("afzs") || txt.includes("auslastung") || txt.includes("einsteiger") || txt.includes("aussteiger")) {
      section.dataset.dashboardView = "fahrgaeste-auslastung";
    } else {
      section.dataset.dashboardView = "netz-fahrplan";
      section.dataset.netSubview = "netzstruktur";
    }
  });

  // ---------- Übersicht ----------
  let overviewStatus = document.querySelector("#overview-data-status");
  if (!overviewStatus) {
    overviewStatus = document.createElement("section");
    overviewStatus.id = "overview-data-status";
    overviewStatus.className = "overview-status";
    overviewStatus.dataset.dashboardView = "uebersicht";
    overviewStatus.innerHTML = `
      <div class="overview-status-heading">
        <div>
          <p class="eyebrow">DATENSTATUS</p>
          <h2>Verfügbare Grundlagen</h2>
        </div>
      </div>

      <div class="overview-status-grid">
        <article class="status-card">
          <span>ITCS-Betriebsdaten</span>
          <strong>Noch nicht importiert</strong>
          <small>Grundlage für Pünktlichkeit, Ausfälle und Fahrleistung</small>
        </article>
        <article class="status-card">
          <span>AFZS-Fahrgastdaten</span>
          <strong>Noch nicht importiert</strong>
          <small>Grundlage für Besetzung und Auslastung</small>
        </article>
        <article class="status-card">
          <span>Netz-/Fahrplandaten</span>
          <strong>Vorhanden</strong>
          <small id="overview-plan-detail">Netzstruktur und planmäßiges Angebot</small>
        </article>
        <article class="status-card">
          <span>DEFAS-Vergleichsdaten</span>
          <strong id="overview-defas">Prüfe Datenstand …</strong>
          <small>Ergänzende Stichprobe – keine Vertragsgrundlage</small>
        </article>
      </div>

      <div class="overview-note">
        Vertragskennzahlen werden erst angezeigt, wenn Betriebsdaten verbindlich importiert
        und die zugehörigen Berechnungs- bzw. Vertragsregeln hinterlegt sind.
      </div>
    `;
    intro.insertAdjacentElement("afterend", overviewStatus);
  }

  // Alte pauschale Statusanzeige entfernen.
  intro.querySelector(".data-status")?.remove();


  function formatSecondsHuman(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "–";
    const sec = Number(value);
    const sign = sec < 0 ? "−" : "";
    const abs = Math.abs(sec);
    if (abs < 60) return `${sign}${Math.round(abs)} s`;
    const min = Math.floor(abs / 60);
    const rest = Math.round(abs % 60);
    return `${sign}${min}:${String(rest).padStart(2, "0")} min`;
  }

  function formatDateDE(value) {
    const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : (value || "–");
  }

  async function refreshItcsOperationStatus() {
    const box = document.querySelector("#operation-data-status");
    if (!box) return;

    try {
      const response = await fetch(`/api/itcs/summary?_=${Date.now()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);

      if (!data.available) {
        box.innerHTML = `
          <div class="panel-heading"><div>
            <p class="eyebrow">BETRIEBSDATEN</p>
            <h2>Vertragsauswertung noch nicht verfügbar</h2>
            <p class="network-caption">Noch wurden keine ITCS-Betriebsdaten verbindlich importiert.</p>
          </div></div>`;
        return;
      }

      const bundles = (data.bundles || []).filter(item => Number(item.rows || 0) > 0);
      if (!bundles.length) {
        box.innerHTML = `<p class="network-caption">ITCS-Daten vorhanden, aber keine Linie ist einem Vertragsbündel zugeordnet.</p>`;
        return;
      }

      box.innerHTML = `
        <div class="panel-heading contract-heading">
          <div>
            <p class="eyebrow">VERTRAGSCONTROLLING · ITCS</p>
            <h2>Liniengenaue Vertragsauswertung</h2>
            <p class="network-caption">
              ${Number(data.imports || data.source_files || 0).toLocaleString("de-DE")} ITCS-Datenbestand ·
              ${data.operator_name || "Verkehrsunternehmen"} · ${data.contract_source || ""}.
            </p>
          </div>
          <label class="contract-bundle-filter">
            <span>Linienbündel</span>
            <select id="contract-bundle-select">
              ${bundles.map((b, i) => `<option value="${b.key}" ${i === 0 ? "selected" : ""}>${b.name}</option>`).join("")}
            </select>
          </label>
        </div>
        <div id="contract-bundle-content"></div>
      `;

      const target = box.querySelector("#contract-bundle-content");
      const select = box.querySelector("#contract-bundle-select");

      const renderBundle = (bundle) => {
        const from = formatDateDE(bundle.date_range?.from);
        const to = formatDateDE(bundle.date_range?.to);
        const range = from === to ? from : `${from} – ${to}`;
        const pc = bundle.delay_penalty_counts || {};

        target.innerHTML = `
          <div class="contract-bundle-meta">
            <strong>${bundle.name}</strong>
            <span>Vertragslinien ${bundle.contract_lines.join(", ")} · Datenzeitraum ${range}</span>
          </div>

          <div class="operation-kpi-grid contract-kpi-grid">
            <article class="operation-kpi">
              <strong>${Number(bundle.rows || 0).toLocaleString("de-DE")}</strong>
              <span>zugeordnete Halte-/Betriebsdatensätze</span>
            </article>
            <article class="operation-kpi">
              <strong>${Number(bundle.trips || 0).toLocaleString("de-DE")}</strong>
              <span>erkannte Fahrten</span>
            </article>
            <article class="operation-kpi">
              <strong>${Number(bundle.end_arrival_evaluable || 0).toLocaleString("de-DE")}</strong>
              <span>auswertbare Endhaltestellen-Ankünfte</span>
            </article>
            <article class="operation-kpi contract-alert-kpi">
              <strong>${Number(bundle.early_departure_trips || 0).toLocaleString("de-DE")}</strong>
              <span>Fahrten mit mindestens einer Abfahrt vor Sollzeit</span>
            </article>
            <article class="operation-kpi contract-alert-kpi">
              <strong>${Number(bundle.end_over_25_trips || 0).toLocaleString("de-DE")}</strong>
              <span>Endankünfte über 25 Min. verspätet</span>
            </article>
            <article class="operation-kpi">
              <strong>${Number(bundle.theoretical_delay_penalty_eur || 0).toLocaleString("de-DE", {style:"currency", currency:"EUR", maximumFractionDigits:0})}</strong>
              <span>rechnerische Verspätungsstaffel vor Ausnahmeprüfung</span>
            </article>
          </div>

          <div class="operation-raw-note contract-rule-note">
            <strong>Vertragslogik aus der Leistungsbeschreibung</strong>
            <span>
              Gemessen wird die verspätete Ankunft an der Endhaltestelle. 5–10 Min. = 10 €,
              &gt;10–15 = 20 €, &gt;15–20 = 40 €, &gt;20–25 = 60 €; &gt;25 Min. gilt als Ausfalltatbestand.
              Jede zu frühe Abfahrt ist ebenfalls ein Ausfalltatbestand.
            </span>
            <span>
              Die angezeigte Euro-Summe ist noch kein Abrechnungsbetrag: planmäßig angekündigte Verspätungen,
              abgestimmte Ausfälle und mögliche Mehrfachtatbestände müssen vor einer Pönalisierung geprüft werden.
            </span>
          </div>

          <div class="contract-delay-grid">
            <div><strong>${Number(pc["5_10"] || 0).toLocaleString("de-DE")}</strong><span>5–10 Min.</span></div>
            <div><strong>${Number(pc["10_15"] || 0).toLocaleString("de-DE")}</strong><span>&gt;10–15 Min.</span></div>
            <div><strong>${Number(pc["15_20"] || 0).toLocaleString("de-DE")}</strong><span>&gt;15–20 Min.</span></div>
            <div><strong>${Number(pc["20_25"] || 0).toLocaleString("de-DE")}</strong><span>&gt;20–25 Min.</span></div>
          </div>

          <div class="operation-line-table-wrap">
            <table class="operation-line-table">
              <thead>
                <tr>
                  <th>Linie</th>
                  <th>Fahrten</th>
                  <th>Halte</th>
                  <th>Endankunft auswertbar</th>
                  <th>zu früh abgefahren</th>
                  <th>&gt;25 Min. Endankunft</th>
                </tr>
              </thead>
              <tbody>
                ${(bundle.line_stats || []).map(item => `
                  <tr>
                    <td><strong>${item.line}</strong></td>
                    <td>${Number(item.trips || 0).toLocaleString("de-DE")}</td>
                    <td>${Number(item.rows || 0).toLocaleString("de-DE")}</td>
                    <td>${Number(item.end_arrival_evaluable || 0).toLocaleString("de-DE")}</td>
                    <td>${Number(item.early_departure_trips || 0).toLocaleString("de-DE")}</td>
                    <td>${Number(item.end_over_25_trips || 0).toLocaleString("de-DE")}</td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>

          <div class="contract-open-rule">
            <strong>95-%-Pünktlichkeitswert: noch nicht automatisch klassifiziert.</strong>
            <span>
              Der Vertrag verlangt 95 % je Linie und Monat an der Endhaltestelle.
              Die vorliegende Leistungsbeschreibung verknüpft die 5-Minuten-Pönalgrenze jedoch nicht ausdrücklich
              mit der Definition „pünktliche Ankunft“. Deshalb wird diese Grenze nicht stillschweigend übernommen.
            </span>
          </div>
        `;
      };

      renderBundle(bundles[0]);
      select.addEventListener("change", () => {
        const bundle = bundles.find(item => item.key === select.value) || bundles[0];
        renderBundle(bundle);
      });
    } catch (err) {
      console.error(err);
      box.innerHTML = `
        <div class="panel-heading"><div>
          <p class="eyebrow">BETRIEBSDATEN</p>
          <h2>ITCS-Auswertung konnte nicht geladen werden</h2>
          <p class="network-caption">${String(err.message || err)}</p>
        </div></div>`;
    }
  }
  // ---------- Betrieb & Qualität ----------
  const realtime = document.querySelector("#defas-echtzeit, .realtime-panel");

  if (!document.querySelector("#operation-data-status")) {
    const operationStatus = document.createElement("section");
    operationStatus.id = "operation-data-status";
    operationStatus.className = "panel operation-status-panel";
    operationStatus.dataset.dashboardView = "betrieb-qualitaet";
    operationStatus.innerHTML = `
      <div class="panel-heading">
        <div>
          <p class="eyebrow">BETRIEBSDATEN</p>
          <h2 id="operation-data-title">Prüfe importierte ITCS-Daten …</h2>
          <p id="operation-data-caption" class="network-caption">
            Der verbindlich importierte ITCS-Datenbestand wird geladen.
          </p>
          <div id="operation-data-summary" class="operation-data-summary" hidden></div>
          <div id="operation-contract-note" class="operation-contract-note" hidden></div>
        </div>
      </div>
    `;
    if (realtime && realtime.parentElement === main) {
      realtime.insertAdjacentElement("beforebegin", operationStatus);
    } else {
      intro.insertAdjacentElement("afterend", operationStatus);
    }
  }


  function operationFormatDate(value) {
    if (!value) return "–";
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : String(value);
  }

  function operationFormatRange(range) {
    if (!range?.from && !range?.to) return "–";
    if (range?.from === range?.to) return operationFormatDate(range.from);
    return `${operationFormatDate(range?.from)} – ${operationFormatDate(range?.to)}`;
  }

  function operationEsc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function refreshOperationDataStatus() {
    const panel = document.querySelector("#operation-data-status");
    if (!panel) return;

    const title = panel.querySelector("#operation-data-title");
    const caption = panel.querySelector("#operation-data-caption");
    const summary = panel.querySelector("#operation-data-summary");
    const contractNote = panel.querySelector("#operation-contract-note");

    try {
      const response = await fetch(`/api/controlling/itcs-summary?_=${Date.now()}`, {
        cache: "no-store"
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      if (!data.available) {
        title.textContent = "Vertragsauswertung noch nicht verfügbar";
        caption.textContent =
          "Noch wurden keine Controlling-fähigen ITCS-Betriebsdaten verbindlich importiert.";
        summary.hidden = true;
        contractNote.hidden = true;
        return;
      }

      title.textContent = "ITCS-Betriebsdaten verfügbar";

      const sourceParts = [];
      if (data.operators?.length) sourceParts.push(data.operators.join(", "));
      if (data.bundles?.length) sourceParts.push(data.bundles.join(", "));

      caption.textContent =
        `${Number(data.imports || data.source_files || 0).toLocaleString("de-DE")} verbindlicher ITCS-Datenbestand` +
        `${Number(data.imports || 0) === 1 ? "" : "e"} · ` +
        `${operationFormatRange(data.date_range)}` +
        `${sourceParts.length ? " · " + sourceParts.join(" · ") : ""}.`;

      summary.innerHTML = `
        <article>
          <strong>${Number(data.row_count || 0).toLocaleString("de-DE")}</strong>
          <span>Betriebsdatensätze</span>
        </article>
        <article>
          <strong>${Number(data.trip_count || 0).toLocaleString("de-DE")}</strong>
          <span>Fahrten</span>
        </article>
        <article>
          <strong>${Number(data.lines?.length || 0).toLocaleString("de-DE")}</strong>
          <span>Linien</span>
          <small>${operationEsc((data.lines || []).join(", ") || "–")}</small>
        </article>
        <article>
          <strong>${operationEsc(operationFormatRange(data.date_range))}</strong>
          <span>Datenzeitraum</span>
        </article>
      `;
      summary.hidden = false;

      contractNote.innerHTML = `
        <strong>Datenbasis für das Vertragscontrolling vorhanden.</strong>
        <span>
          Pünktlichkeit, Ausfälle, Soll-Ist-Fahrleistung und Vertragsabweichungen werden
          erst als Vertragskennzahlen ausgewiesen, wenn die jeweils erforderlichen
          Berechnungs- und Vertragsregeln hinterlegt sind.
        </span>
      `;
      contractNote.hidden = false;
    } catch (err) {
      console.error("ITCS-Datenstatus konnte nicht geladen werden:", err);
      title.textContent = "ITCS-Datenstatus konnte nicht geladen werden";
      caption.textContent =
        "Der Importbestand ist vorhanden, konnte von dieser Ansicht aber nicht gelesen werden.";
      summary.hidden = true;
      contractNote.hidden = true;
    }
  }

  refreshOperationDataStatus();
  if (realtime) {
    const eyebrow = realtime.querySelector(".panel-heading .eyebrow");
    const title = realtime.querySelector(".panel-heading h2");
    if (eyebrow) eyebrow.textContent = "DEFAS VERGLEICHSDATEN";
    if (title) title.textContent = "Stichprobe des letzten DEFAS-Messlaufs";

    const status = realtime.querySelector("#rt-status");
    if (status) {
      status.textContent = status.textContent
        .replace("Nicht berücksichtigt: 40N", "Freizeitlinie 40N nicht berücksichtigt")
        .replace("30.4", "30,4");
    }

    replaceLeafText(realtime, "30.4 %", "30,4 %");
    replaceLeafText(realtime, "Echtzeitabdeckung der erfassten Fahrten", "Anteil der Stichprobenfahrten mit Echtzeitsteuerung");
    replaceLeafText(realtime, "realtime-gesteuerte Fahrten", "Fahrten mit Echtzeitsteuerung");
    replaceLeafText(realtime, "AUFFÄLLIGE LINIEN", "DEFAS-HINWEISE");
    replaceLeafText(realtime, "Linien im letzten DEFAS-Messlauf", "Linien mit Auffälligkeiten in der Stichprobe");

    if (!realtime.querySelector(".defas-source-note")) {
      const note = document.createElement("p");
      note.className = "source-note defas-source-note";
      note.textContent =
        "DEFAS dient ausschließlich als ergänzende Vergleichsquelle. " +
        "Vertragsrelevante Bewertungen erfolgen auf Basis der originären ITCS-/AFZS-Daten " +
        "und der hinterlegten Vertragsregeln.";
      realtime.querySelector(".panel-heading")?.insertAdjacentElement("afterend", note);
    }

    const detail = realtime.querySelector(".realtime-detail");
    if (detail) {
      detail.id = "defas-detail";
      detail.hidden = true;

      let toggle = realtime.querySelector("#defas-detail-toggle");
      if (!toggle) {
        toggle = document.createElement("button");
        toggle.id = "defas-detail-toggle";
        toggle.type = "button";
        toggle.className = "detail-toggle";
        toggle.textContent = "DEFAS-Details anzeigen";
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-controls", "defas-detail");

        const statusLine = realtime.querySelector("#rt-status");
        if (statusLine) statusLine.insertAdjacentElement("afterend", toggle);
        else realtime.querySelector(".defas-source-note")?.insertAdjacentElement("afterend", toggle);
      }

      toggle.addEventListener("click", () => {
        const open = detail.hidden;
        detail.hidden = !open;
        toggle.textContent = open ? "DEFAS-Details ausblenden" : "DEFAS-Details anzeigen";
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
  }

  refreshItcsOperationStatus();

  // ---------- AFZS ----------
  const passenger = document.querySelector("#fahrgaeste-auslastung");
  if (passenger) {
    const title = passenger.querySelector("h2");
    const caption = passenger.querySelector(".network-caption");
    if (title) title.textContent = "Noch keine AFZS-Betriebsdaten importiert";
    if (caption) {
      caption.textContent =
        "Nach dem verbindlichen Import von Fahrgastzähldaten werden hier Einsteiger, " +
        "Aussteiger, Besetzung, Auslastung und Linienabschnitte ausgewertet.";
    }
  }

  // ---------- Netz & Fahrplan ----------
  let netTabs = document.querySelector("#net-subnav");
  if (!netTabs) {
    netTabs = document.createElement("div");
    netTabs.id = "net-subnav";
    netTabs.className = "net-subnav";
    netTabs.dataset.dashboardView = "netz-fahrplan";
    netTabs.innerHTML = `
      <button type="button" data-net-target="netzstruktur">Netzstruktur</button>
      <button type="button" data-net-target="fahrplanangebot">Fahrplanangebot</button>
      <button type="button" data-net-target="betriebszeiten">Betriebszeiten</button>
      <button type="button" data-net-target="dokumente">Fahrplandokumente</button>
    `;
    intro.insertAdjacentElement("afterend", netTabs);
  }

  const timetablePanel = main.querySelector(":scope > .timetable-panel");
  let activeNetSubview = "netzstruktur";

  function setNetSubview(name) {
    activeNetSubview = name;

    // Erst alle Netz-Inhalte ausblenden.
    main.querySelectorAll(":scope > [data-dashboard-view='netz-fahrplan']").forEach((node) => {
      node.classList.remove("is-active-net-subview", "offer-only", "operation-only");
    });

    // Untermenü bleibt sichtbar.
    netTabs.classList.add("is-active-net-subview");

    if (name === "netzstruktur") {
      main.querySelectorAll(
        ":scope > [data-dashboard-view='netz-fahrplan'][data-net-subview='netzstruktur']"
      ).forEach((node) => node.classList.add("is-active-net-subview"));
    }

    if (name === "dokumente") {
      main.querySelectorAll(
        ":scope > [data-dashboard-view='netz-fahrplan'][data-net-subview='dokumente']"
      ).forEach((node) => node.classList.add("is-active-net-subview"));
    }

    if ((name === "fahrplanangebot" || name === "betriebszeiten") && timetablePanel) {
      timetablePanel.classList.add("is-active-net-subview");
      timetablePanel.classList.add(name === "betriebszeiten" ? "operation-only" : "offer-only");
    }

    netTabs.querySelectorAll("button").forEach((button) => {
      const active = button.dataset.netTarget === name;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  netTabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-net-target]");
    if (!button) return;
    setNetSubview(button.dataset.netTarget);
  });

  // ---------- Datenimport ----------
  const importPanel = document.querySelector("#datenimport");
  if (importPanel) {
    replaceLeafText(importPanel, "LIEFERMONAT", "LIEFERPERIODE");
  }

  // ---------- Verwaltung ----------
  const masterdata = document.querySelector("#stammdaten");
  if (masterdata) {
    masterdata.querySelectorAll(".network-caption").forEach((p) => {
      if ((p.textContent || "").includes("Beispiel:")) {
        p.textContent = "Die Linie kann leer bleiben und später ergänzt werden.";
      }
    });
  }

  // ---------- Datenstände ----------
  function cleanDateText(text) {
    return (text || "")
      .replace(/^Automatischer Datenstand:\s*/i, "")
      .replace(/^Netzdaten aktualisiert:\s*/i, "")
      .replace(/^Datenstand:\s*/i, "")
      .trim();
  }

  function refreshDataStatus() {
    const snapshot = document.querySelector("#rt-snapshot")?.textContent?.trim();
    const defas = document.querySelector("#overview-defas");
    if (defas) defas.textContent = snapshot ? `Messlauf ${snapshot}` : "Keine Vergleichsdaten erkannt";

    const footerDate = document.querySelector("#data-date");
    const cleaned = cleanDateText(footerDate?.textContent || "");
    const planDetail = document.querySelector("#overview-plan-detail");
    if (planDetail) {
      planDetail.textContent = cleaned
        ? `Netzdaten aktualisiert: ${cleaned}`
        : "Netzstruktur und planmäßiges Angebot";
    }
  }

  // Der globale Footer soll keinen fachlich irreführenden Netzdatenstand zeigen.
  const footerDate = document.querySelector("#data-date");
  if (footerDate) {
    const observer = new MutationObserver(refreshDataStatus);
    observer.observe(footerDate, { childList: true, characterData: true, subtree: true });
  }

  // ---------- Hauptansicht ----------
  function updateIntro(viewName) {
    const config = views[viewName] || views.uebersicht;
    const eyebrow = intro.querySelector(".eyebrow");
    const title = intro.querySelector("h1");
    const text = intro.querySelector(".intro-text");

    if (eyebrow) eyebrow.textContent = config.eyebrow;
    if (title) title.textContent = config.title;
    if (text) text.textContent = config.text;
  }

  function setActiveView(viewName, updateHash = true) {
    if (!views[viewName]) viewName = "uebersicht";

    main.querySelectorAll(":scope > [data-dashboard-view]").forEach((node) => {
      node.classList.toggle("is-active-view", node.dataset.dashboardView === viewName);
    });

    nav.querySelectorAll("a").forEach((link) => {
      const target = (link.getAttribute("href") || "").replace(/^#/, "");
      const active = target === viewName;
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });

    updateIntro(viewName);

    if (viewName === "netz-fahrplan") {
      setNetSubview(activeNetSubview);
    }

    refreshDataStatus();

    if (updateHash) history.replaceState(null, "", "#" + viewName);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  nav.addEventListener("click", (event) => {
    const link = event.target.closest("a[href^='#']");
    if (!link) return;

    const viewName = link.getAttribute("href").slice(1);
    if (!views[viewName]) return;

    event.preventDefault();
    setActiveView(viewName, true);
  });

  window.addEventListener("hashchange", () => {
    const viewName = location.hash.replace(/^#/, "");
    setActiveView(views[viewName] ? viewName : "uebersicht", false);
  });

  setNetSubview("netzstruktur");
  setTimeout(refreshDataStatus, 250);
  setTimeout(refreshDataStatus, 1000);

  const initial = location.hash.replace(/^#/, "");
  setActiveView(views[initial] ? initial : "uebersicht", false);
})();




