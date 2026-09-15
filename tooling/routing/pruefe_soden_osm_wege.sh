#!/usr/bin/env bash
set -e

OSM=~/vab-routing/vab-routing-bhw.osm.pbf
OUT=~/vab-routing/soden_kandidaten_wege.osm

osmium getparents "$OSM" \
  n1995473256 \
  n1036033216 \
  n1036033241 \
  n309265815 \
  n309265813 \
  n1995473215 \
  n1995473207 \
  n1995473187 \
  n3622348394 \
  n33835930 \
  n2459605765 \
  -o "$OUT" \
  --overwrite

echo "Betroffene Wege:"
grep '<way id=' "$OUT"

echo
echo "Wege mit Tags:"
grep -n -A 40 '<way id=' "$OUT"
