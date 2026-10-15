'use strict';

const statusElement = document.getElementById('status');
const infoPanel = document.getElementById('info-panel');
const infoPanelInhalt = document.getElementById('info-panel-inhalt');
const infoPanelSchliessen = document.getElementById('info-panel-schliessen');

const vabSucheFormular =
  document.getElementById('vab-suche-formular');

const vabSucheEingabe =
  document.getElementById('vab-suche-eingabe');

const vabSucheButton =
  document.querySelector('.vab-suche-button');

const vabSucheVorschlaege =
  document.getElementById('vab-suche-vorschlaege');

function setStatus(text, type = '') {
  /*
   * Der technische Statusblock wird im öffentlichen
   * Kopfbereich nicht mehr angezeigt.
   */
  if (!statusElement) {
    return;
  }

  statusElement.textContent = text;
  statusElement.className = 'status';

  if (type) {
    statusElement.classList.add(type);
  }
}

const karte = L.map('karte', {
  zoomControl: true,
  preferCanvas: true,

  /*
   * Zoomen erfolgt immer zur Kartenmitte.
   * Dadurch bleibt ein mittig positionierter Ort
   * beim Rein- und Herauszoomen im Mittelpunkt.
   */
  /*
   * Das standardmäßige Leaflet-Mausradzoomen wird
   * deaktiviert. Weiter unten übernimmt eine eigene
   * Steuerung mit kleinen 0,1-Zoomschritten.
   */
  scrollWheelZoom: false,
  doubleClickZoom: 'center',
  touchZoom: 'center',
  zoomSnap: 0.1
}).setView([49.97, 9.15], 9);

// Zoom-Schaltflaechen unten links, damit die verschiebbare Gebietsueberschrift sie nicht verdeckt.
karte.zoomControl.setPosition('bottomleft');

const vabKartenLegende = L.control({
  position: 'bottomright'
});

vabKartenLegende.onAdd = function() {
  const div = L.DomUtil.create(
    'div',
    'vab-kartenlegende'
  );

  div.innerHTML = `
    <div class="vab-kartenlegende-nord">
      <span class="vab-nordpfeil">↑</span>
      <strong>N</strong>
    </div>

    <div class="vab-kartenlegende-zeile">
      <span class="vab-legende-linie vab-legende-linie-netz"></span>
      <span>Liniennetz</span>
    </div>

    <div class="vab-kartenlegende-zeile">
      <span class="vab-legende-linie vab-legende-linie-auswahl"></span>
      <span>Ausgewählte Linie</span>
    </div>

    <div class="vab-kartenlegende-zeile">
      <span class="vab-legende-h">H</span>
      <span>Haltestelle</span>
    </div>
  `;

  L.DomEvent.disableClickPropagation(div);
  L.DomEvent.disableScrollPropagation(div);

  return div;
};

vabKartenLegende.addTo(karte);


/*
 * Eigenes, sehr fein abgestuftes Mausradzoomen.
 *
 * Entscheidend:
 * - Die aktuelle Kartenmitte wird vor jedem Zoom
 *   gespeichert.
 * - Nach dem Zoom wird exakt dieselbe geografische
 *   Position wieder als Kartenmitte gesetzt.
 * - Die Mausposition hat keinen Einfluss auf den
 *   Mittelpunkt.
 */
const karteContainer =
  karte.getContainer();

let mausradZoomAccumulator = 0;
let letzterMausradZoomZeitpunkt = 0;

karteContainer.addEventListener(
  'wheel',
  event => {
    event.preventDefault();
    event.stopPropagation();

    mausradZoomAccumulator +=
      Number(event.deltaY) || 0;

    const schwelle = 80;

    if (
      Math.abs(mausradZoomAccumulator)
      < schwelle
    ) {
      return;
    }

    const jetzt = performance.now();

    /*
     * Sehr schnelle Mehrfachereignisse von Maus
     * oder Touchpad werden gebremst.
     */
    if (
      jetzt - letzterMausradZoomZeitpunkt
      < 45
    ) {
      return;
    }

    letzterMausradZoomZeitpunkt = jetzt;

    const richtung =
      mausradZoomAccumulator < 0
        ? 1
        : -1;

    mausradZoomAccumulator = 0;

    const aktuelleMitte =
      karte.getCenter();

    const aktuellerZoom =
      karte.getZoom();

    const zoomSchritt = 0.2;

    const neuerZoom = Math.min(
      karte.getMaxZoom(),
      Math.max(
        karte.getMinZoom(),
        Number(
          (
            aktuellerZoom
            + richtung * zoomSchritt
          ).toFixed(1)
        )
      )
    );

    if (neuerZoom === aktuellerZoom) {
      return;
    }

    karte.setView(
      aktuelleMitte,
      neuerZoom,
      {
        animate: false,
        reset: true
      }
    );
  },
  {
    passive: false
  }
);


L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap-Mitwirkende'
  }
).addTo(karte);

L.control.scale({
  imperial: false,
  position: 'bottomleft'
}).addTo(karte);

/*
 * VAB-Kerngebiet aus amtlichen ALKIS-Verwaltungsgrenzen,
 * Bayerische Vermessungsverwaltung, CC BY 4.0.
 * Stadt Aschaffenburg (09661), LK Aschaffenburg (09671),
 * LK Miltenberg (09676). Stand 30.09.2026.
 * Vereinigt und fuer die Kartenanzeige auf 75 m vereinfacht.
 * Die vollstaendige Originalgeometrie wurde vom Nutzer geliefert.
 */
karte.createPane('vabGebietPane');
karte.getPane('vabGebietPane').style.zIndex = 390;
karte.getPane('vabGebietPane').style.pointerEvents = 'none';
const vabGebiet = {"type":"Feature","properties":{"name":"VAB-Gebiet","source":"Bayerische Vermessungsverwaltung, CC BY 4.0","stand":"2026-09-30"},"geometry":{"type":"Polygon","coordinates":[[[9.10206,49.58025],[9.09175,49.58887],[9.08837,49.59688],[9.08316,49.60179],[9.07406,49.60067],[9.06649,49.60231],[9.06841,49.61095],[9.06483,49.6167],[9.06876,49.62262],[9.0797,49.62923],[9.08084,49.63257],[9.08601,49.63568],[9.09238,49.63536],[9.10219,49.6426],[9.09928,49.64567],[9.10089,49.64905],[9.09955,49.65343],[9.10381,49.66003],[9.08869,49.66897],[9.08824,49.6903],[9.08965,49.69317],[9.0952,49.6961],[9.11626,49.69756],[9.12772,49.70035],[9.1273,49.70672],[9.12376,49.70641],[9.12123,49.71464],[9.13156,49.71463],[9.13464,49.71638],[9.1361,49.72409],[9.14083,49.72905],[9.14381,49.73699],[9.15058,49.74268],[9.14374,49.74514],[9.14497,49.74747],[9.12773,49.75524],[9.11196,49.75667],[9.10689,49.75874],[9.11059,49.76626],[9.11352,49.76724],[9.11204,49.76944],[9.11326,49.77379],[9.11733,49.77374],[9.12325,49.77673],[9.12779,49.7764],[9.13457,49.7823],[9.12908,49.78773],[9.12945,49.79298],[9.13215,49.79419],[9.12784,49.79581],[9.1082,49.798],[9.09428,49.79008],[9.09062,49.79075],[9.09033,49.79603],[9.08703,49.79942],[9.08631,49.80658],[9.07717,49.81836],[9.0819,49.82412],[9.08691,49.82662],[9.08564,49.82911],[9.08297,49.82953],[9.08306,49.83266],[9.07782,49.83463],[9.08246,49.83904],[9.08984,49.84113],[9.08526,49.84768],[9.0713,49.83637],[9.07033,49.83333],[9.06518,49.83184],[9.05843,49.83272],[9.05614,49.83456],[9.05931,49.83871],[9.05929,49.84101],[9.05385,49.83924],[9.05312,49.83986],[9.0544,49.84031],[9.05399,49.84276],[9.06063,49.84552],[9.06011,49.84617],[9.05406,49.84554],[9.05018,49.84209],[9.0455,49.8422],[9.04339,49.84403],[9.04157,49.83993],[9.0378,49.84262],[9.03612,49.84638],[9.04062,49.84735],[9.04319,49.85008],[9.04373,49.85549],[9.03379,49.8604],[9.03322,49.86658],[9.03668,49.86722],[9.03817,49.86555],[9.04211,49.86632],[9.04355,49.86794],[9.04798,49.86618],[9.05031,49.86624],[9.05052,49.86729],[9.04586,49.86968],[9.03761,49.8781],[9.03782,49.89218],[9.03569,49.89938],[9.0336,49.89935],[9.0314,49.90131],[9.03276,49.90139],[9.03103,49.90396],[9.03267,49.9044],[9.02999,49.90583],[9.03203,49.90948],[9.02458,49.90934],[9.02337,49.91014],[9.03223,49.92459],[9.02916,49.92749],[9.02963,49.93153],[9.02626,49.9363],[9.02543,49.94565],[9.01907,49.94684],[9.02669,49.95509],[9.02414,49.9586],[9.02323,49.96567],[9.01894,49.97465],[9.02009,49.98541],[9.01416,49.99138],[9.02291,49.99703],[9.02956,49.99249],[9.03115,49.98856],[9.04517,49.98805],[9.05137,49.99305],[9.0511,49.99462],[9.04653,49.99862],[9.03806,50.00018],[9.03521,50.00433],[9.03504,50.00639],[9.03945,50.01037],[9.03271,50.01707],[9.0305,50.02173],[9.02977,50.02645],[9.03251,50.03656],[9.02954,50.04086],[9.02416,50.04364],[9.01098,50.04576],[9.00163,50.04486],[8.99042,50.0417],[8.98553,50.04176],[8.97785,50.0459],[8.97673,50.05211],[8.98298,50.05676],[8.99143,50.06836],[8.99331,50.06718],[8.99567,50.069],[8.9993,50.06934],[8.99769,50.09273],[9.00911,50.10519],[9.01837,50.11154],[9.04675,50.11571],[9.06568,50.11704],[9.07151,50.11947],[9.07714,50.11594],[9.08931,50.11705],[9.09284,50.12015],[9.09457,50.12012],[9.09735,50.12493],[9.11852,50.12662],[9.14284,50.11465],[9.14588,50.11433],[9.15376,50.11771],[9.15591,50.11135],[9.15399,50.10707],[9.15056,50.10502],[9.14209,50.09542],[9.14872,50.09026],[9.1552,50.09507],[9.1594,50.09529],[9.15983,50.09701],[9.16251,50.09823],[9.15917,50.09999],[9.16031,50.10217],[9.16339,50.10561],[9.16587,50.1064],[9.16761,50.10992],[9.1748,50.11408],[9.17295,50.11618],[9.1742,50.11938],[9.18678,50.12396],[9.18991,50.12628],[9.19029,50.12871],[9.18854,50.13139],[9.18509,50.13323],[9.18316,50.138],[9.19474,50.13858],[9.19868,50.14118],[9.21023,50.14282],[9.21181,50.14669],[9.21873,50.14653],[9.2215,50.14945],[9.2273,50.14713],[9.23614,50.14616],[9.25314,50.13939],[9.25929,50.1386],[9.26643,50.13948],[9.27072,50.14216],[9.27401,50.14274],[9.28578,50.14157],[9.29414,50.13944],[9.30744,50.13332],[9.31618,50.13589],[9.3234,50.14062],[9.32727,50.14117],[9.33653,50.13689],[9.34009,50.13227],[9.34231,50.13137],[9.35178,50.13061],[9.3697,50.13165],[9.37642,50.13052],[9.37587,50.12602],[9.38293,50.11926],[9.39459,50.09759],[9.40465,50.08759],[9.3965,50.08367],[9.3948,50.08584],[9.39025,50.08634],[9.37283,50.08291],[9.38967,50.08586],[9.39391,50.08517],[9.39425,50.08289],[9.40269,50.07684],[9.40237,50.07395],[9.40685,50.07124],[9.41182,50.06517],[9.41227,50.06104],[9.40922,50.0609],[9.40967,50.06575],[9.40239,50.07152],[9.39092,50.07118],[9.3926,50.06859],[9.39013,50.06423],[9.38804,50.06481],[9.38417,50.06308],[9.38561,50.06324],[9.38786,50.0607],[9.38531,50.05366],[9.38743,50.05278],[9.38843,50.04969],[9.39928,50.0489],[9.40163,50.05218],[9.40829,50.05216],[9.40967,50.05491],[9.40888,50.05836],[9.41209,50.0591],[9.41354,50.05336],[9.41673,50.05237],[9.42238,50.04681],[9.41668,50.04686],[9.40632,50.0498],[9.40389,50.04931],[9.40557,50.04581],[9.40907,50.04412],[9.40571,50.04109],[9.39672,50.04622],[9.39534,50.04548],[9.40298,50.03637],[9.40541,50.035],[9.41675,50.03385],[9.41883,50.03187],[9.41603,50.0307],[9.40259,50.03191],[9.40251,50.02787],[9.40482,50.02351],[9.40977,50.02192],[9.41302,50.01865],[9.42157,50.02337],[9.43526,50.01924],[9.42891,50.01757],[9.42888,50.01674],[9.4221,50.01634],[9.41408,50.01209],[9.40801,50.01242],[9.40369,50.01536],[9.39894,50.01473],[9.39933,50.01282],[9.39475,50.01184],[9.39627,50.00149],[9.39602,50],[9.39399,49.99949],[9.3962,49.9993],[9.39703,49.99667],[9.39472,49.99582],[9.40022,49.99526],[9.39688,49.99791],[9.39575,50.00854],[9.39775,50.01109],[9.40768,50.01061],[9.41295,50.0091],[9.41153,50.00732],[9.41387,50.00329],[9.40924,50.00124],[9.40808,49.9969],[9.41086,49.99341],[9.41708,49.99172],[9.41748,49.99062],[9.41757,49.99183],[9.42353,49.99208],[9.43074,49.99104],[9.43821,49.98034],[9.4439,49.97575],[9.44137,49.96221],[9.44889,49.95129],[9.45241,49.94908],[9.467,49.9501],[9.4757,49.94608],[9.48337,49.94976],[9.48606,49.94928],[9.4842,49.94507],[9.48597,49.94369],[9.48249,49.94531],[9.48209,49.94384],[9.4754,49.94137],[9.46859,49.93609],[9.46762,49.93102],[9.46365,49.92797],[9.46589,49.92436],[9.4639,49.92091],[9.46502,49.91691],[9.45988,49.92259],[9.45374,49.92654],[9.43942,49.91941],[9.42489,49.91691],[9.42233,49.91769],[9.43101,49.9117],[9.43115,49.90834],[9.42673,49.89979],[9.43495,49.89042],[9.43371,49.88718],[9.43476,49.88395],[9.4262,49.88185],[9.43543,49.87973],[9.43667,49.87841],[9.43764,49.87243],[9.43589,49.87319],[9.44039,49.86851],[9.43918,49.8659],[9.45018,49.85057],[9.45914,49.84541],[9.46588,49.84317],[9.46562,49.84225],[9.47766,49.84],[9.47975,49.83849],[9.47755,49.8388],[9.47615,49.8365],[9.46421,49.8394],[9.45101,49.84501],[9.44232,49.85226],[9.43808,49.85147],[9.43585,49.84867],[9.43326,49.84782],[9.43465,49.84454],[9.44113,49.84146],[9.44415,49.83766],[9.45159,49.83405],[9.45417,49.83099],[9.45373,49.827],[9.44656,49.82108],[9.44744,49.81603],[9.4532,49.81066],[9.4669,49.80723],[9.46997,49.79952],[9.46871,49.79424],[9.47025,49.78875],[9.46536,49.7812],[9.47017,49.78056],[9.46922,49.77743],[9.46699,49.77485],[9.46198,49.77249],[9.46217,49.77049],[9.4585,49.76952],[9.45397,49.76993],[9.44422,49.77413],[9.43527,49.78712],[9.43074,49.78893],[9.42346,49.78959],[9.41803,49.7873],[9.4043,49.77668],[9.39067,49.77024],[9.38417,49.77202],[9.37693,49.77766],[9.37039,49.7792],[9.368,49.77872],[9.36178,49.77345],[9.35129,49.76916],[9.34138,49.76845],[9.3248,49.76944],[9.31724,49.76859],[9.31352,49.76605],[9.31344,49.76004],[9.32286,49.74933],[9.32292,49.74367],[9.31983,49.74123],[9.31613,49.74022],[9.29567,49.74046],[9.29604,49.7386],[9.30494,49.73634],[9.3123,49.73468],[9.31647,49.73525],[9.32298,49.73106],[9.33104,49.73219],[9.33579,49.73401],[9.34153,49.73417],[9.35745,49.73093],[9.3637,49.73159],[9.374,49.72804],[9.36648,49.72605],[9.36357,49.72375],[9.34973,49.7216],[9.34423,49.71868],[9.34411,49.71714],[9.34586,49.71653],[9.35252,49.71664],[9.35329,49.70729],[9.3576,49.70414],[9.36884,49.70351],[9.38069,49.7054],[9.38006,49.70627],[9.38281,49.70881],[9.38289,49.71893],[9.38034,49.72614],[9.38645,49.72829],[9.38568,49.73193],[9.39984,49.72965],[9.40141,49.7207],[9.40352,49.72027],[9.40777,49.72191],[9.4096,49.71775],[9.41561,49.71245],[9.41869,49.71178],[9.42042,49.70664],[9.41764,49.7058],[9.41676,49.70217],[9.41845,49.6974],[9.42232,49.69614],[9.41929,49.69393],[9.42071,49.69091],[9.41931,49.68927],[9.41301,49.68314],[9.40625,49.67942],[9.41301,49.67743],[9.41215,49.67549],[9.40295,49.67523],[9.39694,49.67191],[9.40652,49.66531],[9.41277,49.66285],[9.41191,49.66087],[9.41948,49.65887],[9.41643,49.65376],[9.4061,49.64546],[9.39269,49.64587],[9.38229,49.64295],[9.36741,49.65524],[9.36676,49.65839],[9.3634,49.65525],[9.35355,49.65061],[9.3487,49.64966],[9.34308,49.64424],[9.3355,49.64469],[9.33043,49.64724],[9.31846,49.65018],[9.31358,49.6537],[9.30405,49.65492],[9.3065,49.65074],[9.29929,49.64847],[9.29757,49.64667],[9.29083,49.64404],[9.28538,49.63579],[9.27816,49.63772],[9.2718,49.63476],[9.27544,49.63145],[9.27044,49.62643],[9.27572,49.62437],[9.27777,49.62022],[9.28352,49.61751],[9.28512,49.61481],[9.26462,49.6068],[9.2648,49.60181],[9.26039,49.59833],[9.25927,49.59323],[9.25514,49.59432],[9.25026,49.59394],[9.24621,49.58981],[9.24888,49.58784],[9.24914,49.58466],[9.24496,49.5845],[9.2412,49.58296],[9.24044,49.58146],[9.23347,49.58121],[9.23305,49.58016],[9.23,49.58047],[9.22284,49.5779],[9.22,49.57818],[9.21401,49.57653],[9.21092,49.57792],[9.20582,49.57606],[9.20069,49.57659],[9.19456,49.5739],[9.18733,49.57688],[9.18074,49.57375],[9.17379,49.57788],[9.16487,49.57541],[9.15915,49.57964],[9.15273,49.57969],[9.1525,49.57864],[9.14415,49.57816],[9.1436,49.57638],[9.14161,49.57725],[9.13717,49.57561],[9.13125,49.57575],[9.12053,49.5735],[9.11478,49.57481],[9.10835,49.57922],[9.10273,49.57749],[9.10206,49.58025]]]}};
L.geoJSON(vabGebiet, {
  pane: 'vabGebietPane',
  interactive: false,
  style: {
    color: '#12366c',
    weight: 1.5,
    opacity: 1,
    fillColor: '#77b9ee',
    fillOpacity: 0.24
  }
}).addTo(karte);

karte.createPane('linienRenderPane');
karte.getPane('linienRenderPane').style.zIndex = 405;
karte.getPane('linienRenderPane').style.pointerEvents = 'none';

const linienRenderRenderer = L.canvas({
  pane: 'linienRenderPane',
  padding: 0.5
});

karte.createPane('linienPane');
karte.getPane('linienPane').style.zIndex = 410;

karte.createPane('auswahlPane');
karte.getPane('auswahlPane').style.zIndex = 620;

karte.createPane('haltestellenPane');
karte.getPane('haltestellenPane').style.zIndex = 610;
karte.getPane('haltestellenPane').style.pointerEvents = 'none';

/*
 * Markierte Abschnitte und deren Marker sind rein visuell.
 * Das gesamte Pane darf niemals Mausereignisse abfangen.
 */
karte.getPane('auswahlPane').style.pointerEvents = 'none';

karte.createPane('klickPane');
karte.getPane('klickPane').style.zIndex = 650;
karte.getPane('klickPane').style.pointerEvents = 'none';

karte.createPane('robPane');
karte.getPane('robPane').style.zIndex = 700;

karte.createPane('robBussteigPane');
karte.getPane('robBussteigPane').style.zIndex = 690;

/*
 * ROB-Bussteigmarker liegen bewusst weit oben.
 * Leaflet-Tooltips und Popups müssen darüber liegen,
 * damit Linienangaben nicht von den Bussteig-Icons
 * verdeckt werden.
 */
karte.getPane('tooltipPane').style.zIndex = 760;
karte.getPane('popupPane').style.zIndex = 770;

let linienRenderLayer;
let linienLayer;
let abschnittKlickLayer;
let ausgewaehlterAbschnitt = null;
let startMarker = null;
let zielMarker = null;
let linienHaltestellenLayer = null;
let robMarker = null;
let robBussteigLayer = null;
let robBussteigPositionen = null;
let robConfigurationAktuell = null;
let robBearbeitungsmodusAktiv = false;
let robBussteigOriginalpositionen = null;

const robBussteigMarkerNachNummer = new Map();
const linienNachName = new Map();
let linienLabelLayer = null;

/*
 * Referenzpunkt des letzten Label-Renders.
 *
 * Kleine Kartenverschiebungen dürfen die Auswahl der
 * Linienbeschriftungen nicht verändern. Leaflet bewegt
 * vorhandene Marker ohnehin automatisch mit.
 */
