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

  function topLevelSection(node) {
    if (!node) return null;
    const section = node.matches?.("section") ? node : node.closest?.("section");
    return section && section.parentElement === main ? section : null;
  }

  function mark(selector, viewName) {
    document.querySelectorAll(selector).forEach((node) => {
      const section = topLevelSection(node);
      if (section && section !== intro) section.dataset.dashboardView = viewName;
    });
  }

  function replaceExactText(from, to) {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );
    const nodes = [];
    while (walker.nextNode()) {
      if ((walker.currentNode.nodeValue || "").trim() === from) {
        nodes.push(walker.currentNode);
      }
    }
    nodes.forEach((node) => {
      node.nodeValue = node.nodeValue.replace(from, to);
    });
  }

  function replaceContainedText(from, to) {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );
    const nodes = [];
    while (walker.nextNode()) {
      if ((walker.currentNode.nodeValue || "").includes(from)) {
        nodes.push(walker.currentNode);
      }
    }
    nodes.forEach((node) => {
      node.nodeValue = node.nodeValue.replace(from, to);
    });
  }

  // ----------------------------------------------------------
  // Fachlich korrekte Texte
  // ----------------------------------------------------------

  replaceExactText("Servicekalender", "Fahrplankalender");
  replaceExactText("Abfahrtspositionen im Index", "Planmäßige Haltestellenabfahrten");
  replaceExactText("Linien im Fahrplanindex", "Linien im Fahrplanbestand");
  replaceExactText("DATEI / TABELLENBLATT", "TABELLENBLATT");
  replaceExactText("LIEFERMONAT", "LIEFERPERIODE");

  replaceContainedText(
    "Erste und letzte planmäßige Haltestellenabfahrt im Fahrplanindex.",
    "Erste und letzte planmäßige Haltestellenabfahrt im Fahrplanbestand."
  );

  replaceContainedText(
    "Linienbündel, Verkehrsunternehmen und Linienzuordnungen direkt im Dashboard pflegen.",
    "Linienbündel, Verkehrsunternehmen, Zuordnungen und Gültigkeiten direkt im Dashboard pflegen."
  );

  // DEFAS ist Vergleichsquelle, nicht Vertragsgrundlage.
  const realtime = document.querySelector("#defas-echtzeit, .realtime-panel");
  if (realtime) {
    const eyebrow = realtime.querySelector(".panel-heading .eyebrow");
    const title = realtime.querySelector(".panel-heading h2");

    if (eyebrow) eyebrow.textContent = "DEFAS VERGLEICHSDATEN";
    if (title) title.textContent = "Stichprobe des letzten DEFAS-Messlaufs";

    const replacements = [
      ["erfasste Fahrten", "Fahrten in der Stichprobe"],
      ["Linien im Messlauf", "Linien in der Stichprobe"],
      ["Halte-Beobachtungen", "Halte-Beobachtungen in der Stichprobe"],
      ["Echtzeitabdeckung der erfassten Fahrten", "Anteil der Stichprobenfahrten mit Echtzeitsteuerung"],
      ["realtime-gesteuerte Fahrten", "Fahrten mit Echtzeitsteuerung"],
      ["Beobachtungen mit Verspätungswert", "Beobachtungen mit auswertbarem Verspätungswert"],
      ["AUFFÄLLIGE LINIEN", "DEFAS-HINWEISE"],
      ["Linien im letzten DEFAS-Messlauf", "Linien mit Auffälligkeiten in der Stichprobe"]
    ];

    replacements.forEach(([from, to]) => {
      realtime.querySelectorAll("*").forEach((el) => {
        if (el.children.length === 0 && (el.textContent || "").trim() === from) {
          el.textContent = to;
        }
      });
    });

    const status = realtime.querySelector("#rt-status");
    if (status) {
      status.textContent = status.textContent.replace(
        "Nicht berücksichtigt: 40N",
        "Freizeitlinie 40N nicht berücksichtigt"
      );
    }

    if (!realtime.querySelector(".defas-source-note")) {
      const note = document.createElement("p");
      note.className = "source-note defas-source-note";
      note.textContent =
        "DEFAS dient hier ausschließlich als ergänzende Vergleichsquelle. " +
        "Vertragsrelevante Bewertungen erfolgen auf Basis der originären ITCS-/AFZS-Daten " +
        "und der hinterlegten Vertragsregeln.";
      const heading = realtime.querySelector(".panel-heading");
      if (heading) heading.insertAdjacentElement("afterend", note);
    }
  }

  // AFZS-Placeholder fachlich eindeutig formulieren.
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

  // ----------------------------------------------------------
  // Hauptansichten zuordnen
  // ----------------------------------------------------------

  // Die vier bisherigen Netz-KPI-Karten gehören NICHT zur Übersicht.
  main.querySelectorAll(":scope > .kpi-grid").forEach((node) => {
    node.dataset.dashboardView = "netz-fahrplan";
    node.dataset.netSubview = "netzstruktur";
  });

  mark(".documents-panel", "netz-fahrplan");
  mark(".line-analysis-panel", "netz-fahrplan");
  mark("#netzstruktur", "netz-fahrplan");
  mark(".network-structure-panel", "netz-fahrplan");
  mark("#fahrplanangebot", "netz-fahrplan");
  mark(".timetable-panel", "netz-fahrplan");

  main.querySelectorAll(":scope > .documents-panel").forEach((node) => {
    node.dataset.netSubview = "dokumente";
  });
  main.querySelectorAll(":scope > .line-analysis-panel").forEach((node) => {
    node.dataset.netSubview = "netzstruktur";
  });
  main.querySelectorAll(":scope > .network-structure-panel").forEach((node) => {
    node.dataset.netSubview = "netzstruktur";
  });
  main.querySelectorAll(":scope > .timetable-panel").forEach((node) => {
    node.dataset.netSubview = "fahrplanangebot";
  });

  mark("#defas-echtzeit", "betrieb-qualitaet");
  mark(".realtime-panel", "betrieb-qualitaet");
  mark("#fahrgaeste-auslastung", "fahrgaeste-auslastung");
  mark("#datenimport", "datenimport");
  mark(".import-panel", "datenimport");
  mark("#stammdaten", "stammdaten");
  mark(".masterdata-panel", "stammdaten");

  // Sonstige noch nicht zugeordnete Top-Level-Panels gehören nicht auf die Übersicht.
  main.querySelectorAll(":scope > section.panel:not([data-dashboard-view])").forEach((section) => {
    const txt = (section.textContent || "").toLowerCase();

    if (
      txt.includes("defas") ||
      txt.includes("echtzeit") ||
      txt.includes("verspät") ||
      txt.includes("ausfall")
    ) {
      section.dataset.dashboardView = "betrieb-qualitaet";
    } else if (
      txt.includes("afzs") ||
      txt.includes("auslastung") ||
      txt.includes("einsteiger") ||
      txt.includes("aussteiger")
    ) {
      section.dataset.dashboardView = "fahrgaeste-auslastung";
    } else {
      section.dataset.dashboardView = "netz-fahrplan";
      section.dataset.netSubview ||= "netzstruktur";
    }
  });

  // ----------------------------------------------------------
  // Übersicht: echter Datenstatus statt Netzstatistik
  // ----------------------------------------------------------

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
          <strong id="overview-itcs">Noch nicht importiert</strong>
          <small>Grundlage für Pünktlichkeit, Ausfälle und Fahrleistung</small>
        </article>

        <article class="status-card">
          <span>AFZS-Fahrgastdaten</span>
          <strong id="overview-afzs">Noch nicht importiert</strong>
          <small>Grundlage für Besetzung und Auslastung</small>
        </article>

        <article class="status-card">
          <span>Netz-/Fahrplandaten</span>
          <strong id="overview-plan">Vorhanden</strong>
          <small id="overview-plan-detail">Netzstruktur und planmäßiges Angebot</small>
        </article>

        <article class="status-card">
          <span>DEFAS-Vergleichsdaten</span>
          <strong id="overview-defas">Prüfe Datenstand …</strong>
          <small>Ergänzende Stichprobe, keine Vertragsgrundlage</small>
        </article>
      </div>

      <div class="overview-note">
        Vertragskennzahlen werden erst angezeigt, wenn Betriebsdaten verbindlich importiert
        und die zugehörigen Berechnungs- bzw. Vertragsregeln hinterlegt sind.
      </div>
    `;
    intro.insertAdjacentElement("afterend", overviewStatus);
  }

  // Kein pauschaler grüner "Daten aus dem Liniennetz"-Status.
  const genericStatus = intro.querySelector(".data-status");
  if (genericStatus) genericStatus.remove();

  // ----------------------------------------------------------
  // Betrieb & Qualität: ITCS-Status separat vor DEFAS
  // ----------------------------------------------------------

  let operationStatus = document.querySelector("#operation-data-status");
  if (!operationStatus) {
    operationStatus = document.createElement("section");
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

  // ----------------------------------------------------------
  // Netz & Fahrplan: Unterbereiche statt langer Gesamtseite
  // ----------------------------------------------------------

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

    main.querySelectorAll(":scope > [data-dashboard-view='netz-fahrplan']").forEach((node) => {
      if (node === netTabs) {
        node.classList.add("is-active-view");
        return;
      }

      if (node === timetablePanel) {
        const shouldShow = name === "fahrplanangebot" || name === "betriebszeiten";
        node.classList.toggle("is-active-net-subview", shouldShow);
        node.classList.toggle("operation-only", name === "betriebszeiten");
        node.classList.toggle("offer-only", name === "fahrplanangebot");
        return;
      }

      const sub = node.dataset.netSubview || "netzstruktur";
      node.classList.toggle("is-active-net-subview", sub === name);
    });

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
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  });

  // ----------------------------------------------------------
  // Datenstände / Footer eindeutig beschriften
  // ----------------------------------------------------------

  function refreshOverviewStatus() {
    const snapshot = document.querySelector("#rt-snapshot")?.textContent?.trim();
    const defas = document.querySelector("#overview-defas");
    if (defas) {
      defas.textContent = snapshot
        ? `Messlauf ${snapshot}`
        : "Keine Vergleichsdaten erkannt";
    }

    const dataDate = document.querySelector("#data-date")?.textContent?.trim() || "";
    const detail = document.querySelector("#overview-plan-detail");
    if (detail) {
      const cleaned = dataDate
        .replace(/^Automatischer Datenstand:\s*/i, "")
        .replace(/^Datenstand:\s*/i, "")
        .trim();

      detail.textContent = cleaned
        ? `Netzdaten aktualisiert: ${cleaned}`
        : "Netzstruktur und planmäßiges Angebot";
    }
  }

  const dataDate = document.querySelector("#data-date");
  if (dataDate) {
    const normalizeFooterDate = () => {
      const txt = dataDate.textContent || "";
      if (/^Automatischer Datenstand:/i.test(txt)) {
        dataDate.textContent = txt.replace(
          /^Automatischer Datenstand:/i,
          "Netzdaten aktualisiert:"
        );
      }
      refreshOverviewStatus();
    };

    const observer = new MutationObserver(normalizeFooterDate);
    observer.observe(dataDate, { childList: true, characterData: true, subtree: true });
    normalizeFooterDate();
  }

  // ----------------------------------------------------------
  // Hauptansichts-Wechsel
  // ----------------------------------------------------------

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
      const active = node.dataset.dashboardView === viewName;
      node.classList.toggle("is-active-view", active);
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

    refreshOverviewStatus();

    if (updateHash) {
      history.replaceState(null, "", "#" + viewName);
    }

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

  // Dashboard-Daten werden teilweise asynchron gesetzt.
  setTimeout(refreshOverviewStatus, 300);
  setTimeout(refreshOverviewStatus, 1200);

  setNetSubview("netzstruktur");

  const initial = location.hash.replace(/^#/, "");
  setActiveView(views[initial] ? initial : "uebersicht", false);
})();
