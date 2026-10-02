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
          <h2>Vertragsauswertung noch nicht verfügbar</h2>
          <p class="network-caption">
            Noch wurden keine ITCS-Betriebsdaten verbindlich importiert.
            Pünktlichkeit, Ausfälle, Soll-Ist-Fahrleistung und Vertragsabweichungen
            werden erst aus den originären VU-Daten und den hinterlegten Regeln berechnet.
          </p>
        </div>
      </div>
    `;
    if (realtime && realtime.parentElement === main) {
      realtime.insertAdjacentElement("beforebegin", operationStatus);
    } else {
      intro.insertAdjacentElement("afterend", operationStatus);
    }
  }

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
