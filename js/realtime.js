'use strict';

const VAB_REALTIME_LINE_TRIP_URL =
  'https://vab-realtime.bauer-48e.workers.dev/line-trip';

const VAB_REALTIME_STOERUNGEN_URL =
  'https://vab-realtime.bauer-48e.workers.dev/stoerungen';
let vabRealtimeLineTripRequestId = 0;


function vabRealtimeEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


function vabRealtimeFormatTime(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(
    'de-DE',
    {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Europe/Berlin'
    }
  ).format(date);
}


function vabRealtimeGetTimes(stop) {
  const planned =
    stop?.departureTimePlanned
    ?? stop?.arrivalTimePlanned
    ?? '';

  const estimated =
    stop?.departureTimeEstimated
    ?? stop?.arrivalTimeEstimated
    ?? '';

  return {
    planned,
    estimated
  };
}


function vabRealtimeGetDeviation(
  planned,
  estimated
) {
  if (!planned || !estimated) {
    return '';
  }

  const plannedMs =
    new Date(planned).getTime();

  const estimatedMs =
    new Date(estimated).getTime();

  if (
    !Number.isFinite(plannedMs)
    || !Number.isFinite(estimatedMs)
  ) {
    return '';
  }

  const difference =
    Math.round(
      (estimatedMs - plannedMs) / 60000
    );

  if (difference === 0) {
    return 'pünktlich';
  }

  if (difference > 0) {
    return `+${difference} min`;
  }

  return `${difference} min`;
}


function vabRealtimeNormalizeStopId(value) {
  return String(value ?? '')
    .trim()
    .replace(/(?:_G)+$/, '');
}


function vabRealtimeStopIdsMatch(
  first,
  second
) {
  const firstId =
    vabRealtimeNormalizeStopId(first);

  const secondId =
    vabRealtimeNormalizeStopId(second);

  if (!firstId || !secondId) {
    return false;
  }

  return (
    firstId === secondId
    || firstId.startsWith(
      `${secondId}:`
    )
    || secondId.startsWith(
      `${firstId}:`
    )
  );
}


function vabRealtimeIsSelectedStop(
  sequenceStop,
  selectedStopId
) {
  return (
    vabRealtimeStopIdsMatch(
      sequenceStop?.id,
      selectedStopId
    )
    || vabRealtimeStopIdsMatch(
      sequenceStop?.parent?.id,
      selectedStopId
    )
  );
}


function vabRealtimeCreateStopRow(
  sequenceStop,
  index,
  selectedIndex
) {
  const stopId =
    String(
      sequenceStop?.id
      ?? sequenceStop?.parent?.id
      ?? ''
    );

  const name =
    sequenceStop?.parent?.name
    ?? sequenceStop?.name
    ?? 'Haltestelle';

  const {
    planned,
    estimated
  } = vabRealtimeGetTimes(sequenceStop);

  const realtime =
    Boolean(estimated);

  const shownTime =
    estimated || planned;

  const deviation =
    vabRealtimeGetDeviation(
      planned,
      estimated
    );

  let delayMinutes = null;

  if (planned && estimated) {
    const plannedMs =
      new Date(planned).getTime();

    const estimatedMs =
      new Date(estimated).getTime();

    if (
      Number.isFinite(plannedMs)
      && Number.isFinite(estimatedMs)
    ) {
      delayMinutes =
        Math.round(
          (estimatedMs - plannedMs) / 60000
        );
    }
  }

  let metaClass =
    'vab-linienfahrt-meta';

  if (
    realtime
    && Number.isFinite(delayMinutes)
  ) {
    if (delayMinutes >= 6) {
      metaClass +=
        ' vab-linienfahrt-meta-verspaetung-stark';
    } else if (delayMinutes >= 1) {
      metaClass +=
        ' vab-linienfahrt-meta-verspaetung';
    }
  }

  let rowClass =
    'vab-linienfahrt-halt';

  if (
    selectedIndex >= 0
    && index < selectedIndex
  ) {
    rowClass +=
      ' vab-linienfahrt-halt-vorbei';
  }

  if (index === selectedIndex) {
    rowClass +=
      ' vab-linienfahrt-halt-ausgewaehlt';
  }

  let meta = 'Fahrplanzeit';

  if (realtime) {
    meta =
      deviation
        ? `${deviation} · Echtzeit`
        : 'Echtzeit';
  }

  return `
    <div
      class="${rowClass}"
      data-vab-trip-stop-id="${vabRealtimeEscape(stopId)}"
      role="button"
      tabindex="0"
    >
      <div class="vab-linienfahrt-halt-name">
        ${vabRealtimeEscape(name)}

        ${
          index === selectedIndex
            ? `
              <span class="vab-linienfahrt-auswahlhinweis">
                ausgewählte Haltestelle
              </span>
            `
            : ''
        }
      </div>

      <div class="vab-linienfahrt-halt-zeit">
        <div class="vab-linienfahrt-uhrzeit">
          ${
            vabRealtimeEscape(
              vabRealtimeFormatTime(shownTime)
            ) || '–'
          }
        </div>

        <div class="${metaClass}">
          ${vabRealtimeEscape(meta)}
        </div>
      </div>
    </div>
  `;
}


