async function loadJson(path) {
  const response = await fetch(path, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(
      `${path}: HTTP ${response.status}`
    );
  }

  return response.json();
}


function formatNumber(value, decimals = 0) {
  return Number(value).toLocaleString(
    "de-DE",
    {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }
  );
}


function normalizePlace(value) {
  return String(value ?? "")
    .trim();
}


function createRankingRow(
  rank,
  name,
  value,
  suffix
) {
  const row =
    document.createElement("div");

  row.className = "ranking-row";

  const rankElement =
    document.createElement("span");

  rankElement.className = "ranking-rank";
  rankElement.textContent = rank;

  const nameElement =
    document.createElement("span");

  nameElement.className = "ranking-name";
  nameElement.textContent = name;

  const valueElement =
    document.createElement("span");

  valueElement.className = "ranking-value";
  valueElement.textContent =
    `${formatNumber(value)} ${suffix}`;

  row.append(
    rankElement,
    nameElement,
    valueElement
  );

  return row;
}


function renderRanking(
  elementId,
  rows,
  suffix
) {
  const container =
    document.getElementById(elementId);

  container.innerHTML = "";

  rows.forEach(
    (row, index) => {
      container.appendChild(
        createRankingRow(
          index + 1,
          row.name,
          row.value,
          suffix
        )
      );
    }
  );
}


function analyseStops(data) {
  const stops =
    Array.isArray(data?.stops)
      ? data.stops
      : [];

  const lines = new Set();
  const places = new Set();

  let totalLineRelations = 0;

  const stopRanking = [];
  const placeCounts = new Map();

  for (const stop of stops) {
    const stopLines =
      Array.isArray(stop?.lines)
        ? [
            ...new Set(
              stop.lines
                .map(line =>
                  String(line).trim()
                )
                .filter(Boolean)
            )
          ]
        : [];

    for (const line of stopLines) {
      lines.add(line);
    }

    totalLineRelations +=
      stopLines.length;

    const place =
      normalizePlace(stop?.place);

    if (place) {
      places.add(place);

      placeCounts.set(
        place,
        (placeCounts.get(place) ?? 0)
        + 1
      );
    }

    stopRanking.push({
      name:
        String(stop?.name ?? "Unbekannt"),
      value:
        stopLines.length
    });
  }

  stopRanking.sort(
    (a, b) =>
      b.value - a.value
      || a.name.localeCompare(
        b.name,
        "de"
      )
  );

  const placeRanking =
    Array.from(
      placeCounts.entries()
    )
      .map(
        ([name, value]) => ({
          name,
          value
        })
      )
      .sort(
        (a, b) =>
          b.value - a.value
          || a.name.localeCompare(
            b.name,
            "de"
          )
      );

  return {
    stopCount:
      stops.length,

    lineCount:
      lines.size,

    placeCount:
      places.size,

    averageLines:
      stops.length > 0
        ? totalLineRelations
          / stops.length
        : 0,

    topStops:
      stopRanking.slice(0, 10),

    topPlaces:
      placeRanking.slice(0, 10),

    generatedAt:
      data?.generated_at ?? null,

    validFrom:
      data?.valid_from ?? null,

    validTo:
      data?.valid_to ?? null
  };
}


function analyseDocuments(data) {
  const lines =
    data?.lines
    && typeof data.lines === "object"
      ? data.lines
      : {};

  const documents =
    Object.values(lines)
      .flatMap(
        entries =>
          Array.isArray(entries)
            ? entries
            : []
      );

  let regular = 0;
  let diversion = 0;
  let ast = 0;
  let other = 0;

  for (const documentEntry of documents) {
    const type =
      String(
        documentEntry?.type ?? ""
      ).toLowerCase();

    if (
      type.includes("umleitung")
    ) {
      diversion += 1;
    } else if (
      type.includes("ast")
    ) {
      ast += 1;
    } else if (
      type.includes("regul")
    ) {
      regular += 1;
    } else {
      other += 1;
    }
  }

  return {
    total:
      documents.length,
    regular,
    diversion,
    ast,
    other
  };
}


