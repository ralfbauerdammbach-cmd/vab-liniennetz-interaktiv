'use strict';

const statusElement = document.getElementById('status');
const infoPanel = document.getElementById('info-panel');
const infoPanelInhalt = document.getElementById('info-panel-inhalt');
const infoPanelSchliessen = document.getElementById('info-panel-schliessen');

const vabSucheFormular =
  document.getElementById('vab-suche-formular');

const vabSucheEingabe =
  document.getElementById('vab-suche-eingabe');

const vabSucheButton =
  document.querySelector('.vab-suche-button');

const vabSucheVorschlaege =
  document.getElementById('vab-suche-vorschlaege');

function setStatus(text, type = '') {
  statusElement.textContent = text;
  statusElement.className = 'status';

  if (type) {
    statusElement.classList.add(type);
  }
}

const karte = L.map('karte', {
  zoomControl: true,
  preferCanvas: true,

  /*
   * Zoomen erfolgt immer zur Kartenmitte.
   * Dadurch bleibt ein mittig positionierter Ort
   * beim Rein- und Herauszoomen im Mittelpunkt.
   */
  /*
   * Das standardmäßige Leaflet-Mausradzoomen wird
   * deaktiviert. Weiter unten übernimmt eine eigene
   * Steuerung mit kleinen 0,1-Zoomschritten.
   */
  scrollWheelZoom: false,
  doubleClickZoom: 'center',
  touchZoom: 'center',
  zoomSnap: 0.1
}).setView([49.97, 9.15], 9);


/*
 * Eigenes, sehr fein abgestuftes Mausradzoomen.
 *
 * Entscheidend:
 * - Die aktuelle Kartenmitte wird vor jedem Zoom
 *   gespeichert.
 * - Nach dem Zoom wird exakt dieselbe geografische
 *   Position wieder als Kartenmitte gesetzt.
 * - Die Mausposition hat keinen Einfluss auf den
 *   Mittelpunkt.
 */
const karteContainer =
  karte.getContainer();

let mausradZoomAccumulator = 0;
let letzterMausradZoomZeitpunkt = 0;

karteContainer.addEventListener(
  'wheel',
  event => {
    event.preventDefault();
    event.stopPropagation();

    mausradZoomAccumulator +=
      Number(event.deltaY) || 0;

    const schwelle = 80;

    if (
      Math.abs(mausradZoomAccumulator)
      < schwelle
    ) {
      return;
    }

    const jetzt = performance.now();

    /*
     * Sehr schnelle Mehrfachereignisse von Maus
     * oder Touchpad werden gebremst.
     */
    if (
      jetzt - letzterMausradZoomZeitpunkt
      < 45
    ) {
      return;
    }

    letzterMausradZoomZeitpunkt = jetzt;

    const richtung =
      mausradZoomAccumulator < 0
        ? 1
        : -1;

    mausradZoomAccumulator = 0;

    const aktuelleMitte =
      karte.getCenter();

    const aktuellerZoom =
      karte.getZoom();

    const zoomSchritt = 0.2;

    const neuerZoom = Math.min(
      karte.getMaxZoom(),
      Math.max(
        karte.getMinZoom(),
        Number(
          (
            aktuellerZoom
            + richtung * zoomSchritt
          ).toFixed(1)
        )
      )
    );

    if (neuerZoom === aktuellerZoom) {
      return;
    }

    karte.setView(
      aktuelleMitte,
      neuerZoom,
      {
        animate: false,
        reset: true
      }
    );
  },
  {
    passive: false
  }
);


L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap-Mitwirkende'
  }
).addTo(karte);

L.control.scale({
  imperial: false,
  position: 'bottomleft'
}).addTo(karte);

karte.createPane('linienPane');
karte.getPane('linienPane').style.zIndex = 410;

karte.createPane('auswahlPane');
karte.getPane('auswahlPane').style.zIndex = 620;

karte.createPane('haltestellenPane');
karte.getPane('haltestellenPane').style.zIndex = 610;
karte.getPane('haltestellenPane').style.pointerEvents = 'none';

/*
 * Markierte Abschnitte und deren Marker sind rein visuell.
 * Das gesamte Pane darf niemals Mausereignisse abfangen.
 */
karte.getPane('auswahlPane').style.pointerEvents = 'none';

karte.createPane('klickPane');
karte.getPane('klickPane').style.zIndex = 650;
karte.getPane('klickPane').style.pointerEvents = 'none';

karte.createPane('robPane');
karte.getPane('robPane').style.zIndex = 700;

karte.createPane('robBussteigPane');
karte.getPane('robBussteigPane').style.zIndex = 690;

let linienLayer;
let abschnittKlickLayer;
let ausgewaehlterAbschnitt = null;
let startMarker = null;
let zielMarker = null;
let linienHaltestellenLayer = null;
let robMarker = null;
let robBussteigLayer = null;
let robBussteigPositionen = null;
let robConfigurationAktuell = null;
let robBearbeitungsmodusAktiv = false;
let robBussteigOriginalpositionen = null;

const robBussteigMarkerNachNummer = new Map();
const linienNachName = new Map();
let fixierteLinie = null;
let gemeinsameAbschnitteGeoJSON = null;
let linienvarianten61 = null;
let aktiveVariante61 = null;
let linienvarianten68 = null;
let aktiveVariante68 = null;
let linienvarianten60 = null;
let aktiveVariante60 = null;

/*
 * Gemeinsame Variantenverwaltung für beliebige Linien.
 * Die bisherigen linienbezogenen Variablen bleiben
 * vorerst als Rückfallebene erhalten.
 */
const linienvariantenNachLinie = new Map();
let aktiveVariantenLinie = null;
let aktiveVariantenId = null;

function getLineName(properties = {}) {
  return String(
    properties.line
    ?? properties.route_short_name
    ?? properties.route_name
    ?? properties.route_id
    ?? ''
  ).trim();
}

function sortLines(lines = []) {
  return [...lines].sort((first, second) =>
    String(first).localeCompare(
      String(second),
      'de',
      {
        numeric: true,
        sensitivity: 'base'
      }
    )
  );
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function removeSelection() {
  aktiveVariante61 = null;
  aktiveVariante68 = null;
  aktiveVariante60 = null;
  aktiveVariantenLinie = null;
  aktiveVariantenId = null;

  if (ausgewaehlterAbschnitt) {
    karte.removeLayer(ausgewaehlterAbschnitt);
    ausgewaehlterAbschnitt = null;
  }

  if (startMarker) {
    karte.removeLayer(startMarker);
    startMarker = null;
  }

  if (zielMarker) {
    karte.removeLayer(zielMarker);
    zielMarker = null;
  }

  if (linienHaltestellenLayer) {
    karte.removeLayer(linienHaltestellenLayer);
    linienHaltestellenLayer = null;
  }

  /*
   * Der Leaflet-Canvas des Haltestellen-Panes kann auch
   * ohne sichtbare Marker bestehen bleiben. Deshalb darf
   * das Pane nach dem Schließen keine Klicks abfangen.
   */
  karte.getPane('haltestellenPane').style.pointerEvents = 'none';

  infoPanel.classList.remove('sichtbar');
  infoPanel.setAttribute('aria-hidden', 'true');
}

function clearAllSelection() {
  /*
   * Fixierte Linie vollständig zurücksetzen.
   */
  if (fixierteLinie) {
    resetLineStyle(fixierteLinie);
    fixierteLinie = null;
  }

  /*
   * Gemeinsamen Abschnitt, Marker und Infospalte entfernen.
   */
  removeSelection();

  /*
   * Leaflet nach Änderung der Seitenleistenbreite aktualisieren.
   */
  window.setTimeout(() => {
    karte.invalidateSize();
  }, 230);

  if (linienNachName.size > 0) {
    setStatus(
      `${linienNachName.size.toLocaleString('de-DE')} Linien verfügbar`,
      'erfolg'
    );
  }
}

function lineStyle() {
  return {
    pane: 'linienPane',
    color: '#000F47',
    weight: 3,
    opacity: 0.72,
    lineCap: 'round',
    lineJoin: 'round'
  };
}

function registerLineLayer(lineName, layer) {
  if (!lineName) {
    return;
  }

  if (!linienNachName.has(lineName)) {
    linienNachName.set(lineName, []);
  }

  linienNachName.get(lineName).push(layer);
}

function setLineStyle(lineName, style) {
  const layers = linienNachName.get(lineName) ?? [];

  for (const layer of layers) {
    /*
     * Die ursprüngliche Ebenenreihenfolge bleibt erhalten.
     * bringToFront würde die Klickreihenfolge dauerhaft verändern.
     */
    layer.setStyle(style);
  }
}

function resetLineStyle(lineName) {
  const layers = linienNachName.get(lineName) ?? [];

  for (const layer of layers) {
    linienLayer.resetStyle(layer);
  }
}

function getLineBounds(lineName) {
  const layers = linienNachName.get(lineName) ?? [];
  const bounds = L.latLngBounds([]);

  for (const layer of layers) {
    const layerBounds = layer.getBounds();

    if (layerBounds.isValid()) {
      bounds.extend(layerBounds);
    }
  }

  return bounds;
}



function getLineInformation(lineName) {
  const layers = linienNachName.get(lineName) ?? [];

  const headsigns = new Set();
  const startStops = new Set();
  const endStops = new Set();
  const patternIds = new Set();

  for (const layer of layers) {
    const properties =
      layer.feature?.properties ?? {};

    for (
      const headsign
      of properties.headsigns ?? []
    ) {
      const value = String(headsign).trim();

      if (value) {
        headsigns.add(value);
      }
    }

    const stops = properties.stops ?? [];

    if (stops.length > 0) {
      const first = stops[0] ?? {};
      const last = stops[stops.length - 1] ?? {};

      const firstName = String(
        first.stop_name
        ?? first.name
        ?? ''
      ).trim();

      const lastName = String(
        last.stop_name
        ?? last.name
        ?? ''
      ).trim();

      if (firstName) {
        startStops.add(firstName);
      }

      if (lastName) {
        endStops.add(lastName);
      }
    }

    const patternId = String(
      properties.pattern_id ?? ''
    ).trim();

    if (patternId) {
      patternIds.add(patternId);
    }
  }

  return {
    headsigns: sortLines([...headsigns]),
    startStops: sortLines([...startStops]),
    endStops: sortLines([...endStops]),
    patternCount: patternIds.size
  };
}

function renderLineInformation(lineName) {
  const information =
    getLineInformation(lineName);

  const headsignItems =
    information.headsigns.length > 0
      ? information.headsigns
          .map(value => `
            <li>${escapeHtml(value)}</li>
          `)
          .join('')
      : '<li>Keine Zielangabe vorhanden</li>';

  const startItems =
    information.startStops.length > 0
      ? information.startStops
          .map(value => `
            <li>${escapeHtml(value)}</li>
          `)
          .join('')
      : '<li>Keine Angabe vorhanden</li>';

  const endItems =
    information.endStops.length > 0
      ? information.endStops
          .map(value => `
            <li>${escapeHtml(value)}</li>
          `)
          .join('')
      : '<li>Keine Angabe vorhanden</li>';

  infoPanelInhalt.innerHTML = `
    <div class="seitenleisten-inhalt linien-information">
      <div class="liniennummer-gross">
        ${escapeHtml(lineName)}
      </div>

      <h2>Linie ${escapeHtml(lineName)}</h2>

      <section class="linien-info-bereich">
        <h3>Zielrichtungen</h3>
        <ul>
          ${headsignItems}
        </ul>
      </section>

      <section class="linien-info-bereich">
        <h3>Mögliche Anfangshaltestellen</h3>
        <ul>
          ${startItems}
        </ul>
      </section>

      <section class="linien-info-bereich">
        <h3>Mögliche Endhaltestellen</h3>
        <ul>
          ${endItems}
        </ul>
      </section>

      <div class="linien-info-fuss">
        ${information.patternCount.toLocaleString('de-DE')}
        Fahrtmuster
      </div>
    </div>
  `;

  infoPanel.classList.add('sichtbar');
  infoPanel.setAttribute(
    'aria-hidden',
    'false'
  );

  /*
   * Nach dem Öffnen der Seitenleiste muss Leaflet
   * die neue Kartengröße berücksichtigen.
   */
  window.setTimeout(() => {
    karte.invalidateSize();
  }, 230);
}


function getStopsForLine(lineName, selectedLayers = null) {
  const layers =
    selectedLayers ?? linienNachName.get(lineName) ?? [];
  const rawStops = [];

  function normalizeStopName(value) {
    return String(value ?? '')
      .trim()
      .toLocaleLowerCase('de')
      .replace(/\s+/g, ' ');
  }

  function distanceInMeters(first, second) {
    const earthRadius = 6371000;
    const toRadians = value =>
      value * Math.PI / 180;

    const latitude1 =
      toRadians(first.latitude);

    const latitude2 =
      toRadians(second.latitude);

    const latitudeDifference =
      toRadians(
        second.latitude - first.latitude
      );

    const longitudeDifference =
      toRadians(
        second.longitude - first.longitude
      );

    const a =
      Math.sin(latitudeDifference / 2) ** 2
      + Math.cos(latitude1)
      * Math.cos(latitude2)
      * Math.sin(longitudeDifference / 2) ** 2;

    return earthRadius * 2 * Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );
  }

  for (const layer of layers) {
    const properties =
      layer.feature?.properties ?? {};

    for (const stop of properties.stops ?? []) {
      const stopId = String(
        stop.stop_id ?? ''
      ).trim();

      const stopName = String(
        stop.stop_name ?? ''
      ).trim();

      const latitude = Number(stop.lat);
      const longitude = Number(stop.lon);

      if (
        !stopId
        || !Number.isFinite(latitude)
        || !Number.isFinite(longitude)
      ) {
        continue;
      }

      rawStops.push({
        stopId,
        stopName,
        normalizedName:
          normalizeStopName(stopName),
        latitude,
        longitude
      });
    }
  }

  const mergedStops = [];

  for (const stop of rawStops) {
    const existingStop = mergedStops.find(
      candidate =>
        candidate.normalizedName
          === stop.normalizedName
        && distanceInMeters(
          candidate,
          stop
        ) <= 60
    );

    if (existingStop) {
      existingStop.latitude =
        (
          existingStop.latitude
          * existingStop.count
          + stop.latitude
        )
        / (existingStop.count + 1);

      existingStop.longitude =
        (
          existingStop.longitude
          * existingStop.count
          + stop.longitude
        )
        / (existingStop.count + 1);

      existingStop.count += 1;
      continue;
    }

    mergedStops.push({
      ...stop,
      count: 1
    });
  }

  return mergedStops;
}


