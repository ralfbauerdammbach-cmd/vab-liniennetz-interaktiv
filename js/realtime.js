'use strict';

const VAB_REALTIME_LINE_TRIP_URL =
  'https://vab-realtime.bauer-48e.workers.dev/line-trip';

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


function vabRealtimeIsSelectedStop(
  sequenceStop,
  selectedStopId
) {
  const platformId =
    String(sequenceStop?.id ?? '');

  const parentId =
    String(sequenceStop?.parent?.id ?? '');

  const selected =
    String(selectedStopId ?? '');

  return (
    parentId === selected
    || platformId === selected
    || platformId.startsWith(
      `${selected}:`
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
      sequenceStop?.parent?.id
      ?? sequenceStop?.id
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

        <div class="vab-linienfahrt-meta">
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
        row.dataset.vabTripStopId
        === String(stopId)
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

      const lineName =
        data?.displayLine
        ?? String(line);

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