let linienLabelRenderCenter = null;
let linienLabelRenderZoom = null;
let fixierteLinie = null;
let gemeinsameAbschnitteGeoJSON = null;
let linienLabelKorridoreGeoJSON = null;
let linienvarianten61 = null;
let aktiveVariante61 = null;
let linienvarianten68 = null;
let aktiveVariante68 = null;
let linienvarianten60 = null;
let aktiveVariante60 = null;

/*
 * Gemeinsame Variantenverwaltung für beliebige Linien.
 * Die bisherigen linienbezogenen Variablen bleiben
 * vorerst als Rückfallebene erhalten.
 */
const linienvariantenNachLinie = new Map();
let aktiveVariantenLinie = null;
let aktiveVariantenId = null;

function getLineName(properties = {}) {
  return String(
    properties.line
    ?? properties.route_short_name
    ?? properties.route_name
    ?? properties.route_id
    ?? ''
  ).trim();
}

function vabDisplayLineName(line) {
  const value = String(line ?? '').trim();

  return value === '20RMV'
    ? '20'
    : value;
}


function sortLines(lines = []) {
  return [...lines].sort((first, second) =>
    String(first).localeCompare(
      String(second),
      'de',
      {
        numeric: true,
        sensitivity: 'base'
      }
    )
  );
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function removeSelection() {
  aktiveVariante61 = null;
  aktiveVariante68 = null;
  aktiveVariante60 = null;
  aktiveVariantenLinie = null;
  aktiveVariantenId = null;

  if (ausgewaehlterAbschnitt) {
    karte.removeLayer(ausgewaehlterAbschnitt);
    ausgewaehlterAbschnitt = null;
  }

  if (startMarker) {
    karte.removeLayer(startMarker);
    startMarker = null;
  }

  if (zielMarker) {
    karte.removeLayer(zielMarker);
    zielMarker = null;
  }

  if (linienHaltestellenLayer) {
    karte.removeLayer(linienHaltestellenLayer);
    linienHaltestellenLayer = null;
  }

  /*
   * Der Leaflet-Canvas des Haltestellen-Panes kann auch
   * ohne sichtbare Marker bestehen bleiben. Deshalb darf
   * das Pane nach dem Schließen keine Klicks abfangen.
   */
  karte.getPane('haltestellenPane').style.pointerEvents = 'none';

  infoPanel.classList.remove('sichtbar');
  infoPanel.setAttribute('aria-hidden', 'true');
}

function clearAllSelection() {
  /*
   * Fixierte Linie vollständig zurücksetzen.
   */
  if (fixierteLinie) {
    resetLineStyle(fixierteLinie);
    fixierteLinie = null;
  }

  /*
   * Gemeinsamen Abschnitt, Marker und Infospalte entfernen.
   */
  removeSelection();

  /*
   * Leaflet nach Änderung der Seitenleistenbreite aktualisieren.
   */
  window.setTimeout(() => {
    karte.invalidateSize();
  }, 230);

  if (linienNachName.size > 0) {
    setStatus(
      `${linienNachName.size.toLocaleString('de-DE')} Linien verfügbar`,
      'erfolg'
    );
  }
}

function renderLineStyle() {
  const uebersicht = karte.getZoom() < 11;
  return {
    pane: 'linienRenderPane',
    color: '#000000',
    weight: uebersicht ? 1 : 2,
    opacity: 1,
    lineCap: 'round',
    lineJoin: 'round'
  };
}

function lineStyle() {
  /*
   * Fachliche VAB-Geometrie bleibt vollständig erhalten,
   * dient im Grundzustand aber nur noch als Interaktionsfläche.
   *
   * Hover-/Auswahlfunktionen setzen weiterhin explizite
   * sichtbare Farben auf genau diesen Layer.
   */
  return {
    pane: 'linienPane',
    color: '#000F47',
    weight: 10,
    opacity: 0.001,
    lineCap: 'round',
    lineJoin: 'round'
  };
}

function registerLineLayer(lineName, layer) {
  if (!lineName) {
    return;
  }

  if (!linienNachName.has(lineName)) {
    linienNachName.set(lineName, []);
  }

  linienNachName.get(lineName).push(layer);
}

function setLineStyle(lineName, style) {
  const layers = linienNachName.get(lineName) ?? [];

  for (const layer of layers) {
    /*
     * Die ursprüngliche Ebenenreihenfolge bleibt erhalten.
     * bringToFront würde die Klickreihenfolge dauerhaft verändern.
     */
    layer.setStyle(style);
  }
}

function resetLineStyle(lineName) {
  const layers = linienNachName.get(lineName) ?? [];

  for (const layer of layers) {
    linienLayer.resetStyle(layer);
  }
}

// Gemeinsame Begrenzung der ausgewaehlten Fahrweg-Geometrien.
// Wird sowohl fuer Linienvarianten als auch fuer einzelne Fahrwege gebraucht.
function getBoundsForLayers(layers = []) {
  const bounds = L.latLngBounds([]);
  for (const layer of layers) {
    if (!layer || typeof layer.getBounds !== 'function') continue;
    const layerBounds = layer.getBounds();
    if (layerBounds?.isValid()) bounds.extend(layerBounds);
  }
  return bounds;
}

function getLineBounds(lineName) {
  const layers = linienNachName.get(lineName) ?? [];
  const bounds = L.latLngBounds([]);

  for (const layer of layers) {
    const layerBounds = layer.getBounds();

    if (layerBounds.isValid()) {
      bounds.extend(layerBounds);
    }
  }

  return bounds;
}




function flattenLineLatLngs(latlngs) {
  const result = [];

  function walk(values) {
    for (const value of values ?? []) {
      if (
        value
        && Number.isFinite(value.lat)
        && Number.isFinite(value.lng)
      ) {
        result.push(value);
      } else if (Array.isArray(value)) {
        walk(value);
      }
    }
  }

  walk(latlngs);
  return result;
}


function getLeafletLineLength(layer) {
  const points =
    flattenLineLatLngs(
      layer.getLatLngs?.() ?? []
    );

  let length = 0;

  for (let i = 1; i < points.length; i += 1) {
    length += karte.distance(
      points[i - 1],
      points[i]
    );
  }

  return length;
}


function getLeafletLineMidpoint(layer) {
  const points =
    flattenLineLatLngs(
      layer.getLatLngs?.() ?? []
    );

  if (points.length === 0) {
    return null;
  }

  if (points.length === 1) {
    return points[0];
  }

  let totalLength = 0;
  const segments = [];

  for (let i = 1; i < points.length; i += 1) {
    const length =
      karte.distance(
        points[i - 1],
        points[i]
      );

    segments.push({
      start: points[i - 1],
      end: points[i],
      length
    });

    totalLength += length;
  }

  const target = totalLength / 2;
  let travelled = 0;

  for (const segment of segments) {
    if (
      travelled + segment.length
      >= target
    ) {
      const ratio =
        segment.length > 0
          ? (target - travelled)
            / segment.length
          : 0;

      return L.latLng(
        segment.start.lat
          + (
            segment.end.lat
            - segment.start.lat
          ) * ratio,
        segment.start.lng
          + (
            segment.end.lng
            - segment.start.lng
          ) * ratio
      );
    }

    travelled += segment.length;
  }

  return points[points.length - 1];
}



function getLineLabelSpacingForZoom(zoom) {
  if (zoom >= 16) {
    return 3000;
  }

  if (zoom >= 15) {
    return 5000;
  }

  if (zoom >= 14) {
    return 8000;
  }

  if (zoom >= 13) {
    return 12000;
  }

  return 18000;
}


function getLeafletLinePointAtDistance(
  layer,
  targetDistance
) {
  const points =
    flattenLineLatLngs(
      layer.getLatLngs?.() ?? []
    );

  if (points.length === 0) {
    return null;
  }

  if (points.length === 1) {
    return points[0];
  }

  let travelled = 0;

  for (let i = 1; i < points.length; i += 1) {
    const start = points[i - 1];
    const end = points[i];

    const segmentLength =
      karte.distance(
        start,
        end
      );

    if (
      travelled + segmentLength
      >= targetDistance
    ) {
      const remaining =
        targetDistance - travelled;

      const ratio =
        segmentLength > 0
          ? remaining / segmentLength
          : 0;

      return L.latLng(
        start.lat
          + (
            end.lat
            - start.lat
          ) * ratio,

        start.lng
          + (
            end.lng
            - start.lng
          ) * ratio
      );
    }

    travelled += segmentLength;
  }

  return points[
    points.length - 1
  ];
}




function normalizeLineLabelAngle(angle) {
  let result = angle;

  while (result > 180) {
    result -= 360;
  }

  while (result < -180) {
    result += 360;
  }

  /*
   * Schrift niemals auf dem Kopf darstellen.
   */
  if (result > 90) {
    result -= 180;
  }

  if (result < -90) {
    result += 180;
  }

  return result;
}


function getVisibleLineLabelPositions(
  layer,
  spacingPixels = 300
) {
  const latLngs =
    flattenLineLatLngs(
      layer.getLatLngs?.() ?? []
    );

  if (latLngs.length < 2) {
    return [];
  }

  const size =
    karte.getSize();

  /*
   * Etwas großzügiger als der sichtbare Ausschnitt,
   * damit Labels am Kartenrand nicht springen.
   */
  const margin = 50;

  const positions = [];
  let distanceSinceLabel =
    spacingPixels / 2;

  for (
    let i = 1;
    i < latLngs.length;
    i += 1
  ) {
    const startLatLng =
      latLngs[i - 1];

    const endLatLng =
      latLngs[i];

    const startPoint =
      karte.latLngToContainerPoint(
        startLatLng
      );

    const endPoint =
      karte.latLngToContainerPoint(
        endLatLng
      );

    const dx =
      endPoint.x - startPoint.x;

    const dy =
      endPoint.y - startPoint.y;

    const segmentLength =
      Math.sqrt(
        dx * dx + dy * dy
      );

    if (segmentLength <= 0) {
      continue;
    }

    let travelled = 0;

    while (
      distanceSinceLabel
      + (
        segmentLength - travelled
      )
      >= spacingPixels
    ) {
      const needed =
        spacingPixels
        - distanceSinceLabel;

      travelled += needed;

      const ratio =
        travelled / segmentLength;

      const x =
        startPoint.x
        + dx * ratio;

      const y =
        startPoint.y
        + dy * ratio;

      if (
        x >= -margin
        && x <= size.x + margin
        && y >= -margin
        && y <= size.y + margin
      ) {
        const latLng =
          karte.containerPointToLatLng(
            L.point(x, y)
          );

        const angle =
          normalizeLineLabelAngle(
            Math.atan2(
              dy,
              dx
            ) * 180 / Math.PI
          );

        positions.push({
          latLng,
          point: L.point(x, y),
          angle
        });
      }

      distanceSinceLabel = 0;
    }

    distanceSinceLabel +=
      segmentLength - travelled;
  }

  return positions;
}


function isLineLabelPositionFree(
  point,
  usedPoints,
  minimumDistance = 55
) {
  return !usedPoints.some(
    usedPoint =>
      point.distanceTo(usedPoint)
      < minimumDistance
  );
}



function getSharedLineLabelText(lines) {
  const sortedLines =
    sortLines(
      (lines ?? []).map(String)
    );

  /*
   * Kartografische Grundregel:
   *
   * Sammellabels werden immer in genau einer Zeile
   * geschrieben – wie bei klassischen Liniennetzplänen.
   *
   * Keine Umbrüche, keine Kästen, keine mehrzeiligen
   * Nummernblöcke.
   */
  const text =
    sortedLines.join(', ');

  return {
    text,
    rows: [text],
    html: `
      <span class="vab-linienlabel-zeile">${escapeHtml(text)}</span>
    `
  };
}



function getSharedLineLabelFontSize(labelData) {
  const text =
    String(
      labelData?.text
      ?? ''
    );

  /*
   * Netzweite typografische Regel:
   *
   * kurze Kombinationen bleiben gut sichtbar,
   * lange Linienfolgen treten optisch zurück.
   *
   * Keine linien- oder ortsspezifische Sonderregel.
   */
  if (text.length <= 20) {
    return 10;
  }

  if (text.length <= 40) {
    return 9;
  }

  return 8;
}



function getSharedLineLabelRequiredWidth(
  labelData,
  fontSize = 10
) {
  const text =
    String(
      labelData?.text
      ?? ''
    );

  if (!text) {
    return 0;
  }

  const canvas =
    getSharedLineLabelRequiredWidth._canvas
    ?? (
      getSharedLineLabelRequiredWidth._canvas =
        document.createElement(
          'canvas'
        )
    );

  const context =
    canvas.getContext('2d');

  context.font =
    `700 ${fontSize}px Arial, sans-serif`;

  let width =
    context.measureText(
      text
    ).width;

  /*
   * CSS letter-spacing: 0.15 px.
   */
  width +=
    Math.max(
      0,
      text.length - 1
    )
    * 0.15;

  /*
   * Entspricht dem horizontalen Padding
   * von getSharedLabelBox:
   *
   * 8 px links + 8 px rechts.
   */
  width += 16;

  return width;
}



function getLeafletLineMidpointWithAngle(layer) {
  const points =
    flattenLineLatLngs(
      layer.getLatLngs?.() ?? []
    );

  if (points.length < 2) {
    return null;
  }

  const segments = [];
  let totalLength = 0;

  for (let i = 1; i < points.length; i += 1) {
    const start = points[i - 1];
    const end = points[i];

    const length =
      karte.distance(
        start,
        end
      );

    segments.push({
      start,
      end,
      length
    });

    totalLength += length;
  }

  const target =
    totalLength / 2;

  let travelled = 0;

  for (const segment of segments) {
    if (
      travelled + segment.length
      >= target
    ) {
      const ratio =
        segment.length > 0
          ? (
              target - travelled
            ) / segment.length
          : 0;

      const latLng =
        L.latLng(
          segment.start.lat
          + (
              segment.end.lat
              - segment.start.lat
            ) * ratio,

          segment.start.lng
          + (
              segment.end.lng
              - segment.start.lng
            ) * ratio
        );

      const startPoint =
        karte.latLngToContainerPoint(
          segment.start
        );

      const endPoint =
        karte.latLngToContainerPoint(
          segment.end
        );

      const angle =
        normalizeLineLabelAngle(
          Math.atan2(
            endPoint.y - startPoint.y,
            endPoint.x - startPoint.x
          ) * 180 / Math.PI
        );

      return {
        latLng,
        angle
      };
    }

    travelled += segment.length;
  }

  return null;
}



function getBestSharedLabelPosition(
  layer,
  labelData
) {
  const latLngs =
    flattenLineLatLngs(
      layer.getLatLngs?.() ?? []
    );

  if (latLngs.length < 2) {
    return null;
  }

  /*
   * --------------------------------------------------
   * WICHTIG:
   * --------------------------------------------------
   *
   * Die Lage des Labels darf NICHT von der aktuellen
   * Zoomstufe abhängen.
   *
   * Deshalb wird die geometrisch beste Position immer
   * bei derselben festen Referenz-Zoomstufe bestimmt.
   */
  const REFERENCE_ZOOM = 18;

  const referencePoints =
    latLngs.map(
      latLng =>
        karte.project(
          latLng,
          REFERENCE_ZOOM
        )
    );

  const text =
    String(
      labelData?.text
      ?? ''
    );

  const rows =
    Array.isArray(
      labelData?.rows
    )
      ? labelData.rows
      : [text];

  const lineCount =
    rows.reduce(
      (sum, row) =>
        sum
        + String(row)
            .split(',')
            .filter(Boolean)
            .length,
      0
    );

  /*
   * Schriftgröße folgt ausschließlich der Länge des
   * eigentlichen einzeiligen Labeltexts.
   */
  const fontSize =
    getSharedLineLabelFontSize(
      labelData
    );

  const longestRowLength =
    Math.max(
      1,
      ...rows.map(
        row =>
          String(row).length
      )
    );

  /*
   * Diese Breite dient nur zur Auswahl eines
   * ausreichend langen Straßenstückes.
   *
   * Da REFERENCE_ZOOM fest ist, verändert auch
   * dieser Wert die geografische Position beim
   * Zoomen nicht mehr.
   */
  const estimatedTextWidth =
    Math.max(
      18,
      longestRowLength
      * fontSize
      * 0.57
    );

  const requiredLength =
    Math.max(
      42,
      estimatedTextWidth * 1.05
    );

  const candidates = [];


  function pointDistance(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;

    return Math.sqrt(
      dx * dx
      + dy * dy
    );
  }


  function pointToLineDistance(
    point,
    startPoint,
    endPoint
  ) {
    const dx =
      endPoint.x - startPoint.x;

    const dy =
      endPoint.y - startPoint.y;

    const denominator =
      dx * dx + dy * dy;

    if (denominator === 0) {
      return pointDistance(
        point,
        startPoint
      );
    }

    const factor =
      Math.max(
        0,
        Math.min(
          1,
          (
            (
              point.x - startPoint.x
            ) * dx
            +
            (
              point.y - startPoint.y
            ) * dy
          )
          / denominator
        )
      );

    const nearest =
      L.point(
        startPoint.x + factor * dx,
        startPoint.y + factor * dy
      );

    return pointDistance(
      point,
      nearest
    );
  }


  /*
   * Geeigneten zusammenhängenden geraden Teil des
   * Abschnitts suchen – ausschließlich im festen
   * Referenzkoordinatensystem.
   */
  for (
    let startIndex = 0;
    startIndex < referencePoints.length - 1;
    startIndex += 1
  ) {
    let accumulatedLength = 0;

    for (
      let endIndex = startIndex + 1;
      endIndex < referencePoints.length;
      endIndex += 1
    ) {
      accumulatedLength +=
        pointDistance(
          referencePoints[endIndex - 1],
          referencePoints[endIndex]
        );

      if (
        accumulatedLength
        < requiredLength
      ) {
        continue;
      }

      /*
       * Keine unnötig riesigen Suchfenster.
       */
      if (
        accumulatedLength
        > requiredLength * 1.8
      ) {
        break;
      }

      const first =
        referencePoints[startIndex];

      const last =
        referencePoints[endIndex];

      const dx =
        last.x - first.x;

      const dy =
        last.y - first.y;

      const directLength =
        Math.sqrt(
          dx * dx
          + dy * dy
        );

      const straightness =
        directLength
        / Math.max(
            1,
            accumulatedLength
          );

      if (
        straightness < 0.94
      ) {
        continue;
      }

      let maximumDeviation = 0;

      for (
        let index = startIndex + 1;
        index < endIndex;
        index += 1
      ) {
        maximumDeviation =
          Math.max(
            maximumDeviation,
            pointToLineDistance(
              referencePoints[index],
              first,
              last
            )
          );
      }

      if (
        maximumDeviation > 9
      ) {
        continue;
      }

      const angle =
        normalizeLineLabelAngle(
          Math.atan2(
            dy,
            dx
          )
          * 180 / Math.PI
        );

      const absoluteAngle =
        Math.abs(angle);

      /*
       * Große Bündel weiterhin nicht senkrecht
       * als Zahlenwand darstellen.
       */
      if (
        lineCount >= 10
        && absoluteAngle > 55
      ) {
        continue;
      }

      if (
        lineCount >= 18
        && absoluteAngle > 42
      ) {
        continue;
      }

      /*
       * Mittelpunkt entlang der tatsächlichen
       * Teilgeometrie bestimmen.
       */
      const target =
        accumulatedLength / 2;

      let travelled = 0;
      let midpointReference = null;

      for (
        let index = startIndex + 1;
        index <= endIndex;
        index += 1
      ) {
        const a =
          referencePoints[index - 1];

        const b =
          referencePoints[index];

        const segmentLength =
          pointDistance(
            a,
            b
          );

        if (
          travelled + segmentLength
          >= target
        ) {
          const remaining =
            target - travelled;

          const ratio =
            segmentLength > 0
              ? remaining / segmentLength
              : 0;

          midpointReference =
            L.point(
              a.x
                + (
                    b.x - a.x
                  ) * ratio,

              a.y
                + (
                    b.y - a.y
                  ) * ratio
            );

          break;
        }

        travelled += segmentLength;
      }

      if (!midpointReference) {
        continue;
      }

      /*
       * Feste Weltpixelposition zurück in eine
       * geografische Koordinate umwandeln.
       *
       * DIESE Position bleibt anschließend in allen
       * Zoomstufen identisch.
       */
      const latLng =
        karte.unproject(
          midpointReference,
          REFERENCE_ZOOM
        );

      let orientationFactor = 1;

      if (absoluteAngle > 15) {
        orientationFactor = 0.93;
      }

      if (absoluteAngle > 30) {
        orientationFactor = 0.78;
      }

      if (absoluteAngle > 45) {
        orientationFactor = 0.52;
      }

      const score =
        straightness
        * orientationFactor
        * (
            1
            + Math.min(
                0.5,
                (
                  accumulatedLength
                  - requiredLength
                )
                / requiredLength
              )
          )
        * (
            1
            - Math.min(
                0.35,
                maximumDeviation / 30
              )
          );

      candidates.push({
        latLng,

        /*
         * Nur die Bildschirmposition wird beim
         * aktuellen Zoom neu berechnet.
         * Die geografische Lage bleibt gleich.
         */
        point:
          karte.latLngToContainerPoint(
            latLng
          ),

        angle,
        fontSize,
        lineCount,
        estimatedTextWidth,
        score
      });

      break;
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  /*
   * Stabiler Tie-Breaker:
   * Bei gleichem Score gewinnt immer die geografisch
   * frühere Position. Dadurch gibt es auch bei nahezu
   * identischen Kandidaten kein zufälliges Springen.
   */
  candidates.sort(
    (a, b) => {
      const scoreDifference =
        b.score - a.score;

      if (
        Math.abs(scoreDifference)
        > 0.000001
      ) {
        return scoreDifference;
      }

      const latDifference =
        a.latLng.lat
        - b.latLng.lat;

      if (
        Math.abs(latDifference)
        > 0.0000001
      ) {
        return latDifference;
      }

      return (
        a.latLng.lng
        - b.latLng.lng
      );
    }
  );

  return candidates[0];
}



function getSharedLabelBox(
  labelPosition,
  labelData
) {
  const point =
    labelPosition.point;

  const fontSize =
    Number(
      labelPosition.fontSize
      ?? 10
    );

  const rows =
    Array.isArray(
      labelData?.rows
    )
      ? labelData.rows
      : [
          String(
            labelData?.text
            ?? ''
          )
        ];

  /*
   * Tatsächliche Textbreite im Browser messen.
   *
   * Damit stimmen auch:
   * - Leerzeichen nach Kommata
   * - zweistellige Liniennummern
   * - BG2 / BG3 / OF-85 usw.
   */
  const canvas =
    getSharedLabelBox._canvas
    ?? (
      getSharedLabelBox._canvas =
        document.createElement(
          'canvas'
        )
    );

  const context =
    canvas.getContext('2d');

  /*
   * Entspricht möglichst genau dem CSS:
   * font-weight 700, 10 px.
   */
  context.font =
    `700 ${fontSize}px Arial, sans-serif`;

  let textWidth = 0;

  for (const row of rows) {
    const measured =
      context.measureText(
        String(row)
      ).width;

    textWidth =
      Math.max(
        textWidth,
        measured
      );
  }

  /*
   * Letter-spacing aus CSS grob berücksichtigen.
   */
  const longestRowLength =
    Math.max(
      1,
      ...rows.map(
        row =>
          String(row).length
      )
    );

  textWidth +=
    longestRowLength
    * 0.15;

  const lineHeight =
    fontSize * 1.15;

  const textHeight =
    Math.max(
      lineHeight,
      rows.length
      * lineHeight
    );

  /*
   * Sicherheitsrand um die tatsächliche Schrift.
   */
  const paddingX = 8;
  const paddingY = 5;

  const width =
    textWidth
    + paddingX * 2;

  const height =
    textHeight
    + paddingY * 2;

  /*
   * Jetzt die Drehung berücksichtigen.
   *
   * Ein 100 px breites Label bei 45° benötigt
   * sowohl horizontal als auch vertikal deutlich
   * mehr Raum als ein ungedrehtes Label.
   */
  const angle =
    Math.abs(
      Number(
        labelPosition.angle
        ?? 0
      )
    )
    * Math.PI / 180;

  const rotatedWidth =
    Math.abs(
      width
      * Math.cos(angle)
    )
    +
    Math.abs(
      height
      * Math.sin(angle)
    );

  const rotatedHeight =
    Math.abs(
      width
      * Math.sin(angle)
    )
    +
    Math.abs(
      height
      * Math.cos(angle)
    );

  /*
   * Kleine zusätzliche Luft zwischen zwei Labels.
   */
  const collisionMargin = 6;

  return {
    left:
      point.x
      - rotatedWidth / 2
      - collisionMargin,

    right:
      point.x
      + rotatedWidth / 2
      + collisionMargin,

    top:
      point.y
      - rotatedHeight / 2
      - collisionMargin,

    bottom:
      point.y
      + rotatedHeight / 2
      + collisionMargin
  };
}


function sharedLabelBoxesOverlap(
  first,
  second
) {
  return !(
    first.right < second.left
    || first.left > second.right
    || first.bottom < second.top
    || first.top > second.bottom
  );
}


function isSharedLabelBoxFree(
  box,
  usedBoxes
) {
  return !usedBoxes.some(
    usedBox =>
      sharedLabelBoxesOverlap(
        box,
        usedBox
      )
  );
}


function createLineLabels() {
  /*
   * Zustand des aktuellen Renders festhalten.
   * Er dient anschließend als Hysterese beim Panning.
   */
  linienLabelRenderCenter =
    karte.getCenter();

  linienLabelRenderZoom =
    karte.getZoom();

  if (linienLabelLayer) {
    karte.removeLayer(
      linienLabelLayer
    );
  }

  linienLabelLayer = null;

  const zoom =
    karte.getZoom();

  if (zoom < 12) {
    return;
  }

  if (!karte.getPane('linienLabelPane')) {
    karte.createPane(
      'linienLabelPane'
    );

    karte.getPane(
      'linienLabelPane'
    ).style.zIndex = 605;

    karte.getPane(
      'linienLabelPane'
    ).style.pointerEvents = 'none';
  }

  linienLabelLayer =
    L.layerGroup();

  const usedPoints = [];

  /*
   * Tatsächliche belegte Textflächen der Sammellabels.
   * Dadurch werden Labels nicht mehr pauschal über
   * 150–250 Pixel Entfernung gegenseitig verdrängt.
   */
  const usedSharedLabelBoxes = [];

  /*
   * Die Kollisionsprüfung basiert jetzt auf real
   * gemessenen und entsprechend der Linienrichtung
   * gedrehten Textflächen.
   */

  /*
   * --------------------------------------------------
   * 1. GEMEINSAME LINIENABSCHNITTE
   * --------------------------------------------------
   *
   * Neue Strategie:
   *
   * Zunächst für ALLE sichtbaren gemeinsamen
   * Abschnitte einen möglichen Label-Kandidaten
   * berechnen.
   *
   * Anschließend werden Kandidaten danach ausgewählt,
   * wie gut sie bisher noch nicht dargestellte Linien
   * abdecken.
   */

  const representedLines =
    new Set();

  const sharedCandidates = [];

  const sharedFeatures =
    linienLabelKorridoreGeoJSON?.features
    ?? [];

  for (const feature of sharedFeatures) {
    const properties =
      feature.properties ?? {};

    const lines =
      sortLines(
        (properties.lines ?? [])
          .map(String)
      );

    if (lines.length < 2) {
      continue;
    }

    const geometry =
      feature.geometry ?? {};

    if (
      geometry.type !== 'LineString'
      || !Array.isArray(
        geometry.coordinates
      )
      || geometry.coordinates.length < 2
    ) {
      continue;
    }

    const latLngs =
      geometry.coordinates.map(
        coordinate =>
          L.latLng(
            coordinate[1],
            coordinate[0]
          )
      );

    const temporaryLayer =
      L.polyline(latLngs);

    const labelData =
      getSharedLineLabelText(
        lines
      );

    const labelPosition =
      getBestSharedLabelPosition(
        temporaryLayer,
        labelData
      );

    if (!labelPosition) {
      continue;
    }

    const point =
      labelPosition.point;

    const size =
      karte.getSize();

    if (
      point.x < -30
      || point.x > size.x + 30
      || point.y < -30
      || point.y > size.y + 30
    ) {
      continue;
    }

    /*
     * Tatsächliche sichtbare Länge des Abschnitts.
     */
    let visibleLength = 0;

    for (
      let index = 1;
      index < latLngs.length;
      index += 1
    ) {
      const first =
        karte.latLngToContainerPoint(
          latLngs[index - 1]
        );

      const second =
        karte.latLngToContainerPoint(
          latLngs[index]
        );

      visibleLength +=
        first.distanceTo(
          second
        );
    }

    /*
     * --------------------------------------------------
     * FIT-ON-CORRIDOR
     * --------------------------------------------------
     *
     * Ein Sammellabel darf nur erscheinen, wenn seine
     * tatsächlich benötigte Bildschirmbreite vollständig
     * auf den sichtbaren OSM-Korridor passt.
     *
     * Das ist keine geografische Distanzheuristik:
     * Textbreite und sichtbare Korridorlänge werden beide
     * direkt in Browser-Pixeln verglichen.
     */
    const requiredLabelWidth =
      getSharedLineLabelRequiredWidth(
        labelData,
        labelPosition.fontSize ?? 10
      );

    if (
      requiredLabelWidth <= 0
      || visibleLength < requiredLabelWidth
    ) {
      continue;
    }

    sharedCandidates.push({
      feature,
      sharedSectionId:
        properties.shared_section_id
        ?? (
          Array.isArray(properties.osm_way_ids)
            ? properties.osm_way_ids.join('-')
            : ''
        ),
      lines,
      labelData,
      labelPosition,
      point,
      visibleLength,
      requiredLabelWidth
    });
  }


  /*
   * Lange Abschnitte zunächst bevorzugen.
   */
  sharedCandidates.sort(
    (a, b) =>
      b.visibleLength
      - a.visibleLength
  );


  /*
   * --------------------------------------------------
   * ABSCHNITTSTREUE LABEL-AUSWAHL
   * --------------------------------------------------
   *
   * Grundregel:
   *
   * Ein Label beschreibt ausschließlich den konkreten
   * gemeinsamen Abschnitt, auf dem es platziert wird.
   *
   * Es spielt KEINE Rolle mehr, ob einzelne Linien
   * bereits an anderer Stelle dargestellt wurden.
   *
   * Damit kann beispielsweise ein Abschnitt mit
   * 4,10 nicht mehr deshalb bevorzugt oder verdrängt
   * werden, weil andere Linien irgendwo im sichtbaren
   * Kartenausschnitt bereits vorkommen.
   */

  sharedCandidates.sort(
    (a, b) => {
      /*
       * Lange sichtbare Abschnitte zuerst.
       */
      const lengthDifference =
        b.visibleLength
        - a.visibleLength;

      if (
        Math.abs(lengthDifference)
        > 0.01
      ) {
        return lengthDifference;
      }

      /*
       * Bei nahezu gleicher Länge erhält die
       * umfangreichere Linienkombination Vorrang.
       */
      return (
        b.lines.length
        - a.lines.length
      );
    }
  );


  for (const candidate of sharedCandidates) {
    const {
      sharedSectionId,
      lines,
      labelData,
      labelPosition,
      point
    } = candidate;

    /*
     * Kollisionsfläche entspricht der tatsächlich
     * gemessenen und gedrehten Beschriftung.
     */
    const labelBox =
      getSharedLabelBox(
        labelPosition,
        labelData
      );

    /*
     * Wichtig:
     *
     * Nur eine echte räumliche Textüberschneidung darf
     * dazu führen, dass dieses Label nicht dargestellt
     * wird.
     *
     * Die Tatsache, dass dieselben Linien bereits
     * irgendwo anders vorkommen, ist KEIN Kriterium.
     */
    if (
      !isSharedLabelBoxFree(
        labelBox,
        usedSharedLabelBoxes
      )
    ) {
      continue;
    }

    const icon =
      L.divIcon({
        className: '',
        iconSize: null,

        html: `
          <div
            class="vab-linienlabel"
            data-shared-section="${escapeHtml(sharedSectionId)}"
            data-lines="${escapeHtml(lines.join(','))}"
            style="
              --vab-label-angle:
              ${labelPosition.angle}deg;

              --vab-label-size:
              ${labelPosition.fontSize ?? 10}px;
            "
          >
            ${labelData.html}
          </div>
        `
      });

    L.marker(
      labelPosition.latLng,
      {
        pane: 'linienLabelPane',
        icon,
        interactive: false,
        keyboard: false
      }
    ).addTo(
      linienLabelLayer
    );

    usedPoints.push(
      point
    );

    usedSharedLabelBoxes.push(
      labelBox
    );

    /*
     * Nur für die spätere Einzellabel-Logik merken,
     * welche Linien tatsächlich in einem sichtbaren
     * Sammellabel vorkommen.
     *
     * Diese Menge beeinflusst NICHT mehr die Auswahl
     * anderer gemeinsamer Abschnitte.
     */
    for (const line of lines) {
      representedLines.add(
        String(line)
      );
    }
  }


  /*
   * Dieses Set wird ausschließlich anschließend von
   * der Einzellabel-Logik verwendet.
   *
   * Gemeinsame Abschnitte beeinflussen sich damit nur
   * noch über echte räumliche Textkollisionen.
   */
  const linesRepresentedBySharedLabels =
    representedLines;

  /*
   * Qualitätskontrolle der tatsächlich sichtbaren
   * Sammellabels. Keine Änderung an der Darstellung.
   */
  window.setTimeout(() => {
    const audit =
      Array.from(
        document.querySelectorAll(
          '.vab-linienlabel[data-shared-section]'
        )
      ).map(element => ({
        section:
          element.dataset.sharedSection,
        lines:
          element.dataset.lines,
        text:
          element.innerText
            .replace(/\\n+/g, ' / ')
            .trim()
      }));

    window.vabSharedLabelAudit =
      audit;

    console.group(
      `VAB Sammellabel-Prüfung – ${audit.length} sichtbare Labels`
    );

    console.table(audit);

    console.groupEnd();
  }, 0);


  /*
   * --------------------------------------------------
   * 2. EINZELNE LINIEN
   * --------------------------------------------------
   *
   * Einzellabels nur dort setzen, wo kein gemeinsamer
   * Linienabschnitt vorhanden ist.
   */
  let spacingPixels = 650;

  if (zoom >= 14) {
    spacingPixels = 560;
  }

  if (zoom >= 16) {
    spacingPixels = 470;
  }

  if (zoom >= 18) {
    spacingPixels = 420;
  }

  for (
    const [lineName, layers]
    of linienNachName.entries()
  ) {
    if (
      !lineName
      || !Array.isArray(layers)
      || layers.length === 0
    ) {
      continue;
    }

    for (const layer of layers) {
      const positions =
        getVisibleLineLabelPositions(
          layer,
          spacingPixels
        );

      for (const position of positions) {
        /*
         * Liegt hier ein gemeinsamer Abschnitt,
         * übernimmt dessen Sammelbeschriftung.
         */
        const sharedFeature =
          findSharedSectionAtClick(
            position.latLng,
            lineName
          );

        if (sharedFeature) {
          continue;
        }

        if (
          !isLineLabelPositionFree(
            position.point,
            usedPoints,
            100
          )
        ) {
          continue;
        }

        const icon =
          L.divIcon({
            className: '',
            iconSize: null,
            html: `
              <div
                class="vab-linienlabel"
            data-line="${escapeHtml(String(lineName))}"
                style="
                  --vab-label-angle:
                  ${position.angle ?? 0}deg;
                "
              >
                ${escapeHtml(vabDisplayLineName(lineName))}
              </div>
            `
          });

        L.marker(
          position.latLng,
          {
            pane: 'linienLabelPane',
            icon,
            interactive: false,
            keyboard: false
          }
        ).addTo(
          linienLabelLayer
        );

        usedPoints.push(
          position.point
        );
      }
    }
  }

  linienLabelLayer.addTo(
    karte
  );
}



function shouldRefreshLineLabelsAfterPan() {
  const zoom =
    karte.getZoom();

  /*
   * Nach Zoomwechsel immer neu rendern.
   */
  if (
    linienLabelRenderCenter === null
    || linienLabelRenderZoom !== zoom
  ) {
    return true;
  }

  const currentCenter =
    karte.getCenter();

  /*
   * Weltpixel statt Containerpixel verwenden.
   * Damit messen wir ausschließlich die tatsächliche
   * Verschiebung der Karte.
   */
  const previousPoint =
    karte.project(
      linienLabelRenderCenter,
      zoom
    );

  const currentPoint =
    karte.project(
      currentCenter,
      zoom
    );

  const dx =
    Math.abs(
      currentPoint.x
      - previousPoint.x
    );

  const dy =
    Math.abs(
      currentPoint.y
      - previousPoint.y
    );

  const size =
    karte.getSize();

  /*
   * Erst neu berechnen, wenn ungefähr 40 % des
   * Kartenausschnitts verschoben wurden.
   *
   * Ein leichtes Ziehen mit der Maushand verändert
   * damit KEINE Beschriftung mehr.
   */
  return (
    dx > size.x * 0.40
    || dy > size.y * 0.40
  );
}


function refreshLineLabelsAfterPan() {
  if (
    !shouldRefreshLineLabelsAfterPan()
  ) {
    return;
  }

  createLineLabels();
}


function updateLineLabelVisibility() {
  createLineLabels();
}


karte.on(
  'zoomend',
  updateLineLabelVisibility
);

karte.on(
  'moveend',
  refreshLineLabelsAfterPan
);


function getLineInformation(lineName) {
  const layers = linienNachName.get(lineName) ?? [];

  const headsigns = new Set();
  const startStops = new Set();
  const endStops = new Set();
  const patternIds = new Set();

  for (const layer of layers) {
    const properties =
      layer.feature?.properties ?? {};

    for (
      const headsign
      of properties.headsigns ?? []
    ) {
      const value = String(headsign).trim();

      if (value) {
        headsigns.add(value);
      }
    }

    const stops = properties.stops ?? [];

    if (stops.length > 0) {
      const first = stops[0] ?? {};
      const last = stops[stops.length - 1] ?? {};

      const firstName = String(
        first.stop_name
        ?? first.name
        ?? ''
      ).trim();

      const lastName = String(
        last.stop_name
        ?? last.name
        ?? ''
      ).trim();

      if (firstName) {
        startStops.add(firstName);
      }

      if (lastName) {
        endStops.add(lastName);
      }
    }

    const patternId = String(
      properties.pattern_id ?? ''
    ).trim();

    if (patternId) {
      patternIds.add(patternId);
    }
  }

  return {
    headsigns: sortLines([...headsigns]),
    startStops: sortLines([...startStops]),
    endStops: sortLines([...endStops]),
    patternCount: patternIds.size
  };
}

function renderLineInformation(lineName) {
  const information =
    getLineInformation(lineName);

  const headsignItems =
    information.headsigns.length > 0
      ? information.headsigns
          .map(value => `
            <li>${escapeHtml(value)}</li>
          `)
          .join('')
      : '<li>Keine Zielangabe vorhanden</li>';

  const startItems =
    information.startStops.length > 0
      ? information.startStops
          .map(value => `
            <li>${escapeHtml(value)}</li>
          `)
          .join('')
      : '<li>Keine Angabe vorhanden</li>';

  const endItems =
    information.endStops.length > 0
      ? information.endStops
          .map(value => `
            <li>${escapeHtml(value)}</li>
          `)
          .join('')
      : '<li>Keine Angabe vorhanden</li>';

  infoPanelInhalt.innerHTML = `
    <div class="seitenleisten-inhalt linien-information">
      <div class="liniennummer-gross">
        ${escapeHtml(vabDisplayLineName(lineName))}
      </div>

      <h2>Linie ${escapeHtml(vabDisplayLineName(lineName))}</h2>

      <section class="linien-info-bereich">
        <h3>Zielrichtungen</h3>
        <ul>
          ${headsignItems}
        </ul>
      </section>

      <section class="linien-info-bereich">
        <h3>Mögliche Anfangshaltestellen</h3>
        <ul>
          ${startItems}
        </ul>
      </section>

      <section class="linien-info-bereich">
        <h3>Mögliche Endhaltestellen</h3>
        <ul>
          ${endItems}
        </ul>
      </section>

      <div class="linien-info-fuss">
        ${information.patternCount.toLocaleString('de-DE')}
        Fahrtmuster
      </div>
    </div>
  `;

  infoPanel.classList.add('sichtbar');
  infoPanel.setAttribute(
    'aria-hidden',
    'false'
  );

  /*
   * Nach dem Öffnen der Seitenleiste muss Leaflet
   * die neue Kartengröße berücksichtigen.
   */
  window.setTimeout(() => {
    karte.invalidateSize();
  }, 230);
}


function vabNormalizePlatformStopId(value) {
  return String(value ?? '')
    .trim()
    .replace(/(?:_G)+$/, '');
}


function vabGetParentStopIdForPlatform(stopId) {
  const normalizedId =
    vabNormalizePlatformStopId(stopId);

  if (!normalizedId) {
    return '';
  }

  const parentStop =
    (vabSuchindex?.stops ?? []).find(
      stop =>
        (stop.member_stop_ids ?? []).some(
          memberId =>
            vabNormalizePlatformStopId(memberId)
            === normalizedId
        )
    );

  return String(parentStop?.id ?? '');
}


function vabGetStopGroupId(stopId) {
  const normalizedId =
    vabNormalizePlatformStopId(stopId);

  if (!normalizedId) {
    return '';
  }

  const parentId =
    vabGetParentStopIdForPlatform(
      normalizedId
    );

  if (parentId) {
    return parentId;
  }

  const match =
    normalizedId.match(
      /^(.*):0:[^:]+$/
    );

  return match?.[1] ?? normalizedId;
}


function getStopsForLine(lineName, selectedLayers = null) {
  const layers =
    selectedLayers ?? linienNachName.get(lineName) ?? [];

  const stopsByPhysicalId =
    new Map();

  for (const layer of layers) {
    const properties =
      layer.feature?.properties ?? {};

    for (const stop of properties.stops ?? []) {
      const sourceStopId = String(
        stop.stop_id ?? ''
      ).trim();

      const stopName = String(
        stop.stop_name ?? ''
      ).trim();

      const latitude =
        Number(stop.lat);

      const longitude =
        Number(stop.lon);

      const physicalStopId =
        vabNormalizePlatformStopId(
          sourceStopId
        );

      if (
        !physicalStopId
        || !Number.isFinite(latitude)
        || !Number.isFinite(longitude)
      ) {
        continue;
      }

      const existing =
        stopsByPhysicalId.get(
          physicalStopId
        );

      const sourceIsGenerated =
        /(?:_G)+$/.test(sourceStopId);

      const existingIsGenerated =
        /(?:_G)+$/.test(
          String(
            existing?.stopId ?? ''
          )
        );

      /*
       * Gleiche physische Plattform nur einmal.
       *
       * 0:1 und 0:2 bleiben getrennt.
       * _G-Dubletten werden zusammengefasst.
       *
       * Wenn sowohl Basis-ID als auch _G-ID
       * existieren, wird die Basis-ID bevorzugt.
       */
      if (
        existing
        && !(
          existingIsGenerated
          && !sourceIsGenerated
        )
      ) {
        continue;
      }

      stopsByPhysicalId.set(
        physicalStopId,
        {
          stopId:
            sourceStopId,

          stopName,

          latitude,
          longitude,

          parentStopId:
            vabGetParentStopIdForPlatform(
              sourceStopId
            )
        }
      );
    }
  }

  return [
    ...stopsByPhysicalId.values()
  ];
}

/*
 * Ermittelt zu einem Haltestelleneintrag aus der
 * Liniengeometrie den passenden Eintrag aus dem
 * VAB-Haltestellensuchindex.
 */
/*
 * Ermittelt für einen Klick auf einen Linienverlauf
 * die räumlich nächstgelegene Haltestelle aus dem
 * zentralen VAB-Suchindex, die von dieser Linie
 * tatsächlich bedient wird.
 *
 * Dadurch sind unterschiedliche Stop-IDs zwischen
 * Routingdaten, DELFI und DEFAS unproblematisch.
 */
function vabFindNearestStopForLineClick(
  lineName,
  latlng,
  selectedLayers = null
) {
  if (
    !lineName
    || !latlng
    || !vabSuchindex
  ) {
    return null;
  }

  const requestedLine =
    String(lineName).trim();

  const stops =
    vabSuchindex?.stops ?? [];

  let nearestStop = null;
  let nearestDistance = Infinity;

  /*
   * Zuerst nur Haltestellen berücksichtigen,
   * bei denen die interne Linienkennung exakt passt.
   */
  for (const stop of stops) {
    const lines =
      Array.isArray(stop?.lines)
        ? stop.lines.map(value =>
            String(value).trim()
          )
        : [];

    if (!lines.includes(requestedLine)) {
      continue;
    }

    const latitude =
      Number(stop?.lat);

    const longitude =
      Number(stop?.lon);

    if (
      !Number.isFinite(latitude)
      || !Number.isFinite(longitude)
    ) {
      continue;
    }

    const distance =
      karte.distance(
        latlng,
        L.latLng(
          latitude,
          longitude
        )
      );

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestStop = stop;
    }
  }

  /*
   * Sonder-/Rückfallebene:
   * Falls intern beispielsweise 20RMV verwendet wird,
   * kann die sichtbare Liniennummer trotzdem 20 sein.
   */
  if (!nearestStop) {
    const displayLine =
      vabDisplayLineName(
        requestedLine
      );

    for (const stop of stops) {
      const lines =
        Array.isArray(stop?.lines)
          ? stop.lines
          : [];

      const servesDisplayLine =
        lines.some(line =>
          vabDisplayLineName(line)
          === displayLine
        );

      if (!servesDisplayLine) {
        continue;
      }

      const latitude =
        Number(stop?.lat);

      const longitude =
        Number(stop?.lon);

      if (
        !Number.isFinite(latitude)
        || !Number.isFinite(longitude)
      ) {
        continue;
      }

      const distance =
        karte.distance(
          latlng,
          L.latLng(
            latitude,
            longitude
          )
        );

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestStop = stop;
      }
    }
  }

  return nearestStop;
}


/*
 * Klick auf einen Linienverlauf:
 * nächstgelegene Haltestelle bestimmen und unmittelbar
 * die nächste konkrete Fahrt einschließlich
 * Haltestellenfolge und Fahrplandokumente öffnen.
 */
/*
 * Linienklick: zunächst die zwei vom Fahrgast gewünschten
 * Aktionen anbieten. Das Leaflet-Popup bleibt an der Karte.
 */
// Popup nach jeder Layoutaenderung innerhalb der sichtbaren Karte halten.
function vabKeepActionPopupInMap(popup) {
  if (!popup || !karte.hasLayer(popup)) return;
  const element = popup.getElement();
  const mapElement = karte.getContainer();
  if (!element || !mapElement) return;
  const box = element.getBoundingClientRect();
  const mapBox = mapElement.getBoundingClientRect();
  const margin = 12;
  let dx = 0;
  let dy = 0;
  if (box.left < mapBox.left + margin) dx = box.left - mapBox.left - margin;
  else if (box.right > mapBox.right - margin) dx = box.right - mapBox.right + margin;
  if (box.top < mapBox.top + margin) dy = box.top - mapBox.top - margin;
  else if (box.bottom > mapBox.bottom - margin) dy = box.bottom - mapBox.bottom + margin;
  if (dx || dy) karte.panBy([dx, dy], { animate: false });
}

function vabOpenLineActionPopup(lineName, latlng, patternId = '') {
  const content = document.createElement('div');
  content.className = 'vab-linien-aktionspopup';

  const heading = document.createElement('h3');
  heading.textContent = 'Linie ' + vabDisplayLineName(lineName);
  content.appendChild(heading);

  const pdfButton = document.createElement('button');
  pdfButton.type = 'button';
  pdfButton.textContent = 'PDF-Fahrplan';
  pdfButton.className = 'vab-aktionspopup-button';

  const stopsButton = document.createElement('button');
  stopsButton.type = 'button';
  stopsButton.textContent = 'Abfahrtstafel / Haltestellen';
  stopsButton.className = 'vab-aktionspopup-button';

  content.append(pdfButton, stopsButton);

  pdfButton.addEventListener('click', () => {
    karte.closePopup();
    vabShowLinePdfDocuments(lineName);
  });

  stopsButton.addEventListener('click', () => {
    karte.closePopup();
    const group = getVariantGroup(lineName, patternId);
    if (group) {
      selectVariant(lineName, group.id, patternId);
    } else {
      vabShowLineStopsWithoutVariants(lineName);
    }
  });

  // Oberhalb des Popups genug Platz lassen: bei Klicks nahe am oberen
  // Kartenrand darf das Menue nicht unter den Seitenkopf rutschen.
  const popup = L.popup({
    maxWidth: 340,
    minWidth: 250,
    autoPan: true,
    keepInView: true,
    autoPanPaddingTopLeft: L.point(14, 14),
    autoPanPaddingBottomRight: L.point(14, 14)
  })
    .setLatLng(latlng)
    .setContent(content)
    .openOn(karte);

  // Leaflet berechnet die Position manchmal vor der Aenderung
  // der Kartenbreite (Seitenleiste). Danach erneut kontrollieren.
  requestAnimationFrame(() => vabKeepActionPopupInMap(popup));
  window.setTimeout(() => {
    if (!karte.hasLayer(popup)) return;
    karte.invalidateSize();
    vabKeepActionPopupInMap(popup);
  }, 260);
}

function vabShowLinePdfDocuments(lineName) {
  infoPanelInhalt.innerHTML = `
    <div class="seitenleisten-inhalt linien-information">
      <h2>Linie ${escapeHtml(vabDisplayLineName(lineName))}</h2>
      <h3>PDF-Fahrplan</h3>
      <div class="vab-fahrplan-pdf-bereich">
        ${vabCreateSchedulePdfHtml(lineName)}
      </div>
      <button type="button" class="vab-popup-zurueck">
        Zurück zur Linienauswahl
      </button>
    </div>
  `;
  vabOpenLineDialog();
  infoPanelInhalt.querySelector('.vab-popup-zurueck')
    ?.addEventListener('click', () => {
      const group = getVariantGroup(lineName);
      if (group) {
        selectVariant(lineName, group.id);
      } else {
        vabShowLineStopsWithoutVariants(lineName);
      }
    });
}

/*
 * Die bahn.de-Verbindungssuche erhält die Haltestelle
 * als Start oder Ziel. Es wird kein App-Start versprochen:
 * das Betriebssystem entscheidet, ob eine App übernimmt.
 */
/*
 * DB akzeptiert für lokale Haltestellen nicht zuverlässig einen
 * aus dem Namen konstruierten Deep Link. Daher wird die Haltestelle
 * kopiert und die reguläre DB-Verbindungssuche geöffnet.
 */
function vabOpenDbSearchForStop(stopName, asOrigin = false) {
  const name = String(stopName ?? '').trim();
  if (!name) return;
  // Synchron im Klickhandler öffnen, damit Popup-Blocker nicht greifen.
  window.open('https://www.bahn.de/', '_blank', 'noopener,noreferrer');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(name).catch(() => {});
  }
  setStatus(
    'Haltestelle „' + name + '“ kopieren und bei der DB als '
    + (asOrigin ? 'Start' : 'Ziel') + ' einfügen.',
    'erfolg'
  );
}