let vabSichtbareHaltestellenMarker = [];


/*
 * Darstellung der Haltestellen abhängig von der
 * aktuellen Zoomstufe.
 *
 * Ab Zoomstufe 16 erscheint im Marker ein H.
 */
function createStopMarkerIconForZoom(zoom) {
  if (zoom >= 16) {
    return L.divIcon({
      className: 'vab-haltestellen-divicon',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      html: `
        <div style="
          width: 22px;
          height: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          border: 3px solid #001B69;
          border-radius: 50%;
          background: #FFFFFF;
          color: #001B69;
          font-family: Arial, sans-serif;
          font-size: 13px;
          font-weight: 700;
          line-height: 1;
        ">H</div>
      `
    });
  }

  if (zoom >= 13) {
    return L.divIcon({
      className: 'vab-haltestellen-divicon',
      iconSize: [12, 12],
      iconAnchor: [6, 6],
      html: `
        <div style="
          width: 12px;
          height: 12px;
          box-sizing: border-box;
          border: 2px solid #001B69;
          border-radius: 50%;
          background: #FFFFFF;
        "></div>
      `
    });
  }

  return L.divIcon({
    className: 'vab-haltestellen-divicon',
    iconSize: [7, 7],
    iconAnchor: [3.5, 3.5],
    html: `
      <div style="
        width: 7px;
        height: 7px;
        box-sizing: border-box;
        border: 1px solid #FFFFFF;
        border-radius: 50%;
        background: #001B69;
      "></div>
    `
  });
}


/*
 * Bereits sichtbare Haltestellenmarker beim Zoomen
 * unmittelbar an die neue Darstellungsstufe anpassen.
 */
function updateVisibleStopMarkerStyle() {
  const zoom = karte.getZoom();

  const icon =
    createStopMarkerIconForZoom(zoom);

  for (
    const marker
    of vabSichtbareHaltestellenMarker
  ) {
    if (
      marker
      && typeof marker.setIcon === 'function'
    ) {
      marker.setIcon(icon);
    }

    /*
     * Ab Zoomstufe 16 den Haltestellennamen
     * dauerhaft anzeigen. Darunter erscheint er
     * weiterhin nur beim Berühren des Markers.
     */
    if (
      marker
      && typeof marker.getTooltip === 'function'
      && marker.getTooltip()
    ) {
      if (zoom >= 16) {
        marker.openTooltip();
      } else {
        marker.closeTooltip();
      }
    }
  }
}


karte.on(
  'zoomend',
  updateVisibleStopMarkerStyle
);


function showStopsForLine(lineName, selectedLayers = null) {
  /*
   * Markerbestand der zuvor angezeigten Linie
   * zurücksetzen.
   */
  vabSichtbareHaltestellenMarker = [];

  karte.getPane('haltestellenPane').style.pointerEvents = 'auto';

  if (linienHaltestellenLayer) {
    karte.removeLayer(linienHaltestellenLayer);
    linienHaltestellenLayer = null;
  }

  const stops = getStopsForLine(
    lineName,
    selectedLayers
  );

  linienHaltestellenLayer = L.layerGroup();

  for (const stop of stops) {
    const marker = L.marker(
      [stop.latitude, stop.longitude],
      {
        pane: 'haltestellenPane',
        icon: createStopMarkerIconForZoom(
          karte.getZoom()
        ),
        bubblingMouseEvents: false,
        keyboard: false
      }
    );

    /*
     * Marker für spätere Zoomänderungen speichern.
     */
    vabSichtbareHaltestellenMarker.push(marker);

    if (stop.stopName) {
      marker.bindTooltip(
        escapeHtml(stop.stopName),
        {
          sticky: false,
          direction: 'right',
          offset: [13, 0],
          opacity: 0.95,
          className: 'vab-haltestellenname'
        }
      );
    }

    marker.addTo(linienHaltestellenLayer);
  }

  linienHaltestellenLayer.addTo(karte);

  /*
   * Marker und Namen unmittelbar nach dem Einfügen
   * an die aktuelle Zoomstufe anpassen.
   */
  updateVisibleStopMarkerStyle();
}


function getPatternIdFromLayer(layer) {
  return String(
    layer.feature?.properties?.pattern_id ?? ''
  ).trim();
}

function getPreferredVariantId(lineName) {
  const preferredVariants = {
    '60': '60-aschaffenburg-elsenfeld',
    '61': '61-moenchberg-elsenfeld',
    '68': '68-elsenfeld-moemlingen'
  };

  return preferredVariants[lineName] ?? '';
}

function getVariantConfiguration(lineName) {
  return linienvariantenNachLinie.get(
    String(lineName)
  ) ?? null;
}

function getVariantGroup(
  lineName,
  patternId = ''
) {
  const configuration =
    getVariantConfiguration(lineName);

  const groups =
    configuration?.groups ?? [];

  if (patternId) {
    const matchingGroup = groups.find(
      group =>
        Array.isArray(group.pattern_ids)
        && group.pattern_ids.includes(patternId)
    );

    if (matchingGroup) {
      return matchingGroup;
    }
  }

  const preferredId =
    getPreferredVariantId(lineName);

  return groups.find(
    group => group.id === preferredId
  ) ?? groups[0] ?? null;
}

function getLayersForVariant(
  lineName,
  group
) {
  if (!group) {
    return [];
  }

  const patternIds = new Set(
    group.pattern_ids ?? []
  );

  return (
    linienNachName.get(String(lineName)) ?? []
  ).filter(
    layer =>
      patternIds.has(
        getPatternIdFromLayer(layer)
      )
  );
}

function styleVariantLayers(
  lineName,
  layers = []
) {
  resetLineStyle(lineName);

  for (const layer of layers) {
    layer.setStyle({
      color: '#FF009B',
      weight: 7,
      opacity: 1
    });
  }
}