function formatDataDate(value) {
  if (!value) {
    return "";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return "";
  }

  return new Intl.DateTimeFormat(
    "de-DE",
    {
      dateStyle: "medium",
      timeStyle: "short"
    }
  ).format(date);
}


async function startDashboard() {
  try {
    const [
      stopData,
      documentData
    ] =
      await Promise.all([
        loadJson(
          "../data/haltestellen_suchindex.json"
        ),
        loadJson(
          "../data/fahrplan_pdf_zuordnung.json"
        )
      ]);

    const network =
      analyseStops(stopData);

    const documents =
      analyseDocuments(
        documentData
      );

    document.getElementById(
      "kpi-lines"
    ).textContent =
      formatNumber(
        network.lineCount
      );

    document.getElementById(
      "kpi-stops"
    ).textContent =
      formatNumber(
        network.stopCount
      );

    document.getElementById(
      "kpi-places"
    ).textContent =
      formatNumber(
        network.placeCount
      );

    document.getElementById(
      "kpi-average-lines"
    ).textContent =
      formatNumber(
        network.averageLines,
        1
      );

    renderRanking(
      "top-stops",
      network.topStops,
      "Linien"
    );

    renderRanking(
      "top-places",
      network.topPlaces,
      "Haltestellen"
    );

    document.getElementById(
      "documents-total"
    ).textContent =
      formatNumber(
        documents.total
      );

    document.getElementById(
      "docs-regular"
    ).textContent =
      formatNumber(
        documents.regular
      );

    document.getElementById(
      "docs-diversion"
    ).textContent =
      formatNumber(
        documents.diversion
      );

    document.getElementById(
      "docs-ast"
    ).textContent =
      formatNumber(
        documents.ast
      );

    document.getElementById(
      "docs-other"
    ).textContent =
      formatNumber(
        documents.other
      );

    const dataDate =
      formatDataDate(
        stopData?.generated_at
      );

    document.getElementById(
      "data-date"
    ).textContent =
      dataDate
        ? `Datenstand: ${dataDate}`
        : "";
  } catch (error) {
    console.error(
      "Dashboard-Daten konnten nicht geladen werden:",
      error
    );

    document.querySelectorAll(
      ".loading"
    ).forEach(
      element => {
        element.textContent =
          "Daten konnten nicht geladen werden.";
      }
    );
  }
}


startDashboard();

let vabDashboardLines = [];


function buildLineStatistics(data) {
  const lineStops = new Map();

  for (const stop of data?.stops ?? []) {
    const stopLines =
      Array.isArray(stop?.lines)
        ? [...new Set(stop.lines.map(String))]
        : [];

    for (const line of stopLines) {
      if (!lineStops.has(line)) {
        lineStops.set(line, new Set());
      }

      lineStops
        .get(line)
        .add(String(stop?.id ?? stop?.name ?? ""));
    }
  }

  return Array.from(
    lineStops.entries()
  )
    .map(([name, stops]) => ({
      name,
      value: stops.size
    }))
    .sort(
      (a, b) =>
        b.value - a.value
        || a.name.localeCompare(
          b.name,
          "de",
          { numeric: true }
        )
    );
}


function renderLineAnalysis(filter = "") {
  const container =
    document.getElementById(
      "line-analysis"
    );

  if (!container) {
    return;
  }

  const query =
    String(filter)
      .trim()
      .toLowerCase();

  let rows =
    vabDashboardLines;

  if (query) {
    rows =
      rows.filter(row =>
        row.name
          .toLowerCase()
          .includes(query)
      );
  } else {
    rows =
      rows.slice(0, 15);
  }

  container.innerHTML = "";

  if (rows.length === 0) {
    container.innerHTML =
      '<p class="loading">Keine Linie gefunden.</p>';

    return;
  }

  const maximum =
    Math.max(
      ...rows.map(row => row.value),
      1
    );

  for (const row of rows) {
    const element =
      document.createElement("div");

    element.className =
      "line-bar-row";

    const width =
      Math.max(
        2,
        row.value / maximum * 100
      );

    element.innerHTML = `
      <div class="line-bar-name">
        Linie ${row.name}
      </div>

      <div class="line-bar-track">
        <div
          class="line-bar-fill"
          style="width:${width}%"
        ></div>
      </div>

      <div class="line-bar-value">
        ${formatNumber(row.value)}
        Haltestellen
      </div>
    `;

    container.appendChild(
      element
    );
  }
}