function vabRealtimeMarkSelectedRow(
  container,
  stopId
) {
  if (!container || !stopId) {
    return;
  }

  for (
    const row
    of container.querySelectorAll(
      '[data-vab-trip-stop-id]'
    )
  ) {
    row.classList.remove(
      'vab-linienfahrt-halt-ausgewaehlt'
    );

    row.querySelector(
      '.vab-linienfahrt-auswahlhinweis'
    )?.remove();
  }

  const selectedRow =
    Array.from(
      container.querySelectorAll(
        '[data-vab-trip-stop-id]'
      )
    ).find(
      row =>
        vabRealtimeStopIdsMatch(
          row.dataset.vabTripStopId,
          stopId
        )
    );

  if (!selectedRow) {
    return;
  }

  selectedRow.classList.add(
    'vab-linienfahrt-halt-ausgewaehlt'
  );

  const name =
    selectedRow.querySelector(
      '.vab-linienfahrt-halt-name'
    );

  name?.insertAdjacentHTML(
    'beforeend',
    `
      <span class="vab-linienfahrt-auswahlhinweis">
        ausgewählte Haltestelle
      </span>
    `
  );
}


window.addEventListener(
  'vab-line-stop-focused',
  event => {
    const container =
      document.getElementById(
        'vab-linienfahrt-inhalt'
      );

    const stopId =
      event?.detail?.stopId;

    vabRealtimeMarkSelectedRow(
      container,
      stopId
    );
  }
);

const vabRealtimeDirectionCache =
  new Map();


async function vabRealtimeLoadDirectionForStop(
  stopId,
  line
) {
  const normalizedStopId =
    vabRealtimeNormalizeStopId(
      stopId
    );

  const cacheKey =
    `${String(line)}|${normalizedStopId}`;

  const cached =
    vabRealtimeDirectionCache.get(
      cacheKey
    );

  const now =
    Date.now();

  if (
    cached
    && now - cached.created < 30000
  ) {
    return cached.promise;
  }

  const promise =
    (async () => {
      const url =
        `${VAB_REALTIME_LINE_TRIP_URL}`
        + `?stop=${encodeURIComponent(stopId)}`
        + `&line=${encodeURIComponent(line)}`;

      const response =
        await fetch(
          url,
          {
            cache: 'no-store'
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error
          ?? `HTTP ${response.status}`
        );
      }

      const destination =
        data?.selectedTrip?.destination
        ?? data?.tripStopTimes?.leg
          ?.transportation
          ?.destination
          ?.name
        ?? '';

      return {
        destination,

        displayLine:
          data?.displayLine
          ?? String(line)
      };
    })();

  vabRealtimeDirectionCache.set(
    cacheKey,
    {
      created: now,
      promise
    }
  );

  try {
    return await promise;
  } catch (error) {
    vabRealtimeDirectionCache.delete(
      cacheKey
    );

    throw error;
  }
}


window.addEventListener(
  'vab-line-direction-request',
  async event => {
    const stopId =
      String(
        event?.detail?.stopId ?? ''
      );

    const line =
      String(
        event?.detail?.line ?? ''
      );

    const generation =
      Number(
        event?.detail?.generation ?? 0
      );

    if (!stopId || !line) {
      return;
    }

    try {
      const result =
        await vabRealtimeLoadDirectionForStop(
          stopId,
          line
        );

      if (!result.destination) {
        return;
      }

      window.dispatchEvent(
        new CustomEvent(
          'vab-line-direction-secondary',
          {
            detail: {
              stopId,

              line:
                result.displayLine,

              destination:
                result.destination,

              generation
            }
          }
        )
      );
    } catch (error) {
      console.warn(
        'Gegenrichtung konnte nicht geladen werden:',
        error
      );
    }
  }
);