function renderVariants(
  lineName,
  activeGroup
) {
  const configuration =
    getVariantConfiguration(lineName);

  const groups =
    configuration?.groups ?? [];

  const hasMultipleVariants =
    groups.length > 1;

  const buttons = groups
    .map(group => {
      const active =
        group.id === activeGroup?.id;

      const description = group.description
        ? `
          <span class="varianten-beschreibung">
            ${escapeHtml(group.description)}
          </span>
        `
        : '';

      const typeLabel =
        group.type === 'schulverkehr'
          ? 'Schulverkehr'
          : 'Regelverkehr';

      return `
        <button
          type="button"
          class="varianten-button${active ? ' aktiv' : ''}"
          data-variant-id="${escapeHtml(group.id)}"
          aria-pressed="${active ? 'true' : 'false'}"
        >
          <span class="varianten-titel">
            ${escapeHtml(group.label)}
          </span>

          ${description}

          <span class="varianten-typ">
            ${escapeHtml(typeLabel)}
          </span>
        </button>
      `;
    })
    .join('');

  const hintHtml =
    hasMultipleVariants
      ? `
        <p class="varianten-hinweis">
          Diese Linie besitzt mehrere Fahrwege.
          Wählen Sie die gewünschte Variante.
        </p>
      `
      : `
        <p class="varianten-hinweis">
          Fahrweg der Linie
          ${escapeHtml(lineName)}.
        </p>
      `;

  const pdfHtml =
    vabCreateSchedulePdfHtml(lineName);

  infoPanelInhalt.innerHTML = `
    <div class="seitenleisten-inhalt linien-information">
      <div class="liniennummer-gross">
        ${escapeHtml(lineName)}
      </div>

      <h2>Linie ${escapeHtml(lineName)}</h2>

      ${hintHtml}

      <div class="varianten-liste">
        ${buttons}
      </div>

      <section class="vab-suche-panel-bereich">
        <h3>Fahrplandokumente</h3>

        <div class="vab-fahrplan-pdf-bereich">
          ${pdfHtml}
        </div>
      </section>

      <button
        type="button"
        class="vab-zurueck-rob"
      >
        Zurück zum ROB
      </button>
    </div>
  `;

  infoPanel.classList.add('sichtbar');

  infoPanel.setAttribute(
    'aria-hidden',
    'false'
  );

  for (
    const button
    of infoPanelInhalt.querySelectorAll(
      '.varianten-button'
    )
  ) {
    button.addEventListener(
      'click',
      event => {
        event.preventDefault();
        event.stopPropagation();

        selectVariant(
          lineName,
          button.dataset.variantId
        );
      }
    );
  }

  infoPanelInhalt
    .querySelector('.vab-zurueck-rob')
    ?.addEventListener(
      'click',
      () => {
        if (robConfigurationAktuell) {
          showRobSelection(
            robConfigurationAktuell
          );
        }
      }
    );

  window.setTimeout(() => {
    karte.invalidateSize();
  }, 230);
}

function selectVariant(
  lineName,
  variantId
) {
  const configuration =
    getVariantConfiguration(lineName);

  const group = (
    configuration?.groups ?? []
  ).find(
    item => item.id === variantId
  );

  if (!group) {
    return;
  }

  const layers = getLayersForVariant(
    lineName,
    group
  );

  if (layers.length === 0) {
    setStatus(
      `Für die Variante ${group.label} wurden keine Geometrien gefunden`,
      'fehler'
    );

    return;
  }

  if (
    fixierteLinie
    && fixierteLinie !== lineName
  ) {
    resetLineStyle(fixierteLinie);
  }

  removeSelection();

  fixierteLinie = lineName;
  aktiveVariantenLinie = lineName;
  aktiveVariantenId = group.id;

  styleVariantLayers(
    lineName,
    layers
  );

  showStopsForLine(
    lineName,
    layers
  );

  renderVariants(
    lineName,
    group
  );

  const bounds =
    getBoundsForLayers(layers);

  if (bounds.isValid()) {
    window.setTimeout(() => {
      karte.invalidateSize();

      karte.fitBounds(bounds, {
        padding: [30, 30],
        maxZoom: 15
      });
    }, 240);
  }

  setStatus(
    `Linie ${lineName}: ${group.label}`,
    'erfolg'
  );
}

function selectLineVariant(
  lineName,
  patternId = ''
) {
  const group = getVariantGroup(
    lineName,
    patternId
  );

  if (!group) {
    return false;
  }

  if (
    fixierteLinie === lineName
    && aktiveVariantenLinie === lineName
    && aktiveVariantenId === group.id
  ) {
    resetLineStyle(lineName);
    fixierteLinie = null;
    removeSelection();

    setStatus(
      `${linienNachName.size.toLocaleString('de-DE')} Linien verfügbar`,
      'erfolg'
    );

    return true;
  }

  selectVariant(
    lineName,
    group.id
  );

  return true;
}


function selectLineFromStopSearch(lineName) {
  if (!lineName) {
    return;
  }

  /*
   * Eine eventuell zuvor ausgewählte Linie zurücksetzen.
   */
  if (
    fixierteLinie
    && fixierteLinie !== lineName
  ) {
    resetLineStyle(fixierteLinie);
  }

  removeSelection();

  fixierteLinie = lineName;

  /*
   * Sämtliche vorhandenen Fahrwegvarianten der Linie
   * gemeinsam hervorheben. Die Variantenauswahl wird
   * dabei bewusst nicht geöffnet.
   */
  setLineStyle(lineName, {
    color: '#FF009B',
    weight: 7,
    opacity: 1
  });

  showStopsForLine(lineName);

  const bounds = getLineBounds(lineName);

  if (bounds.isValid()) {
    karte.fitBounds(bounds, {
      padding: [30, 30],
      maxZoom: 15
    });
  }

  setStatus(
    `Linie ${lineName}: Aushangfahrplan`,
    'erfolg'
  );
}


function selectLine(
  lineName,
  patternId = ''
) {
  if (!lineName) {
    return;
  }

  /*
   * Linien mit hinterlegter Variantendatei verwenden
   * die gemeinsame Variantenlogik.
   */
  if (
    linienvariantenNachLinie.has(lineName)
  ) {
    selectLineVariant(
      lineName,
      patternId
    );

    return;
  }

  /*
   * Erneuter Klick auf dieselbe Linie hebt die Auswahl auf.
   */
  if (fixierteLinie === lineName) {
    resetLineStyle(lineName);
    fixierteLinie = null;
    removeSelection();

    setStatus(
      `${linienNachName.size.toLocaleString('de-DE')} Linien verfügbar`,
      'erfolg'
    );

    return;
  }

  if (fixierteLinie) {
    resetLineStyle(fixierteLinie);
  }

  removeSelection();

  fixierteLinie = lineName;

  setLineStyle(lineName, {
    color: '#FF009B',
    weight: 7,
    opacity: 1
  });

  showStopsForLine(lineName);

  const bounds = getLineBounds(lineName);

  if (bounds.isValid()) {
    karte.fitBounds(bounds, {
      padding: [30, 30],
      maxZoom: 15
    });
  }

  setStatus(
    `Linie ${lineName} ausgewählt`,
    'erfolg'
  );
}

function distancePointToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (dx === 0 && dy === 0) {
    return point.distanceTo(start);
  }

  const value = (
    (point.x - start.x) * dx
    + (point.y - start.y) * dy
  ) / (
    dx * dx + dy * dy
  );

  const factor = Math.max(0, Math.min(1, value));

  const nearest = L.point(
    start.x + factor * dx,
    start.y + factor * dy
  );

  return point.distanceTo(nearest);
}

function findSharedSectionAtClick(latlng, lineName) {
  const features =
    gemeinsameAbschnitteGeoJSON?.features ?? [];

  const clickPoint =
    karte.latLngToLayerPoint(latlng);

  let bestFeature = null;
  let bestDistance = Infinity;

  for (const feature of features) {
    const properties = feature.properties ?? {};
    const lines = (properties.lines ?? []).map(String);

    if (!lines.includes(String(lineName))) {
      continue;
    }

    const coordinates =
      feature.geometry?.coordinates ?? [];

    for (
      let index = 1;
      index < coordinates.length;
      index += 1
    ) {
      const first = coordinates[index - 1];
      const second = coordinates[index];

      const firstPoint = karte.latLngToLayerPoint(
        L.latLng(first[1], first[0])
      );

      const secondPoint = karte.latLngToLayerPoint(
        L.latLng(second[1], second[0])
      );

      const distance = distancePointToSegment(
        clickPoint,
        firstPoint,
        secondPoint
      );

      if (distance < bestDistance) {
        bestDistance = distance;
        bestFeature = feature;
      }
    }
  }

  return bestDistance <= 12
    ? bestFeature
    : null;
}

function addLineInteraction(feature, layer) {
  const properties = feature.properties ?? {};
  const lineName = getLineName(properties);

  registerLineLayer(lineName, layer);

  if (lineName) {
    layer.bindTooltip(
      `Linie ${escapeHtml(lineName)}`,
      {
        sticky: true,
        direction: 'top'
      }
    );
  }

  layer.on({
    mouseover(event) {
      const sharedFeature = (
        lineName
        ? findSharedSectionAtClick(
            event.latlng,
            lineName
          )
        : null
      );

      if (sharedFeature) {
        const sharedLines = sortLines(
          sharedFeature.properties?.lines ?? []
        );

        const lineLabels = sharedLines
          .map(line => `
            <span
              style="
                display:inline-block;
                margin:2px 3px 2px 0;
                padding:3px 7px;
                border-radius:12px;
                background:#000F47;
                color:#ffffff;
                font-weight:700;
              "
            >
              ${escapeHtml(line)}
            </span>
          `)
          .join('');

        layer.setTooltipContent(`
          <div style="min-width:150px">
            <div style="font-weight:700;margin-bottom:4px">
              Mehrere Linien auf diesem Abschnitt
            </div>

            <div style="margin-bottom:5px">
              ${lineLabels}
            </div>

            <div style="font-size:12px">
              Klicken, um eine Linie auszuwählen
            </div>
          </div>
        `);
      } else if (lineName) {
        layer.setTooltipContent(
          `Linie ${escapeHtml(lineName)}`
        );
      }

      if (
        !lineName
        || fixierteLinie === lineName
      ) {
        return;
      }

      setLineStyle(lineName, {
        color: '#FF7040',
        weight: 6,
        opacity: 1
      });
    },

    mouseout() {
      if (lineName) {
        layer.setTooltipContent(
          `Linie ${escapeHtml(lineName)}`
        );
      }

      if (
        !lineName
        || fixierteLinie === lineName
      ) {
        return;
      }

      resetLineStyle(lineName);

      if (fixierteLinie) {
        setLineStyle(fixierteLinie, {
          color: '#FF009B',
          weight: 7,
          opacity: 1
        });
      }
    },

    click(event) {
      /*
       * Das Ereignis darf bis zur Karte weiterlaufen.
       * Es wird nur als bereits verarbeiteter Linienklick markiert.
       */
      if (event.originalEvent) {
        event.originalEvent.vabLineHandled = true;
      }

      /*
       * Ein erneuter Klick auf die bereits fixierte Linie
       * hebt die Auswahl immer zuerst auf.
       */
      if (fixierteLinie === lineName) {
        selectLine(
          lineName,
          String(properties.pattern_id ?? '')
        );
        return;
      }

      const sharedFeature = findSharedSectionAtClick(
        event.latlng,
        lineName
      );

      if (sharedFeature) {
        const temporaryLayer = L.geoJSON(sharedFeature);

        showSharedSection(
          sharedFeature,
          temporaryLayer
        );

        return;
      }

      selectLine(
        lineName,
        String(properties.pattern_id ?? '')
      );
    }
  });
}