document.addEventListener('click', event => {
  const button = event.target.closest?.('.vab-db-stop-action');
  if (!button) return;
  event.preventDefault();
  vabOpenDbSearchForStop(
    button.dataset.stopName,
    button.dataset.dbRole === 'start'
  );
});

function vabGetOrderedPatternStops(layer) {
  const raw = layer?.feature?.properties?.stops ?? [];
  const result = [];

  for (const stop of raw) {
    const name = String(stop.stop_name ?? '').trim();
    if (!name) continue;

    // Nur direkt aufeinanderfolgende identische Halte entfernen.
    if (result.length && result[result.length - 1].name === name) {
      continue;
    }

    result.push({
      name,
      id: String(stop.stop_id ?? ''),
      lat: Number(stop.lat),
      lon: Number(stop.lon)
    });
  }

  return result;
}

/*
 * Kompakter Haltestellenfinder: eine Suchliste mit begrenzter
 * Höhe und genau einer Aktionsgruppe für die gewählte Haltestelle.
 * Keine unendliche Liste und keine DB-Schaltfläche je Haltestelle.
 */
function vabMountStopFinder(host, layers, preferredStop = null) {
  if (!host) return;
  const entries = [];
  const seen = new Set();
  for (const layer of layers) {
    for (const stop of vabGetOrderedPatternStops(layer)) {
      const key = String(stop.id || stop.name).replace(/(?:_G)+$/, '');
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(stop);
    }
  }
  if (preferredStop?.name && !entries.some(stop =>
    (preferredStop.id && stop.id === preferredStop.id)
    || stop.name === preferredStop.name
  )) {
    entries.unshift({
      name: preferredStop.name,
      id: String(preferredStop.id || ''),
      lat: Number(preferredStop.lat),
      lon: Number(preferredStop.lon)
    });
  }
  let chosen = preferredStop
    ? entries.find(stop =>
        (preferredStop.id && stop.id === preferredStop.id)
        || stop.name === preferredStop.name
      ) ?? entries[0]
    : entries[0];

  host.innerHTML = `
    <section class="vab-finder vab-stop-section" aria-label="Haltestelle auswählen">
      <div class="vab-step-heading">
        <span class="vab-step-number">2</span>
        <div><h3>Deine Haltestelle</h3>
        <p>Hier kannst du ein- oder aussteigen.</p></div>
      </div>
      <div class="vab-finder-selected" aria-live="polite"></div>
      <button type="button" class="vab-finder-toggle"
        aria-expanded="false" aria-controls="vab-finder-picker">
        <span>Andere Haltestelle wählen</span><span aria-hidden="true">⌄</span>
      </button>
      <div class="vab-finder-picker" id="vab-finder-picker" hidden>
        <label class="vab-finder-label" for="vab-finder-search">Haltestelle suchen</label>
        <input id="vab-finder-search" class="vab-finder-search"
          type="search" placeholder="Haltestellenname eingeben" autocomplete="off">
        <div class="vab-finder-count" aria-live="polite"></div>
        <div class="vab-finder-results" aria-label="Haltestellen des Fahrwegs"></div>
      </div>
    </section>`;
  const input = host.querySelector('.vab-finder-search');
  const results = host.querySelector('.vab-finder-results');
  const selected = host.querySelector('.vab-finder-selected');
  const count = host.querySelector('.vab-finder-count');
  const toggle = host.querySelector('.vab-finder-toggle');
  const picker = host.querySelector('.vab-finder-picker');

  function showChosen() {
    if (!chosen) {
      selected.innerHTML = '<p>Für diesen Fahrweg sind keine Haltestellen hinterlegt.</p>';
      return;
    }
    selected.innerHTML = `
      <div class="vab-finder-overline">Ausgewählt</div>
      <strong class="vab-finder-selected-name">${escapeHtml(chosen.name)}</strong>
      <div class="vab-finder-actions">
        <a class="vab-finder-db-link" target="_blank" rel="noopener noreferrer"
          href="https://www.bahn.de/buchung/start#?SO=${encodeURIComponent(chosen.name)}">
          ↗ Hier starten
        </a>
        <a class="vab-finder-db-link" target="_blank" rel="noopener noreferrer"
          href="https://www.bahn.de/buchung/start#?ZO=${encodeURIComponent(chosen.name)}">
          ↗ Hier ankommen
        </a>
      </div>
      <p class="vab-finder-note">DB-Verbindungssuche (Test): Übernahme der
      Haltestelle bitte prüfen.</p>`;
  }
  function showResults() {
    const query = input.value.trim().toLocaleLowerCase('de');
    const matches = entries.filter(stop =>
      stop.name.toLocaleLowerCase('de').includes(query)
    );
    count.textContent = matches.length + ' Haltestellen auf diesem Fahrweg';
    results.replaceChildren();
    if (!matches.length) {
      const empty = document.createElement('p');
      empty.className = 'vab-finder-empty';
      empty.textContent = 'Keine passende Haltestelle gefunden.';
      results.appendChild(empty);
    }
    for (const stop of matches) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'vab-finder-stop' + (stop === chosen ? ' aktiv' : '');
      button.setAttribute('aria-pressed', String(stop === chosen));
      button.textContent = stop.name;
      button.addEventListener('click', () => {
        chosen = stop;
        showChosen();
        picker.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
        toggle.querySelector('span').textContent = 'Andere Haltestelle wählen';
        input.value = '';
        showResults();
        toggle.focus();
      });
      results.appendChild(button);
    }
  }
  toggle.addEventListener('click', () => {
    const open = picker.hidden;
    picker.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('span').textContent = open
      ? 'Haltestellenliste schließen'
      : 'Andere Haltestelle wählen';
    if (open) {
      showResults();
      input.focus();
      results.querySelector('.aktiv')?.scrollIntoView({ block: 'nearest' });
    }
  });
  input.addEventListener('input', showResults);
  showChosen();
  showResults();
}

