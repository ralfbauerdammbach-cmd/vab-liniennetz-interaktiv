import json
import re
from pathlib import Path
from collections import defaultdict, Counter
from math import radians, cos, sqrt

ROUTES = Path("data/linien_routed.geojson")
SHARED = Path("data/gemeinsame_linienabschnitte.geojson")
TARGET = Path("data/gemeinsame_linienabschnitte_korridor_kandidat.geojson")
AUDIT = Path("logs/korridor_kandidat_audit.txt")

LAT0 = radians(49.97)

CELL = 30
MAX_DISTANCE = 7.0
MIN_DIRECTION_SIMILARITY = 0.965
MIN_COVERAGE = 0.85
SAMPLE_STEP = 6.0
MIN_SEGMENT_LENGTH = 3.0


def natural_key(value):
    parts = re.split(r"(\d+)", str(value))
    return tuple(
        int(part) if part.isdigit() else part.lower()
        for part in parts
    )


def get_line(feature):
    props = feature.get("properties") or {}

    return str(
        props.get("line")
        or props.get("route_short_name")
        or props.get("linie")
        or ""
    ).strip()


def rounded_coord(coord):
    return (
        round(float(coord[0]), 6),
        round(float(coord[1]), 6),
    )


def geo_edge(a, b):
    return tuple(
        sorted(
            (
                rounded_coord(a),
                rounded_coord(b),
            )
        )
    )


def xy(coord):
    lon, lat = coord[:2]

    return (
        lon * 111320 * cos(LAT0),
        lat * 110540,
    )


def distance(a, b):
    return sqrt(
        (b[0] - a[0]) ** 2
        + (b[1] - a[1]) ** 2
    )


def point_segment_distance(p, a, b):
    px, py = p
    ax, ay = a
    bx, by = b

    dx = bx - ax
    dy = by - ay

    length2 = dx * dx + dy * dy

    if length2 == 0:
        return distance(p, a)

    t = (
        (px - ax) * dx
        + (py - ay) * dy
    ) / length2

    t = max(0, min(1, t))

    q = (
        ax + t * dx,
        ay + t * dy,
    )

    return distance(p, q)


def direction_similarity(a1, a2, b1, b2):
    ax = a2[0] - a1[0]
    ay = a2[1] - a1[1]

    bx = b2[0] - b1[0]
    by = b2[1] - b1[1]

    al = sqrt(ax * ax + ay * ay)
    bl = sqrt(bx * bx + by * by)

    if al == 0 or bl == 0:
        return 0.0

    return abs(
        (ax * bx + ay * by)
        / (al * bl)
    )


routes = json.loads(
    ROUTES.read_text(encoding="utf-8")
)

shared = json.loads(
    SHARED.read_text(encoding="utf-8")
)

Path("logs").mkdir(
    parents=True,
    exist_ok=True,
)


# =========================================================
# 1. Routingkanten je Linie deduplizieren
# =========================================================

line_edges = defaultdict(dict)

for feature in routes.get("features", []):
    line = get_line(feature)

    if not line:
        continue

    coords = (
        feature.get("geometry") or {}
    ).get("coordinates") or []

    for index in range(1, len(coords)):
        key = geo_edge(
            coords[index - 1],
            coords[index],
        )

        if key in line_edges[line]:
            continue

        a_geo, b_geo = key

        a = xy(a_geo)
        b = xy(b_geo)

        segment_length = distance(a, b)

        if segment_length < MIN_SEGMENT_LENGTH:
            continue

        midpoint = (
            (a[0] + b[0]) / 2,
            (a[1] + b[1]) / 2,
        )

        line_edges[line][key] = {
            "line": line,
            "a": a,
            "b": b,
            "mid": midpoint,
            "length": segment_length,
        }


segments = []

for line in line_edges:
    segments.extend(
        line_edges[line].values()
    )


# =========================================================
# 2. Räumlicher Index
# =========================================================

grid = defaultdict(list)