function showSharedSection(feature, clickedLayer) {
  const properties = feature.properties ?? {};
  const coordinates = feature.geometry?.coordinates ?? [];

  if (coordinates.length < 2) {
    return;
  }

  if (fixierteLinie) {
    resetLineStyle(fixierteLinie);
    fixierteLinie = null;
  }

  removeSelection();

  ausgewaehlterAbschnitt = L.geoJSON(feature, {
    pane: 'auswahlPane',
    style: {
      color: '#FF7040',
      weight: 9,
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round'
    },
    interactive: false
  }).addTo(karte);

  const startCoordinate = coordinates[0];
  const endCoordinate = coordinates[coordinates.length - 1];

  startMarker = L.circleMarker(
    [startCoordinate[1], startCoordinate[0]],
    {
      pane: 'auswahlPane',
      radius: 8,
      color: '#ffffff',
      weight: 3,
      fillColor: '#18864b',
      fillOpacity: 1,
      interactive: false
    }
  ).addTo(karte);

  zielMarker = L.circleMarker(
    [endCoordinate[1], endCoordinate[0]],
    {
      pane: 'auswahlPane',
      radius: 8,
      color: '#ffffff',
      weight: 3,
      fillColor: '#c92a2a',
      fillOpacity: 1,
      interactive: false
    }
  ).addTo(karte);

  const lines = sortLines(properties.lines ?? []);

  const lineBadges = lines
    .map(line => `
      <button
        type="button"
        class="linien-auswahl-button linien-badge-button"
        data-line="${escapeHtml(line)}"
        aria-label="Linie ${escapeHtml(line)} anzeigen"
      >
        <span class="linien-auswahl-nummer">
          ${escapeHtml(line)}
        </span>

        <span class="linien-auswahl-text">
          Linie ${escapeHtml(line)} anzeigen
        </span>

        <span
          class="linien-auswahl-pfeil"
          aria-hidden="true"
        >
          ›
        </span>
      </button>
    `)
    .join('');

  infoPanelInhalt.innerHTML = `
    <div class="seitenleisten-inhalt gemeinsame-auswahl">
      <h2>Mehrere Linien auf diesem Abschnitt</h2>

      <p class="gemeinsame-auswahl-hinweis">
        Welche Linie möchten Sie anzeigen?
      </p>

      <div class="linien-auswahl-liste">
        ${lineBadges}
      </div>
    </div>
  `;

  infoPanel.classList.add('sichtbar');
  infoPanel.setAttribute('aria-hidden', 'false');

  for (
    const button
    of infoPanelInhalt.querySelectorAll(
      '.linien-badge-button'
    )
  ) {
    button.addEventListener('click', event => {
      event.stopPropagation();

      const lineName = String(
        button.dataset.line ?? ''
      ).trim();

      if (!lineName) {
        return;
      }

      selectLine(lineName);
    });
  }
}

function addSharedSectionInteraction(feature, layer) {
  layer.on('click', event => {
    L.DomEvent.stopPropagation(event);
    showSharedSection(feature, layer);
  });
}

async function loadGeoJSON(path, label) {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(
      `${label}: HTTP-Fehler ${response.status}`
    );
  }

  const geojson = await response.json();

  if (
    geojson.type !== 'FeatureCollection'
    || !Array.isArray(geojson.features)
  ) {
    throw new Error(
      `${label}: ungültiges FeatureCollection-GeoJSON`
    );
  }

  return geojson;
}


function showRobSelection(configuration) {
  if (fixierteLinie) {
    resetLineStyle(fixierteLinie);
    fixierteLinie = null;
  }

  removeSelection();

  const bussteige =
    configuration?.bussteige ?? [];

  const bussteigHtml = bussteige
    .map(bussteig => {
      const linien =
        Array.isArray(bussteig.linien)
          ? sortLines(bussteig.linien)
          : [];

      const hinweise =
        Array.isArray(bussteig.hinweise)
          ? bussteig.hinweise
          : [];

      const linienHtml = linien.length > 0
        ? linien
            .map(line => `
              <button
                type="button"
                class="linien-auswahl-button rob-linien-button"
                data-line="${escapeHtml(line)}"
                aria-label="Linie ${escapeHtml(line)} anzeigen"
              >
                <span class="linien-auswahl-nummer">
                  ${escapeHtml(line)}
                </span>

                <span class="linien-auswahl-text">
                  Linie ${escapeHtml(line)} anzeigen
                </span>

                <span
                  class="linien-auswahl-pfeil"
                  aria-hidden="true"
                >
                  ›
                </span>
              </button>
            `)
            .join('')
        : `
          <div class="rob-keine-linien">
            Keine regulären Linien
          </div>
        `;

      const hinweisHtml = hinweise
        .map(hinweis => `
          <div class="rob-bussteig-hinweis">
            ${escapeHtml(hinweis)}
          </div>
        `)
        .join('');

      return `
        <section class="rob-bussteig-gruppe">
          <div class="rob-bussteig-kopf">
            <span class="rob-bussteig-nummer">
              ${escapeHtml(bussteig.bussteig)}
            </span>

            <h3>
              Bussteig ${escapeHtml(bussteig.bussteig)}
            </h3>
          </div>

          <div class="linien-auswahl-liste">
            ${linienHtml}
          </div>

          ${hinweisHtml}
        </section>
      `;
    })
    .join('');

  infoPanelInhalt.innerHTML = `
    <div class="seitenleisten-inhalt rob-auswahl">
      <div class="rob-panel-kennung">
        ROB
      </div>

      <h2>ROB-Aschaffenburg</h2>

      <p class="gemeinsame-auswahl-hinweis">
        Wählen Sie einen Bussteig und anschließend
        die gewünschte Linie.
      </p>

      <div class="rob-bussteige-liste">
        ${bussteigHtml}
      </div>
    </div>
  `;

  infoPanel.classList.add('sichtbar');
  infoPanel.setAttribute(
    'aria-hidden',
    'false'
  );

  for (
    const button
    of infoPanelInhalt.querySelectorAll(
      '.rob-linien-button'
    )
  ) {
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();

      const lineName = String(
        button.dataset.line ?? ''
      ).trim();

      if (!lineName) {
        return;
      }

      selectLine(lineName);
    });
  }

  refreshMapAfterPanelChange();

  setStatus(
    'ROB-Aschaffenburg: Linie nach Bussteig auswählen',
    'erfolg'
  );
}




function cloneRobPositionConfiguration(configuration) {
  return JSON.parse(
    JSON.stringify(configuration)
  );
}


function setRobEditButtonState() {
  const control =
    document.querySelector('.rob-edit-control');

  if (!control) {
    return;
  }

  control.classList.toggle(
    'aktiv',
    robBearbeitungsmodusAktiv
  );

  const editButton =
    control.querySelector('[data-rob-action="edit"]');

  const exportButton =
    control.querySelector('[data-rob-action="export"]');

  const cancelButton =
    control.querySelector('[data-rob-action="cancel"]');

  if (editButton) {
    editButton.textContent =
      robBearbeitungsmodusAktiv
        ? 'Bearbeitung aktiv'
        : 'Bussteige bearbeiten';

    editButton.disabled =
      robBearbeitungsmodusAktiv;
  }

  if (exportButton) {
    exportButton.disabled =
      !robBearbeitungsmodusAktiv;
  }

  if (cancelButton) {
    cancelButton.disabled =
      !robBearbeitungsmodusAktiv;
  }
}


function updateRobPositionFromMarker(
  bussteigNumber,
  marker
) {
  const latLng = marker.getLatLng();

  const position =
    robBussteigPositionen?.positionen?.find(
      item =>
        String(item.bussteig) ===
        String(bussteigNumber)
    );

  if (!position) {
    return;
  }

  position.lat =
    Number(latLng.lat.toFixed(7));

  position.lon =
    Number(latLng.lng.toFixed(7));
}


function applyRobMarkerDraggingState() {
  for (
    const marker
    of robBussteigMarkerNachNummer.values()
  ) {
    /*
     * Leaflet erstellt marker.dragging erst,
     * nachdem der Marker tatsächlich auf der
     * Karte eingeblendet wurde.
     */
    if (!marker.dragging) {
      continue;
    }

    const markerElement =
      marker.getElement();

    if (robBearbeitungsmodusAktiv) {
      marker.dragging.enable();

      markerElement?.classList.add(
        'rob-bussteig-editierbar'
      );
    } else {
      marker.dragging.disable();

      markerElement?.classList.remove(
        'rob-bussteig-editierbar'
      );
    }
  }
}


function setRobBearbeitungsmodus(active) {
  robBearbeitungsmodusAktiv =
    Boolean(active);

  applyRobMarkerDraggingState();

  setRobEditButtonState();

  if (robBearbeitungsmodusAktiv) {
    setStatus(
      'Bearbeitungsmodus aktiv: Bussteige mit der Maus verschieben',
      'erfolg'
    );
  } else {
    setStatus(
      'Bearbeitungsmodus beendet',
      'erfolg'
    );
  }
}


function startRobBearbeitung() {
  if (!robBussteigPositionen) {
    setStatus(
      'Die Bussteigpositionen sind noch nicht geladen',
      'fehler'
    );

    return;
  }

  robBussteigOriginalpositionen =
    cloneRobPositionConfiguration(
      robBussteigPositionen
    );

  setRobBearbeitungsmodus(true);

  if (karte.getZoom() < 17) {
    karte.setZoom(17);
  }
}


function cancelRobBearbeitung() {
  if (!robBussteigOriginalpositionen) {
    setRobBearbeitungsmodus(false);
    return;
  }

  robBussteigPositionen =
    cloneRobPositionConfiguration(
      robBussteigOriginalpositionen
    );

  for (
    const position
    of robBussteigPositionen.positionen ?? []
  ) {
    const marker =
      robBussteigMarkerNachNummer.get(
        String(position.bussteig)
      );

    if (!marker) {
      continue;
    }

    marker.setLatLng([
      Number(position.lat),
      Number(position.lon)
    ]);
  }

  robBussteigOriginalpositionen = null;

  setRobBearbeitungsmodus(false);

  setStatus(
    'Änderungen an den Bussteigen wurden verworfen',
    'erfolg'
  );
}


function exportRobBussteigPositionen() {
  if (!robBussteigPositionen) {
    setStatus(
      'Es sind keine Bussteigpositionen vorhanden',
      'fehler'
    );

    return;
  }

  for (
    const [bussteigNumber, marker]
    of robBussteigMarkerNachNummer
  ) {
    updateRobPositionFromMarker(
      bussteigNumber,
      marker
    );
  }

  const jsonText =
    JSON.stringify(
      robBussteigPositionen,
      null,
      2
    );

  const blob = new Blob(
    [jsonText],
    {
      type: 'application/json;charset=utf-8'
    }
  );

  const url =
    URL.createObjectURL(blob);

  const downloadLink =
    document.createElement('a');

  downloadLink.href = url;
  downloadLink.download =
    'rob_bussteig_positionen.json';

  document.body.appendChild(
    downloadLink
  );

  downloadLink.click();
  downloadLink.remove();

  URL.revokeObjectURL(url);

  robBussteigOriginalpositionen =
    cloneRobPositionConfiguration(
      robBussteigPositionen
    );

  setRobBearbeitungsmodus(false);

  setStatus(
    'Neue Bussteigpositionen wurden als JSON-Datei heruntergeladen',
    'erfolg'
  );
}