function vabShowLineStopsWithoutVariants(lineName, preferredStop = null) {
  const layers = linienNachName.get(String(lineName)) ?? [];
  if (!layers.length) {
    setStatus('Für diese Linie ist kein Fahrweg hinterlegt', 'fehler');
    return;
  }
  const options = layers.map((layer, index) => {
    const stops = vabGetOrderedPatternStops(layer);
    const first = stops[0]?.name ?? 'Start';
    const last = stops[stops.length - 1]?.name ?? 'Ziel';
    return `<option value="${index}">${escapeHtml(first)} → ${escapeHtml(last)}</option>`;
  }).join('');
  infoPanelInhalt.innerHTML = `
    <div class="seitenleisten-inhalt linien-information vab-board-dialog">
      <div class="vab-dialog-eyebrow">Linie ${escapeHtml(vabDisplayLineName(lineName))} · VAB</div>
      <h2>Linie ${escapeHtml(vabDisplayLineName(lineName))}</h2>
      <section class="vab-route-section" aria-label="Linienweg auf der Karte">
        <div class="vab-step-heading"><span class="vab-step-number">1</span>
          <div><h3>Fahrweg auf der Karte</h3>
          <p>Wähle den Verlauf, den du sehen möchtest.</p></div>
        </div>
        <label class="vab-finder-label" for="vab-pattern-select">Fahrtrichtung / Fahrweg</label>
        <select id="vab-pattern-select" class="vab-finder-select">${options}</select>
        <p class="vab-route-hint">Der gewählte Linienweg wird pink auf der Karte angezeigt.</p>
      </section>
      <div class="vab-finder-host"></div>
      <button type="button" class="vab-popup-pdf vab-finder-pdf">▤ PDF-Fahrplan ansehen</button>
    </div>`;
  vabOpenLineDialog();
  const selector = infoPanelInhalt.querySelector('#vab-pattern-select');
  function activate(index, focus = null) {
    const layer = layers[index];
    if (!layer) return;
    if (fixierteLinie && fixierteLinie !== lineName) resetLineStyle(fixierteLinie);
    fixierteLinie = lineName;
    removeSelection();
    // removeSelection blendet das Panel aus: nach dem Wechsel wieder oeffnen.
    vabOpenLineDialog();
    resetLineStyle(lineName);
    layer.setStyle({ color: '#FF009B', weight: 7, opacity: 1 });
    showStopsForLine(lineName, [layer]);
    vabMountStopFinder(
      infoPanelInhalt.querySelector('.vab-finder-host'),
      [layer], focus
    );
    const bounds = getBoundsForLayers([layer]);
    if (bounds.isValid()) window.setTimeout(() => {
      karte.invalidateSize();
      karte.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    }, 240);
  }
  selector.addEventListener('change', () => activate(Number(selector.value)));
  infoPanelInhalt.querySelector('.vab-popup-pdf')
    .addEventListener('click', () => vabShowLinePdfDocuments(lineName));
  const matchingIndex = preferredStop
    ? layers.findIndex(layer => vabGetOrderedPatternStops(layer).some(stop =>
        (preferredStop.id && stop.id === preferredStop.id)
        || stop.name === preferredStop.name
      ))
    : -1;
  const firstIndex = matchingIndex >= 0 ? matchingIndex : 0;
  selector.value = String(firstIndex);
  activate(firstIndex, preferredStop);
}

function vabShowLineTripFromMapClick(
  lineName,
  latlng,
  selectedLayers = null,
  patternId = ''
) {
  vabOpenLineActionPopup(lineName, latlng, patternId);
  return true;
}

let vabSichtbareHaltestellenMarker = [];

let vabLineDirectionGeneration = 0;


function vabFindVisibleStopMarker(stopId) {
  const normalizedId =
    vabNormalizePlatformStopId(
      stopId
    );

  if (!normalizedId) {
    return null;
  }

  const exactMarker =
    vabSichtbareHaltestellenMarker.find(
      marker =>
        vabNormalizePlatformStopId(
          marker?.vabStopId
        )
        === normalizedId
    );

  if (exactMarker) {
    return exactMarker;
  }

  return (
    vabSichtbareHaltestellenMarker.find(
      marker =>
        String(
          marker?.vabStopGroupId ?? ''
        )
        === String(stopId ?? '')
    )
    ?? null
  );
}


function vabSetStopMarkerDirection(
  marker,
  lineName,
  destination
) {
  if (
    !marker
    || !destination
    || !marker.getTooltip()
  ) {
    return;
  }

  const stopName =
    String(marker.vabStopName ?? '');

  marker.setTooltipContent(`
    <div>
      ${escapeHtml(stopName)}
    </div>

    <div style="
      margin-top: 3px;
      font-size: 11px;
      font-weight: 500;
      line-height: 1.2;
    ">
      Linie ${escapeHtml(vabDisplayLineName(lineName))}
      &middot; Richtung ${escapeHtml(destination)}
    </div>
  `);

  if (karte.getZoom() >= 16) {
    marker.openTooltip();
  }
}


function vabResetStopTooltipDirections() {
  for (
    const marker
    of vabSichtbareHaltestellenMarker
  ) {
    const stopName =
      String(marker?.vabStopName ?? '');

    if (
      stopName
      && marker?.getTooltip()
    ) {
      marker.setTooltipContent(
        escapeHtml(stopName)
      );
    }
  }
}


function vabUpdateStopTooltipDirection(
  stopId,
  lineName,
  destination,
  requestLine = ''
) {
  vabLineDirectionGeneration += 1;

  const generation =
    vabLineDirectionGeneration;

  vabResetStopTooltipDirections();

  const marker =
    vabFindVisibleStopMarker(
      stopId
    );

  if (!marker) {
    return;
  }

  vabSetStopMarkerDirection(
    marker,
    lineName,
    destination
  );

  const groupId =
    String(
      marker.vabStopGroupId ?? ''
    );

  const stopName =
    String(
      marker.vabStopName ?? ''
    );

  if (!groupId) {
    return;
  }

  /*
   * Weitere physische Plattformen derselben
   * Haltestelle bekommen ihre eigene naechste
   * Fahrtrichtung direkt aus DEFAS.
   */
  for (
    const sibling
    of vabSichtbareHaltestellenMarker
  ) {
    if (
      sibling === marker
      || String(
        sibling?.vabStopGroupId ?? ''
      ) !== groupId
      || String(
        sibling?.vabStopName ?? ''
      ) !== stopName
    ) {
      continue;
    }

    window.dispatchEvent(
      new CustomEvent(
        'vab-line-direction-request',
        {
          detail: {
            stopId:
              String(
                sibling.vabStopId ?? ''
              ),

            line:
              String(
                requestLine
                || lineName
                || ''
              ),

            generation
          }
        }
      )
    );
  }
}


window.addEventListener(
  'vab-line-direction-focused',
  event => {
    vabUpdateStopTooltipDirection(
      event?.detail?.stopId,
      event?.detail?.line,
      event?.detail?.destination,
      event?.detail?.requestLine
    );
  }
);


window.addEventListener(
  'vab-line-direction-secondary',
  event => {
    const generation =
      Number(
        event?.detail?.generation ?? 0
      );

    if (
      generation
      !== vabLineDirectionGeneration
    ) {
      return;
    }

    const marker =
      vabFindVisibleStopMarker(
        event?.detail?.stopId
      );

    vabSetStopMarkerDirection(
      marker,
      event?.detail?.line,
      event?.detail?.destination
    );
  }
);


/*
 * Darstellung der Haltestellen abhängig von der
 * aktuellen Zoomstufe.
 *
 * Ab Zoomstufe 16 erscheint im Marker ein H.
 */
function createStopMarkerIconForZoom(zoom) {
  if (zoom >= 16) {
    return L.divIcon({
      className: 'vab-haltestellen-divicon',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      html: `
        <div style="
          width: 22px;
          height: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          border: 3px solid #001B69;
          border-radius: 50%;
          background: #FFFFFF;
          color: #001B69;
          font-family: Arial, sans-serif;
          font-size: 13px;
          font-weight: 700;
          line-height: 1;
        ">H</div>
      `
    });
  }

  if (zoom >= 13) {
    return L.divIcon({
      className: 'vab-haltestellen-divicon',
      iconSize: [12, 12],
      iconAnchor: [6, 6],
      html: `
        <div style="
          width: 12px;
          height: 12px;
          box-sizing: border-box;
          border: 2px solid #001B69;
          border-radius: 50%;
          background: #FFFFFF;
        "></div>
      `
    });
  }

  return L.divIcon({
    className: 'vab-haltestellen-divicon',
    iconSize: [7, 7],
    iconAnchor: [3.5, 3.5],
    html: `
      <div style="
        width: 7px;
        height: 7px;
        box-sizing: border-box;
        border: 1px solid #FFFFFF;
        border-radius: 50%;
        background: #001B69;
      "></div>
    `
  });
}


/*
 * Bereits sichtbare Haltestellenmarker beim Zoomen
 * unmittelbar an die neue Darstellungsstufe anpassen.
 */
function updateVisibleStopMarkerStyle() {
  const zoom = karte.getZoom();

  const icon =
    createStopMarkerIconForZoom(zoom);

  for (
    const marker
    of vabSichtbareHaltestellenMarker
  ) {
    if (
      marker
      && typeof marker.setIcon === 'function'
    ) {
      marker.setIcon(icon);
    }

    /*
     * Ab Zoomstufe 16 den Haltestellennamen
     * dauerhaft anzeigen. Darunter erscheint er
     * weiterhin nur beim Berühren des Markers.
     */
    if (
      marker
      && typeof marker.getTooltip === 'function'
      && marker.getTooltip()
    ) {
      if (zoom >= 16) {
        marker.openTooltip();
      } else {
        marker.closeTooltip();
      }
    }
  }
}


karte.on(
  'zoomend',
  updateVisibleStopMarkerStyle
);