for index, segment in enumerate(segments):
    gx = int(segment["mid"][0] // CELL)
    gy = int(segment["mid"][1] // CELL)

    grid[(gx, gy)].append(index)


def matching_lines_at_sample(
    sample_point,
    tangent_a,
    tangent_b,
):
    gx = int(sample_point[0] // CELL)
    gy = int(sample_point[1] // CELL)

    found = set()

    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for index in grid.get(
                (gx + dx, gy + dy),
                [],
            ):
                segment = segments[index]

                d = point_segment_distance(
                    sample_point,
                    segment["a"],
                    segment["b"],
                )

                if d > MAX_DISTANCE:
                    continue

                similarity = direction_similarity(
                    tangent_a,
                    tangent_b,
                    segment["a"],
                    segment["b"],
                )

                if similarity < MIN_DIRECTION_SIMILARITY:
                    continue

                found.add(segment["line"])

    return found


# =========================================================
# 3. Bestehende gemeinsame Abschnitte abtasten
# =========================================================

def sample_shared_geometry(coords):
    samples = []

    for index in range(1, len(coords)):
        a = xy(coords[index - 1])
        b = xy(coords[index])

        segment_length = distance(a, b)

        if segment_length <= 0:
            continue

        count = max(
            1,
            int(segment_length / SAMPLE_STEP),
        )

        for number in range(count):
            ratio = (
                number + 0.5
            ) / count

            point = (
                a[0] + (b[0] - a[0]) * ratio,
                a[1] + (b[1] - a[1]) * ratio,
            )

            samples.append(
                (
                    point,
                    a,
                    b,
                )
            )

    return samples


# =========================================================
# 4. Kandidat erzeugen
# =========================================================

new_features = []

changed_features = 0
added_total = 0

added_by_line = Counter()
audit_rows = []

for feature in shared.get("features", []):
    props = dict(
        feature.get("properties") or {}
    )

    geometry = feature.get("geometry") or {}
    coords = geometry.get("coordinates") or []

    original_lines = {
        str(line)
        for line in (
            props.get("lines")
            or []
        )
    }

    if (
        geometry.get("type") != "LineString"
        or len(coords) < 2
    ):
        new_features.append(feature)
        continue

    samples = sample_shared_geometry(
        coords
    )

    if not samples:
        new_features.append(feature)
        continue

    hits = Counter()

    for (
        sample_point,
        tangent_a,
        tangent_b,
    ) in samples:
        lines_here = matching_lines_at_sample(
            sample_point,
            tangent_a,
            tangent_b,
        )

        for line in lines_here:
            hits[line] += 1

    final_lines = set(
        original_lines
    )

    additions = []

    for line, hit_count in hits.items():
        if line in original_lines:
            continue

        coverage = (
            hit_count
            / len(samples)
        )

        if coverage >= MIN_COVERAGE:
            final_lines.add(line)

            additions.append(
                (
                    line,
                    coverage,
                )
            )

    additions.sort(
        key=lambda item:
            natural_key(item[0])
    )

    if additions:
        changed_features += 1
        added_total += len(additions)

        for line, _coverage in additions:
            added_by_line[line] += 1

        audit_rows.append(
            {
                "section":
                    props.get("shared_section_id"),

                "old":
                    sorted(
                        original_lines,
                        key=natural_key,
                    ),

                "new":
                    sorted(
                        final_lines,
                        key=natural_key,
                    ),

                "added":
                    additions,
            }
        )

    final_lines_sorted = sorted(
        final_lines,
        key=natural_key,
    )

    props["lines"] = final_lines_sorted
    props["source_lines"] = final_lines_sorted
    props["line_count"] = len(
        final_lines_sorted
    )

    props["corridor_enriched"] = bool(
        additions
    )

    if additions:
        props["corridor_added_lines"] = [
            line
            for line, _coverage
            in additions
        ]

        props["corridor_added_coverage"] = {
            line: round(coverage, 4)
            for line, coverage
            in additions
        }

    new_features.append(
        {
            "type": "Feature",
            "properties": props,
            "geometry": geometry,
        }
    )


# =========================================================
# 5. Datei schreiben
# =========================================================

result = {
    "type": "FeatureCollection",

    "metadata": {
        **(
            shared.get("metadata")
            or {}
        ),

        "corridor_generator":
            "exact-sections-plus-parallel-corridors-v1",

        "corridor_max_distance_m":
            MAX_DISTANCE,

        "corridor_min_direction_similarity":
            MIN_DIRECTION_SIMILARITY,

        "corridor_min_coverage":
            MIN_COVERAGE,

        "corridor_sample_step_m":
            SAMPLE_STEP,
    },

    "features": new_features,
}

TARGET.write_text(
    json.dumps(
        result,
        ensure_ascii=False,
        indent=2,
    ),
    encoding="utf-8",
)


# =========================================================
# 6. Audit schreiben
# =========================================================

with AUDIT.open(
    "w",
    encoding="utf-8",
) as handle:

    handle.write(
        "VAB KORRIDOR-KANDIDAT AUDIT\n"
    )

    handle.write(
        "=" * 90 + "\n\n"
    )

    handle.write(
        f"Abschnitte gesamt: {len(new_features)}\n"
    )

    handle.write(
        f"Geänderte Abschnitte: {changed_features}\n"
    )

    handle.write(
        f"Neu ergänzte Linienzuordnungen: {added_total}\n\n"
    )

    handle.write(
        "Am häufigsten ergänzte Linien:\n"
    )

    for line, count in added_by_line.most_common():
        handle.write(
            f"{count:5} | Linie {line}\n"
        )

    handle.write(
        "\nLinie 63:\n"
    )

    for row in audit_rows:
        additions = dict(
            row["added"]
        )

        if "63" not in additions:
            continue

        handle.write(
            f"{row['section']} | "
            f"{additions['63'] * 100:5.1f}% | "
            f"{','.join(row['old'])} -> "
            f"{','.join(row['new'])}\n"
        )


# =========================================================
# 7. Konsistenzprüfung
# =========================================================

bad_line_count = []

for feature in new_features:
    props = feature.get("properties") or {}

    lines = props.get("lines") or []

    if props.get("line_count") != len(lines):
        bad_line_count.append(
            props.get("shared_section_id")
        )


print("=" * 90)
print("VAB – KORRIDOR-KANDIDAT")
print("=" * 90)

print()
print("Produktive Datei verändert: NEIN")
print()

print(
    "Abschnitte gesamt:",
    len(new_features)
)

print(
    "Geänderte Abschnitte:",
    changed_features
)

print(
    "Neu ergänzte Linienzuordnungen:",
    added_total
)

print(
    "line_count-Fehler:",
    len(bad_line_count)
)

print()
print("AM HÄUFIGSTEN ERGÄNZTE LINIEN")
print("-" * 90)

for line, count in added_by_line.most_common(30):
    marker = (
        "  <<< 63"
        if line == "63"
        else ""
    )

    print(
        f"{count:5} Abschnitte | "
        f"Linie {line}{marker}"
    )


line63_rows = [
    row
    for row in audit_rows
    if "63" in dict(row["added"])
]

print()
print("LINIE 63")
print("-" * 90)

print(
    "Abschnitte mit neu ergänzter 63:",
    len(line63_rows)
)

for row in line63_rows[:30]:
    additions = dict(
        row["added"]
    )

    print(
        f"{row['section']} | "
        f"{additions['63'] * 100:5.1f}% | "
        f"{','.join(row['old'])}"
        f" -> "
        f"{','.join(row['new'])}"
    )


print()
print("AUSGABEDATEIEN")
print("-" * 90)

print(
    TARGET,
    f"({TARGET.stat().st_size / 1024 / 1024:.2f} MB)"
)

print(AUDIT)

print("=" * 90)