function createRobEditControl() {
  const urlParameters =
    new URLSearchParams(
      window.location.search
    );

  const editorEnabled =
    urlParameters.get('rob-edit') === '1';

  if (!editorEnabled) {
    return;
  }

  if (
    document.querySelector(
      '.rob-edit-control'
    )
  ) {
    return;
  }

  const RobEditControl =
    L.Control.extend({
      options: {
        position: 'topright'
      },

      onAdd() {
        const container =
          L.DomUtil.create(
            'div',
            'leaflet-control rob-edit-control'
          );

        container.innerHTML = `
          <button
            type="button"
            class="rob-edit-button rob-edit-start"
            data-rob-action="edit"
          >
            Bussteige bearbeiten
          </button>

          <button
            type="button"
            class="rob-edit-button rob-edit-export"
            data-rob-action="export"
            disabled
          >
            Positionen speichern
          </button>

          <button
            type="button"
            class="rob-edit-button rob-edit-cancel"
            data-rob-action="cancel"
            disabled
          >
            Abbrechen
          </button>
        `;

        L.DomEvent.disableClickPropagation(
          container
        );

        L.DomEvent.disableScrollPropagation(
          container
        );

        container
          .querySelector(
            '[data-rob-action="edit"]'
          )
          ?.addEventListener(
            'click',
            startRobBearbeitung
          );

        container
          .querySelector(
            '[data-rob-action="export"]'
          )
          ?.addEventListener(
            'click',
            exportRobBussteigPositionen
          );

        container
          .querySelector(
            '[data-rob-action="cancel"]'
          )
          ?.addEventListener(
            'click',
            cancelRobBearbeitung
          );

        return container;
      }
    });

  karte.addControl(
    new RobEditControl()
  );

  setRobEditButtonState();
}


function getRobBussteigConfiguration(bussteigNumber) {
  const bussteige =
    robConfigurationAktuell?.bussteige ?? [];

  return bussteige.find(
    item =>
      String(item.bussteig) ===
      String(bussteigNumber)
  ) ?? null;
}


function showRobBussteig(bussteigNumber) {
  const bussteig =
    getRobBussteigConfiguration(bussteigNumber);

  if (!bussteig) {
    setStatus(
      `Für Bussteig ${bussteigNumber} liegen keine Daten vor`,
      'fehler'
    );

    return;
  }

  showRobSelection({
    name: 'ROB-Aschaffenburg',
    bussteige: [bussteig]
  });

  setStatus(
    `ROB-Aschaffenburg – Bussteig ${bussteigNumber}`,
    'erfolg'
  );
}


function updateRobBussteigVisibility() {
  if (!robBussteigLayer) {
    return;
  }

  const minimumZoom =
    Number(
      robBussteigPositionen?.anzeige_ab_zoom
      ?? 17
    );

  if (karte.getZoom() >= minimumZoom) {
    if (!karte.hasLayer(robBussteigLayer)) {
      robBussteigLayer.addTo(karte);
    }

    /*
     * Jetzt sind die Marker wirklich auf der Karte
     * und Leaflet hat die Dragging-Handler erzeugt.
     */
    applyRobMarkerDraggingState();
  } else if (karte.hasLayer(robBussteigLayer)) {
    karte.removeLayer(robBussteigLayer);
  }
}


function createRobBussteige(
  positionConfiguration,
  robConfiguration
) {
  robBussteigPositionen =
    positionConfiguration;

  robConfigurationAktuell =
    robConfiguration;

  if (robBussteigLayer) {
    karte.removeLayer(robBussteigLayer);
  }

  robBussteigMarkerNachNummer.clear();

  robBussteigLayer = L.layerGroup();

  const positions =
    positionConfiguration?.positionen ?? [];

  for (const position of positions) {
    const bussteigNumber =
      String(position.bussteig ?? '').trim();

    if (!bussteigNumber) {
      continue;
    }

    const bussteigData =
      getRobBussteigConfiguration(bussteigNumber);

    const lines =
      Array.isArray(bussteigData?.linien)
        ? sortLines(bussteigData.linien)
        : [];

    const usage =
      String(position.nutzung ?? '').trim();

    const lineText =
      lines.length > 0
        ? `Linien: ${lines.join(', ')}`
        : usage || 'Keine regulären Linien';

    const icon = L.divIcon({
      className: 'rob-bussteig-marker-container',
      html: `
        <button
          type="button"
          class="rob-bussteig-marker"
          aria-label="Bussteig ${escapeHtml(bussteigNumber)} anzeigen"
        >
          <span class="rob-bussteig-marker-label">
            Bussteig
          </span>

          <span class="rob-bussteig-marker-nummer">
            ${escapeHtml(bussteigNumber)}
          </span>
        </button>
      `,
      iconSize: [38, 38],
      iconAnchor: [19, 19]
    });

    const marker = L.marker(
      [
        Number(position.lat),
        Number(position.lon)
      ],
      {
        pane: 'robBussteigPane',
        icon,
        keyboard: true,
        draggable: true,
        title:
          `Bussteig ${bussteigNumber} – ${lineText}`,
        riseOnHover: true
      }
    );

    marker.bindTooltip(
      `
        <strong>Bussteig ${escapeHtml(bussteigNumber)}</strong><br>
        ${escapeHtml(lineText)}
      `,
      {
        direction: 'top',
        offset: [0, -12]
      }
    );

    marker.on('click', event => {
      L.DomEvent.stopPropagation(event);

      if (event.originalEvent) {
        event.originalEvent.vabLineHandled = true;
      }

      showRobBussteig(bussteigNumber);
    });

    marker.on('dragstart', () => {
      const markerElement =
        marker.getElement();

      markerElement?.classList.add(
        'rob-bussteig-wird-verschoben'
      );

      setStatus(
        `Bussteig ${bussteigNumber} wird verschoben`,
        'erfolg'
      );
    });

    marker.on('dragend', () => {
      updateRobPositionFromMarker(
        bussteigNumber,
        marker
      );

      const markerElement =
        marker.getElement();

      markerElement?.classList.remove(
        'rob-bussteig-wird-verschoben'
      );

      const latLng =
        marker.getLatLng();

      setStatus(
        `Bussteig ${bussteigNumber}: `
        + `${latLng.lat.toFixed(7)}, `
        + `${latLng.lng.toFixed(7)}`,
        'erfolg'
      );
    });

    marker.addTo(robBussteigLayer);

    /*
     * Der Dragging-Zustand wird erst gesetzt,
     * wenn der Layer wirklich auf der Karte liegt.
     */
    robBussteigMarkerNachNummer.set(
      bussteigNumber,
      marker
    );
  }

  karte.off(
    'zoomend',
    updateRobBussteigVisibility
  );

  karte.on(
    'zoomend',
    updateRobBussteigVisibility
  );

  updateRobBussteigVisibility();

  createRobEditControl();
}


function createRobMarker(configuration) {
  if (robMarker) {
    karte.removeLayer(robMarker);
  }

  const icon = L.divIcon({
    className: 'rob-marker-container',
    html: `
      <div
        class="rob-marker"
        role="button"
        aria-label="ROB-Aschaffenburg anzeigen"
      >
        <span class="rob-marker-titel">
          ROB-Aschaffenburg
        </span>
      </div>
    `,
    iconSize: [182, 42],
    iconAnchor: [91, 76]
  });

  robMarker = L.marker(
    [49.9804200, 9.1420500],
    {
      pane: 'robPane',
      icon,
      title: 'ROB-Aschaffenburg – Linien nach Bussteig',
      keyboard: true,
      riseOnHover: true
    }
  ).addTo(karte);

  robMarker.bindTooltip(
    'ROB-Aschaffenburg – Linien nach Bussteig',
    {
      direction: 'top',
      offset: [0, -20]
    }
  );

  robMarker.on('click', event => {
    L.DomEvent.stopPropagation(event);

    if (event.originalEvent) {
      event.originalEvent.vabLineHandled = true;
    }

    /*
     * Zuerst die ROB-Seitenleiste öffnen. Dadurch
     * verändert sich die tatsächlich verfügbare
     * Kartenbreite.
     */
    showRobSelection(configuration);

    /*
     * Anschließend die Kartengröße neu berechnen
     * und so weit auf den ROB zoomen, dass die
     * einzelnen Bussteige sichtbar werden.
     */
    window.setTimeout(() => {
      karte.invalidateSize();

      karte.setView(
        robMarker.getLatLng(),
        19,
        {
          animate: true,
          duration: 0.6
        }
      );

      /*
       * Die ROB-Seitenleiste liegt links über der Karte.
       * Deshalb den Kartenausschnitt um die halbe
       * Seitenleistenbreite nach rechts verschieben.
       * Der ROB erscheint dadurch mittig im tatsächlich
       * sichtbaren Kartenbereich.
       */
      const panelBreite =
        infoPanel.getBoundingClientRect().width;

      if (panelBreite > 0) {
        karte.panBy(
          [
            -panelBreite * 0.75,
            0
          ],
          {
            animate: true,
            duration: 0.4
          }
        );
      }

      updateRobBussteigVisibility();
    }, 180);
  });
}


