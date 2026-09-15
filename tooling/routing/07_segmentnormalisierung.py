import csv
import json
from collections import defaultdict
from pathlib import Path

BASE = Path.home() / 'vab-routing'
RUN = BASE / 'gesamtlauf'
REPORT_DIR = RUN / 'pruefung'

SEGMENT_FILE = REPORT_DIR / 'segmentinventur.json'
REGISTER_FILE = Path(
    '/mnt/f/AMINA neu/11-Marketing/VAB/vab-routing/'
    'Haltestellen Deutschland.csv'
)

OUT_JSON = REPORT_DIR / 'segmentinventur_normalisiert.json'
OUT_CSV = REPORT_DIR / 'segmentinventur_normalisiert.csv'
OUT_SUMMARY = REPORT_DIR / 'segmentinventur_normalisiert_summary.json'

with open(SEGMENT_FILE, encoding='utf-8') as f:
    raw_segments = json.load(f)['segments']

# Nur die im Segmentbestand vorkommenden Haltestellen-IDs benötigen wir.
wanted_stop_ids = set()

for segment in raw_segments:
    wanted_stop_ids.add(segment['from_stop_id'])
    wanted_stop_ids.add(segment['to_stop_id'])

# GTFS-interne Varianten wie ..._G zusätzlich über die Basis-ID suchen.
wanted_register_ids = set(wanted_stop_ids)

def remove_gtfs_g_suffixes(stop_id):
    clean_id = stop_id

    while clean_id.endswith('_G'):
        clean_id = clean_id[:-2]

    return clean_id


for stop_id in wanted_stop_ids:
    clean_id = remove_gtfs_g_suffixes(stop_id)

    if clean_id != stop_id:
        wanted_register_ids.add(clean_id)

register = {}

with open(
    REGISTER_FILE,
    encoding='utf-8-sig',
    errors='replace',
    newline=''
) as f:
    reader = csv.DictReader(f, delimiter=';')

    for row in reader:
        dhid = row.get('DHID', '').strip()

        if dhid in wanted_register_ids:
            register[dhid] = {
                'dhid': dhid,
                'parent': row.get('Parent', '').strip(),
                'type': row.get('Type', '').strip(),
                'name': row.get('Name', '').strip(),
            }

# Auch übergeordnete Parent-DHIDs nachladen.
parents_needed = {
    row['parent']
    for row in register.values()
    if row['parent'] and row['parent'] not in register
}

if parents_needed:
    with open(
        REGISTER_FILE,
        encoding='utf-8-sig',
        errors='replace',
        newline=''
    ) as f:
        reader = csv.DictReader(f, delimiter=';')

        for row in reader:
            dhid = row.get('DHID', '').strip()

            if dhid in parents_needed:
                register[dhid] = {
                    'dhid': dhid,
                    'parent': row.get('Parent', '').strip(),
                    'type': row.get('Type', '').strip(),
                    'name': row.get('Name', '').strip(),
                }


def fallback_station_id(stop_id):
    """
    Vorsichtiger Fallback für DHID-artige Kennungen:
    de:AGS:Haltestelle[:Bereich[:Steig]]
    """
    clean_id = remove_gtfs_g_suffixes(stop_id)
    parts = clean_id.split(':')

    if len(parts) >= 3 and parts[0] == 'de':
        return ':'.join(parts[:3])

    return clean_id


def normalize_stop(stop_id):
    lookup_id = remove_gtfs_g_suffixes(stop_id)
    row = register.get(lookup_id)

    if not row:
        return {
            'station_id': fallback_station_id(stop_id),
            'station_name': '',
            'method': 'DHID-Fallback',
        }

    current = row
    visited = set()

    while current and current['dhid'] not in visited:
        visited.add(current['dhid'])

        # S = Gesamtstation/Haltestelle
        if current['type'] == 'S':
            return {
                'station_id': current['dhid'],
                'station_name': current['name'],
                'method': (
                    'Register exakt'
                    if lookup_id == current['dhid']
                    else 'Register Parent'
                ),
            }

        parent_id = current.get('parent', '')

        if not parent_id or parent_id == current['dhid']:
            break

        current = register.get(parent_id)

    return {
        'station_id': fallback_station_id(stop_id),
        'station_name': row.get('name', ''),
        'method': 'Register/Fallback',
    }


normalization = {
    stop_id: normalize_stop(stop_id)
    for stop_id in sorted(wanted_stop_ids)
}

normalized_segments = {}

