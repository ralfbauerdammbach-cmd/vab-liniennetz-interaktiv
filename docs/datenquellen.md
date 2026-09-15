# Datenquellen und Build-Basis

## OSM / OSRM

Die Liniengeometrien wurden mit einer lokalen OSRM-Instanz auf Basis
eines für das VAB-Projekt vorbereiteten OpenStreetMap-Datensatzes erzeugt.

Relevante lokale Quelldateien:

- `vab-routing-plan.osm.pbf`
- `osrm-plan/vab-routing-plan.osm.pbf`
- `osrm-plan/vab-routing-plan.osrm*`

Die beiden Plan-PBF-Dateien sind bitidentisch.

Die großen OSM-/OSRM-Rohdaten werden wegen ihrer Größe nicht im
Git-Repository gespeichert.

## GTFS

Verwendet wird ein lokaler VAB-GTFS-Arbeitsdatensatz mit unter anderem:

- `routes.txt`
- `trips.txt`
- `stops.txt`
- `stop_times.txt`
- `shapes.txt`

Die großen GTFS-Rohdaten werden nicht im Git-Repository gespeichert.

## Produktive Webdaten

Die Anwendung verwendet unter anderem:

- `data/linien_routed.geojson`
- `data/gemeinsame_linienabschnitte.geojson`
- `data/haltestellen.geojson`
- `data/haltestellen_suchindex.json`
- `data/linienvarianten_*.json`

## Routing-Pipeline

Die nachvollziehbare Routing- und Segmentpipeline befindet sich unter:

`tooling/routing/`

Die produktive Plan-Routing-Pipeline erwartet eine lokale OSRM-Instanz
auf Port `5001`.

Große Quelldaten sowie erzeugte OSRM-Artefakte sind bewusst nicht Teil
des Git-Repositories.