async function loadMapData() {
  setStatus('Liniengeometrien werden geladen …');

  const variantenResponse = await fetch('data/linienvarianten_61.json', { cache: 'no-store' });

  if (!variantenResponse.ok) {
    throw new Error(
      `Linienvarianten 61: HTTP-Fehler ${variantenResponse.status}`
    );
  }

  linienvarianten61 =
    await variantenResponse.json();

  const variantenResponse68 = await fetch('data/linienvarianten_68.json', { cache: 'no-store' });

  if (!variantenResponse68.ok) {
    throw new Error(
      `Linienvarianten 68: HTTP-Fehler ${variantenResponse68.status}`
    );
  }

  linienvarianten68 =
    await variantenResponse68.json();

  const variantenResponse60 = await fetch('data/linienvarianten_60.json', { cache: 'no-store' });

  if (!variantenResponse60.ok) {
    throw new Error(
      `Linienvarianten 60: HTTP-Fehler ${variantenResponse60.status}`
    );
  }

  linienvarianten60 =
    await variantenResponse60.json();

  const variantenResponse63 = await fetch('data/linienvarianten_63.json', { cache: 'no-store' });

  if (!variantenResponse63.ok) {
    throw new Error(
      `Linienvarianten 63: HTTP-Fehler ${variantenResponse63.status}`
    );
  }

  const linienvarianten63 =
    await variantenResponse63.json();

  const variantenResponse64 = await fetch('data/linienvarianten_64.json', { cache: 'no-store' });

  if (!variantenResponse64.ok) {
    throw new Error(
      `Linienvarianten 64: HTTP-Fehler ${variantenResponse64.status}`
    );
  }

  const linienvarianten64 =
    await variantenResponse64.json();

  const variantenResponse65 = await fetch('data/linienvarianten_65.json', { cache: 'no-store' });

  if (!variantenResponse65.ok) {
    throw new Error(
      `Linienvarianten 65: HTTP-Fehler ${variantenResponse65.status}`
    );
  }

  const linienvarianten65 =
    await variantenResponse65.json();

  const variantenResponse62 = await fetch('data/linienvarianten_62.json', { cache: 'no-store' });

  if (!variantenResponse62.ok) {
    throw new Error(
      `Linienvarianten 62: HTTP-Fehler ${variantenResponse62.status}`
    );
  }

  const linienvarianten62 =
    await variantenResponse62.json();

  const variantenResponse67 = await fetch('data/linienvarianten_67.json', { cache: 'no-store' });

  if (!variantenResponse67.ok) {
    throw new Error(
      `Linienvarianten 67: HTTP-Fehler ${variantenResponse67.status}`
    );
  }

  const linienvarianten67 =
    await variantenResponse67.json();

  const variantenResponse69 = await fetch('data/linienvarianten_69.json', { cache: 'no-store' });

  if (!variantenResponse69.ok) {
    throw new Error(
      `Linienvarianten 69: HTTP-Fehler ${variantenResponse69.status}`
    );
  }

  const linienvarianten69 =
    await variantenResponse69.json();

  const variantenResponse76 = await fetch('data/linienvarianten_76.json', { cache: 'no-store' });

  if (!variantenResponse76.ok) {
    throw new Error(
      `Linienvarianten 76: HTTP-Fehler ${variantenResponse76.status}`
    );
  }

  const linienvarianten76 =
    await variantenResponse76.json();

  const variantenResponse74 = await fetch('data/linienvarianten_74.json', { cache: 'no-store' });

  if (!variantenResponse74.ok) {
    throw new Error(
      `Linienvarianten 74: HTTP-Fehler ${variantenResponse74.status}`
    );
  }

  const linienvarianten74 =
    await variantenResponse74.json();

  /*
   * Automatisch erzeugte Variantendateien werden gesammelt
   * geladen. Neue Linien müssen später nur noch in dieser
   * Liste ergänzt werden.
   */
  const automatischeVariantenLinien = [
    '2',
    '5',
    '6',
    '8',
    '9',
    '10',
    '11',
    '12',
    '14',
    '15',
    '29',
    '52',
    '54',
    '81',
    '88',
    '93',
    '95',
    '96',
    '97',
    '98',
    '99',
    'BG1',
    'GU2',
    'OF-85'
  ];

  const automatischGeladeneVarianten =
    await Promise.all(
      automatischeVariantenLinien.map(
        async (liniennummer) => {
          const response = await fetch(
            `data/linienvarianten_${liniennummer}.json`
          );

          if (!response.ok) {
            throw new Error(
              `Linienvarianten ${liniennummer}: ` +
              `HTTP-Fehler ${response.status}`
            );
          }

          return {
            liniennummer,
            konfiguration: await response.json()
          };
        }
      )
    );

  /*
   * Alle Variantendateien zentral registrieren.
   * Weitere Linien müssen später nur noch hier ergänzt werden.
   */
  linienvariantenNachLinie.set(
    '60',
    linienvarianten60
  );

  linienvariantenNachLinie.set(
    '61',
    linienvarianten61
  );

  linienvariantenNachLinie.set(
    '68',
    linienvarianten68
  );

  linienvariantenNachLinie.set(
    '63',
    linienvarianten63
  );

  linienvariantenNachLinie.set(
    '64',
    linienvarianten64
  );

  linienvariantenNachLinie.set(
    '65',
    linienvarianten65
  );

  linienvariantenNachLinie.set(
    '62',
    linienvarianten62
  );

  linienvariantenNachLinie.set(
    '67',
    linienvarianten67
  );

  linienvariantenNachLinie.set(
    '69',
    linienvarianten69
  );

  linienvariantenNachLinie.set(
    '76',
    linienvarianten76
  );

  linienvariantenNachLinie.set(
    '74',
    linienvarianten74
  );

  automatischGeladeneVarianten.forEach(
    ({ liniennummer, konfiguration }) => {
      linienvariantenNachLinie.set(
        liniennummer,
        konfiguration
      );
    }
  );

  const linienGeoJSON = await loadGeoJSON(
    'data/linien_routed.geojson',
    'Linien'
  );

  linienLayer = L.geoJSON(linienGeoJSON, {
    pane: 'linienPane',
    style: lineStyle,
    onEachFeature: addLineInteraction
  }).addTo(karte);

  const bounds = linienLayer.getBounds();

  if (bounds.isValid()) {
    karte.fitBounds(bounds, {
      padding: [24, 24]
    });
  }

  setStatus(
    'Gemeinsame Linienabschnitte werden geladen …'
  );

  const abschnittGeoJSON = await loadGeoJSON(
    'data/gemeinsame_linienabschnitte.geojson',
    'Gemeinsame Linienabschnitte'
  );

  gemeinsameAbschnitteGeoJSON = abschnittGeoJSON;

  abschnittKlickLayer = L.geoJSON(
    abschnittGeoJSON,
    {
      pane: 'klickPane',

      style: {
        color: '#000000',
        weight: 10,
        opacity: 0.001,
        lineCap: 'round',
        lineJoin: 'round'
      },

      interactive: false
    }
  ).addTo(karte);

  const robResponse = await fetch(
    'data/rob_bussteige.json'
  );

  if (!robResponse.ok) {
    throw new Error(
      `ROB-Bussteige: HTTP-Fehler ${robResponse.status}`
    );
  }

  const robConfiguration =
    await robResponse.json();

  const robPositionResponse = await fetch(
    'data/rob_bussteig_positionen.json'
  );

  if (!robPositionResponse.ok) {
    throw new Error(
      `ROB-Bussteigpositionen: HTTP-Fehler ` +
      `${robPositionResponse.status}`
    );
  }

  const robPositionConfiguration =
    await robPositionResponse.json();

  createRobMarker(robConfiguration);

  createRobBussteige(
    robPositionConfiguration,
    robConfiguration
  );

setStatus(
    `${linienGeoJSON.features.length.toLocaleString('de-DE')} Linienmuster, `
    + `${linienNachName.size.toLocaleString('de-DE')} Linien und `
    + `${abschnittGeoJSON.features.length.toLocaleString('de-DE')} gemeinsame Abschnitte geladen`,
    'erfolg'
  );
}

karte.on('click', event => {
  /*
   * Der Linienhandler hat diesen Klick bereits verarbeitet.
   * Deshalb darf die Karte die Auswahl nicht sofort wieder löschen.
   */
  if (
    event.originalEvent
    && event.originalEvent.vabLineHandled
  ) {
    return;
  }

  removeSelection();

  if (fixierteLinie) {
    resetLineStyle(fixierteLinie);
    fixierteLinie = null;
  }

  setStatus(
    `${linienNachName.size.toLocaleString('de-DE')} Linien verfügbar`,
    'erfolg'
  );
});

function refreshMapAfterPanelChange() {
  /*
   * Die Seitenleiste verändert während ihrer Animation
   * mehrfach die verfügbare Kartenbreite. Leaflet wird
   * deshalb zu mehreren Zeitpunkten aktualisiert.
   */
  karte.invalidateSize({
    pan: false,
    debounceMoveend: true
  });

  window.requestAnimationFrame(() => {
    karte.invalidateSize({
      pan: false,
      debounceMoveend: true
    });
  });

  for (const delay of [80, 160, 260, 400]) {
    window.setTimeout(() => {
      karte.invalidateSize({
        pan: false,
        debounceMoveend: true
      });
    }, delay);
  }
}

infoPanelSchliessen.addEventListener('click', event => {
  event.preventDefault();
  event.stopPropagation();
  L.DomEvent.stopPropagation(event);

  if (fixierteLinie) {
    resetLineStyle(fixierteLinie);
    fixierteLinie = null;
  }

  removeSelection();
  refreshMapAfterPanelChange();

  /*
   * Nach dem Schließen muss der Kartencontainer
   * ausdrücklich wieder den Tastaturfokus erhalten.
   */
  window.setTimeout(() => {
    karte.getContainer().focus({
      preventScroll: true
    });
  }, 270);

  setStatus(
    `${linienNachName.size.toLocaleString('de-DE')} Linien verfügbar`,
    'erfolg'
  );
});

loadMapData().catch(error => {
  console.error(error);

  setStatus(
    `Fehler beim Laden der Karte: ${error.message}`,
    'fehler'
  );
});

/* BEGIN VAB-SUCHE */

let vabSuchindex = null;
let vabFahrplanindex = null;
let vabAktuelleHaltestelle = null;
let vabAktuellerOrt = null;
let vabAktuelleLinie = null;
let vabAktuellerWochentag =
  (new Date().getDay() + 6) % 7;

const vabWochentage = [
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag'
];


function vabNormalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[.,/()-]/g, ' ')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}


function vabNaturalSort(values) {
  return [...values].sort((a, b) =>
    String(a).localeCompare(
      String(b),
      'de',
      {
        numeric: true,
        sensitivity: 'base'
      }
    )
  );
}


function vabResetSearchView() {
  vabCloseSuggestions();

  vabAktuelleHaltestelle = null;
  vabAktuelleLinie = null;

  /*
   * Vorhandene Linien-, Abschnitts- und
   * Haltestellenauswahl vollständig zurücksetzen.
   */
  removeSelection();

  if (fixierteLinie) {
    resetLineStyle(fixierteLinie);
    fixierteLinie = null;
  }

  /*
   * Informationsspalte schließen.
   */
  infoPanel.classList.remove('sichtbar');

  infoPanel.setAttribute(
    'aria-hidden',
    'true'
  );

  /*
   * Ursprünglichen Kartenausschnitt wiederherstellen.
   */
  karte.setView(
    [49.97, 9.15],
    9,
    {
      animate: true
    }
  );

  refreshMapAfterPanelChange();

  setStatus(
    `${linienNachName.size.toLocaleString('de-DE')} Linien verfügbar`,
    'erfolg'
  );
}


function vabCloseSuggestions() {
  vabSucheVorschlaege.hidden = true;
  vabSucheVorschlaege.innerHTML = '';

  vabSucheEingabe.setAttribute(
    'aria-expanded',
    'false'
  );
}


function vabSearchScore(searchText, query) {
  if (searchText === query) {
    return 0;
  }

  if (searchText.startsWith(query)) {
    return 1;
  }

  const words = searchText.split(' ');

  if (
    words.some(word =>
      word.startsWith(query)
    )
  ) {
    return 2;
  }

  if (searchText.includes(query)) {
    return 3;
  }

  return 99;
}