window.vabRealtimeShowLineTrip =
  async function(stop, line) {
    const requestId =
      ++vabRealtimeLineTripRequestId;

    const header =
      document.getElementById(
        'vab-linienfahrt-kopf'
      );

    const content =
      document.getElementById(
        'vab-linienfahrt-inhalt'
      );

    if (
      !header
      || !content
      || !stop?.id
      || !line
    ) {
      return;
    }

    header.textContent =
      'Fahrtdaten werden geladen ...';

    content.innerHTML = `
      <div class="vab-linienfahrt-laden">
        Haltestellen und Echtzeitdaten werden geladen ...
      </div>
    `;

    try {
      const url =
        `${VAB_REALTIME_LINE_TRIP_URL}`
        + `?stop=${encodeURIComponent(stop.id)}`
        + `&line=${encodeURIComponent(line)}`;

      const response =
        await fetch(
          url,
          {
            cache: 'no-store'
          }
        );

      const data =
        await response.json();

      if (
        requestId
        !== vabRealtimeLineTripRequestId
      ) {
        return;
      }

      if (!response.ok) {
        throw new Error(
          data?.error
          ?? `HTTP ${response.status}`
        );
      }

      const leg =
        data?.tripStopTimes?.leg;

      const sequence =
        Array.isArray(leg?.stopSequence)
          ? leg.stopSequence
          : [];

      if (sequence.length === 0) {
        throw new Error(
          'Keine Haltestellenfolge vorhanden.'
        );
      }

      const destination =
        data?.selectedTrip?.destination
        ?? leg?.transportation?.destination?.name
        ?? 'Ziel nicht angegeben';

      const selectedIndex =
        sequence.findIndex(
          sequenceStop =>
            vabRealtimeIsSelectedStop(
              sequenceStop,
              stop.id
            )
        );

      const selectedSequenceStop =
        selectedIndex >= 0
          ? sequence[selectedIndex]
          : null;

      const selectedConcreteStopId =
        String(
          selectedSequenceStop?.id
          ?? selectedSequenceStop?.parent?.id
          ?? stop.id
          ?? ''
        );

      const lineName =
        data?.displayLine
        ?? String(line);

      const notifyDirection = stopId => {
        window.dispatchEvent(
          new CustomEvent(
            'vab-line-direction-focused',
            {
              detail: {
                stopId:
                  String(stopId ?? ''),

                line:
                  String(lineName ?? ''),

                requestLine:
                  String(line ?? ''),

                destination:
                  String(destination ?? '')
              }
            }
          )
        );
      };

      notifyDirection(
        selectedConcreteStopId
      );

      if (
        selectedConcreteStopId
        && typeof window.vabFocusStopInLine
        === 'function'
      ) {
        window.vabFocusStopInLine(
          selectedConcreteStopId
        );
      }

      header.innerHTML = `
        <div class="vab-linienfahrt-richtung">
          Linie ${vabRealtimeEscape(lineName)}
          · Richtung
          ${vabRealtimeEscape(destination)}
        </div>

        <div class="vab-linienfahrt-hinweis">
          Nächste konkrete Fahrt ab
          ${vabRealtimeEscape(stop.name)}.
          Angezeigt werden alle Haltestellen
          dieser Fahrt.
        </div>
      `;

      content.innerHTML = `
        <div class="vab-linienfahrt-liste">
          ${
            sequence
              .map(
                (sequenceStop, index) =>
                  vabRealtimeCreateStopRow(
                    sequenceStop,
                    index,
                    selectedIndex
                  )
              )
              .join('')
          }
        </div>
      `;

      for (
        const row
        of content.querySelectorAll(
          '[data-vab-trip-stop-id]'
        )
      ) {
        const activateStop = () => {
          const stopId =
            row.dataset.vabTripStopId;

          notifyDirection(stopId);

          vabRealtimeMarkSelectedRow(
            content,
            stopId
          );

          if (
            typeof window.vabFocusStopInLine
            === 'function'
          ) {
            window.vabFocusStopInLine(
              stopId
            );
          }
        };

        row.addEventListener(
          'click',
          activateStop
        );

        row.addEventListener(
          'keydown',
          event => {
            if (
              event.key === 'Enter'
              || event.key === ' '
            ) {
              event.preventDefault();
              activateStop();
            }
          }
        );
      }
      if (selectedIndex >= 0) {
        window.setTimeout(
          () => {
            const selectedRow =
              content.querySelector(
                '.vab-linienfahrt-halt-ausgewaehlt'
              );

            selectedRow?.scrollIntoView({
              block: 'center',
              inline: 'nearest'
            });
          },
          80
        );
      }
    } catch (error) {
      console.warn(
        'Linien-Echtzeit konnte nicht geladen werden:',
        error
      );

      if (
        requestId
        !== vabRealtimeLineTripRequestId
      ) {
        return;
      }

      header.textContent =
        `Linie ${String(line)}`;

      content.innerHTML = `
        <div class="vab-linienfahrt-fehler">
          Die aktuellen Fahrtdaten sind derzeit
          nicht verfügbar. Der reguläre PDF-Fahrplan
          bleibt weiterhin verfügbar.
        </div>
      `;
    }
  };


let vabRealtimeStoerungenCache = null;


window.vabRealtimeLoadStoerungen =
  async function() {
    const now = Date.now();

    if (
      vabRealtimeStoerungenCache
      && now - vabRealtimeStoerungenCache.created < 300000
    ) {
      return vabRealtimeStoerungenCache.data;
    }

    try {
      const response = await fetch(
        VAB_REALTIME_STOERUNGEN_URL,
        {
          cache: 'no-store'
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error
          ?? `HTTP ${response.status}`
        );
      }

      const normalized = {
        source:
          String(data?.source ?? ''),

        fetchedAt:
          String(data?.fetchedAt ?? ''),

        sourceTotal:
          Number(data?.sourceTotal ?? 0),

        activeCount:
          Number(data?.activeCount ?? 0),

        announcements:
          Array.isArray(data?.announcements)
            ? data.announcements
            : []
      };

      vabRealtimeStoerungenCache = {
        created: now,
        data: normalized
      };

      return normalized;
    } catch (error) {
      console.warn(
        'VAB-Stoerungsmeldungen konnten nicht geladen werden:',
        error
      );

      return {
        source: '',
        fetchedAt: '',
        sourceTotal: 0,
        activeCount: 0,
        announcements: []
      };
    }
  };