async function startLineAnalysis() {
  try {
    const data =
      await loadJson(
        "../data/haltestellen_suchindex.json"
      );

    vabDashboardLines =
      buildLineStatistics(data);

    renderLineAnalysis();

    document
      .getElementById("line-search")
      ?.addEventListener(
        "input",
        event => {
          renderLineAnalysis(
            event.target.value
          );
        }
      );
  } catch (error) {
    console.error(
      "Linienanalyse konnte nicht geladen werden:",
      error
    );
  }
}


startLineAnalysis();

async function startNetworkStructure() {
  try {
    const data =
      await loadJson(
        "../data/haltestellen_suchindex.json"
      );

    const groups = {
      one: 0,
      twoThree: 0,
      fourNine: 0,
      tenPlus: 0
    };

    for (const stop of data?.stops ?? []) {
      const count =
        new Set(
          Array.isArray(stop?.lines)
            ? stop.lines.map(String)
            : []
        ).size;

      if (count === 1) {
        groups.one++;
      } else if (count >= 2 && count <= 3) {
        groups.twoThree++;
      } else if (count >= 4 && count <= 9) {
        groups.fourNine++;
      } else if (count >= 10) {
        groups.tenPlus++;
      }
    }

    const total =
      groups.one +
      groups.twoThree +
      groups.fourNine +
      groups.tenPlus;

    document.getElementById("network-1").textContent =
      formatNumber(groups.one);

    document.getElementById("network-2-3").textContent =
      formatNumber(groups.twoThree);

    document.getElementById("network-4-9").textContent =
      formatNumber(groups.fourNine);

    document.getElementById("network-10plus").textContent =
      formatNumber(groups.tenPlus);

    const setWidth = (id, value) => {
      const element =
        document.getElementById(id);

      if (element) {
        element.style.width =
          total > 0
            ? `${value / total * 100}%`
            : "0%";
      }
    };

    setWidth(
      "network-bar-1",
      groups.one
    );

    setWidth(
      "network-bar-2",
      groups.twoThree
    );

    setWidth(
      "network-bar-3",
      groups.fourNine
    );

    setWidth(
      "network-bar-4",
      groups.tenPlus
    );

  } catch (error) {
    console.error(
      "Netzstruktur konnte nicht geladen werden:",
      error
    );
  }
}

startNetworkStructure();

let vabTimetableAnalysis = null;

const vabWeekdays = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag"
];


function vabTimetableTuple(entry) {
  if (Array.isArray(entry)) {
    return entry;
  }

  if (Array.isArray(entry?.value)) {
    return entry.value;
  }

  return [];
}