function showStopsForLine(lineName, selectedLayers = null) {
  /*
   * Markerbestand der zuvor angezeigten Linie
   * zuruecksetzen.
   */
  vabSichtbareHaltestellenMarker = [];

  karte.getPane(
    'haltestellenPane'
  ).style.pointerEvents = 'auto';

  if (linienHaltestellenLayer) {
    karte.removeLayer(
      linienHaltestellenLayer
    );

    linienHaltestellenLayer = null;
  }

  const stops =
    getStopsForLine(
      lineName,
      selectedLayers
    );

  linienHaltestellenLayer =
    L.layerGroup();

  for (const stop of stops) {
    const marker =
      L.marker(
        [
          stop.latitude,
          stop.longitude
        ],
        {
          pane: 'haltestellenPane',

          icon:
            createStopMarkerIconForZoom(
              karte.getZoom()
            ),

          bubblingMouseEvents: false,
          keyboard: false
        }
      );

    marker.vabStopId =
      String(stop.stopId ?? '');

    marker.vabStopName =
      String(stop.stopName ?? '');

    marker.vabStopGroupId =
      String(
        stop.parentStopId
        || vabGetStopGroupId(
          stop.stopId
        )
        || ''
      );

    vabSichtbareHaltestellenMarker.push(
      marker
    );

    if (stop.stopName) {
      marker.bindTooltip(
        escapeHtml(stop.stopName),
        {
          sticky: false,
          direction: 'right',
          offset: [13, 0],
          opacity: 0.95,
          className:
            'vab-haltestellenname'
        }
      );
    }

    marker.on(
      'click',
      event => {
        L.DomEvent.stopPropagation(
          event
        );

        if (event.originalEvent) {
          event.originalEvent.vabLineHandled =
            true;
        }

        /*
         * Die konkrete Plattform wird direkt
         * verwendet. Dadurch fragt DEFAS genau
         * die zu dieser Fahrtrichtung gehoerende
         * Haltestelle ab.
         */
        const selectedStop = {
          id:
            String(stop.stopId ?? ''),

          name:
            String(stop.stopName ?? ''),

          lat:
            Number(stop.latitude),

          lon:
            Number(stop.longitude),

          lines:
            fixierteLinie
              ? [fixierteLinie]
              : []
        };

        if (fixierteLinie) {
          const group = getVariantGroup(fixierteLinie, vabAktuellesPatternId);
          if (group) {
            selectVariant(fixierteLinie, group.id, vabAktuellesPatternId, selectedStop);
          } else {
            vabShowLineStopsWithoutVariants(fixierteLinie, selectedStop);
          }
          return;
        }

        if (
          typeof window.vabFocusStopInLine
          === 'function'
        ) {
          window.vabFocusStopInLine(
            stop.stopId
          );
        }
      }
    );

    marker.addTo(
      linienHaltestellenLayer
    );
  }

  linienHaltestellenLayer.addTo(
    karte
  );

  updateVisibleStopMarkerStyle();
}

function getPatternIdFromLayer(layer) {
  return String(
    layer.feature?.properties?.pattern_id ?? ''
  ).trim();
}

function getPreferredVariantId(lineName) {
  const preferredVariants = {
    '60': '60-aschaffenburg-elsenfeld',
    '61': '61-moenchberg-elsenfeld',
    '68': '68-elsenfeld-moemlingen'
  };

  return preferredVariants[lineName] ?? '';
}

function getVariantConfiguration(lineName) {
  return linienvariantenNachLinie.get(
    String(lineName)
  ) ?? null;
}

function getVariantGroup(
  lineName,
  patternId = ''
) {
  const configuration =
    getVariantConfiguration(lineName);

  const groups =
    configuration?.groups ?? [];

  if (patternId) {
    const matchingGroup = groups.find(
      group =>
        Array.isArray(group.pattern_ids)
        && group.pattern_ids.includes(patternId)
    );

    if (matchingGroup) {
      return matchingGroup;
    }
  }

  const preferredId =
    getPreferredVariantId(lineName);

  return groups.find(
    group => group.id === preferredId
  ) ?? groups[0] ?? null;
}

function getLayersForVariant(
  lineName,
  group
) {
  if (!group) {
    return [];
  }

  const patternIds = new Set(
    group.pattern_ids ?? []
  );

  return (
    linienNachName.get(String(lineName)) ?? []
  ).filter(
    layer =>
      patternIds.has(
        getPatternIdFromLayer(layer)
      )
  );
}

function styleVariantLayers(
  lineName,
  layers = []
) {
  resetLineStyle(lineName);

  for (const layer of layers) {
    layer.setStyle({
      color: '#FF009B',
      weight: 7,
      opacity: 1
    });
  }
}

let vabAktuellesPatternId = '';

function renderVariants(lineName, activeGroup, preferredStop = null) {
  const groups = getVariantConfiguration(lineName)?.groups ?? [];
  const options = groups.map(group => `
    <option value="${escapeHtml(group.id)}"
      ${group.id === activeGroup?.id ? 'selected' : ''}>
      ${escapeHtml(group.label)}
      ${group.type === 'schulverkehr' ? ' · Schulverkehr' : ''}
    </option>`).join('');
  const layers = getLayersForVariant(lineName, activeGroup);
  const directionOptions = layers.map((layer, index) => {
    const stops = vabGetOrderedPatternStops(layer);
    const first = stops[0]?.name ?? 'Start';
    const last = stops[stops.length - 1]?.name ?? 'Ziel';
    return `<option value="${index}">${escapeHtml(first)} → ${escapeHtml(last)}</option>`;
  }).join('');
  infoPanelInhalt.innerHTML = `
    <div class="seitenleisten-inhalt linien-information vab-board-dialog">
      <div class="vab-dialog-eyebrow">Linie ${escapeHtml(vabDisplayLineName(lineName))} · VAB</div>
      <h2>Linie ${escapeHtml(vabDisplayLineName(lineName))}</h2>
      <section class="vab-route-section" aria-label="Linienweg auf der Karte">
        <div class="vab-step-heading"><span class="vab-step-number">1</span>
          <div><h3>Fahrweg auf der Karte</h3>
          <p>Wähle Variante und Fahrtrichtung.</p></div>
        </div>
        <label class="vab-finder-label" for="vab-variant-select">Linienvariante</label>
        <select id="vab-variant-select" class="vab-finder-select">${options}</select>
        <label class="vab-finder-label" for="vab-direction-select">Fahrtrichtung</label>
        <select id="vab-direction-select" class="vab-finder-select">${directionOptions}</select>
        <p class="vab-route-hint">Der gewählte Linienweg wird pink auf der Karte angezeigt.</p>
      </section>
      <div class="vab-finder-host"></div>
      <button type="button" class="vab-finder-pdf">▤ PDF-Fahrplan ansehen</button>
    </div>`;
  vabOpenLineDialog();
  const direction = infoPanelInhalt.querySelector('#vab-direction-select');
  const firstIndex = Math.max(0, layers.findIndex(layer =>
    (vabAktuellesPatternId && getPatternIdFromLayer(layer) === vabAktuellesPatternId)
    || (preferredStop && vabGetOrderedPatternStops(layer).some(stop =>
      (preferredStop.id && stop.id === preferredStop.id)
      || stop.name === preferredStop.name
    ))
  ));
  direction.value = String(firstIndex);
  function updateDirection(index, focus = null) {
    const layer = layers[index];
    if (!layer) return;
    vabAktuellesPatternId = getPatternIdFromLayer(layer);
    styleVariantLayers(lineName, [layer]);
    showStopsForLine(lineName, [layer]);
    vabMountStopFinder(
      infoPanelInhalt.querySelector('.vab-finder-host'), [layer], focus
    );
    const bounds = getBoundsForLayers([layer]);
    if (bounds.isValid()) window.setTimeout(() => {
      karte.invalidateSize();
      karte.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    }, 240);
  }
  infoPanelInhalt.querySelector('#vab-variant-select')
    .addEventListener('change', event => selectVariant(lineName, event.target.value));
  direction.addEventListener('change', () =>
    updateDirection(Number(direction.value))
  );
  infoPanelInhalt.querySelector('.vab-finder-pdf')
    .addEventListener('click', () => vabShowLinePdfDocuments(lineName));
  updateDirection(firstIndex, preferredStop);
}

function selectVariant(
  lineName,
  variantId,
  patternId = '',
  preferredStop = null
) {
  vabAktuellesPatternId = patternId;
  const configuration =
    getVariantConfiguration(lineName);

  const group = (
    configuration?.groups ?? []
  ).find(
    item => item.id === variantId
  );

  if (!group) {
    return;
  }

  const layers = getLayersForVariant(
    lineName,
    group
  );

  if (layers.length === 0) {
    setStatus(
      `Für die Variante ${group.label} wurden keine Geometrien gefunden`,
      'fehler'
    );

    return;
  }

  if (
    fixierteLinie
    && fixierteLinie !== lineName
  ) {
    resetLineStyle(fixierteLinie);
  }

  removeSelection();

  fixierteLinie = lineName;
  aktiveVariantenLinie = lineName;
  aktiveVariantenId = group.id;

  styleVariantLayers(
    lineName,
    layers
  );

  showStopsForLine(
    lineName,
    layers
  );

  renderVariants(
    lineName,
    group,
    preferredStop
  );

  const bounds =
    getBoundsForLayers(layers);

  if (bounds.isValid()) {
    window.setTimeout(() => {
      karte.invalidateSize();

      karte.fitBounds(bounds, {
        padding: [30, 30],
        maxZoom: 15
      });
    }, 240);
  }

  setStatus(
    `Linie ${lineName}: ${group.label}`,
    'erfolg'
  );
}

function selectLineVariant(
  lineName,
  patternId = ''
) {
  const group = getVariantGroup(
    lineName,
    patternId
  );

  if (!group) {
    return false;
  }

  if (
    fixierteLinie === lineName
    && aktiveVariantenLinie === lineName
    && aktiveVariantenId === group.id
  ) {
    resetLineStyle(lineName);
    fixierteLinie = null;
    removeSelection();

    setStatus(
      `${linienNachName.size.toLocaleString('de-DE')} Linien verfügbar`,
      'erfolg'
    );

    return true;
  }

  selectVariant(
    lineName,
    group.id
  );

  return true;
}


function selectLineFromStopSearch(lineName) {
  if (!lineName) {
    return;
  }

  /*
   * Eine eventuell zuvor ausgewählte Linie zurücksetzen.
   */
  if (
    fixierteLinie
    && fixierteLinie !== lineName
  ) {
    resetLineStyle(fixierteLinie);
  }

  removeSelection();

  fixierteLinie = lineName;

  /*
   * Sämtliche vorhandenen Fahrwegvarianten der Linie
   * gemeinsam hervorheben. Die Variantenauswahl wird
   * dabei bewusst nicht geöffnet.
   */
  setLineStyle(lineName, {
    color: '#FF009B',
    weight: 7,
    opacity: 1
  });

  showStopsForLine(lineName);

  const bounds = getLineBounds(lineName);

  if (bounds.isValid()) {
    karte.fitBounds(bounds, {
      padding: [30, 30],
      maxZoom: 15
    });
  }

  setStatus(
    `Linie ${vabDisplayLineName(lineName)}: Aushangfahrplan`,
    'erfolg'
  );
}


function selectLine(
  lineName,
  patternId = ''
) {
  if (!lineName) {
    return;
  }

  /*
   * Linien mit hinterlegter Variantendatei verwenden
   * die gemeinsame Variantenlogik.
   */
  if (
    linienvariantenNachLinie.has(lineName)
  ) {
    selectLineVariant(
      lineName,
      patternId
    );

    return;
  }

  /*
   * Erneuter Klick auf dieselbe Linie hebt die Auswahl auf.
   */
  if (fixierteLinie === lineName) {
    resetLineStyle(lineName);
    fixierteLinie = null;
    removeSelection();

    setStatus(
      `${linienNachName.size.toLocaleString('de-DE')} Linien verfügbar`,
      'erfolg'
    );

    return;
  }

  if (fixierteLinie) {
    resetLineStyle(fixierteLinie);
  }

  removeSelection();

  fixierteLinie = lineName;

  setLineStyle(lineName, {
    color: '#FF009B',
    weight: 7,
    opacity: 1
  });

  showStopsForLine(lineName);

  const bounds = getLineBounds(lineName);

  if (bounds.isValid()) {
    karte.fitBounds(bounds, {
      padding: [30, 30],
      maxZoom: 15
    });
  }

  setStatus(
    `Linie ${lineName} ausgewählt`,
    'erfolg'
  );
}

function distancePointToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (dx === 0 && dy === 0) {
    return point.distanceTo(start);
  }

  const value = (
    (point.x - start.x) * dx
    + (point.y - start.y) * dy
  ) / (
    dx * dx + dy * dy
  );

  const factor = Math.max(0, Math.min(1, value));

  const nearest = L.point(
    start.x + factor * dx,
    start.y + factor * dy
  );

  return point.distanceTo(nearest);
}

function findSharedSectionAtClick(latlng, lineName) {
  const features =
    gemeinsameAbschnitteGeoJSON?.features ?? [];

  const clickPoint =
    karte.latLngToLayerPoint(latlng);

  let bestFeature = null;
  let bestDistance = Infinity;

  for (const feature of features) {
    const properties = feature.properties ?? {};
    const lines = (properties.lines ?? []).map(String);

    if (!lines.includes(String(lineName))) {
      continue;
    }

    const coordinates =
      feature.geometry?.coordinates ?? [];

    for (
      let index = 1;
      index < coordinates.length;
      index += 1
    ) {
      const first = coordinates[index - 1];
      const second = coordinates[index];

      const firstPoint = karte.latLngToLayerPoint(
        L.latLng(first[1], first[0])
      );

      const secondPoint = karte.latLngToLayerPoint(
        L.latLng(second[1], second[0])
      );

      const distance = distancePointToSegment(
        clickPoint,
        firstPoint,
        secondPoint
      );

      if (distance < bestDistance) {
        bestDistance = distance;
        bestFeature = feature;
      }
    }
  }

  return bestDistance <= 12
    ? bestFeature
    : null;
}

function addLineInteraction(feature, layer) {
  const properties = feature.properties ?? {};
  const lineName = getLineName(properties);

  registerLineLayer(lineName, layer);

  if (lineName) {
    layer.bindTooltip(
      `Linie ${escapeHtml(vabDisplayLineName(lineName))}`,
      {
        sticky: true,
        direction: 'top'
      }
    );
  }

  layer.on({
    mouseover(event) {
      const sharedFeature = (
        lineName
        ? findSharedSectionAtClick(
            event.latlng,
            lineName
          )
        : null
      );

      if (sharedFeature) {
        const sharedLines = sortLines(
          sharedFeature.properties?.lines ?? []
        );

        const lineLabels = sharedLines
          .map(line => `
            <span
              style="
                display:inline-block;
                margin:2px 3px 2px 0;
                padding:3px 7px;
                border-radius:12px;
                background:#000F47;
                color:#ffffff;
                font-weight:700;
              "
            >
              ${escapeHtml(vabDisplayLineName(line))}
            </span>
          `)
          .join('');

        layer.setTooltipContent(`
          <div style="min-width:150px">
            <div style="font-weight:700;margin-bottom:4px">
              Mehrere Linien auf diesem Abschnitt
            </div>

            <div style="margin-bottom:5px">
              ${lineLabels}
            </div>

            <div style="font-size:12px">
              Klicken, um eine Linie auszuwählen
            </div>
          </div>
        `);
      } else if (lineName) {
        layer.setTooltipContent(
          `Linie ${escapeHtml(vabDisplayLineName(lineName))}`
        );
      }

      if (
        !lineName
        || fixierteLinie === lineName
      ) {
        return;
      }

      setLineStyle(lineName, {
        color: '#FF7040',
        weight: 6,
        opacity: 1
      });
    },

    mouseout() {
      if (lineName) {
        layer.setTooltipContent(
          `Linie ${escapeHtml(vabDisplayLineName(lineName))}`
        );
      }

      if (
        !lineName
        || fixierteLinie === lineName
      ) {
        return;
      }

      resetLineStyle(lineName);

      if (fixierteLinie) {
        setLineStyle(fixierteLinie, {
          color: '#FF009B',
          weight: 7,
          opacity: 1
        });
      }
    },

    click(event) {
      /*
       * Klick auf einen Linienverlauf.
       *
       * Eindeutige Linie:
       * direkt Fahrt, Haltestellenfolge und Fahrplandokument.
       *
       * Mehrere Linien auf demselben Abschnitt:
       * zunächst Linie auswählen.
       */
      if (event.originalEvent) {
        event.originalEvent.vabLineHandled = true;
      }

      const sharedFeature =
        findSharedSectionAtClick(
          event.latlng,
          lineName
        );

      /*
       * Wenn bereits eine Linie aktiv ist und diese
       * ebenfalls ueber den angeklickten gemeinsamen
       * Abschnitt verlaeuft, darf die Mehrlinien-Auswahl
       * die bestehende Auswahl nicht ersetzen.
       *
       * Das ist besonders wichtig beim Doppelklick zum
       * Zoomen: Die pink markierte Linie bleibt erhalten.
       */
      if (
        sharedFeature
        && fixierteLinie
      ) {
        const sharedLines =
          (
            sharedFeature.properties?.lines
            ?? []
          ).map(String);

        if (
          sharedLines.includes(
            String(fixierteLinie)
          )
        ) {
          vabShowLineTripFromMapClick(
            fixierteLinie,
            event.latlng
          );

          return;
        }
      }

      /*
       * Nur wenn noch keine passende Linie ausgewaehlt
       * ist, wird die Auswahl fuer gemeinsam befahrene
       * Abschnitte angezeigt.
       */
      if (sharedFeature) {
        const temporaryLayer =
          L.geoJSON(sharedFeature);

        showSharedSection(
          sharedFeature,
          temporaryLayer,
          event.latlng
        );

        return;
      }

      /*
       * Bewusst nicht selectLine():
       * Diese Funktion würde bei Linien mit Varianten
       * wieder die alte Variantenansicht öffnen.
       */
      selectLineFromStopSearch(
        lineName
      );

      /*
       * Passende Haltestelle am Klickpunkt bestimmen
       * und direkt die konkrete Fahrt öffnen.
       */
      vabShowLineTripFromMapClick(
        lineName,
        event.latlng,
        null,
        getPatternIdFromLayer(layer)
      );
    }
  });
}

function showSharedSection(feature, clickedLayer, clickLatLng = null) {
  const properties = feature.properties ?? {};
  const coordinates = feature.geometry?.coordinates ?? [];

  if (coordinates.length < 2) {
    return;
  }

  if (fixierteLinie) {
    resetLineStyle(fixierteLinie);
    fixierteLinie = null;
  }

  removeSelection();

  ausgewaehlterAbschnitt = L.geoJSON(feature, {
    pane: 'auswahlPane',
    style: {
      color: '#FF7040',
      weight: 9,
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round'
    },
    interactive: false
  }).addTo(karte);

  const startCoordinate = coordinates[0];
  const endCoordinate = coordinates[coordinates.length - 1];

  startMarker = L.circleMarker(
    [startCoordinate[1], startCoordinate[0]],
    {
      pane: 'auswahlPane',
      radius: 8,
      color: '#ffffff',
      weight: 3,
      fillColor: '#18864b',
      fillOpacity: 1,
      interactive: false
    }
  ).addTo(karte);

  zielMarker = L.circleMarker(
    [endCoordinate[1], endCoordinate[0]],
    {
      pane: 'auswahlPane',
      radius: 8,
      color: '#ffffff',
      weight: 3,
      fillColor: '#c92a2a',
      fillOpacity: 1,
      interactive: false
    }
  ).addTo(karte);

  const lines = sortLines(properties.lines ?? []);

  const lineBadges = lines
    .map(line => `
      <button
        type="button"
        class="linien-auswahl-button linien-badge-button"
        data-line="${escapeHtml(line)}"
        aria-label="Linie ${escapeHtml(vabDisplayLineName(line))} anzeigen"
      >
        <span class="linien-auswahl-nummer">
          ${escapeHtml(vabDisplayLineName(line))}
        </span>

        <span class="linien-auswahl-text">
          Linie ${escapeHtml(vabDisplayLineName(line))} anzeigen
        </span>

        <span
          class="linien-auswahl-pfeil"
          aria-hidden="true"
        >
          ›
        </span>
      </button>
    `)
    .join('');

  infoPanelInhalt.innerHTML = `
    <div class="seitenleisten-inhalt gemeinsame-auswahl">
      <h2>Mehrere Linien auf diesem Abschnitt</h2>

      <p class="gemeinsame-auswahl-hinweis">
        Welche Linie möchten Sie anzeigen?
      </p>

      <div class="linien-auswahl-liste">
        ${lineBadges}
      </div>
    </div>
  `;

  infoPanel.classList.add('sichtbar');
  infoPanel.setAttribute('aria-hidden', 'false');

  for (
    const button
    of infoPanelInhalt.querySelectorAll(
      '.linien-badge-button'
    )
  ) {
    button.addEventListener('click', event => {
      event.stopPropagation();

      const lineName = String(
        button.dataset.line ?? ''
      ).trim();

      if (!lineName) {
        return;
      }

      selectLineFromStopSearch(
        lineName
      );

      if (clickLatLng) {
        vabShowLineTripFromMapClick(
          lineName,
          clickLatLng
        );
      }
    });
  }
}

function addSharedSectionInteraction(feature, layer) {
  layer.on('click', event => {
    L.DomEvent.stopPropagation(event);
    showSharedSection(
      feature,
      layer,
      event.latlng
    );
  });
}

async function loadGeoJSON(path, label) {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(
      `${label}: HTTP-Fehler ${response.status}`
    );
  }

  const geojson = await response.json();

  if (
    geojson.type !== 'FeatureCollection'
    || !Array.isArray(geojson.features)
  ) {
    throw new Error(
      `${label}: ungültiges FeatureCollection-GeoJSON`
    );
  }

  return geojson;
}


