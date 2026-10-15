'use strict';
// Verhindert, dass Leaflet-Kartenklicks die beiden Popup-Aktionen verschlucken.
// Im Capture-Handler vor den Kartenhandlern abfangen.
document.addEventListener('click', function (event) {
  const button = event.target.closest?.('.vab-linien-aktionspopup .vab-aktionspopup-button');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const popup = button.closest('.vab-linien-aktionspopup');
  const visibleName = popup?.querySelector('h3')?.textContent?.replace(/^Linie\s+/, '').trim();
  if (!visibleName) return;
  const lineName = [...linienNachName.keys()].find(
    name => vabDisplayLineName(name) === visibleName
  ) || visibleName;

  if (button.textContent.trim() === 'PDF-Fahrplan') {
    vabShowLinePdfDocuments(lineName);
  } else {
    // Zuerst das Panel sichtbar machen, bevor eine Variante gerendert wird.
    // Ein nicht passender Varianten-Eintrag darf die Haltestellenansicht
    // nicht blockieren (betrifft u.a. einzelne Linienverlaeufe).
    infoPanel.classList.add('sichtbar', 'vab-dialog-mode');
    infoPanel.setAttribute('aria-hidden', 'false');
    try {
      const group = getVariantGroup(lineName);
      const layers = group ? getLayersForVariant(lineName, group) : [];
      if (group && layers.length) {
        selectVariant(lineName, group.id);
      } else {
        vabShowLineStopsWithoutVariants(lineName);
      }
      // Ist die Ansicht nicht aufgebaut worden, immer die
      // Haltestellenliste der Linie als Rueckfall anzeigen.
      if (!infoPanelInhalt.querySelector('.vab-finder-host')) {
        vabShowLineStopsWithoutVariants(lineName);
      }
    } catch (error) {
      console.error('VAB: Haltestellenansicht fehlgeschlagen', lineName, error);
      try {
        vabShowLineStopsWithoutVariants(lineName);
      } catch (fallbackError) {
        console.error('VAB: Haltestellen-Fallback fehlgeschlagen', fallbackError);
        infoPanelInhalt.innerHTML =
          '<div class="seitenleisten-inhalt"><h2>Linie ' +
          escapeHtml(vabDisplayLineName(lineName)) +
          '</h2><p>Die Haltestellen konnten nicht geladen werden. Bitte die Seite neu laden.</p></div>';
      }
    }
  }

  // Manche Routinen entfernen die alte Auswahl und schliessen dabei
  // versehentlich die eben geoeffnete Seitenleiste wieder.
  infoPanel.classList.add('sichtbar', 'vab-dialog-mode');
  infoPanel.setAttribute('aria-hidden', 'false');
  karte.closePopup();
  window.setTimeout(() => {
    infoPanel.classList.add('sichtbar', 'vab-dialog-mode');
    infoPanel.setAttribute('aria-hidden', 'false');
    karte.invalidateSize();
  }, 0);
}, true);