function vabTimetableAnalyse(data) {
  const serviceProperties =
    data?.services?.constructor === Object
      ? Object.entries(data.services)
      : [];

  const services = new Map(
    serviceProperties.map(
      ([id, value]) => [
        String(id),
        value
      ]
    )
  );

  const stationEntries =
    data?.departures_by_station?.constructor === Object
      ? Object.entries(
          data.departures_by_station
        )
      : [];

  const weekdayTotals =
    Array(7).fill(0);

  const hourlyWeekdayTotals =
    Array.from(
      { length: 7 },
      () => Array(24).fill(0)
    );

  const lineWeekdayTotals =
    Array.from(
      { length: 7 },
      () => new Map()
    );

  const lineWeekdayOperation =
    Array.from(
      { length: 7 },
      () => new Map()
    );

  const allLines =
    new Set();

  let departureCount = 0;

  for (
    const [, departures]
    of stationEntries
  ) {
    if (!Array.isArray(departures)) {
      continue;
    }

    for (const entry of departures) {
      const tuple =
        vabTimetableTuple(entry);

      const line =
        String(tuple[1] ?? "")
          .trim();

      const serviceId =
        String(tuple[3] ?? "")
          .trim();

      if (!line) {
        continue;
      }

      departureCount++;
      allLines.add(line);

      const service =
        services.get(serviceId);

      const weekdays =
        Array.isArray(service?.weekdays)
          ? service.weekdays
          : [];

      for (
        let day = 0;
        day < 7;
        day++
      ) {
        if (
          String(weekdays[day] ?? "0")
          !== "1"
        ) {
          continue;
        }

        weekdayTotals[day]++;

        const timeText =
          String(tuple[0] ?? "");

        const hourMatch =
          timeText.match(/^(\d{1,2}):/);

        if (hourMatch) {
          const rawHour =
            Number(hourMatch[1]);

          if (
            Number.isFinite(rawHour)
            && rawHour >= 0
          ) {
            const hour =
              rawHour % 24;

            hourlyWeekdayTotals[day][hour]++;
          }
        }

        const lineMap =
          lineWeekdayTotals[day];

        lineMap.set(
          line,
          (lineMap.get(line) ?? 0) + 1
        );

        const operationMap =
          lineWeekdayOperation[day];

        const timeParts =
          timeText.match(
            /^(\d{1,2}):(\d{2})/
          );

        if (timeParts) {
          const minutes =
            Number(timeParts[1]) * 60
            + Number(timeParts[2]);

          const current =
            operationMap.get(line)
            ?? {
              line,
              count: 0,
              first: null,
              last: null
            };

          current.count++;

          if (
            current.first === null
            || minutes < current.first
          ) {
            current.first = minutes;
          }

          if (
            current.last === null
            || minutes > current.last
          ) {
            current.last = minutes;
          }

          operationMap.set(
            line,
            current
          );
        }
      }
    }
  }

  return {
    serviceCount:
      services.size,

    stationCount:
      stationEntries.length,

    departureCount,

    lineCount:
      allLines.size,

    weekdayTotals,

    hourlyWeekdayTotals,

    lineWeekdayTotals,

    lineWeekdayOperation,

    validFrom:
      data?.valid_from ?? "",

    validTo:
      data?.valid_to ?? ""
  };
}


function vabFormatCompactDate(value) {
  const text =
    String(value ?? "");

  if (!/^\d{8}$/.test(text)) {
    return text;
  }

  return (
    text.slice(6, 8)
    + "."
    + text.slice(4, 6)
    + "."
    + text.slice(0, 4)
  );
}


function vabRenderWeekdayProfile() {
  const analysis =
    vabTimetableAnalysis;

  if (!analysis) {
    return;
  }

  const container =
    document.getElementById(
      "weekday-bars"
    );

  container.innerHTML = "";

  const maximum =
    Math.max(
      ...analysis.weekdayTotals,
      1
    );

  analysis.weekdayTotals.forEach(
    (value, index) => {
      const row =
        document.createElement("div");

      row.className =
        "weekday-row";

      const width =
        value / maximum * 100;

      row.innerHTML = `
        <span class="weekday-name">
          ${vabWeekdays[index]}
        </span>

        <div class="weekday-track">
          <div
            class="weekday-fill"
            style="width:${width}%"
          ></div>
        </div>

        <span class="weekday-value">
          ${formatNumber(value)}
        </span>
      `;

      container.appendChild(row);
    }
  );
}


function vabRenderTimetableLines(day) {
  const analysis =
    vabTimetableAnalysis;

  if (!analysis) {
    return;
  }

  const lineMap =
    analysis.lineWeekdayTotals[day];

  const rows =
    Array.from(
      lineMap.entries()
    )
      .map(
        ([name, value]) => ({
          name,
          value
        })
      )
      .sort(
        (a, b) =>
          b.value - a.value
          || a.name.localeCompare(
            b.name,
            "de",
            { numeric: true }
          )
      )
      .slice(0, 12);

  const container =
    document.getElementById(
      "weekday-lines"
    );

  container.innerHTML = "";

  const maximum =
    Math.max(
      ...rows.map(row => row.value),
      1
    );

  for (const row of rows) {
    const element =
      document.createElement("div");

    element.className =
      "line-bar-row";

    const width =
      row.value / maximum * 100;

    element.innerHTML = `
      <div class="line-bar-name">
        Linie ${row.name}
      </div>

      <div class="line-bar-track">
        <div
          class="line-bar-fill"
          style="width:${width}%"
        ></div>
      </div>

      <div class="line-bar-value">
        ${formatNumber(row.value)}
        Abfahrten
      </div>
    `;

    container.appendChild(element);
  }

  document.getElementById(
    "weekday-line-title"
  ).textContent =
    `Stärkste Linien am ${vabWeekdays[day]}`;
}