function vabGetStopConnections(stopId) {
  const departures =
    vabFahrplanindex
      ?.departures_by_station
      ?.[stopId]
    ?? [];

  const connectionMap = new Map();

  for (const departure of departures) {
    const line =
      String(departure?.[1] ?? '').trim();

    const direction =
      String(departure?.[2] ?? '').trim()
      || 'Richtung nicht angegeben';

    if (!line) {
      continue;
    }

    const key =
      `${line}|${direction}`;

    if (!connectionMap.has(key)) {
      connectionMap.set(key, {
        line,
        direction
      });
    }
  }

  return [...connectionMap.values()]
    .sort((a, b) => {
      const lineComparison =
        String(a.line).localeCompare(
          String(b.line),
          'de',
          {
            numeric: true,
            sensitivity: 'base'
          }
        );

      if (lineComparison !== 0) {
        return lineComparison;
      }

      return String(a.direction).localeCompare(
        String(b.direction),
        'de',
        {
          sensitivity: 'base'
        }
      );
    });
}


function vabFindSearchResults(queryText) {
  if (!vabSuchindex) {
    return [];
  }

  const query =
    vabNormalizeSearchText(queryText);

  if (query.length < 2) {
    return [];
  }

  const results = [];

  for (const place of vabSuchindex.places ?? []) {
    const score =
      vabSearchScore(place.search, query);

    if (score >= 99) {
      continue;
    }

    results.push({
      type: 'place',
      id: place.name,
      title: place.name,
      subtitle:
        `${place.station_ids.length} Haltestellen · `
        + `${place.lines.length} Linien`,
      lines: vabNaturalSort(
        place.lines ?? []
      ),
      score
    });
  }

  for (const stop of vabSuchindex.stops ?? []) {
    const score =
      vabSearchScore(stop.search, query);

    if (score >= 99) {
      continue;
    }

    const connections =
      vabGetStopConnections(stop.id);

    results.push({
      type: 'stop',
      id: stop.id,
      title: stop.name,
      subtitle:
        `${stop.lines.length} Linien`,
      connections,
      score
    });
  }

  return results
    .sort((a, b) =>
      a.score - b.score
      || a.type.localeCompare(b.type)
      || a.title.localeCompare(
        b.title,
        'de',
        {
          numeric: true,
          sensitivity: 'base'
        }
      )
    )
    .slice(0, 10);
}


function vabRenderSuggestions(queryText) {
  const results =
    vabFindSearchResults(queryText);

  if (results.length === 0) {
    vabCloseSuggestions();
    return;
  }

  vabSucheVorschlaege.innerHTML =
    results.map(result => {
      const connections =
        Array.isArray(result.connections)
          ? result.connections
          : [];

      const visibleConnections =
        connections.slice(0, 5);

      const connectionsHtml =
        result.type === 'stop'
          ? `
            <span class="vab-suche-verbindungen">
              ${
                visibleConnections.length > 0
                  ? visibleConnections
                      .map(connection => `
                        <span class="vab-suche-verbindung">
                          <span class="vab-suche-linie">
                            ${escapeHtml(connection.line)}
                          </span>

                          <span class="vab-suche-richtung">
                            Richtung
                            ${escapeHtml(connection.direction)}
                          </span>
                        </span>
                      `)
                      .join('')
                  : `
                    <small>
                      ${escapeHtml(result.subtitle)}
                    </small>
                  `
              }

              ${
                connections.length > visibleConnections.length
                  ? `
                    <small class="vab-suche-weitere">
                      + ${
                        connections.length
                        - visibleConnections.length
                      } weitere Verbindungen
                    </small>
                  `
                  : ''
              }
            </span>
          `
          : `
            <span class="vab-suche-ort-info">
              <small>
                ${escapeHtml(result.subtitle)}
              </small>

              ${
                Array.isArray(result.lines)
                && result.lines.length > 0
                  ? `
                    <span class="vab-suche-ort-linien">
                      ${result.lines.map(line => `
                        <span class="vab-suche-linie">
                          ${escapeHtml(line)}
                        </span>
                      `).join('')}
                    </span>
                  `
                  : ''
              }
            </span>
          `;

      return `
        <button
          type="button"
          class="vab-suche-treffer"
          role="option"
          data-search-type="${escapeHtml(result.type)}"
          data-search-id="${escapeHtml(result.id)}"
        >
          <span class="vab-suche-treffer-typ">
            ${result.type === 'place' ? 'Ort' : 'Haltestelle'}
          </span>

          <span class="vab-suche-treffer-inhalt">
            <strong>
              ${escapeHtml(result.title)}
            </strong>

            ${connectionsHtml}
          </span>
        </button>
      `;
    }).join('');

  vabSucheVorschlaege.hidden = false;

  vabSucheEingabe.setAttribute(
    'aria-expanded',
    'true'
  );
}


function vabGetStopById(stopId) {
  return (
    vabSuchindex?.stops?.find(
      stop => String(stop.id) === String(stopId)
    )
    ?? null
  );
}


function vabGetPlaceByName(placeName) {
  return (
    vabSuchindex?.places?.find(
      place =>
        String(place.name) ===
        String(placeName)
    )
    ?? null
  );
}


function vabOpenInfoPanel() {
  infoPanel.classList.add('sichtbar');

  infoPanel.setAttribute(
    'aria-hidden',
    'false'
  );

  refreshMapAfterPanelChange();
}


function vabCreateLineButtons(lines, stopId = '') {
  return vabNaturalSort(lines).map(line => `
    <button
      type="button"
      class="linien-auswahl-button vab-suche-linien-button"
      data-search-line="${escapeHtml(line)}"
      data-search-stop="${escapeHtml(stopId)}"
    >
      <span class="linien-auswahl-nummer">
        ${escapeHtml(line)}
      </span>

      <span class="linien-auswahl-text">
        Linie ${escapeHtml(line)} anzeigen
      </span>

      <span
        class="linien-auswahl-pfeil"
        aria-hidden="true"
      >
        ›
      </span>
    </button>
  `).join('');
}


function vabBindLineButtons() {
  for (
    const button
    of infoPanelInhalt.querySelectorAll(
      '.vab-suche-linien-button'
    )
  ) {
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();

      const line =
        String(button.dataset.searchLine ?? '')
          .trim();

      const stopId =
        String(button.dataset.searchStop ?? '')
          .trim();

      if (!line) {
        return;
      }

      selectLineFromStopSearch(line);

      if (stopId) {
        const stop =
          vabGetStopById(stopId);

        if (stop) {
          vabShowSchedule(stop, line);
        }

        return;
      }

      if (vabAktuellerOrt) {
        vabShowPlaceSchedule(
          vabAktuellerOrt,
          line
        );
      }
    });
  }
}


function vabShowPlace(place) {
  if (!place) {
    return;
  }

  vabAktuellerOrt = place;
  vabAktuelleHaltestelle = null;
  vabAktuelleLinie = null;


  vabCloseSuggestions();

  const stops = (place.station_ids ?? [])
    .map(vabGetStopById)
    .filter(Boolean)
    .sort((a, b) =>
      a.name.localeCompare(
        b.name,
        'de',
        {
          numeric: true,
          sensitivity: 'base'
        }
      )
    );

  const stopHtml = stops.map(stop => `
    <button
      type="button"
      class="vab-ort-haltestelle"
      data-search-stop-select="${escapeHtml(stop.id)}"
    >
      <span>
        ${escapeHtml(stop.name)}
      </span>

      <small>
        ${escapeHtml(
          vabNaturalSort(stop.lines).join(', ')
        )}
      </small>
    </button>
  `).join('');

  infoPanelInhalt.innerHTML = `
    <div class="seitenleisten-inhalt vab-suche-panel">
      <div class="vab-suche-panel-kennung">
        Ort
      </div>

      <h2>${escapeHtml(place.name)}</h2>

      <p class="gemeinsame-auswahl-hinweis">
        Wählen Sie eine Linie für die Kartenansicht
        oder eine Haltestelle für den Regelfahrplan.
      </p>

      <section class="vab-suche-panel-bereich">
        <h3>Linien im Ort</h3>

        <div class="linien-auswahl-liste">
          ${vabCreateLineButtons(place.lines)}
        </div>
      </section>

      <section class="vab-suche-panel-bereich">
        <h3>Haltestellen</h3>

        <div class="vab-ort-haltestellen">
          ${stopHtml}
        </div>
      </section>
    </div>
  `;

  vabOpenInfoPanel();
  vabBindLineButtons();

  for (
    const button
    of infoPanelInhalt.querySelectorAll(
      '[data-search-stop-select]'
    )
  ) {
    button.addEventListener('click', () => {
      const stop =
        vabGetStopById(
          button.dataset.searchStopSelect
        );

      vabShowStop(stop);
    });
  }

  setStatus(
    `${place.name}: Linien und Haltestellen angezeigt`,
    'erfolg'
  );
}


function vabShowStop(stop) {
  if (!stop) {
    return;
  }

  vabAktuelleHaltestelle = stop;
  vabAktuelleLinie = null;

  vabCloseSuggestions();

  if (
    Number.isFinite(Number(stop.lat))
    && Number.isFinite(Number(stop.lon))
  ) {
    karte.setView(
      [
        Number(stop.lat),
        Number(stop.lon)
      ],
      Math.max(karte.getZoom(), 16),
      {
        animate: true
      }
    );
  }

  infoPanelInhalt.innerHTML = `
    <div class="seitenleisten-inhalt vab-suche-panel">
      <div class="vab-suche-panel-kennung">
        H
      </div>

      <h2>${escapeHtml(stop.name)}</h2>

      <p class="gemeinsame-auswahl-hinweis">
        Wählen Sie eine Linie. Anschließend können Sie
        den zugehörigen Aushangfahrplan als PDF öffnen.
      </p>

      <section class="vab-suche-panel-bereich">
        <h3>Linien an dieser Haltestelle</h3>

        <div class="linien-auswahl-liste">
          ${vabCreateLineButtons(
            stop.lines,
            stop.id
          )}
        </div>
      </section>
    </div>
  `;

  vabOpenInfoPanel();
  vabBindLineButtons();

  setStatus(
    `${stop.name}: ${stop.lines.length} Linien gefunden`,
    'erfolg'
  );
}



let vabFahrplanPdfZuordnung = {};


function vabGetSchedulePdfDocuments(line) {
  const key = String(line ?? '').trim();

  const documents =
    vabFahrplanPdfZuordnung[key];

  return Array.isArray(documents)
    ? documents
    : [];
}


