export default {
  async fetch(request) {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=15"
    };

    if (url.pathname === "/departures") {
      const stop = url.searchParams.get("stop");

      if (!stop || !stop.startsWith("de:")) {
        return Response.json(
          { error: "Haltestellen-ID fehlt oder ist ungültig." },
          {
            status: 400,
            headers: corsHeaders
          }
        );
      }

      const defasUrl = new URL(
        "https://bayfp.defas-fgi.de/AMINA/XML_DM_REQUEST"
      );

      defasUrl.searchParams.set("outputFormat", "rapidJSON");
      defasUrl.searchParams.set("language", "de");
      defasUrl.searchParams.set("mode", "direct");
      defasUrl.searchParams.set("type_dm", "any");
      defasUrl.searchParams.set("name_dm", stop);
      defasUrl.searchParams.set("useRealtime", "1");
      defasUrl.searchParams.set("limit", "8");
      defasUrl.searchParams.set("deleteAssignedStops_dm", "1");
      defasUrl.searchParams.set("hideBannerInfo", "1");

      try {
        const response = await fetch(defasUrl.toString());

        if (!response.ok) {
          throw new Error(`DEFAS ${response.status}`);
        }

        const data = await response.text();

        return new Response(data, {
          status: 200,
          headers: corsHeaders
        });
      } catch (error) {
        return Response.json(
          { error: "Echtzeitdaten derzeit nicht erreichbar." },
          {
            status: 502,
            headers: corsHeaders
          }
        );
      }
    }

    if (url.pathname === "/line-trip") {
      const stop = url.searchParams.get("stop");

      const requestedLine = String(
        url.searchParams.get("line") ?? ""
      ).trim();

      if (!stop || !stop.startsWith("de:") || !requestedLine) {
        return Response.json(
          {
            error: "Haltestelle oder Linie fehlt."
          },
          {
            status: 400,
            headers: corsHeaders
          }
        );
      }

      try {
        const dmUrl = new URL(
          "https://bayfp.defas-fgi.de/AMINA/XML_DM_REQUEST"
        );

        dmUrl.searchParams.set("outputFormat", "rapidJSON");
        dmUrl.searchParams.set("language", "de");
        dmUrl.searchParams.set("mode", "direct");
        dmUrl.searchParams.set("type_dm", "any");
        dmUrl.searchParams.set("name_dm", stop);
        dmUrl.searchParams.set("useRealtime", "1");
        dmUrl.searchParams.set("limit", "100");
        dmUrl.searchParams.set("deleteAssignedStops_dm", "1");
        dmUrl.searchParams.set("hideBannerInfo", "1");

        const dmResponse = await fetch(dmUrl.toString());

        if (!dmResponse.ok) {
          throw new Error(`DM ${dmResponse.status}`);
        }

        const dmData = await dmResponse.json();

        const events =
          Array.isArray(dmData?.stopEvents)
            ? dmData.stopEvents
            : [];

        const displayLine =
          requestedLine === "20RMV"
            ? "20"
            : requestedLine;

        const trip =
          events.find(event => {
            const eventNumber = String(
              event?.transportation?.number ?? ""
            ).trim();

            const eventDisassembledName = String(
              event?.transportation?.disassembledName ?? ""
            ).trim();

            return (
              eventNumber === displayLine ||
              eventDisassembledName === displayLine
            );
          });

        if (!trip) {
          return Response.json(
            {
              error:
                `Keine kommende Fahrt der Linie ${displayLine} gefunden.`
            },
            {
              status: 404,
              headers: corsHeaders
            }
          );
        }

        const efaLine =
          trip?.transportation?.id;

        const tripCode =
          trip?.transportation?.properties?.tripCode;

        const planned =
          trip?.departureTimePlanned
          ?? trip?.departureTimeBaseTimetable;

        if (!efaLine || tripCode == null || !planned) {
          return Response.json(
            {
              error:
                "DEFAS liefert nicht alle benötigten Fahrtdaten.",
              trip
            },
            {
              status: 502,
              headers: corsHeaders
            }
          );
        }

        const dateObject = new Date(planned);

        const parts =
          new Intl.DateTimeFormat(
            "de-DE",
            {
              timeZone: "Europe/Berlin",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              hourCycle: "h23"
            }
          ).formatToParts(dateObject);

        const values = {};

        for (const part of parts) {
          values[part.type] = part.value;
        }

        const efaDate =
          `${values.year}${values.month}${values.day}`;

        const efaTime =
          `${values.hour}${values.minute}`;

        const tripUrl = new URL(
          "https://bayfp.defas-fgi.de/AMINA/XML_TRIPSTOPTIMES_REQUEST"
        );

        tripUrl.searchParams.set(
          "outputFormat",
          "rapidJSON"
        );

        tripUrl.searchParams.set(
          "language",
          "de"
        );

        tripUrl.searchParams.set(
          "line",
          efaLine
        );

        tripUrl.searchParams.set(
          "stopID",
          stop
        );

        tripUrl.searchParams.set(
          "tripCode",
          String(tripCode)
        );

        tripUrl.searchParams.set(
          "date",
          efaDate
        );

        tripUrl.searchParams.set(
          "time",
          efaTime
        );

        tripUrl.searchParams.set(
          "tStOTType",
          "ALL"
        );

        tripUrl.searchParams.set(
          "useRealtime",
          "1"
        );

        const tripResponse =
          await fetch(tripUrl.toString());

        const tripText =
          await tripResponse.text();

        let tripData;

        try {
          tripData = JSON.parse(tripText);
        } catch {
          tripData = {
            raw: tripText
          };
        }

        return Response.json(
          {
            requestedLine,
            displayLine,
            selectedTrip: {
              line: efaLine,
              tripCode,
              planned,
              estimated:
                trip?.departureTimeEstimated ?? null,
              destination:
                trip?.transportation?.destination?.name
                ?? null,
              realtime:
                trip?.isRealtimeControlled === true
            },
            requestParameters: {
              stopID: stop,
              line: efaLine,
              tripCode,
              date: efaDate,
              time: efaTime
            },
            tripStopTimesStatus:
              tripResponse.status,
            tripStopTimes:
              tripData
          },
          {
            status: tripResponse.ok ? 200 : 502,
            headers: corsHeaders
          }
        );

      } catch (error) {
        return Response.json(
          {
            error:
              "Fahrtverlauf konnte nicht geladen werden.",
            detail:
              String(error?.message ?? error)
          },
          {
            status: 502,
            headers: corsHeaders
          }
        );
      }
    }

    if (url.pathname === "/stoerungen") {
      const stoerungenHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=300"
      };

      try {
        const vabUrl = "https://www.vab-info.de/stoerungen";

        const response = await fetch(vabUrl, {
          headers: {
            "Accept": "text/html,application/xhtml+xml"
          }
        });

        if (!response.ok) {
          throw new Error(`VAB ${response.status}`);
        }

        const html = await response.text();

        const nextDataMatch = html.match(
          /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
        );

        if (!nextDataMatch) {
          throw new Error("__NEXT_DATA__ nicht gefunden.");
        }

        const nextData = JSON.parse(nextDataMatch[1]);

        const announcements = Array.isArray(
          nextData?.props?.pageProps?.announcements
        )
          ? nextData.props.pageProps.announcements
          : [];

        const sourceTotal =
          Number(nextData?.props?.pageProps?.total) ||
          announcements.length;

        function descriptionToText(value) {
          return String(value ?? "")
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;/gi, " ")
            .replace(/&amp;/gi, "&")
            .replace(/&quot;/gi, '"')
            .replace(/&#39;|&#039;/gi, "'")
            .replace(/&lt;/gi, "<")
            .replace(/&gt;/gi, ">")
            .replace(/\s+/g, " ")
            .trim();
        }

        function collectLines(announcement) {
          const values = [
            announcement?.lineNumber,
            announcement?.title,
            ...(
              Array.isArray(announcement?.linies)
                ? announcement.linies.map(line => line?.name)
                : []
            ),
            descriptionToText(announcement?.description)
          ];

          const result = new Set();

          const groupPattern =
            /\bLinie(?:n)?\s+((?:[A-Z0-9]*\d[A-Z0-9]*)(?:\s*(?:,|und|\/|&)\s*(?:[A-Z0-9]*\d[A-Z0-9]*))*)/gi;

          const tokenPattern =
            /[A-Z0-9]*\d[A-Z0-9]*/gi;

          for (const value of values) {
            const valueText = String(value ?? "");

            for (const match of valueText.matchAll(groupPattern)) {
              const tokens = match[1].match(tokenPattern) ?? [];

              for (const token of tokens) {
                result.add(token.toUpperCase());
              }
            }
          }

          return [...result].sort(
            (a, b) =>
              a.localeCompare(
                b,
                "de",
                { numeric: true }
              )
          );
        }

        const now = Date.now();

        const activeAnnouncements = announcements
          .filter(announcement => {
            const startTime =
              announcement?.startDate
                ? Date.parse(announcement.startDate)
                : NaN;

            const endTime =
              announcement?.endDate
                ? Date.parse(announcement.endDate)
                : NaN;

            if (
              Number.isFinite(startTime) &&
              now < startTime
            ) {
              return false;
            }

            if (
              Number.isFinite(endTime) &&
              now >= endTime
            ) {
              return false;
            }

            return true;
          })
          .map(announcement => ({
            id: announcement?.id ?? null,
            lines: collectLines(announcement),
            lineNumber: announcement?.lineNumber ?? null,
            lineType: announcement?.lineType ?? null,
            status: announcement?.status ?? null,
            statusType: announcement?.statusType ?? null,
            title: String(announcement?.title ?? "").trim(),
            description: descriptionToText(
              announcement?.description
            ),
            startDate: announcement?.startDate ?? null,
            endDate: announcement?.endDate ?? null,
            publishedAt: announcement?.publishedAt ?? null,
            ctaLabel: announcement?.ctaLabel ?? null,
            ctaUrl: announcement?.ctaUrl ?? null,
            documentUrl: announcement?.dokumentUrl ?? null
          }));

        return Response.json(
          {
            source: vabUrl,
            fetchedAt: new Date().toISOString(),
            sourceTotal,
            activeCount: activeAnnouncements.length,
            announcements: activeAnnouncements
          },
          {
            status: 200,
            headers: stoerungenHeaders
          }
        );
      } catch (error) {
        return Response.json(
          {
            error:
              "VAB-Stoerungsmeldungen konnten nicht geladen werden.",
            detail:
              String(error?.message ?? error)
          },
          {
            status: 502,
            headers: stoerungenHeaders
          }
        );
      }
    }
    return new Response(
      "Not found",
      {
        status: 404,
        headers: corsHeaders
      }
    );
  }
};