async function startTimetableAnalysis() {
  try {
    const data =
      await loadJson(
        "../data/fahrplan_index.json"
      );

    vabTimetableAnalysis =
      vabTimetableAnalyse(data);

    const analysis =
      vabTimetableAnalysis;

    document.getElementById(
      "tt-services"
    ).textContent =
      formatNumber(
        analysis.serviceCount
      );

    document.getElementById(
      "tt-stations"
    ).textContent =
      formatNumber(
        analysis.stationCount
      );

    document.getElementById(
      "tt-departures"
    ).textContent =
      formatNumber(
        analysis.departureCount
      );

    document.getElementById(
      "tt-lines"
    ).textContent =
      formatNumber(
        analysis.lineCount
      );

    document.getElementById(
      "tt-validity"
    ).textContent =
      "Fahrplandaten gültig: "
      + vabFormatCompactDate(
          analysis.validFrom
        )
      + " bis "
      + vabFormatCompactDate(
          analysis.validTo
        );

    vabRenderWeekdayProfile();
    vabRenderTimetableLines(0);
    vabRenderDailyProfile(0);
    vabRenderLineOperation(0);

    document
      .getElementById(
        "timetable-weekday"
      )
      ?.addEventListener(
        "change",
        event => {
          const day =
            Number(event.target.value);

          vabRenderTimetableLines(day);
          vabRenderDailyProfile(day);

          const operationSearch =
            document.getElementById(
              "operation-search"
            )?.value ?? "";

          vabRenderLineOperation(
            day,
            operationSearch
          );
        }
      );

  } catch (error) {
    console.error(
      "Fahrplananalyse konnte nicht geladen werden:",
      error
    );
  }
}


startTimetableAnalysis();




function vabSumHours(hours, start, end) {
  return hours
    .slice(start, end)
    .reduce(
      (sum, value) => sum + value,
      0
    );
}


function vabRenderDailyProfile(day) {
  const analysis =
    vabTimetableAnalysis;

  if (!analysis) {
    return;
  }

  const hours =
    analysis.hourlyWeekdayTotals?.[day]
    ?? Array(24).fill(0);

  const setValue = (id, value) => {
    const element =
      document.getElementById(id);

    if (element) {
      element.textContent =
        formatNumber(value);
    }
  };

  setValue(
    "daypart-night",
    vabSumHours(hours, 0, 4)
  );

  setValue(
    "daypart-early",
    vabSumHours(hours, 4, 6)
  );

  setValue(
    "daypart-morning",
    vabSumHours(hours, 6, 9)
  );

  setValue(
    "daypart-day",
    vabSumHours(hours, 9, 15)
  );

  setValue(
    "daypart-afternoon",
    vabSumHours(hours, 15, 19)
  );

  setValue(
    "daypart-evening",
    vabSumHours(hours, 19, 24)
  );

  const title =
    document.getElementById(
      "daily-profile-title"
    );

  if (title) {
    title.textContent =
      `Angebotsverlauf am ${vabWeekdays[day]}`;
  }

  const container =
    document.getElementById(
      "hour-profile"
    );

  if (!container) {
    return;
  }

  container.innerHTML = "";

  const maximum =
    Math.max(...hours, 1);

  hours.forEach(
    (value, hour) => {
      const column =
        document.createElement("div");

      column.className =
        "hour-column";

      const height =
        value > 0
          ? Math.max(
              3,
              value / maximum * 100
            )
          : 0;

      column.innerHTML = `
        <span class="hour-value">
          ${formatNumber(value)}
        </span>

        <div class="hour-bar-area">
          <div
            class="hour-bar"
            style="height:${height}%"
            title="${hour}:00 Uhr – ${formatNumber(value)} Abfahrten"
          ></div>
        </div>

        <span class="hour-label">
          ${String(hour).padStart(2, "0")}
        </span>
      `;

      container.appendChild(column);
    }
  );
}