function showRobSelection(configuration) {
  if (fixierteLinie) {
    resetLineStyle(fixierteLinie);
    fixierteLinie = null;
  }

  removeSelection();

  const bussteige =
    configuration?.bussteige ?? [];

  const bussteigHtml = bussteige
    .map(bussteig => {
      const linien =
        Array.isArray(bussteig.linien)
          ? sortLines(bussteig.linien)
          : [];

      const hinweise =
        Array.isArray(bussteig.hinweise)
          ? bussteig.hinweise
          : [];

      const linienHtml = linien.length > 0
        ? linien
            .map(line => `
              <button
                type="button"
                class="linien-auswahl-button rob-linien-button"
                data-line="${escapeHtml(line)}"
                aria-label="Linie ${escapeHtml(vabDisplayLineName(line))} anzeigen"
              >
                <span class="linien-auswahl-nummer">
                  ${escapeHtml(vabDisplayLineName(line))}
                </span>

                <span class="linien-auswahl-text">
                  Linie ${escapeHtml(vabDisplayLineName(line))} anzeigen
                </span>

                <span
                  class="linien-auswahl-pfeil"
                  aria-hidden="true"
                >
                  ›
                </span>
              </button>
            `)
            .join('')
        : `
          <div class="rob-keine-linien">
            Keine regulären Linien
          </div>
        `;

      const hinweisHtml = hinweise
        .map(hinweis => `
          <div class="rob-bussteig-hinweis">
            ${escapeHtml(hinweis)}
          </div>
        `)
        .join('');

      return `
        <section class="rob-bussteig-gruppe">
          <div class="rob-bussteig-kopf">
            <span class="rob-bussteig-nummer">
              ${escapeHtml(bussteig.bussteig)}
            </span>

            <h3>
              Bussteig ${escapeHtml(bussteig.bussteig)}
            </h3>
          </div>

          <div class="linien-auswahl-liste">
            ${linienHtml}
          </div>

          ${hinweisHtml}
        </section>
      `;
    })
    .join('');

  infoPanelInhalt.innerHTML = `
    <div class="seitenleisten-inhalt rob-auswahl">
      <div class="rob-panel-kennung">
        ROB
      </div>

      <h2>ROB-Aschaffenburg</h2>

      <p class="gemeinsame-auswahl-hinweis">
        Wählen Sie einen Bussteig und anschließend
        die gewünschte Linie.
      </p>

      <div class="rob-bussteige-liste">
        ${bussteigHtml}
      </div>
    </div>
  `;

  infoPanel.classList.add('sichtbar');
  infoPanel.setAttribute(
    'aria-hidden',
    'false'
  );

  for (
    const button
    of infoPanelInhalt.querySelectorAll(
      '.rob-linien-button'
    )
  ) {
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();

      const lineName = String(
        button.dataset.line ?? ''
      ).trim();

      if (!lineName) {
        return;
      }

      /*
       * Der ROB ist gleichzeitig die Haltestelle
       * Aschaffenburg Hauptbahnhof/ROB.
       *
       * Deshalb soll ein Klick auf eine Linie nicht nur
       * den Linienverlauf markieren, sondern - genau wie
       * bei einer normalen Haltestelle - die nächste
       * konkrete Fahrt mit Haltestellenfolge und
       * Fahrplandokumente öffnen.
       */
      const robStop =
        vabGetStopById('de:09661:5100')
        ?? (vabSuchindex?.stops ?? []).find(stop => {
          const name =
            vabNormalizeSearchText(
              stop?.name ?? ''
            );

          return (
            name.includes('hauptbahnhof rob')
            || name.includes('hbf rob')
          );
        })
        ?? null;

      if (robStop) {
        selectLineFromStopSearch(
          lineName
        );

        vabShowSchedule(
          robStop,
          lineName,
          'rob'
        );

        return;
      }

      /*
       * Rückfallebene, falls die ROB-Haltestelle
       * wider Erwarten nicht im Suchindex enthalten ist.
       */
      selectLine(lineName);
    });
  }

  refreshMapAfterPanelChange();

  setStatus(
    'ROB-Aschaffenburg: Linie nach Bussteig auswählen',
    'erfolg'
  );
}




function cloneRobPositionConfiguration(configuration) {
  return JSON.parse(
    JSON.stringify(configuration)
  );
}


function setRobEditButtonState() {
  const control =
    document.querySelector('.rob-edit-control');

  if (!control) {
    return;
  }

  control.classList.toggle(
    'aktiv',
    robBearbeitungsmodusAktiv
  );

  const editButton =
    control.querySelector('[data-rob-action="edit"]');

  const exportButton =
    control.querySelector('[data-rob-action="export"]');

  const cancelButton =
    control.querySelector('[data-rob-action="cancel"]');

  if (editButton) {
    editButton.textContent =
      robBearbeitungsmodusAktiv
        ? 'Bearbeitung aktiv'
        : 'Bussteige bearbeiten';

    editButton.disabled =
      robBearbeitungsmodusAktiv;
  }

  if (exportButton) {
    exportButton.disabled =
      !robBearbeitungsmodusAktiv;
  }

  if (cancelButton) {
    cancelButton.disabled =
      !robBearbeitungsmodusAktiv;
  }
}


function updateRobPositionFromMarker(
  bussteigNumber,
  marker
) {
  const latLng = marker.getLatLng();

  const position =
    robBussteigPositionen?.positionen?.find(
      item =>
        String(item.bussteig) ===
        String(bussteigNumber)
    );

  if (!position) {
    return;
  }

  position.lat =
    Number(latLng.lat.toFixed(7));

  position.lon =
    Number(latLng.lng.toFixed(7));
}


function applyRobMarkerDraggingState() {
  for (
    const marker
    of robBussteigMarkerNachNummer.values()
  ) {
    /*
     * Leaflet erstellt marker.dragging erst,
     * nachdem der Marker tatsächlich auf der
     * Karte eingeblendet wurde.
     */
    if (!marker.dragging) {
      continue;
    }

    const markerElement =
      marker.getElement();

    if (robBearbeitungsmodusAktiv) {
      marker.dragging.enable();

      markerElement?.classList.add(
        'rob-bussteig-editierbar'
      );
    } else {
      marker.dragging.disable();

      markerElement?.classList.remove(
        'rob-bussteig-editierbar'
      );
    }
  }
}


function setRobBearbeitungsmodus(active) {
  robBearbeitungsmodusAktiv =
    Boolean(active);

  applyRobMarkerDraggingState();

  setRobEditButtonState();

  if (robBearbeitungsmodusAktiv) {
    setStatus(
      'Bearbeitungsmodus aktiv: Bussteige mit der Maus verschieben',
      'erfolg'
    );
  } else {
    setStatus(
      'Bearbeitungsmodus beendet',
      'erfolg'
    );
  }
}


function startRobBearbeitung() {
  if (!robBussteigPositionen) {
    setStatus(
      'Die Bussteigpositionen sind noch nicht geladen',
      'fehler'
    );

    return;
  }

  robBussteigOriginalpositionen =
    cloneRobPositionConfiguration(
      robBussteigPositionen
    );

  setRobBearbeitungsmodus(true);

  if (karte.getZoom() < 17) {
    karte.setZoom(17);
  }
}


function cancelRobBearbeitung() {
  if (!robBussteigOriginalpositionen) {
    setRobBearbeitungsmodus(false);
    return;
  }

  robBussteigPositionen =
    cloneRobPositionConfiguration(
      robBussteigOriginalpositionen
    );

  for (
    const position
    of robBussteigPositionen.positionen ?? []
  ) {
    const marker =
      robBussteigMarkerNachNummer.get(
        String(position.bussteig)
      );

    if (!marker) {
      continue;
    }

    marker.setLatLng([
      Number(position.lat),
      Number(position.lon)
    ]);
  }

  robBussteigOriginalpositionen = null;

  setRobBearbeitungsmodus(false);

  setStatus(
    'Änderungen an den Bussteigen wurden verworfen',
    'erfolg'
  );
}


function exportRobBussteigPositionen() {
  if (!robBussteigPositionen) {
    setStatus(
      'Es sind keine Bussteigpositionen vorhanden',
      'fehler'
    );

    return;
  }

  for (
    const [bussteigNumber, marker]
    of robBussteigMarkerNachNummer
  ) {
    updateRobPositionFromMarker(
      bussteigNumber,
      marker
    );
  }

  const jsonText =
    JSON.stringify(
      robBussteigPositionen,
      null,
      2
    );

  const blob = new Blob(
    [jsonText],
    {
      type: 'application/json;charset=utf-8'
    }
  );

  const url =
    URL.createObjectURL(blob);

  const downloadLink =
    document.createElement('a');

  downloadLink.href = url;
  downloadLink.download =
    'rob_bussteig_positionen.json';

  document.body.appendChild(
    downloadLink
  );

  downloadLink.click();
  downloadLink.remove();

  URL.revokeObjectURL(url);

  robBussteigOriginalpositionen =
    cloneRobPositionConfiguration(
      robBussteigPositionen
    );

  setRobBearbeitungsmodus(false);

  setStatus(
    'Neue Bussteigpositionen wurden als JSON-Datei heruntergeladen',
    'erfolg'
  );
}


function createRobEditControl() {
  const urlParameters =
    new URLSearchParams(
      window.location.search
    );

  const editorEnabled =
    urlParameters.get('rob-edit') === '1';

  if (!editorEnabled) {
    return;
  }

  if (
    document.querySelector(
      '.rob-edit-control'
    )
  ) {
    return;
  }

  const RobEditControl =
    L.Control.extend({
      options: {
        position: 'topright'
      },

      onAdd() {
        const container =
          L.DomUtil.create(
            'div',
            'leaflet-control rob-edit-control'
          );

        container.innerHTML = `
          <button
            type="button"
            class="rob-edit-button rob-edit-start"
            data-rob-action="edit"
          >
            Bussteige bearbeiten
          </button>

          <button
            type="button"
            class="rob-edit-button rob-edit-export"
            data-rob-action="export"
            disabled
          >
            Positionen speichern
          </button>

          <button
            type="button"
            class="rob-edit-button rob-edit-cancel"
            data-rob-action="cancel"
            disabled
          >
            Abbrechen
          </button>
        `;

        L.DomEvent.disableClickPropagation(
          container
        );

        L.DomEvent.disableScrollPropagation(
          container
        );

        container
          .querySelector(
            '[data-rob-action="edit"]'
          )
          ?.addEventListener(
            'click',
            startRobBearbeitung
          );

        container
          .querySelector(
            '[data-rob-action="export"]'
          )
          ?.addEventListener(
            'click',
            exportRobBussteigPositionen
          );

        container
          .querySelector(
            '[data-rob-action="cancel"]'
          )
          ?.addEventListener(
            'click',
            cancelRobBearbeitung
          );

        return container;
      }
    });

  karte.addControl(
    new RobEditControl()
  );

  setRobEditButtonState();
}


function getRobBussteigConfiguration(bussteigNumber) {
  const bussteige =
    robConfigurationAktuell?.bussteige ?? [];

  return bussteige.find(
    item =>
      String(item.bussteig) ===
      String(bussteigNumber)
  ) ?? null;
}


function showRobBussteig(bussteigNumber) {
  const bussteig =
    getRobBussteigConfiguration(bussteigNumber);

  if (!bussteig) {
    setStatus(
      `Für Bussteig ${bussteigNumber} liegen keine Daten vor`,
      'fehler'
    );

    return;
  }

  showRobSelection({
    name: 'ROB-Aschaffenburg',
    bussteige: [bussteig]
  });

  setStatus(
    `ROB-Aschaffenburg – Bussteig ${bussteigNumber}`,
    'erfolg'
  );
}


function updateRobBussteigVisibility() {
  if (!robBussteigLayer) {
    return;
  }

  const minimumZoom =
    Number(
      robBussteigPositionen?.anzeige_ab_zoom
      ?? 17
    );

  if (karte.getZoom() >= minimumZoom) {
    if (!karte.hasLayer(robBussteigLayer)) {
      robBussteigLayer.addTo(karte);
    }

    /*
     * Jetzt sind die Marker wirklich auf der Karte
     * und Leaflet hat die Dragging-Handler erzeugt.
     */
    applyRobMarkerDraggingState();
  } else if (karte.hasLayer(robBussteigLayer)) {
    karte.removeLayer(robBussteigLayer);
  }
}


function createRobBussteige(
  positionConfiguration,
  robConfiguration
) {
  robBussteigPositionen =
    positionConfiguration;

  robConfigurationAktuell =
    robConfiguration;

  if (robBussteigLayer) {
    karte.removeLayer(robBussteigLayer);
  }

  robBussteigMarkerNachNummer.clear();

  robBussteigLayer = L.layerGroup();

  const positions =
    positionConfiguration?.positionen ?? [];

  for (const position of positions) {
    const bussteigNumber =
      String(position.bussteig ?? '').trim();

    if (!bussteigNumber) {
      continue;
    }

    const bussteigData =
      getRobBussteigConfiguration(bussteigNumber);

    const lines =
      Array.isArray(bussteigData?.linien)
        ? sortLines(bussteigData.linien)
        : [];

    const usage =
      String(position.nutzung ?? '').trim();

    const lineText =
      lines.length > 0
        ? `Linien: ${lines.join(', ')}`
        : usage || 'Keine regulären Linien';

    const icon = L.divIcon({
      className: 'rob-bussteig-marker-container',
      html: `
        <button
          type="button"
          class="rob-bussteig-marker"
          aria-label="Bussteig ${escapeHtml(bussteigNumber)} anzeigen"
        >
          <span class="rob-bussteig-marker-label">
            Bussteig
          </span>

          <span class="rob-bussteig-marker-nummer">
            ${escapeHtml(bussteigNumber)}
          </span>
        </button>
      `,
      iconSize: [38, 38],
      iconAnchor: [19, 19]
    });

    const marker = L.marker(
      [
        Number(position.lat),
        Number(position.lon)
      ],
      {
        pane: 'robBussteigPane',
        icon,
        keyboard: true,
        draggable: true,
        title:
          `Bussteig ${bussteigNumber} – ${lineText}`,
        riseOnHover: true
      }
    );

    marker.bindTooltip(
      `
        <strong>Bussteig ${escapeHtml(bussteigNumber)}</strong><br>
        ${escapeHtml(lineText)}
      `,
      {
        direction: 'top',
        offset: [0, -12]
      }
    );

    marker.on('click', event => {
      L.DomEvent.stopPropagation(event);

      if (event.originalEvent) {
        event.originalEvent.vabLineHandled = true;
      }

      showRobBussteig(bussteigNumber);
    });

    marker.on('dragstart', () => {
      const markerElement =
        marker.getElement();

      markerElement?.classList.add(
        'rob-bussteig-wird-verschoben'
      );

      setStatus(
        `Bussteig ${bussteigNumber} wird verschoben`,
        'erfolg'
      );
    });

    marker.on('dragend', () => {
      updateRobPositionFromMarker(
        bussteigNumber,
        marker
      );

      const markerElement =
        marker.getElement();

      markerElement?.classList.remove(
        'rob-bussteig-wird-verschoben'
      );

      const latLng =
        marker.getLatLng();

      setStatus(
        `Bussteig ${bussteigNumber}: `
        + `${latLng.lat.toFixed(7)}, `
        + `${latLng.lng.toFixed(7)}`,
        'erfolg'
      );
    });

    marker.addTo(robBussteigLayer);

    /*
     * Der Dragging-Zustand wird erst gesetzt,
     * wenn der Layer wirklich auf der Karte liegt.
     */
    robBussteigMarkerNachNummer.set(
      bussteigNumber,
      marker
    );
  }

  karte.off(
    'zoomend',
    updateRobBussteigVisibility
  );

  karte.on(
    'zoomend',
    updateRobBussteigVisibility
  );

  updateRobBussteigVisibility();

  createRobEditControl();
}


function createRobMarker(configuration) {
  if (robMarker) {
    karte.removeLayer(robMarker);
  }

  const icon = L.divIcon({
    className: 'rob-marker-container',
    html: `
      <div
        class="rob-marker"
        role="button"
        aria-label="ROB-Aschaffenburg anzeigen"
      >
        <span class="rob-marker-titel">
          ROB-Aschaffenburg
        </span>
      </div>
    `,
    iconSize: [182, 42],
    iconAnchor: [91, 76]
  });

  robMarker = L.marker(
    [49.9804200, 9.1420500],
    {
      pane: 'robPane',
      icon,
      title: 'ROB-Aschaffenburg – Linien nach Bussteig',
      keyboard: true,
      riseOnHover: true
    }
  ).addTo(karte);

  robMarker.bindTooltip(
    'ROB-Aschaffenburg – Linien nach Bussteig',
    {
      direction: 'top',
      offset: [0, -20]
    }
  );

  robMarker.on('click', event => {
    L.DomEvent.stopPropagation(event);

    if (event.originalEvent) {
      event.originalEvent.vabLineHandled = true;
    }

    /*
     * Zuerst die ROB-Seitenleiste öffnen. Dadurch
     * verändert sich die tatsächlich verfügbare
     * Kartenbreite.
     */
    showRobSelection(configuration);

    /*
     * Anschließend die Kartengröße neu berechnen
     * und so weit auf den ROB zoomen, dass die
     * einzelnen Bussteige sichtbar werden.
     */
    window.setTimeout(() => {
      karte.invalidateSize();

      karte.setView(
        robMarker.getLatLng(),
        19,
        {
          animate: true,
          duration: 0.6
        }
      );

      /*
       * Die ROB-Seitenleiste liegt links über der Karte.
       * Deshalb den Kartenausschnitt um die halbe
       * Seitenleistenbreite nach rechts verschieben.
       * Der ROB erscheint dadurch mittig im tatsächlich
       * sichtbaren Kartenbereich.
       */
      const panelBreite =
        infoPanel.getBoundingClientRect().width;

      if (panelBreite > 0) {
        karte.panBy(
          [
            -panelBreite * 0.75,
            0
          ],
          {
            animate: true,
            duration: 0.4
          }
        );
      }

      updateRobBussteigVisibility();
    }, 180);
  });
}


async function loadMapData() {
  setStatus('Liniengeometrien werden geladen …');

  const variantenResponse = await fetch('data/linienvarianten_61.json', { cache: 'no-store' });

  if (!variantenResponse.ok) {
    throw new Error(
      `Linienvarianten 61: HTTP-Fehler ${variantenResponse.status}`
    );
  }

  linienvarianten61 =
    await variantenResponse.json();

  const variantenResponse68 = await fetch('data/linienvarianten_68.json', { cache: 'no-store' });

  if (!variantenResponse68.ok) {
    throw new Error(
      `Linienvarianten 68: HTTP-Fehler ${variantenResponse68.status}`
    );
  }

  linienvarianten68 =
    await variantenResponse68.json();

  const variantenResponse60 = await fetch('data/linienvarianten_60.json', { cache: 'no-store' });

  if (!variantenResponse60.ok) {
    throw new Error(
      `Linienvarianten 60: HTTP-Fehler ${variantenResponse60.status}`
    );
  }

  linienvarianten60 =
    await variantenResponse60.json();

  const variantenResponse63 = await fetch('data/linienvarianten_63.json', { cache: 'no-store' });

  if (!variantenResponse63.ok) {
    throw new Error(
      `Linienvarianten 63: HTTP-Fehler ${variantenResponse63.status}`
    );
  }

  const linienvarianten63 =
    await variantenResponse63.json();

  const variantenResponse64 = await fetch('data/linienvarianten_64.json', { cache: 'no-store' });

  if (!variantenResponse64.ok) {
    throw new Error(
      `Linienvarianten 64: HTTP-Fehler ${variantenResponse64.status}`
    );
  }

  const linienvarianten64 =
    await variantenResponse64.json();

  const variantenResponse65 = await fetch('data/linienvarianten_65.json', { cache: 'no-store' });

  if (!variantenResponse65.ok) {
    throw new Error(
      `Linienvarianten 65: HTTP-Fehler ${variantenResponse65.status}`
    );
  }

  const linienvarianten65 =
    await variantenResponse65.json();

  const variantenResponse62 = await fetch('data/linienvarianten_62.json', { cache: 'no-store' });

  if (!variantenResponse62.ok) {
    throw new Error(
      `Linienvarianten 62: HTTP-Fehler ${variantenResponse62.status}`
    );
  }

  const linienvarianten62 =
    await variantenResponse62.json();

  const variantenResponse67 = await fetch('data/linienvarianten_67.json', { cache: 'no-store' });

  if (!variantenResponse67.ok) {
    throw new Error(
      `Linienvarianten 67: HTTP-Fehler ${variantenResponse67.status}`
    );
  }

  const linienvarianten67 =
    await variantenResponse67.json();

  const variantenResponse69 = await fetch('data/linienvarianten_69.json', { cache: 'no-store' });

  if (!variantenResponse69.ok) {
    throw new Error(
      `Linienvarianten 69: HTTP-Fehler ${variantenResponse69.status}`
    );
  }

  const linienvarianten69 =
    await variantenResponse69.json();

  const variantenResponse76 = await fetch('data/linienvarianten_76.json', { cache: 'no-store' });

  if (!variantenResponse76.ok) {
    throw new Error(
      `Linienvarianten 76: HTTP-Fehler ${variantenResponse76.status}`
    );
  }

  const linienvarianten76 =
    await variantenResponse76.json();

  const variantenResponse74 = await fetch('data/linienvarianten_74.json', { cache: 'no-store' });

  if (!variantenResponse74.ok) {
    throw new Error(
      `Linienvarianten 74: HTTP-Fehler ${variantenResponse74.status}`
    );
  }

  const linienvarianten74 =
    await variantenResponse74.json();

  /*
   * Automatisch erzeugte Variantendateien werden gesammelt
   * geladen. Neue Linien müssen später nur noch in dieser
   * Liste ergänzt werden.
   */
  const automatischeVariantenLinien = [
    '2',
    '5',
    '6',
    '8',
    '9',
    '10',
    '11',
    '12',
    '14',
    '15',
    '29',
    '52',
    '54',
    '81',
    '88',
    '93',
    '95',
    '96',
    '97',
    '98',
    '99',
    'BG1',
    'GU2',
    'OF-85'
  ];

  const automatischGeladeneVarianten =
    await Promise.all(
      automatischeVariantenLinien.map(
        async (liniennummer) => {
          const response = await fetch(
            `data/linienvarianten_${liniennummer}.json`
          );

          if (!response.ok) {
            throw new Error(
              `Linienvarianten ${liniennummer}: ` +
              `HTTP-Fehler ${response.status}`
            );
          }

          return {
            liniennummer,
            konfiguration: await response.json()
          };
        }
      )
    );

  /*
   * Alle Variantendateien zentral registrieren.
   * Weitere Linien müssen später nur noch hier ergänzt werden.
   */
  linienvariantenNachLinie.set(
    '60',
    linienvarianten60
  );

  linienvariantenNachLinie.set(
    '61',
    linienvarianten61
  );

  linienvariantenNachLinie.set(
    '68',
    linienvarianten68
  );

  linienvariantenNachLinie.set(
    '63',
    linienvarianten63
  );

  linienvariantenNachLinie.set(
    '64',
    linienvarianten64
  );

  linienvariantenNachLinie.set(
    '65',
    linienvarianten65
  );

  linienvariantenNachLinie.set(
    '62',
    linienvarianten62
  );

  linienvariantenNachLinie.set(
    '67',
    linienvarianten67
  );

  linienvariantenNachLinie.set(
    '69',
    linienvarianten69
  );

  linienvariantenNachLinie.set(
    '76',
    linienvarianten76
  );

  linienvariantenNachLinie.set(
    '74',
    linienvarianten74
  );

  automatischGeladeneVarianten.forEach(
    ({ liniennummer, konfiguration }) => {
      linienvariantenNachLinie.set(
        liniennummer,
        konfiguration
      );
    }
  );

  setStatus(
    'Kartografisches Liniennetz wird geladen …'
  );

  const linienRenderGeoJSON = await loadGeoJSON(
    'data/liniennetz_render.geojson',
    'Kartografisches Liniennetz'
  );

  linienRenderLayer = L.geoJSON(
    linienRenderGeoJSON,
    {
      pane: 'linienRenderPane',
      renderer: linienRenderRenderer,
      style: renderLineStyle,
      interactive: false
    }
  ).addTo(karte);

  // In der Gesamtuebersicht bleiben die Linien dezent; beim Hineinzoomen normal.
  karte.on('zoomend', () => {
    if (linienRenderLayer) {
      linienRenderLayer.setStyle(renderLineStyle);
    }
  });

  const linienGeoJSON = await loadGeoJSON(
    'data/linien_routed.geojson',
    'Linien'
  );

  linienLayer = L.geoJSON(linienGeoJSON, {
    pane: 'linienPane',
    style: lineStyle,
    onEachFeature: addLineInteraction
  }).addTo(karte);

  createLineLabels();

  const bounds = linienLayer.getBounds();

  if (bounds.isValid()) {
    karte.fitBounds(bounds, {
      padding: [24, 24]
    });
  }

  setStatus(
    'Linienbeschriftungen werden geladen …'
  );

  linienLabelKorridoreGeoJSON = await loadGeoJSON(
    'data/liniennetz_labelkorridore.geojson',
    'OSM-Labelkorridore'
  );

  /*
   * Sammellabels jetzt ausschließlich aus den
   * topologisch exakten OSM-Korridoren erzeugen.
   */
  createLineLabels();

  setStatus(
    'Gemeinsame Linienabschnitte werden geladen …'
  );

  const abschnittGeoJSON = await loadGeoJSON(
    'data/gemeinsame_linienabschnitte.geojson',
    'Gemeinsame Linienabschnitte'
  );

  gemeinsameAbschnitteGeoJSON = abschnittGeoJSON;

  abschnittKlickLayer = L.geoJSON(
    abschnittGeoJSON,
    {
      pane: 'klickPane',

      style: {
        color: '#000000',
        weight: 10,
        opacity: 0.001,
        lineCap: 'round',
        lineJoin: 'round'
      },

      interactive: false
    }
  ).addTo(karte);

  const robResponse = await fetch(
    'data/rob_bussteige.json'
  );

  if (!robResponse.ok) {
    throw new Error(
      `ROB-Bussteige: HTTP-Fehler ${robResponse.status}`
    );
  }

  const robConfiguration =
    await robResponse.json();

  const robPositionResponse = await fetch(
    'data/rob_bussteig_positionen.json'
  );

  if (!robPositionResponse.ok) {
    throw new Error(
      `ROB-Bussteigpositionen: HTTP-Fehler ` +
      `${robPositionResponse.status}`
    );
  }

  const robPositionConfiguration =
    await robPositionResponse.json();

  // Die große ROB-Schaltfläche entfällt. Einzelne Bussteige bleiben erhalten.
  if (robMarker) {
    karte.removeLayer(robMarker);
    robMarker = null;
  }

  createRobBussteige(
    robPositionConfiguration,
    robConfiguration
  );

setStatus(
    `${linienGeoJSON.features.length.toLocaleString('de-DE')} Linienmuster, `
    + `${linienNachName.size.toLocaleString('de-DE')} Linien und `
    + `${abschnittGeoJSON.features.length.toLocaleString('de-DE')} gemeinsame Abschnitte geladen`,
    'erfolg'
  );
}


