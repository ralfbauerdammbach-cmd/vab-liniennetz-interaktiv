'use strict';
// Fallback fuer Linienklicks, wenn der duenne unsichtbare Hit-Layer verfehlt wird.
// Bestehende Leaflet-Linienklicks bleiben unveraendert.
(function () {
  function visitSegments(parts, callback) {
    if (!Array.isArray(parts) || !parts.length) return;
    if (parts[0] && Number.isFinite(parts[0].lat)) {
      for (let i = 1; i < parts.length; i++) callback(parts[i - 1], parts[i]);
      return;
    }
    for (const part of parts) visitSegments(part, callback);
  }
  function nearestLine(latlng) {
    if (!linienLayer || !linienNachName.size) return null;
    const point = karte.latLngToLayerPoint(latlng);
    const tolerance = 10;
    const bounds = L.latLngBounds(
      karte.layerPointToLatLng(point.subtract([tolerance, tolerance])),
      karte.layerPointToLatLng(point.add([tolerance, tolerance]))
    );
    let best = null;
    let minDistance = tolerance;
    for (const [lineName, layers] of linienNachName) {
      for (const layer of layers) {
        if (!layer.getBounds?.().intersects(bounds)) continue;
        visitSegments(layer.getLatLngs?.(), (a, b) => {
          const distance = distancePointToSegment(
            point, karte.latLngToLayerPoint(a), karte.latLngToLayerPoint(b)
          );
          if (distance < minDistance) {
            minDistance = distance;
            best = { lineName, layer };
          }
        });
      }
    }
    return best;
  }
  karte.on('click', function (event) {
    if (event.originalEvent?.vabLineHandled) return;
    const found = nearestLine(event.latlng);
    if (!found) return;
    const { lineName, layer } = found;
    const shared = findSharedSectionAtClick(event.latlng, lineName);
    if (shared) {
      showSharedSection(shared, L.geoJSON(shared), event.latlng);
      return;
    }
    selectLineFromStopSearch(lineName);
    vabShowLineTripFromMapClick(
      lineName, event.latlng, null, getPatternIdFromLayer(layer)
    );
  });
})();
