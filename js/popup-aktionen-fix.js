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
    const group = getVariantGroup(lineName);
    if (group) {
      selectVariant(lineName, group.id);
    } else {
      vabShowLineStopsWithoutVariants(lineName);
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