/*
 * ======================================================
 * VAB QUALITÄTSPRÜFUNG – SICHTBARE LINIENBESCHRIFTUNGEN
 * ======================================================
 *
 * Prüft für den aktuellen Kartenausschnitt:
 * - welche Linien dort geometrisch sichtbar sind
 * - welche davon durch Sammel-/Einzellabels dargestellt
 *   werden
 * - welche sichtbaren Linien keine Beschriftung besitzen
 *
 * Keine Änderung an der Kartendarstellung.
 */
window.vabPruefeSichtbareLinienlabels = function() {
  const bounds =
    karte.getBounds();

  const sichtbareLinien =
    new Set();

  for (
    const [lineName, layers]
    of linienNachName.entries()
  ) {
    if (
      !lineName
      || !Array.isArray(layers)
    ) {
      continue;
    }

    let sichtbar = false;

    for (const layer of layers) {
      if (
        typeof layer.getBounds === 'function'
        && layer.getBounds().isValid()
        && bounds.intersects(
          layer.getBounds()
        )
      ) {
        sichtbar = true;
        break;
      }
    }

    if (sichtbar) {
      sichtbareLinien.add(
        String(lineName)
      );
    }
  }

  const dargestellteLinien =
    new Set();

  /*
   * Sammellabels
   */
  document
    .querySelectorAll(
      '.vab-linienlabel[data-lines]'
    )
    .forEach(element => {
      const lines =
        String(
          element.dataset.lines
          ?? ''
        )
          .split(',')
          .map(value => value.trim())
          .filter(Boolean);

      for (const line of lines) {
        dargestellteLinien.add(line);
      }
    });

  /*
   * Einzellabels
   */
  document
    .querySelectorAll(
      '.vab-linienlabel[data-line]'
    )
    .forEach(element => {
      const line =
        String(
          element.dataset.line
          ?? ''
        ).trim();

      if (line) {
        dargestellteLinien.add(line);
      }
    });

  const fehlendeLinien =
    [...sichtbareLinien]
      .filter(
        line =>
          !dargestellteLinien.has(line)
      )
      .sort(sortLines);

  const sichtbareSortiert =
    sortLines(
      [...sichtbareLinien]
    );

  const dargestellteSortiert =
    sortLines(
      [...dargestellteLinien]
    );

  const ergebnis = {
    zoom:
      karte.getZoom(),

    sichtbareLinien:
      sichtbareSortiert,

    dargestellteLinien:
      dargestellteSortiert,

    fehlendeLinien,

    anzahlSichtbar:
      sichtbareSortiert.length,

    anzahlDargestellt:
      dargestellteSortiert.length,

    anzahlFehlend:
      fehlendeLinien.length,

    status:
      fehlendeLinien.length === 0
        ? 'OK'
        : 'FEHLER'
  };

  console.group(
    `VAB Label-QA | Zoom ${ergebnis.zoom} | ${ergebnis.status}`
  );

  console.log(
    'Sichtbare Linien:',
    ergebnis.anzahlSichtbar
  );

  console.log(
    'Durch Labels dargestellt:',
    ergebnis.anzahlDargestellt
  );

  console.log(
    'Fehlende sichtbare Linien:',
    ergebnis.anzahlFehlend
  );

  if (fehlendeLinien.length > 0) {
    console.warn(
      'FEHLENDE LINIEN:',
      fehlendeLinien.join(', ')
    );
  } else {
    console.log(
      'Alle sichtbaren Linien besitzen mindestens eine Beschriftung.'
    );
  }

  console.groupEnd();

  return ergebnis;
};


window.vabLabelQA = function() {
  const result =
    window.vabPruefeSichtbareLinienlabels();

  console.table([
    {
      Zoom:
        result.zoom,

      Sichtbar:
        result.anzahlSichtbar,

      Beschriftet:
        result.anzahlDargestellt,

      Fehlend:
        result.anzahlFehlend,

      Status:
        result.status,

      Fehlende_Linien:
        result.fehlendeLinien.join(', ')
    }
  ]);

  return result;
};


karte.on('click', event => {
  /*
   * Der Linienhandler hat diesen Klick bereits verarbeitet.
   * Deshalb darf die Karte die Auswahl nicht sofort wieder löschen.
   */
  if (
    event.originalEvent
    && event.originalEvent.vabLineHandled
  ) {
    return;
  }

  removeSelection();

  if (fixierteLinie) {
    resetLineStyle(fixierteLinie);
    fixierteLinie = null;
  }

  setStatus(
    `${linienNachName.size.toLocaleString('de-DE')} Linien verfügbar`,
    'erfolg'
  );
});

function refreshMapAfterPanelChange() {
  /*
   * Die Seitenleiste verändert während ihrer Animation
   * mehrfach die verfügbare Kartenbreite. Leaflet wird
   * deshalb zu mehreren Zeitpunkten aktualisiert.
   */
  karte.invalidateSize({
    pan: false,
    debounceMoveend: true
  });

  window.requestAnimationFrame(() => {
    karte.invalidateSize({
      pan: false,
      debounceMoveend: true
    });
  });

  for (const delay of [80, 160, 260, 400]) {
    window.setTimeout(() => {
      karte.invalidateSize({
        pan: false,
        debounceMoveend: true
      });
    }, delay);
  }
}

infoPanelSchliessen.addEventListener('click', event => {
  infoPanel.classList.remove('vab-dialog-mode');
  event.preventDefault();
  event.stopPropagation();
  L.DomEvent.stopPropagation(event);

  if (fixierteLinie) {
    resetLineStyle(fixierteLinie);
    fixierteLinie = null;
  }

  removeSelection();
  refreshMapAfterPanelChange();

  /*
   * Nach dem Schließen muss der Kartencontainer
   * ausdrücklich wieder den Tastaturfokus erhalten.
   */
  window.setTimeout(() => {
    karte.getContainer().focus({
      preventScroll: true
    });
  }, 270);

  setStatus(
    `${linienNachName.size.toLocaleString('de-DE')} Linien verfügbar`,
    'erfolg'
  );
});

loadMapData().catch(error => {
  console.error(error);

  setStatus(
    `Fehler beim Laden der Karte: ${error.message}`,
    'fehler'
  );
});

/* BEGIN VAB-SUCHE */

let vabSuchindex = null;
let vabFahrplanindex = null;
let vabAktuelleHaltestelle = null;
let vabAktuellerOrt = null;
let vabAktuelleLinie = null;
let vabAktuellerWochentag =
  (new Date().getDay() + 6) % 7;

const vabWochentage = [
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag'
];


function vabNormalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[.,/()-]/g, ' ')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}


function vabNaturalSort(values) {
  return [...values].sort((a, b) =>
    String(a).localeCompare(
      String(b),
      'de',
      {
        numeric: true,
        sensitivity: 'base'
      }
    )
  );
}


function vabResetSearchView() {
  vabCloseSuggestions();

  vabAktuelleHaltestelle = null;
  vabAktuelleLinie = null;

  /*
   * Vorhandene Linien-, Abschnitts- und
   * Haltestellenauswahl vollständig zurücksetzen.
   */
  removeSelection();

  if (fixierteLinie) {
    resetLineStyle(fixierteLinie);
    fixierteLinie = null;
  }

  /*
   * Informationsspalte schließen.
   */
  infoPanel.classList.remove('sichtbar');

  infoPanel.setAttribute(
    'aria-hidden',
    'true'
  );

  /*
   * Ursprünglichen Kartenausschnitt wiederherstellen.
   */
  karte.setView(
    [49.97, 9.15],
    9,
    {
      animate: true
    }
  );

  refreshMapAfterPanelChange();

  setStatus(
    `${linienNachName.size.toLocaleString('de-DE')} Linien verfügbar`,
    'erfolg'
  );
}


function vabCloseSuggestions() {
  vabSucheVorschlaege.hidden = true;
  vabSucheVorschlaege.innerHTML = '';

  vabSucheEingabe.setAttribute(
    'aria-expanded',
    'false'
  );
}


function vabSearchScore(searchText, query) {
  if (searchText === query) {
    return 0;
  }

  if (searchText.startsWith(query)) {
    return 1;
  }

  const words = searchText.split(' ');

  if (
    words.some(word =>
      word.startsWith(query)
    )
  ) {
    return 2;
  }

  if (searchText.includes(query)) {
    return 3;
  }

  return 99;
}


function vabGetStopConnections(stopId) {
  const departures =
    vabFahrplanindex
      ?.departures_by_station
      ?.[stopId]
    ?? [];

  const connectionMap = new Map();

  for (const departure of departures) {
    const line =
      String(departure?.[1] ?? '').trim();

    const direction =
      String(departure?.[2] ?? '').trim()
      || 'Richtung nicht angegeben';

    if (!line) {
      continue;
    }

    const key =
      `${line}|${direction}`;

    if (!connectionMap.has(key)) {
      connectionMap.set(key, {
        line,
        direction
      });
    }
  }

  return [...connectionMap.values()]
    .sort((a, b) => {
      const lineComparison =
        String(a.line).localeCompare(
          String(b.line),
          'de',
          {
            numeric: true,
            sensitivity: 'base'
          }
        );

      if (lineComparison !== 0) {
        return lineComparison;
      }

      return String(a.direction).localeCompare(
        String(b.direction),
        'de',
        {
          sensitivity: 'base'
        }
      );
    });
}


function vabFindSearchResults(queryText) {
  if (!vabSuchindex) {
    return [];
  }

  const query =
    vabNormalizeSearchText(queryText);

  if (query.length < 2) {
    return [];
  }

  const results = [];

  for (const place of vabSuchindex.places ?? []) {
    const score =
      vabSearchScore(place.search, query);

    if (score >= 99) {
      continue;
    }

    results.push({
      type: 'place',
      id: place.name,
      title: place.name,
      subtitle:
        `${place.station_ids.length} Haltestellen · `
        + `${place.lines.length} Linien`,
      lines: vabNaturalSort(
        place.lines ?? []
      ),
      score
    });
  }

  for (const stop of vabSuchindex.stops ?? []) {
    const score =
      vabSearchScore(stop.search, query);

    if (score >= 99) {
      continue;
    }

    const connections =
      vabGetStopConnections(stop.id);

    results.push({
      type: 'stop',
      id: stop.id,
      title: stop.name,
      subtitle:
        `${stop.lines.length} Linien`,
      lines:
        vabNaturalSort(
          stop.lines ?? []
        ),
      connections,
      score
    });
  }

  return results
    .sort((a, b) =>
      a.score - b.score
      || a.type.localeCompare(b.type)
      || a.title.localeCompare(
        b.title,
        'de',
        {
          numeric: true,
          sensitivity: 'base'
        }
      )
    )
    .slice(0, 10);
}


function vabRenderSuggestions(queryText) {
  const results =
    vabFindSearchResults(queryText);

  if (results.length === 0) {
    vabCloseSuggestions();
    return;
  }

  vabSucheVorschlaege.innerHTML =
    results.map(result => {
      const connections =
        Array.isArray(result.connections)
          ? result.connections
          : [];

      const visibleConnections =
        connections.slice(0, 5);

      const connectionsHtml =
        result.type === 'stop'
          ? `
              <span class="vab-suche-ort-info">
                <small>
                  ${escapeHtml(result.subtitle)}
                </small>

                ${
                  Array.isArray(result.lines)
                  && result.lines.length > 0
                    ? `
                        <span class="vab-suche-ort-linien">
                          ${result.lines.map(line => `
                            <span class="vab-suche-linie">
                              ${escapeHtml(vabDisplayLineName(line))}
                            </span>
                          `).join('')}
                        </span>
                      `
                    : ''
                }
              </span>
            `
          : `
              <span class="vab-suche-ort-info">
                <small>
                  ${escapeHtml(result.subtitle)}
                </small>

                ${
                  Array.isArray(result.lines)
                  && result.lines.length > 0
                    ? `
                        <span class="vab-suche-ort-linien">
                          ${result.lines.map(line => `
                            <span class="vab-suche-linie">
                              ${escapeHtml(vabDisplayLineName(line))}
                            </span>
                          `).join('')}
                        </span>
                      `
                    : ''
                }
              </span>
            `;

      return `
        <button
          type="button"
          class="vab-suche-treffer"
          role="option"
          data-search-type="${escapeHtml(result.type)}"
          data-search-id="${escapeHtml(result.id)}"
        >
          <span class="vab-suche-treffer-typ">
            ${result.type === 'place' ? 'Ort' : 'Haltestelle'}
          </span>

          <span class="vab-suche-treffer-inhalt">
            <strong>
              ${escapeHtml(result.title)}
            </strong>

            ${connectionsHtml}
          </span>
        </button>
      `;
    }).join('');

  vabSucheVorschlaege.hidden = false;

  vabSucheEingabe.setAttribute(
    'aria-expanded',
    'true'
  );
}


function vabGetStopById(stopId) {
  return (
    vabSuchindex?.stops?.find(
      stop => String(stop.id) === String(stopId)
    )
    ?? null
  );
}


function vabGetPlaceByName(placeName) {
  return (
    vabSuchindex?.places?.find(
      place =>
        String(place.name) ===
        String(placeName)
    )
    ?? null
  );
}


function vabOpenLineDialog() {
  karte.closePopup();
  infoPanel.classList.add('sichtbar', 'vab-dialog-mode');
  infoPanel.setAttribute('aria-hidden', 'false');
  window.setTimeout(() => karte.invalidateSize(), 250);
}

function vabOpenInfoPanel() {
  infoPanel.classList.remove('vab-dialog-mode');
  infoPanel.classList.add('sichtbar');

  infoPanel.setAttribute(
    'aria-hidden',
    'false'
  );

  refreshMapAfterPanelChange();
}


function vabCreateLineButtons(lines, stopId = '') {
  return vabNaturalSort(lines).map(line => {
    const displayLine =
      vabDisplayLineName(line);

    return `
      <button
        type="button"
        class="linien-auswahl-button vab-suche-linien-button"
        data-search-line="${escapeHtml(line)}"
        data-search-stop="${escapeHtml(stopId)}"
      >
        <span class="linien-auswahl-nummer">
          ${escapeHtml(displayLine)}
        </span>

        <span class="linien-auswahl-text">
          Linie ${escapeHtml(displayLine)} anzeigen
        </span>

        <span
          class="linien-auswahl-pfeil"
          aria-hidden="true"
        >
          ›
        </span>
      </button>
    `;
  }).join('');
}


function vabBindLineButtons() {
  for (
    const button
    of infoPanelInhalt.querySelectorAll(
      '.vab-suche-linien-button'
    )
  ) {
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();

      const line =
        String(button.dataset.searchLine ?? '')
          .trim();

      const stopId =
        String(button.dataset.searchStop ?? '')
          .trim();

      if (!line) {
        return;
      }

      selectLineFromStopSearch(line);

      if (stopId) {
        const stop =
          vabGetStopById(stopId);

        if (stop) {
          vabShowSchedule(stop, line);
        }

        return;
      }

      if (vabAktuellerOrt) {
        vabShowPlaceSchedule(
          vabAktuellerOrt,
          line
        );
      }
    });
  }
}


function vabShowPlace(place) {
  if (!place) {
    return;
  }

  vabAktuellerOrt = place;
  vabAktuelleHaltestelle = null;
  vabAktuelleLinie = null;


  vabCloseSuggestions();

  const stops = (place.station_ids ?? [])
    .map(vabGetStopById)
    .filter(Boolean)
    .sort((a, b) =>
      a.name.localeCompare(
        b.name,
        'de',
        {
          numeric: true,
          sensitivity: 'base'
        }
      )
    );

  const stopHtml = stops.map(stop => `
    <button
      type="button"
      class="vab-ort-haltestelle"
      data-search-stop-select="${escapeHtml(stop.id)}"
    >
      <span>
        ${escapeHtml(stop.name)}
      </span>

      <small>
        ${escapeHtml(
          vabNaturalSort(stop.lines)
            .map(vabDisplayLineName)
            .join(', ')
        )}
      </small>
    </button>
  `).join('');

  infoPanelInhalt.innerHTML = `
    <div class="seitenleisten-inhalt vab-suche-panel">
      <div class="vab-suche-panel-kennung">
        Ort
      </div>

      <h2>${escapeHtml(place.name)}</h2>

      <p class="gemeinsame-auswahl-hinweis">
        Wählen Sie eine Linie für die Kartenansicht
        oder eine Haltestelle für den Regelfahrplan.
      </p>

      <section class="vab-suche-panel-bereich">
        <h3>Linien im Ort</h3>

        <div class="linien-auswahl-liste">
          ${vabCreateLineButtons(place.lines)}
        </div>
      </section>

      <section class="vab-suche-panel-bereich">
        <h3>Haltestellen</h3>

        <div class="vab-ort-haltestellen">
          ${stopHtml}
        </div>
      </section>
    </div>
  `;

  vabOpenInfoPanel();
  vabBindLineButtons();

  for (
    const button
    of infoPanelInhalt.querySelectorAll(
      '[data-search-stop-select]'
    )
  ) {
    button.addEventListener('click', () => {
      const stop =
        vabGetStopById(
          button.dataset.searchStopSelect
        );

      vabShowStop(stop);
    });
  }

  setStatus(
    `${place.name}: Linien und Haltestellen angezeigt`,
    'erfolg'
  );
}


function vabFocusStopOnMap(stop, delay = 0) {
  if (
    !stop
    || !Number.isFinite(Number(stop.lat))
    || !Number.isFinite(Number(stop.lon))
  ) {
    return;
  }

  const latitude =
    Number(stop.lat);

  const longitude =
    Number(stop.lon);

  window.setTimeout(
    () => {
      karte.invalidateSize();

      karte.setView(
        [
          latitude,
          longitude
        ],
        karte.getMaxZoom(),
        {
          animate: true
        }
      );
    },
    delay
  );
}