for raw in raw_segments:
    from_norm = normalization[raw['from_stop_id']]
    to_norm = normalization[raw['to_stop_id']]

    normalized_key = (
        from_norm['station_id'],
        to_norm['station_id'],
    )

    if normalized_key not in normalized_segments:
        normalized_segments[normalized_key] = {
            'normalized_segment_id': '',
            'from_station_id': from_norm['station_id'],
            'from_station_name': (
                from_norm['station_name']
                or raw['from_stop_name']
            ),
            'to_station_id': to_norm['station_id'],
            'to_station_name': (
                to_norm['station_name']
                or raw['to_stop_name']
            ),
            'lines': set(),
            'pattern_ids': set(),
            'raw_segment_ids': set(),
            'raw_stop_pairs': set(),
            'occurrences': 0,
            'uses_routing_anchor': False,
        }

    target = normalized_segments[normalized_key]

    target['lines'].update(raw.get('lines', []))
    target['pattern_ids'].update(raw.get('pattern_ids', []))
    target['raw_segment_ids'].add(raw['segment_id'])
    target['raw_stop_pairs'].add((
        raw['from_stop_id'],
        raw['to_stop_id'],
    ))
    target['occurrences'] += int(raw.get('occurrences', 0))
    target['uses_routing_anchor'] = (
        target['uses_routing_anchor']
        or raw.get('from_uses_anchor', False)
        or raw.get('to_uses_anchor', False)
    )

rows = []

for number, item in enumerate(
    sorted(
        normalized_segments.values(),
        key=lambda row: (
            row['from_station_name'],
            row['to_station_name'],
            row['from_station_id'],
            row['to_station_id'],
        )
    ),
    start=1
):
    item['normalized_segment_id'] = f'nseg-{number:05d}'

    reverse_exists = (
        item['to_station_id'],
        item['from_station_id'],
    ) in normalized_segments

    rows.append({
        **item,
        'lines': sorted(item['lines']),
        'pattern_ids': sorted(item['pattern_ids']),
        'raw_segment_ids': sorted(item['raw_segment_ids']),
        'raw_stop_pairs': [
            {
                'from_stop_id': pair[0],
                'to_stop_id': pair[1],
            }
            for pair in sorted(item['raw_stop_pairs'])
        ],
        'reverse_segment_exists': reverse_exists,
    })

with open(OUT_JSON, 'w', encoding='utf-8') as f:
    json.dump(
        {
            'stop_normalization': normalization,
            'segments': rows,
        },
        f,
        ensure_ascii=False,
        indent=2
    )

with open(
    OUT_CSV,
    'w',
    encoding='utf-8-sig',
    newline=''
) as f:
    fieldnames = [
        'normalized_segment_id',
        'from_station_id',
        'from_station_name',
        'to_station_id',
        'to_station_name',
        'lines',
        'line_count',
        'pattern_count',
        'raw_segment_count',
        'occurrences',
        'reverse_segment_exists',
        'uses_routing_anchor',
    ]

    writer = csv.DictWriter(
        f,
        fieldnames=fieldnames,
        delimiter=';'
    )
    writer.writeheader()

    for row in rows:
        writer.writerow({
            'normalized_segment_id': row['normalized_segment_id'],
            'from_station_id': row['from_station_id'],
            'from_station_name': row['from_station_name'],
            'to_station_id': row['to_station_id'],
            'to_station_name': row['to_station_name'],
            'lines': ', '.join(row['lines']),
            'line_count': len(row['lines']),
            'pattern_count': len(row['pattern_ids']),
            'raw_segment_count': len(row['raw_segment_ids']),
            'occurrences': row['occurrences'],
            'reverse_segment_exists': (
                'JA' if row['reverse_segment_exists'] else 'NEIN'
            ),
            'uses_routing_anchor': (
                'JA' if row['uses_routing_anchor'] else 'NEIN'
            ),
        })

method_counts = defaultdict(int)

for result in normalization.values():
    method_counts[result['method']] += 1

shared_segments = [
    row for row in rows
    if len(row['lines']) > 1
]

summary = {
    'raw_directed_segments': len(raw_segments),
    'normalized_directed_segments': len(rows),
    'normalized_segments_with_reverse_direction': sum(
        1 for row in rows
        if row['reverse_segment_exists']
    ),
    'normalized_segments_used_by_multiple_lines': len(shared_segments),
    'unique_stop_ids': len(normalization),
    'normalization_methods': dict(sorted(method_counts.items())),
    'output_json': str(OUT_JSON),
    'output_csv': str(OUT_CSV),
}

with open(OUT_SUMMARY, 'w', encoding='utf-8') as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)

print('Segmentnormalisierung erfolgreich')
print(
    'Rohsegmente gerichtet:',
    summary['raw_directed_segments']
)
print(
    'Normalisierte gerichtete Segmente:',
    summary['normalized_directed_segments']
)
print(
    'Normalisierte Segmente mit Gegenrichtung:',
    summary[
        'normalized_segments_with_reverse_direction'
    ]
)
print(
    'Normalisierte Segmente mit mehreren Linien:',
    summary[
        'normalized_segments_used_by_multiple_lines'
    ]
)
print(
    'Eindeutige verwendete Haltestellen-IDs:',
    summary['unique_stop_ids']
)
print('Normalisierungsmethoden:')

for method, count in summary['normalization_methods'].items():
    print(f'  {method}: {count}')

print('JSON:', OUT_JSON)
print('CSV:', OUT_CSV)
print('Zusammenfassung:', OUT_SUMMARY)