function vabCreateSchedulePdfHtml(line) {
  const documents =
    vabGetSchedulePdfDocuments(line);

  if (documents.length === 0) {
    return `
      <div class="vab-fahrplan-pdf-fehlt">
        Für die Linie
        <strong>${escapeHtml(line)}</strong>
        ist derzeit kein PDF hinterlegt.
      </div>
    `;
  }

  return documents.map(document => {
    const documentType =
      document.type
      || 'Fahrplan';

    const detail =
      document.valid_from
        ? `Stand/Gültigkeit: ${document.valid_from}`
        : (
            document.title
            || 'PDF in neuem Browserfenster öffnen'
          );

    return `
      <a
        class="vab-fahrplan-pdf-link"
        href="${escapeHtml(document.url)}"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span class="vab-fahrplan-pdf-symbol">
          PDF
        </span>

        <span class="vab-fahrplan-pdf-text">
          <strong>
            ${escapeHtml(documentType)}
          </strong>

          <span>
            ${escapeHtml(detail)}
          </span>
        </span>

        <span
          class="vab-fahrplan-pdf-pfeil"
          aria-hidden="true"
        >
          ↗
        </span>
      </a>
    `;
  }).join('');
}

function vabShowPlaceSchedule(
  place,
  line
) {
  if (!place || !line) {
    return;
  }

  vabAktuellerOrt = place;
  vabAktuelleHaltestelle = null;
  vabAktuelleLinie = line;

  const pdfHtml =
    vabCreateSchedulePdfHtml(line);

  infoPanelInhalt.innerHTML = `
    <div class="seitenleisten-inhalt vab-suche-panel">
      <div class="liniennummer-gross">
        ${escapeHtml(line)}
      </div>

      <h2>${escapeHtml(place.name)}</h2>

      <p class="gemeinsame-auswahl-hinweis">
        Verfügbare Fahrplandokumente der Linie
        ${escapeHtml(line)}.
      </p>

      <div class="vab-fahrplan-pdf-bereich">
        ${pdfHtml}
      </div>

      <button
        type="button"
        class="vab-zurueck-haltestelle"
      >
        Zurück zu allen Linien
      </button>
    </div>
  `;

  vabOpenInfoPanel();

  /*
   * Nach der Auswahl einer Linie aus der
   * Haltestellensuche wieder gezielt auf die
   * zuvor gesuchte Haltestelle zoomen.
   *
   * selectLineFromStopSearch() zeigt zunächst
   * den vollständigen Linienverlauf. Für den
   * Suchkontext soll anschließend jedoch die
   * Haltestelle im Mittelpunkt bleiben.
   */
  if (
    Number.isFinite(Number(stop.lat))
    && Number.isFinite(Number(stop.lon))
  ) {
    karte.setView(
      [
        Number(stop.lat),
        Number(stop.lon)
      ],
      16,
      {
        animate: true
      }
    );
  }

  infoPanelInhalt
    .querySelector('.vab-zurueck-haltestelle')
    ?.addEventListener(
      'click',
      () => vabShowPlace(place)
    );

  setStatus(
    `Linie ${line}: Fahrplandokumente für ${place.name}`,
    'erfolg'
  );
}

function vabShowSchedule(
  stop,
  line
) {
  if (!stop || !line) {
    return;
  }

  vabAktuellerOrt = null;
  vabAktuelleHaltestelle = stop;
  vabAktuelleLinie = line;

  const pdfHtml =
    vabCreateSchedulePdfHtml(line);

  infoPanelInhalt.innerHTML = `
    <div class="seitenleisten-inhalt vab-suche-panel">
      <div class="liniennummer-gross">
        ${escapeHtml(line)}
      </div>

      <h2>${escapeHtml(stop.name)}</h2>

      <p class="gemeinsame-auswahl-hinweis">
        Verfügbare Fahrplandokumente der Linie
        ${escapeHtml(line)}.
      </p>

      <div class="vab-fahrplan-pdf-bereich">
        ${pdfHtml}
      </div>

      <button
        type="button"
        class="vab-zurueck-haltestelle"
      >
        Zurück zu allen Linien
      </button>
    </div>
  `;

  vabOpenInfoPanel();

  infoPanelInhalt
    .querySelector('.vab-zurueck-haltestelle')
    ?.addEventListener(
      'click',
      () => vabShowStop(stop)
    );

  setStatus(
    `Linie ${line}: Fahrplandokumente`,
    'erfolg'
  );
}

function vabSelectSearchResult(type, id) {
  if (type === 'place') {
    vabShowPlace(
      vabGetPlaceByName(id)
    );

    return;
  }

  if (type === 'stop') {
    vabShowStop(
      vabGetStopById(id)
    );
  }
}



function vabApplyMunicipalityMappings(
  searchIndex,
  municipalityMapping
) {
  if (
    !searchIndex
    || !municipalityMapping?.gemeinden
  ) {
    return searchIndex;
  }

  const stops =
    Array.isArray(searchIndex.stops)
      ? searchIndex.stops
      : [];

  const existingPlaces =
    Array.isArray(searchIndex.places)
      ? searchIndex.places
      : [];

  const generatedMunicipalities = [];

  for (
    const [municipalityName, config]
    of Object.entries(
      municipalityMapping.gemeinden
    )
  ) {
    const districtNames = new Set(
      (config?.ortsteile ?? [])
        .map(value => String(value).trim())
        .filter(Boolean)
    );

    if (districtNames.size === 0) {
      continue;
    }

    const matchingStops = stops.filter(stop =>
      districtNames.has(
        String(stop.place ?? '').trim()
      )
    );

    const stationIds = [
      ...new Set(
        matchingStops
          .map(stop => String(stop.id ?? '').trim())
          .filter(Boolean)
      )
    ].sort((a, b) =>
      a.localeCompare(
        b,
        'de',
        {
          numeric: true,
          sensitivity: 'base'
        }
      )
    );

    const lines = [
      ...new Set(
        matchingStops.flatMap(
          stop => stop.lines ?? []
        )
      )
    ].sort((a, b) =>
      String(a).localeCompare(
        String(b),
        'de',
        {
          numeric: true,
          sensitivity: 'base'
        }
      )
    );

    if (stationIds.length === 0) {
      console.warn(
        `Keine Haltestellen für Gemeinde `
        + `${municipalityName} gefunden.`,
        [...districtNames]
      );

      continue;
    }

    generatedMunicipalities.push({
      name: municipalityName,
      search: vabNormalizeSearchText(
        municipalityName
      ),
      station_ids: stationIds,
      lines,
      municipality: true,
      districts: [...districtNames]
    });
  }

  const generatedNames = new Set(
    generatedMunicipalities.map(
      place => place.name
    )
  );

  /*
   * Bereits vorhandene gleichnamige Einträge werden
   * durch die zentral erzeugte Gemeindeansicht ersetzt.
   */
  const remainingPlaces =
    existingPlaces.filter(
      place =>
        !generatedNames.has(
          String(place.name ?? '')
        )
    );

  searchIndex.places = [
    ...remainingPlaces,
    ...generatedMunicipalities
  ].sort((a, b) =>
    String(a.name ?? '').localeCompare(
      String(b.name ?? ''),
      'de',
      {
        numeric: true,
        sensitivity: 'base'
      }
    )
  );

  return searchIndex;
}


async function vabInitializeSearch() {
  try {
    const [
      searchResponse,
      scheduleResponse,
      municipalityResponse,
      pdfResponse
    ] = await Promise.all([
      fetch(
        'data/haltestellen_suchindex.json',
        { cache: 'no-store' }
      ),
      fetch(
        'data/fahrplan_index.json',
        { cache: 'no-store' }
      ),
      fetch(
        'data/gemeinde_ortsteile.json',
        { cache: 'no-store' }
      ),
      fetch(
        'data/fahrplan_pdf_zuordnung.json',
        { cache: 'no-store' }
      )
    ]);

    if (!searchResponse.ok) {
      throw new Error(
        `Suchindex: HTTP ${searchResponse.status}`
      );
    }

    if (!scheduleResponse.ok) {
      throw new Error(
        `Fahrplanindex: HTTP ${scheduleResponse.status}`
      );
    }

    if (!municipalityResponse.ok) {
      throw new Error(
        `Gemeindezuordnung: HTTP ${municipalityResponse.status}`
      );
    }

    const rawSearchIndex =
      await searchResponse.json();

    const municipalityMapping =
      await municipalityResponse.json();

    if (!pdfResponse.ok) {
      throw new Error(
        `PDF-Zuordnung: HTTP ${pdfResponse.status}`
      );
    }

    const pdfData =
      await pdfResponse.json();

    vabFahrplanPdfZuordnung =
      pdfData.lines ?? {};

    vabSuchindex =
      vabApplyMunicipalityMappings(
        rawSearchIndex,
        municipalityMapping
      );

    vabFahrplanindex =
      await scheduleResponse.json();

    vabSucheEingabe.disabled = false;
    vabSucheButton.disabled = false;

    setStatus(
      `${vabSuchindex.stops.length.toLocaleString('de-DE')} `
      + `Haltestellen und `
      + `${vabSuchindex.places.length.toLocaleString('de-DE')} `
      + `Orte durchsuchbar`,
      'erfolg'
    );
  } catch (error) {
    console.error(error);

    vabSucheEingabe.placeholder =
      'Suche konnte nicht geladen werden';

    setStatus(
      `Suchfunktion konnte nicht geladen werden: ${error.message}`,
      'fehler'
    );
  }
}


vabSucheEingabe.addEventListener(
  'input',
  () => {
    const searchValue =
      vabSucheEingabe.value.trim();

    if (!searchValue) {
      vabResetSearchView();
      return;
    }

    vabRenderSuggestions(
      searchValue
    );
  }
);




vabSucheEingabe.addEventListener(
  'search',
  () => {
    if (!vabSucheEingabe.value.trim()) {
      vabResetSearchView();
    }
  }
);


vabSucheEingabe.addEventListener(
  'focus',
  () => {
    vabRenderSuggestions(
      vabSucheEingabe.value
    );
  }
);


vabSucheFormular.addEventListener(
  'submit',
  event => {
    event.preventDefault();

    const firstResult =
      vabFindSearchResults(
        vabSucheEingabe.value
      )[0];

    if (!firstResult) {
      setStatus(
        'Keine passende Haltestelle oder kein passender Ort gefunden',
        'fehler'
      );

      return;
    }

    vabSelectSearchResult(
      firstResult.type,
      firstResult.id
    );
  }
);


vabSucheVorschlaege.addEventListener(
  'click',
  event => {
    const button =
      event.target.closest(
        '[data-search-type][data-search-id]'
      );

    if (!button) {
      return;
    }

    vabSucheEingabe.value =
      button
        .querySelector('strong')
        ?.textContent
        ?.trim()
      ?? '';

    vabSelectSearchResult(
      button.dataset.searchType,
      button.dataset.searchId
    );
  }
);


document.addEventListener(
  'click',
  event => {
    if (
      !event.target.closest('.vab-suche')
    ) {
      vabCloseSuggestions();
    }
  }
);


vabInitializeSearch();

/* END VAB-SUCHE */