window.vabFocusStopInLine = function(stopId) {
  const marker =
    vabFindVisibleStopMarker(
      stopId
    );

  if (marker) {
    const latlng =
      marker.getLatLng();

    window.setTimeout(
      () => {
        karte.invalidateSize();

        karte.setView(
          [
            latlng.lat,
            latlng.lng
          ],
          karte.getMaxZoom(),
          {
            animate: true
          }
        );
      },
      60
    );

    window.dispatchEvent(
      new CustomEvent(
        'vab-line-stop-focused',
        {
          detail: {
            stopId:
              String(
                marker.vabStopId
                ?? stopId
              )
          }
        }
      )
    );

    return;
  }

  /*
   * Rueckfallebene fuer normale Parent-Haltestellen.
   */
  const stop =
    vabGetStopById(stopId);

  if (!stop) {
    return;
  }

  vabFocusStopOnMap(
    stop,
    60
  );

  window.dispatchEvent(
    new CustomEvent(
      'vab-line-stop-focused',
      {
        detail: {
          stopId:
            String(stop.id ?? stopId)
        }
      }
    )
  );
};

function vabShowStop(stop) {
  if (!stop) {
    return;
  }

  vabAktuelleHaltestelle = stop;
  vabAktuelleLinie = null;

  vabCloseSuggestions();

  infoPanelInhalt.innerHTML = `
    <div class="seitenleisten-inhalt vab-suche-panel">
      <div class="vab-suche-panel-kennung">
        H
      </div>

      <h2>${escapeHtml(stop.name)}</h2>

      <p class="gemeinsame-auswahl-hinweis">
        Wählen Sie eine Linie. Anschließend können Sie
        den zugehörigen Aushangfahrplan als PDF öffnen.
      </p>

      <section class="vab-suche-panel-bereich">
        <h3>Linien an dieser Haltestelle</h3>

        <div class="linien-auswahl-liste">
          ${vabCreateLineButtons(
            stop.lines,
            stop.id
          )}
        </div>
      </section>
    </div>
  `;

  vabOpenInfoPanel();
  vabBindLineButtons();

  vabFocusStopOnMap(stop, 260);

  setStatus(
    `${stop.name}: ${stop.lines.length} Linien gefunden`,
    'erfolg'
  );
}



let vabFahrplanPdfZuordnung = {};


function vabGetSchedulePdfDocuments(line) {
  const key = String(line ?? '').trim();

  const documents =
    vabFahrplanPdfZuordnung[key];

  return Array.isArray(documents)
    ? documents
    : [];
}


function vabCreateSchedulePdfHtml(line) {
  const documents =
    vabGetSchedulePdfDocuments(line);

  if (documents.length === 0) {
    return `
      <div class="vab-fahrplan-pdf-fehlt">
        Für die Linie
        <strong>${escapeHtml(vabDisplayLineName(line))}</strong>
        ist derzeit kein PDF hinterlegt.
      </div>
    `;
  }

  return documents.map(document => {
    const documentType =
      document.type
      || 'Fahrplan';

    const detail =
      document.valid_from
        ? `Stand/Gültigkeit: ${document.valid_from}`
        : (
            document.title
            || 'PDF in neuem Browserfenster öffnen'
          );

    return `
      <a
        class="vab-fahrplan-pdf-link"
        href="${escapeHtml(document.url)}"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span class="vab-fahrplan-pdf-symbol">
          PDF
        </span>

        <span class="vab-fahrplan-pdf-text">
          <strong>
            ${escapeHtml(documentType)}
          </strong>

          <span>
            ${escapeHtml(detail)}
          </span>
        </span>

        <span
          class="vab-fahrplan-pdf-pfeil"
          aria-hidden="true"
        >
          ↗
        </span>
      </a>
    `;
  }).join('');
}

function vabShowPlaceSchedule(
  place,
  line
) {
  if (!place || !line) {
    return;
  }

  vabAktuellerOrt = place;
  vabAktuelleHaltestelle = null;
  vabAktuelleLinie = line;

  const pdfHtml =
    vabCreateSchedulePdfHtml(line);

  infoPanelInhalt.innerHTML = `
    <div class="seitenleisten-inhalt vab-suche-panel">
      <div class="liniennummer-gross">
        ${escapeHtml(vabDisplayLineName(line))}
      </div>

      <h2>${escapeHtml(place.name)}</h2>

      <p class="gemeinsame-auswahl-hinweis">
        Verfügbare Fahrplandokumente der Linie
        ${escapeHtml(vabDisplayLineName(line))}.
      </p>

      <div class="vab-fahrplan-pdf-bereich">
        ${pdfHtml}
      </div>

      <button
        type="button"
        class="vab-zurueck-haltestelle"
      >
        Zurück zu allen Linien
      </button>
    </div>
  `;

  vabOpenInfoPanel();

  /*
   * Nach der Auswahl einer Linie aus der
   * Haltestellensuche wieder gezielt auf die
   * zuvor gesuchte Haltestelle zoomen.
   *
   * selectLineFromStopSearch() zeigt zunächst
   * den vollständigen Linienverlauf. Für den
   * Suchkontext soll anschließend jedoch die
   * Haltestelle im Mittelpunkt bleiben.
   */
  if (
    Number.isFinite(Number(stop.lat))
    && Number.isFinite(Number(stop.lon))
  ) {
    karte.setView(
      [
        Number(stop.lat),
        Number(stop.lon)
      ],
      16,
      {
        animate: true
      }
    );
  }

  infoPanelInhalt
    .querySelector('.vab-zurueck-haltestelle')
    ?.addEventListener(
      'click',
      () => vabShowPlace(place)
    );

  setStatus(
    `Linie ${vabDisplayLineName(line)}: Fahrplandokumente für ${place.name}`,
    'erfolg'
  );
}

function vabShowSchedule(
  stop,
  line,
  returnContext = 'stop'
) {
  if (!stop || !line) {
    return;
  }

  vabAktuellerOrt = null;
  vabAktuelleHaltestelle = stop;
  vabAktuelleLinie = line;

  const displayLine =
    vabDisplayLineName(line);

  const backLabel =
    returnContext === 'rob'
      ? 'Zurück zum ROB'
      : (
          returnContext === 'map'
            ? 'Zurück zur Karte'
            : 'Zurück zur Haltestelle'
        );

  const pdfHtml =
    vabCreateSchedulePdfHtml(line);

  infoPanelInhalt.innerHTML = `
    <div class="seitenleisten-inhalt vab-suche-panel">
      <div
        class="vab-panel-navigation"
        aria-label="Navigation"
      >
        <button
          type="button"
          class="vab-panel-nav-button vab-panel-nav-zurueck"
        >
          <span aria-hidden="true">←</span>
          ${escapeHtml(backLabel)}
        </button>

        <button
          type="button"
          class="vab-panel-nav-button vab-panel-nav-start"
        >
          <span aria-hidden="true">↻</span>
          Kartenstart
        </button>
      </div>

      <div class="liniennummer-gross">
        ${escapeHtml(displayLine)}
      </div>

      <h2>Linie ${escapeHtml(displayLine)}</h2>

      <p class="gemeinsame-auswahl-hinweis">
        Fahrplandokumente für die Haltestelle
        <strong>${escapeHtml(stop.name)}</strong>.
      </p>

      <section class="vab-fahrplan-dokument-bereich">
        <h3>Fahrplandokument</h3>

        <div class="vab-fahrplan-pdf-bereich">
          ${pdfHtml}
        </div>
      </section>

      <button
        type="button"
        class="vab-zurueck-haltestelle"
      >
        Zurück zu allen Linien
      </button>
    </div>
  `;

  vabOpenInfoPanel();

  /*
   * Kontextabhängige Rücknavigation.
   *
   * ROB:
   * zurück zur Bussteig-/Linienauswahl.
   *
   * Karte:
   * Fahrtansicht schließen und ausgewählte Linie
   * mit ihren Haltestellen wieder anzeigen.
   *
   * Haltestellensuche:
   * zurück zur ursprünglichen Haltestelle.
   */
  const handleScheduleBack = () => {
    if (
      returnContext === 'rob'
      && robConfigurationAktuell
    ) {
      showRobSelection(
        robConfigurationAktuell
      );

      return;
    }

    if (returnContext === 'map') {
      selectLineFromStopSearch(
        line
      );

      return;
    }

    vabShowStop(
      stop
    );
  };

  infoPanelInhalt
    .querySelector('.vab-panel-nav-zurueck')
    ?.addEventListener(
      'click',
      handleScheduleBack
    );

  infoPanelInhalt
    .querySelector('.vab-panel-nav-start')
    ?.addEventListener(
      'click',
      () => window.location.reload()
    );

  /*
   * Die Kartenposition wird anhand der gewählten Haltestelle gesetzt.
   * Eine dynamische Fahrt- oder Plattformabfrage findet nicht statt.
   */
  const visiblePlatformsForParent =
    vabSichtbareHaltestellenMarker.filter(
      marker =>
        String(
          marker?.vabStopGroupId ?? ''
        )
        === String(stop.id ?? '')
    );

  if (
    visiblePlatformsForParent.length <= 1
  ) {
    window.setTimeout(
      () => {
        if (
          Number.isFinite(Number(stop.lat))
          && Number.isFinite(Number(stop.lon))
        ) {
          karte.invalidateSize();

          karte.setView(
            [
              Number(stop.lat),
              Number(stop.lon)
            ],
            karte.getMaxZoom(),
            {
              animate: false
            }
          );
        }
      },
      350
    );
  }

  infoPanelInhalt
    .querySelector('.vab-zurueck-haltestelle')
    ?.addEventListener(
      'click',
      handleScheduleBack
    );

  setStatus(
    `Linie ${displayLine}: Fahrplandokument`,
    'erfolg'
  );
}
function vabSelectSearchResult(type, id) {
  if (type === 'place') {
    vabShowPlace(
      vabGetPlaceByName(id)
    );

    return;
  }

  if (type === 'stop') {
    vabShowStop(
      vabGetStopById(id)
    );
  }
}



function vabApplyMunicipalityMappings(
  searchIndex,
  municipalityMapping
) {
  if (
    !searchIndex
    || !municipalityMapping?.gemeinden
  ) {
    return searchIndex;
  }

  const stops =
    Array.isArray(searchIndex.stops)
      ? searchIndex.stops
      : [];

  const existingPlaces =
    Array.isArray(searchIndex.places)
      ? searchIndex.places
      : [];

  const generatedMunicipalities = [];

  for (
    const [municipalityName, config]
    of Object.entries(
      municipalityMapping.gemeinden
    )
  ) {
    const districtNames = new Set(
      (config?.ortsteile ?? [])
        .map(value => String(value).trim())
        .filter(Boolean)
    );

    if (districtNames.size === 0) {
      continue;
    }

    const matchingStops = stops.filter(stop =>
      districtNames.has(
        String(stop.place ?? '').trim()
      )
    );

    const stationIds = [
      ...new Set(
        matchingStops
          .map(stop => String(stop.id ?? '').trim())
          .filter(Boolean)
      )
    ].sort((a, b) =>
      a.localeCompare(
        b,
        'de',
        {
          numeric: true,
          sensitivity: 'base'
        }
      )
    );

    const lines = [
      ...new Set(
        matchingStops.flatMap(
          stop => stop.lines ?? []
        )
      )
    ].sort((a, b) =>
      String(a).localeCompare(
        String(b),
        'de',
        {
          numeric: true,
          sensitivity: 'base'
        }
      )
    );

    if (stationIds.length === 0) {
      console.warn(
        `Keine Haltestellen für Gemeinde `
        + `${municipalityName} gefunden.`,
        [...districtNames]
      );

      continue;
    }

    generatedMunicipalities.push({
      name: municipalityName,
      search: vabNormalizeSearchText(
        municipalityName
      ),
      station_ids: stationIds,
      lines,
      municipality: true,
      districts: [...districtNames]
    });
  }

  const generatedNames = new Set(
    generatedMunicipalities.map(
      place => place.name
    )
  );

  /*
   * Bereits vorhandene gleichnamige Einträge werden
   * durch die zentral erzeugte Gemeindeansicht ersetzt.
   */
  const remainingPlaces =
    existingPlaces.filter(
      place =>
        !generatedNames.has(
          String(place.name ?? '')
        )
    );

  searchIndex.places = [
    ...remainingPlaces,
    ...generatedMunicipalities
  ].sort((a, b) =>
    String(a.name ?? '').localeCompare(
      String(b.name ?? ''),
      'de',
      {
        numeric: true,
        sensitivity: 'base'
      }
    )
  );

  return searchIndex;
}



function vabNormalizePlaceAliasKey(value) {
  let normalized =
    vabNormalizeSearchText(
      value
    );

  /*
   * Netzweit bekannte Schreibvarianten derselben
   * geografischen Zusatzbezeichnung vereinheitlichen.
   *
   * Diese Funktion verändert NICHT die Originaldaten,
   * sondern nur den Gruppierungsschlüssel der Suche.
   */
  normalized = normalized
    .replace(/\bmain\b/g, 'main')
    .replace(/\bm\b/g, 'main')
    .replace(/\bufr\b/g, 'ufr')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized;
}



function vabChooseCanonicalPlaceName(names) {
  const candidates =
    [...new Set(
      (names ?? [])
        .map(value => String(value ?? '').trim())
        .filter(Boolean)
    )];

  if (candidates.length === 0) {
    return '';
  }

  /*
   * Für die Anzeige verständliche ausgeschriebene
   * Schreibweisen bevorzugen:
   *
   *   Sulzbach (Main) vor Sulzbach/M.
   *   Michelbach (Ufr.) vor Michelbach (Ufr)
   *
   * Keine ortsspezifische Namensliste.
   */
  candidates.sort((a, b) => {
    function score(value) {
      let result = 0;

      if (value.includes('(') && value.includes(')')) {
        result += 100;
      }

      if (!value.includes('/')) {
        result += 20;
      }

      if (/\.\)$/.test(value)) {
        result += 5;
      }

      /*
       * Bei sonst gleicher Qualität die informativere
       * Schreibweise bevorzugen.
       */
      result += Math.min(
        String(value).length,
        50
      ) / 100;

      return result;
    }

    const scoreDifference =
      score(b) - score(a);

    if (Math.abs(scoreDifference) > 0.000001) {
      return scoreDifference;
    }

    return a.localeCompare(
      b,
      'de',
      {
        numeric: true,
        sensitivity: 'base'
      }
    );
  });

  return candidates[0];
}



function vabConsolidatePlaceAliases(searchIndex) {
  if (
    !searchIndex
    || !Array.isArray(searchIndex.places)
  ) {
    return searchIndex;
  }

  const stops =
    Array.isArray(searchIndex.stops)
      ? searchIndex.stops
      : [];

  /*
   * --------------------------------------------------
   * KANONISCHE HALTESTELLEN-ID
   * --------------------------------------------------
   *
   * Im Ortsindex können sowohl echte stop.id-Werte
   * als auch einzelne GTFS-/DELFI-Member-IDs stehen.
   *
   * Jede solche ID wird deshalb zuerst auf genau den
   * kanonischen Stop-Datensatz zurückgeführt.
   */
  const canonicalStopIdByAnyId =
    new Map();

  for (const stop of stops) {
    const canonicalId =
      String(
        stop?.id
        ?? ''
      ).trim();

    if (!canonicalId) {
      continue;
    }

    canonicalStopIdByAnyId.set(
      canonicalId,
      canonicalId
    );

    for (
      const memberId
      of (
        Array.isArray(stop?.member_stop_ids)
          ? stop.member_stop_ids
          : []
      )
    ) {
      const id =
        String(memberId ?? '').trim();

      if (id) {
        canonicalStopIdByAnyId.set(
          id,
          canonicalId
        );
      }
    }
  }

  const groups =
    new Map();

  for (const place of searchIndex.places) {
    const name =
      String(
        place?.name
        ?? ''
      ).trim();

    if (!name) {
      continue;
    }

    const key =
      vabNormalizePlaceAliasKey(
        name
      );

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(place);
  }

  const consolidated = [];

  for (const [key, group] of groups) {
    const names =
      group.map(
        place =>
          String(
            place?.name
            ?? ''
          ).trim()
      ).filter(Boolean);

    const canonicalName =
      vabChooseCanonicalPlaceName(
        names
      );

    /*
     * Erst alle station_ids auf kanonische Stops
     * auflösen, DANN deduplizieren.
     */
    const stationIds =
      [...new Set(
        group.flatMap(place =>
          (
            Array.isArray(place?.station_ids)
              ? place.station_ids
              : []
          )
          .map(value =>
            String(value ?? '').trim()
          )
          .filter(Boolean)
          .map(id =>
            canonicalStopIdByAnyId.get(id)
            ?? id
          )
        )
      )];

    /*
     * Nur IDs behalten, für die tatsächlich ein
     * Stop-Datensatz existiert.
     *
     * Damit können verwaiste Member-/Steig-IDs nicht
     * mehr als zusätzliche Haltestelle gezählt werden.
     */
    const validStationIds =
      stationIds.filter(
        id =>
          canonicalStopIdByAnyId.has(id)
      );

    /*
     * Linien nicht mehr aus den alten Place-Einträgen
     * übernehmen, sondern aus den tatsächlich
     * zugeordneten kanonischen Stops neu bestimmen.
     */
    const validStationIdSet =
      new Set(validStationIds);

    const lines =
      vabNaturalSort(
        [...new Set(
          stops
            .filter(stop =>
              validStationIdSet.has(
                String(stop?.id ?? '').trim()
              )
            )
            .flatMap(stop =>
              Array.isArray(stop?.lines)
                ? stop.lines.map(String)
                : []
            )
        )]
      );

    const searchTerms =
      [...new Set(
        group.flatMap(place => [
          String(place?.search ?? '').trim(),
          vabNormalizeSearchText(
            place?.name
            ?? ''
          )
        ])
        .filter(Boolean)
      )];

    const base =
      group.find(
        place =>
          String(place?.name ?? '').trim()
          === canonicalName
      )
      ?? group[0];

    consolidated.push({
      ...base,

      name:
        canonicalName,

      search:
        searchTerms.join(' '),

      station_ids:
        validStationIds.sort((a, b) =>
          a.localeCompare(
            b,
            'de',
            {
              numeric: true,
              sensitivity: 'base'
            }
          )
        ),

      lines,

      aliases:
        vabNaturalSort(
          names.filter(
            name =>
              name !== canonicalName
          )
        ),

      alias_key:
        key
    });
  }

  searchIndex.places =
    consolidated.sort((a, b) =>
      String(a.name ?? '').localeCompare(
        String(b.name ?? ''),
        'de',
        {
          numeric: true,
          sensitivity: 'base'
        }
      )
    );

  return searchIndex;
}



async function vabInitializeSearch() {
  try {
    const [
      searchResponse,
      scheduleResponse,
      municipalityResponse,
      pdfResponse
    ] = await Promise.all([
      fetch(
        'data/haltestellen_suchindex.json',
        { cache: 'no-store' }
      ),
      fetch(
        'data/fahrplan_index.json',
        { cache: 'no-store' }
      ),
      fetch(
        'data/gemeinde_ortsteile.json',
        { cache: 'no-store' }
      ),
      fetch(
        'data/fahrplan_pdf_zuordnung.json',
        { cache: 'no-store' }
      )
    ]);

    if (!searchResponse.ok) {
      throw new Error(
        `Suchindex: HTTP ${searchResponse.status}`
      );
    }

    if (!scheduleResponse.ok) {
      throw new Error(
        `Fahrplanindex: HTTP ${scheduleResponse.status}`
      );
    }

    if (!municipalityResponse.ok) {
      throw new Error(
        `Gemeindezuordnung: HTTP ${municipalityResponse.status}`
      );
    }

    const rawSearchIndex =
      await searchResponse.json();

    const municipalityMapping =
      await municipalityResponse.json();

    if (!pdfResponse.ok) {
      throw new Error(
        `PDF-Zuordnung: HTTP ${pdfResponse.status}`
      );
    }

    const pdfData =
      await pdfResponse.json();

    vabFahrplanPdfZuordnung =
      pdfData.lines ?? {};

    vabSuchindex =
      vabApplyMunicipalityMappings(
        rawSearchIndex,
        municipalityMapping
      );

    vabSuchindex =
      vabConsolidatePlaceAliases(
        vabSuchindex
      );


    vabFahrplanindex =
      await scheduleResponse.json();

    vabSucheEingabe.disabled = false;
    vabSucheButton.disabled = false;

    setStatus(
      `${vabSuchindex.stops.length.toLocaleString('de-DE')} `
      + `Haltestellen und `
      + `${vabSuchindex.places.length.toLocaleString('de-DE')} `
      + `Orte durchsuchbar`,
      'erfolg'
    );
  } catch (error) {
    console.error(error);

    vabSucheEingabe.placeholder =
      'Suche konnte nicht geladen werden';

    setStatus(
      `Suchfunktion konnte nicht geladen werden: ${error.message}`,
      'fehler'
    );
  }
}


vabSucheEingabe.addEventListener(
  'input',
  () => {
    const searchValue =
      vabSucheEingabe.value.trim();

    if (!searchValue) {
      vabResetSearchView();
      return;
    }

    vabRenderSuggestions(
      searchValue
    );
  }
);




vabSucheEingabe.addEventListener(
  'search',
  () => {
    if (!vabSucheEingabe.value.trim()) {
      vabResetSearchView();
    }
  }
);


vabSucheEingabe.addEventListener(
  'focus',
  () => {
    vabRenderSuggestions(
      vabSucheEingabe.value
    );
  }
);


vabSucheFormular.addEventListener(
  'submit',
  event => {
    event.preventDefault();

    const firstResult =
      vabFindSearchResults(
        vabSucheEingabe.value
      )[0];

    if (!firstResult) {
      setStatus(
        'Keine passende Haltestelle oder kein passender Ort gefunden',
        'fehler'
      );

      return;
    }

    vabSelectSearchResult(
      firstResult.type,
      firstResult.id
    );
  }
);


vabSucheVorschlaege.addEventListener(
  'click',
  event => {
    const button =
      event.target.closest(
        '[data-search-type][data-search-id]'
      );

    if (!button) {
      return;
    }

    vabSucheEingabe.value =
      button
        .querySelector('strong')
        ?.textContent
        ?.trim()
      ?? '';

    vabSelectSearchResult(
      button.dataset.searchType,
      button.dataset.searchId
    );
  }
);


document.addEventListener(
  'click',
  event => {
    if (
      !event.target.closest('.vab-suche')
    ) {
      vabCloseSuggestions();
    }
  }
);


vabInitializeSearch();

/* END VAB-SUCHE */