function vabMinutesToTime(minutes) {
  if (
    minutes === null
    || !Number.isFinite(minutes)
  ) {
    return "–";
  }

  const hours =
    Math.floor(minutes / 60);

  const mins =
    minutes % 60;

  return (
    String(hours).padStart(2, "0")
    + ":"
    + String(mins).padStart(2, "0")
  );
}


function vabFormatDuration(minutes) {
  if (!Number.isFinite(minutes)) {
    return "–";
  }

  const hours =
    Math.floor(minutes / 60);

  const mins =
    minutes % 60;

  if (hours === 0) {
    return `${mins} Min.`;
  }

  if (mins === 0) {
    return `${hours} Std.`;
  }

  return `${hours} Std. ${mins} Min.`;
}


function vabRenderLineOperation(
  day,
  filter = ""
) {
  const analysis =
    vabTimetableAnalysis;

  if (!analysis) {
    return;
  }

  const operationMap =
    analysis
      .lineWeekdayOperation?.[day];

  if (!operationMap) {
    return;
  }

  const query =
    String(filter)
      .trim()
      .toLowerCase();

  let rows =
    Array.from(
      operationMap.values()
    );

  if (query) {
    rows = rows.filter(
      row =>
        String(row.line)
          .toLowerCase()
          .includes(query)
    );
  }

  rows.sort(
    (a, b) =>
      b.count - a.count
      || String(a.line).localeCompare(
        String(b.line),
        "de",
        { numeric: true }
      )
  );

  const body =
    document.getElementById(
      "operation-table-body"
    );

  if (!body) {
    return;
  }

  body.innerHTML = "";

  if (rows.length === 0) {
    body.innerHTML = `
      <tr>
        <td
          colspan="5"
          class="operation-empty"
        >
          Keine passende Linie gefunden.
        </td>
      </tr>
    `;

    return;
  }

  for (const row of rows) {
    const tr =
      document.createElement("tr");

    const duration =
      row.first !== null
      && row.last !== null
        ? row.last - row.first
        : null;

    tr.innerHTML = `
      <td class="operation-line">
        Linie ${row.line}
      </td>

      <td>
        ${vabMinutesToTime(row.first)} Uhr
      </td>

      <td>
        ${vabMinutesToTime(row.last)} Uhr
      </td>

      <td class="operation-duration">
        ${vabFormatDuration(duration)}
      </td>

      <td class="operation-count">
        ${formatNumber(row.count)}
      </td>
    `;

    body.appendChild(tr);
  }

  const title =
    document.getElementById(
      "operation-title"
    );

  if (title) {
    title.textContent =
      `Linienangebot am ${vabWeekdays[day]}`;
  }
}



document
  .getElementById("operation-search")
  ?.addEventListener(
    "input",
    event => {
      const day =
        Number(
          document.getElementById(
            "timetable-weekday"
          )?.value ?? 0
        );

      vabRenderLineOperation(
        day,
        event.target.value
      );
    }
  );

document
  .getElementById("operation-weekday")
  ?.addEventListener(
    "change",
    event => {
      const day =
        Number(event.target.value);

      const mainSelect =
        document.getElementById(
          "timetable-weekday"
        );

      if (mainSelect) {
        mainSelect.value =
          String(day);
      }

      const search =
        document.getElementById(
          "operation-search"
        )?.value ?? "";

      vabRenderTimetableLines(day);
      vabRenderDailyProfile(day);
      vabRenderLineOperation(
        day,
        search
      );
    }
  );

async function loadDashboardStatus() {
  try {
    const status =
      await loadJson(
        "./data-status.json"
      );

    const updated =
      status?.updated_at
        ? new Date(status.updated_at)
        : null;

    const element =
      document.getElementById(
        "data-date"
      );

    if (
      element
      && updated
      && !Number.isNaN(updated.getTime())
    ) {
      element.textContent =
        "Automatischer Datenstand: "
        + new Intl.DateTimeFormat(
            "de-DE",
            {
              dateStyle: "medium",
              timeStyle: "short"
            }
          ).format(updated);
    }
  } catch (error) {
    console.warn(
      "Dashboard-Datenstand konnte nicht geladen werden:",
      error
    );
  }
}

loadDashboardStatus();
