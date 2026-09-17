'use strict';

const VAB_REALTIME_URL =
  'https://vab-realtime.bauer-48e.workers.dev/departures';

let vabRealtimeRequestId = 0;

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
      timeZone: 'Europe/Berlin'
    }
  ).format(date);
}

function vabRealtimeGetLine(event) {
  return String(
    event?.transportation?.disassembledName
    ?? event?.transportation?.number
    ?? event?.transportation?.name
    ?? ''
  ).trim();
}

function vabRealtimeGetDestination(event) {
  return String(
    event?.transportation?.destination?.name
    ?? 'Richtung nicht angegeben'
  ).trim();
}

function vabRealtimeIsCancelled(event) {
  if (
    event?.isCancelled === true
    || event?.cancelled === true
  ) {
    return true;
  }

  const statuses =
    Array.isArray(event?.realtimeStatus)
      ? event.realtimeStatus
      : [];

  return statuses.some(status =>
    /CANCEL|CANCELED|CANCELLED|DELETED|REMOVED/i
      .test(String(status))
  );
}

function vabRealtimeCreateDepartureHtml(event) {
  const line = vabRealtimeGetLine(event);
  const destination = vabRealtimeGetDestination(event);

  const planned =
    event?.departureTimePlanned
    ?? event?.departureTimeBaseTimetable
    ?? '';

  const estimated =
    event?.departureTimeEstimated
    ?? '';

  const realtime =
    event?.isRealtimeControlled === true
    && Boolean(estimated);

  const cancelled =
    vabRealtimeIsCancelled(event);

  const shownTime =
    realtime
      ? estimated
      : planned;

  let deviation = '';

  if (cancelled) {
    deviation = 'entfällt';
  } else if (realtime && planned && estimated) {
    const plannedMs = new Date(planned).getTime();
    const estimatedMs = new Date(estimated).getTime();

    if (
      Number.isFinite(plannedMs)
      && Number.isFinite(estimatedMs)
    ) {
      const difference =
        Math.round(
          (estimatedMs - plannedMs) / 60000
        );

      if (difference === 0) {
        deviation = 'pünktlich';
      } else if (difference > 0) {
        deviation = `+${difference} min`;
      } else {
        deviation = `${difference} min`;
      }
    }
  }

  return `
    <div class="vab-echtzeit-fahrt">
      <div class="vab-echtzeit-kopf">
        <span class="vab-echtzeit-linie">
          ${escapeHtml(line)}
        </span>

        <span class="vab-echtzeit-ziel">
          ${escapeHtml(destination)}
        </span>
      </div>

      <div class="vab-echtzeit-zeitzeile">
        <span class="vab-echtzeit-uhrzeit">
          ${escapeHtml(vabRealtimeFormatTime(shownTime))}
        </span>

        ${
          deviation
            ? `
              <span class="vab-echtzeit-abweichung">
                ${escapeHtml(deviation)}
              </span>
            `
            : ''
        }
      </div>

      <div class="vab-echtzeit-status">
        ${realtime ? 'Echtzeit' : 'Fahrplanzeit'}
      </div>
    </div>
  `;
}

async function vabRealtimeLoad(stop) {
  const container =
    document.getElementById('vab-echtzeit-inhalt');

  if (!container || !stop?.id) {
    return;
  }

  const requestId =
    ++vabRealtimeRequestId;

  container.innerHTML = `
    <div class="vab-echtzeit-laden">
      Echtzeitdaten werden geladen ...
    </div>
  `;

  try {
    const url =
      `${VAB_REALTIME_URL}?stop=`
      + encodeURIComponent(stop.id);

    const response = await fetch(
      url,
      {
        cache: 'no-store'
      }
    );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    const data =
      await response.json();

    if (
      requestId !== vabRealtimeRequestId
      || !document.body.contains(container)
    ) {
      return;
    }

    const events =
      Array.isArray(data?.stopEvents)
        ? data.stopEvents
        : [];

    if (events.length === 0) {
      container.innerHTML = `
        <div class="vab-echtzeit-leer">
          Derzeit keine Abfahrten gefunden.
        </div>
      `;

      return;
    }

    container.innerHTML =
      events
        .slice(0, 8)
        .map(vabRealtimeCreateDepartureHtml)
        .join('');
  } catch (error) {
    console.warn(
      'Echtzeitdaten konnten nicht geladen werden:',
      error
    );

    if (
      requestId !== vabRealtimeRequestId
      || !document.body.contains(container)
    ) {
      return;
    }

    container.innerHTML = `
      <div class="vab-echtzeit-fehler">
        Echtzeitdaten sind derzeit nicht verfügbar.
      </div>
    `;
  }
}

if (typeof window.vabShowStop === 'function') {
  const originalVabShowStop =
    window.vabShowStop;

  window.vabShowStop = function(stop) {
    originalVabShowStop(stop);

    if (!stop) {
      return;
    }

    const panel =
      document.querySelector(
        '#info-panel-inhalt .vab-suche-panel'
      );

    const firstSection =
      panel?.querySelector(
        '.vab-suche-panel-bereich'
      );

    if (!panel || !firstSection) {
      return;
    }

    const realtimeSection =
      document.createElement('section');

    realtimeSection.className =
      'vab-suche-panel-bereich vab-echtzeit-bereich';

    realtimeSection.innerHTML = `
      <h3>Nächste Abfahrten</h3>

      <div id="vab-echtzeit-inhalt">
        <div class="vab-echtzeit-laden">
          Echtzeitdaten werden geladen ...
        </div>
      </div>
    `;

    panel.insertBefore(
      realtimeSection,
      firstSection
    );

    vabRealtimeLoad(stop);
  };
}
