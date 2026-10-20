// =====================================================================
// 07_app — "Después del fuego": herramienta de análisis post-incendio
// Proyecto "Después del fuego" — Paso 7 (v3: nativo + plantaciones)
// =====================================================================

var cfg = require('users/vistokk31/mapbiomas:00_config');

// =====================================================================
// CONSTANTES (los años se actualizan desde 00_config)
// =====================================================================
var BOSQUE   = [3, 59, 60, 67];
var MATORRAL = [66];
var HERBACEO = [12, 11, 63];
var PLANTACION = [9];

var ANIO_OBS = cfg.ULTIMO_ANIO_COBERTURA;
var PRIO_REF = cfg.PRIMER_ANIO_FUEGO - 1;
var PRIO_INI = cfg.PRIMER_ANIO_FUEGO;
var PRIO_FIN = ANIO_OBS - 3;
var TXT_PRIO = 'fuegos ' + PRIO_INI + '–' + PRIO_FIN;

// Zona con datos de MapBiomas Fuego (Valparaíso a La Araucanía)
var ZONA_FUEGO = ee.Geometry.Rectangle([-74.5, -41.5, -70.0, -32.5]);
var comunasApp = cfg.comunas.filterBounds(ZONA_FUEGO);

// Estado de la selección
var regionActual = null;
var regionCut = null;
var seleccionadas = [];

var NOMBRES_PRE  = {1: 'Bosque nativo', 2: 'Matorral', 3: 'Herbáceo natural', 4: 'Plantación'};
var NOMBRES_POST = ['Bosque nativo', 'Matorral', 'Herbáceo natural/humedal', 'Plantación',
                    'Agropecuario', 'Sin vegetación', 'Agua/nieve/no obs.'];
var COLORES_POST = ['1F8D49', 'A89358', 'D6BC74', '7A5900', 'E974ED', 'DB4D4F', '2532E4'];
var NOMBRES_PRIO = ['En recuperación', 'Prioridad media (matorral degradado)',
                    'Prioridad alta (bosque degradado)', 'Prioridad muy alta (bosque, 2+ fuegos)',
                    'Convertido (plantación/agropecuario)',
                    'Oportunidad (plantación quemada con regeneración nativa)'];
var COLORES_PRIO = ['1F8D49', 'F2D16B', 'F28C28', 'C0392B', '7A5900', '00ACC1'];

// Colores de las secciones y sus fondos suaves
var C_TRAY  = '2E7D32';
var C_PRIO  = 'E07B00';
var C_CARB  = '4A6572';
var C_METOD = '757575';
var TINTES = {};
TINTES[C_TRAY]  = 'E8F5E9';
TINTES[C_PRIO]  = 'FFF3E0';
TINTES[C_CARB]  = 'ECEFF1';
TINTES[C_METOD] = 'F2F2F2';
var C_QUEM = 'C0392B';          // rojo: sección "¿Qué se quemó?"
TINTES[C_QUEM] = 'FDECEA';

var C_BORDE_GRAL = 'FFEB3B';   // borde de todas las comunas (amarillo)
var C_BORDE_SEL  = 'FF1744';   // borde de comunas seleccionadas (rojo)

// =====================================================================
// FACTORES DE CARBONO — CONAF, NREF/NRF Nacional de Chile (2023)
// Tabla 26 (bosque), Tabla 27 (otros usos), Tabla 30 (no-CO2)
// =====================================================================
var FRAC_C = 0.47;
var C_A_CO2 = 44 / 12;

var TIPOS = {
  ESC: {nombre: 'Esclerófilo',                  agb: 18.57,  bgb: 5.33,  dom: 16.70},
  RH:  {nombre: 'Roble-Hualo',                  agb: 114.93, bgb: 32.97, dom: 62.11},
  RRC: {nombre: 'Roble-Raulí-Coihue (renoval)', agb: 152.77, bgb: 43.83, dom: 52.90}
};
var TIPO_POR_REGION = {'05': 'ESC', '13': 'ESC', '06': 'ESC',
                       '07': 'RH',  '16': 'RH',
                       '08': 'RRC', '09': 'RRC'};
var BIOMASA_POST = {1: null, 2: 9.04 + 14.99, 3: 4.73 + 8.13, 4: 0, 5: 10 + 2, 6: 0, 7: 0};
var FACTOR_NOCO2 = 0.45 * (4.70 * 28 + 0.26 * 265) / 1000;

var PSC_USD = 71.1;    // Precio social del carbono 2025 (SNI)
var PSC_CLP = 70540;

function stockBosque(tipo) { return ((tipo.agb + tipo.bgb) * FRAC_C + tipo.dom) * C_A_CO2; }
function stockPost(grupo)  { return BIOMASA_POST[grupo] * FRAC_C * C_A_CO2; }

// =====================================================================
// FUNCIONES DE ANÁLISIS
// =====================================================================
function esClase(img, codigos) {
  return img.remap(codigos, ee.List.repeat(1, codigos.length), 0).eq(1);
}

function frecuencia(ini, fin) {
  var bandas = [];
  for (var a = ini; a <= fin; a++) bandas.push('burned_area_' + a);
  return cfg.fuegoArea.select(bandas).unmask(0).gt(0).reduce(ee.Reducer.sum());
}

// Grupo antes del fuego: 1 bosque, 2 matorral, 3 herbáceo natural, 4 plantación, 0 otro
function grupoPre(anio) {
  var c = cfg.cobertura.select('classification_' + anio);
  return ee.Image(0)
    .where(esClase(c, PLANTACION), 4)
    .where(esClase(c, HERBACEO), 3)
    .where(esClase(c, MATORRAL), 2)
    .where(esClase(c, BOSQUE), 1);
}

// Grupo después: 1 bosque, 2 matorral, 3 herbáceo, 4 plantación, 5 agropecuario, 6 sin veg., 7 agua
function grupoPost(anio) {
  return cfg.cobertura.select('classification_' + anio)
    .remap(cfg.CODIGOS_POST, cfg.GRUPOS_POST, 0);
}

function prioridades() {
  var preG = grupoPre(PRIO_REF);
  var post = grupoPost(ANIO_OBS);
  var esB = preG.eq(1), esM = preG.eq(2), esH = preG.eq(3), esP = preG.eq(4);
  var esNativo = preG.gte(1).and(preG.lte(3));

  var frec = frecuencia(PRIO_INI, PRIO_FIN);
  var q = frec.gte(1), q2 = frec.gte(2);
  var fuegoPost = frecuencia(PRIO_FIN + 1, ANIO_OBS).gt(0);
  var natural = post.gte(1).and(post.lte(3));

  var recuperado = q.and(esB.and(post.eq(1))
    .or(esM.and(post.eq(1).or(post.eq(2))))
    .or(esH.and(natural)));
  var matDeg      = q.and(esM).and(post.eq(3).or(post.eq(6)));
  var bosDeg      = q.and(esB).and(post.eq(2).or(post.eq(3)).or(post.eq(6)));
  var muyAlta     = bosDeg.and(q2);
  var conv        = q.and(esNativo).and(post.eq(4).or(post.eq(5)));
  var oportunidad = q.and(esP).and(post.eq(1).or(post.eq(2)));

  return ee.Image(0)
    .where(recuperado, 1).where(matDeg, 2).where(bosDeg, 3)
    .where(muyAlta, 4).where(conv, 5).where(oportunidad, 6)
    .updateMask(fuegoPost.not()).selfMask()
    .rename('prioridad').toByte();
}

var PRIO = prioridades();

// =====================================================================
// UTILIDADES DE INTERFAZ
// =====================================================================
var ESTILO_TITULO = {fontWeight: 'bold', fontSize: '13px', margin: '10px 0 4px 8px'};
var ESTILO_NOTA   = {fontSize: '11px', color: '555555', margin: '4px 8px 6px 8px'};

function crearSeccion(titulo, color, abierta) {
  var tinte = '#' + TINTES[color];
  var contenido = ui.Panel({style: {shown: abierta, margin: '0 0 10px 6px', padding: '4px 0'}});
  var toggle = ui.Button({label: abierta ? '▼' : '▶', style: {margin: '6px 6px 6px 0'}});
  var cabecera = ui.Panel([
    ui.Label('', {backgroundColor: '#' + color, padding: '18px 4px', margin: '0'}),
    ui.Label(titulo, {fontSize: '15px', fontWeight: 'bold', color: '#' + color,
                      backgroundColor: tinte, margin: '12px 8px', stretch: 'horizontal'}),
    toggle
  ], ui.Panel.Layout.Flow('horizontal'),
  {backgroundColor: tinte, margin: '10px 0 0 0', stretch: 'horizontal'});
  toggle.onClick(function() {
    var mostrar = !contenido.style().get('shown');
    contenido.style().set('shown', mostrar);
    toggle.setLabel(mostrar ? '▼' : '▶');
  });
  return {panel: ui.Panel([cabecera, contenido]), contenido: contenido};
}

function tarjeta(valor, etiqueta, color) {
  var fondo = '#F3F5F3';
  return ui.Panel([
    ui.Label(valor, {fontSize: '15px', fontWeight: 'bold', color: '#' + color,
                     margin: '4px 4px 0 4px', backgroundColor: fondo}),
    ui.Label(etiqueta, {fontSize: '10px', color: '555555',
                        margin: '0 4px 4px 4px', backgroundColor: fondo})
  ], ui.Panel.Layout.Flow('vertical'),
  {width: '88px', backgroundColor: fondo, margin: '2px', padding: '2px', border: '1px solid #DDDDDD'});
}

function indicador(texto, valor) {
  return ui.Panel([
    ui.Label(texto, {fontSize: '12px', margin: '2px 8px', width: '220px'}),
    ui.Label(valor, {fontSize: '12px', fontWeight: 'bold', margin: '2px 0'})
  ], ui.Panel.Layout.Flow('horizontal'));
}

function fmtNum(x) { return Math.round(x || 0).toLocaleString('es-CL'); }
function fmt(x)    { return fmtNum(x) + ' ha'; }
function fmtT(x)   { return fmtNum(x) + ' t CO₂e'; }
function pct(a, b) { return b > 0 ? Math.round(100 * (a || 0) / b) + '%' : '—'; }
function fmtDec(x) {
  var v = Math.round(x * 10) / 10;
  var ent = Math.floor(v);
  var dec = Math.round((v - ent) * 10);
  return ent.toLocaleString('es-CL') + ',' + dec;
}
function fmtMill(x) { return fmtDec(x / 1e6) + ' millones'; }

function quitarTildes(s) {
  return s.replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/ñ/g, 'n')
    .replace(/[ÁÀÄ]/g, 'A').replace(/[ÉÈË]/g, 'E').replace(/[ÍÌÏ]/g, 'I')
    .replace(/[ÓÒÖ]/g, 'O').replace(/[ÚÙÜ]/g, 'U').replace(/Ñ/g, 'N');
}

// =====================================================================
// PANEL PRINCIPAL
// =====================================================================
var panel = ui.Panel({style: {width: '430px', padding: '10px'}});
panel.add(ui.Label('Después del fuego', {fontSize: '24px', fontWeight: 'bold', color: '#' + C_TRAY,
                                          margin: '4px 8px 0 8px'}));
panel.add(ui.Label('Qué se recupera, qué se convierte y dónde restaurar después de un incendio',
                   {fontSize: '13px', color: '555555', margin: '0 8px 8px 8px'}));

var selRegion = ui.Select({placeholder: 'Cargando regiones...', onChange: cargarComunas,
                           style: {stretch: 'horizontal'}});
var selComuna = ui.Select({placeholder: 'Primero elige una región', onChange: agregarComuna,
                           style: {stretch: 'horizontal'}});
var panelSeleccion = ui.Panel({style: {margin: '0 0 0 8px'}});

var anios = [];
for (var a = cfg.PRIMER_ANIO_FUEGO; a <= ANIO_OBS - cfg.ANIOS_SEGUIMIENTO_MIN; a++) {
  anios.push(String(a));
}
var selAnio = ui.Select({items: anios, value: '2017', style: {stretch: 'horizontal'}});

var boton = ui.Button({label: 'Generar reporte', onClick: generarReporte,
                       style: {stretch: 'horizontal', margin: '10px 8px'}});

panel.add(ui.Label('Región', ESTILO_TITULO));
panel.add(selRegion);
panel.add(ui.Label('Comunas (puedes agregar varias de la misma región)', ESTILO_TITULO));
panel.add(selComuna);
panel.add(panelSeleccion);
panel.add(ui.Label('Año del incendio', ESTILO_TITULO));
panel.add(selAnio);
panel.add(boton);

var resultados = ui.Panel();
resultados.add(ui.Label('Elige una o más comunas y un año, y presiona "Generar reporte".',
                        {color: 'gray', fontSize: '12px', margin: '4px 8px'}));
panel.add(resultados);

// ----- Sección fija: Metodología y fuentes -----
var secMetod = crearSeccion('Metodología y fuentes', C_METOD, false);
[
  'Datos: MapBiomas Chile — Cobertura y Uso del Suelo, Colección 2.0 (1999–' + ANIO_OBS + ') y ' +
  'MapBiomas Fuego, Colección 1 (2013–2025, regiones de Valparaíso a La Araucanía).',
  '"Qué pasó después del fuego": vegetación nativa y plantaciones quemadas en el año elegido, según la ' +
  'cobertura del año anterior al incendio, y su estado en ' + ANIO_OBS + '.',
  '"Prioridades de restauración": vegetación nativa y plantaciones de ' + PRIO_REF + ' quemadas entre ' +
  PRIO_INI + ' y ' + PRIO_FIN + ', según su estado en ' + ANIO_OBS + '. Se excluyen los incendios ' +
  'posteriores a ' + PRIO_FIN + ', porque aún no hay tiempo para evaluar su recuperación. ' +
  '"Oportunidad" identifica plantaciones quemadas que hoy son matorral o bosque nativo: pueden ser ' +
  'regeneración natural, aunque requieren verificación en terreno.',
  'Carbono: factores de emisión de CONAF, Nivel de Referencia de Emisiones Forestales de Chile (2023), ' +
  'Tablas 26, 27 y 30. Solo se contabiliza bosque nativo. Precio social del carbono 2025 (Sistema ' +
  'Nacional de Inversiones): ' + String(PSC_USD).replace('.', ',') + ' USD/t CO₂e. El tipo forestal se ' +
  'asigna por región, por eso las comunas de un reporte deben ser de la misma región.',
  'Limitación: los cambios de cobertura se asocian al fuego, pero no se atribuyen causalmente. ' +
  'Parte de la conversión a plantación ocurre también en bosques no quemados.',
  'Autoría: Isidora Vidal Prieto · Código abierto: https://github.com/isidoravidal-prieto/despues-del-fuego'
].forEach(function(txt) { secMetod.contenido.add(ui.Label(txt, ESTILO_NOTA)); });
panel.add(secMetod.panel);

ui.root.insert(0, panel);

// =====================================================================
// MAPA: satelital por defecto + gris como opción + leyenda a la derecha
// =====================================================================
var GRIS = [
  {stylers: [{saturation: -100}, {lightness: 15}]},
  {featureType: 'poi', stylers: [{visibility: 'off'}]},
  {featureType: 'transit', stylers: [{visibility: 'off'}]}
];
Map.setOptions('SATELLITE', {'Gris': GRIS}, ['SATELLITE', 'HYBRID', 'Gris']);
Map.centerObject(ZONA_FUEGO, 6);
Map.addLayer(ee.Image().byte().paint(comunasApp, 0, 1), {palette: [C_BORDE_GRAL]}, 'Comunas');

var leyendaMapa = ui.Panel({style: {position: 'bottom-right', padding: '8px 10px', width: '280px'}});
var contLeyenda = ui.Panel();
var selLeyenda = ui.Select({
  items: ['Prioridades de restauración', 'Estado post-fuego'],
  value: 'Prioridades de restauración',
  onChange: actualizarLeyenda,
  style: {stretch: 'horizontal', margin: '0 0 6px 0'}
});
function actualizarLeyenda(v) {
  contLeyenda.clear();
  var noms = (v === 'Estado post-fuego') ? NOMBRES_POST : NOMBRES_PRIO;
  var cols = (v === 'Estado post-fuego') ? COLORES_POST : COLORES_PRIO;
  noms.forEach(function(n, i) {
    contLeyenda.add(ui.Panel([
      ui.Label('', {backgroundColor: '#' + cols[i], padding: '7px', margin: '0 6px 3px 0'}),
      ui.Label(n, {fontSize: '11px', margin: '0 0 3px 0'})
    ], ui.Panel.Layout.Flow('horizontal')));
  });
}
leyendaMapa.add(ui.Label('Leyenda', {fontWeight: 'bold', fontSize: '12px', margin: '0 0 4px 0'}));
leyendaMapa.add(selLeyenda);
leyendaMapa.add(contLeyenda);
actualizarLeyenda('Prioridades de restauración');
Map.add(leyendaMapa);

// Cargar regiones
comunasApp.aggregate_array('REGION').distinct().sort().evaluate(function(lista) {
  selRegion.items().reset(lista);
  selRegion.setPlaceholder('Elige una región');
});

// =====================================================================
// SELECCIÓN DE COMUNAS
// =====================================================================
function cargarComunas(region) {
  regionActual = region;
  seleccionadas = [];
  dibujarSeleccion();
  selComuna.items().reset([]);
  selComuna.setValue(null, false);
  selComuna.setPlaceholder('Cargando comunas...');
  var deRegion = comunasApp.filter(ee.Filter.eq('REGION', region));
  ee.Dictionary({
    cut: deRegion.first().get('CUT_REG'),
    lista: deRegion.aggregate_array('COMUNA').sort()
  }).evaluate(function(res) {
    regionCut = res.cut;
    selComuna.items().reset(res.lista);
    selComuna.setPlaceholder('Elige una comuna para agregarla');
  });
}

function agregarComuna(nombre) {
  if (!nombre) return;
  if (seleccionadas.indexOf(nombre) === -1) seleccionadas.push(nombre);
  dibujarSeleccion();
  selComuna.setValue(null, false);
}

function quitarComuna(nombre) {
  seleccionadas = seleccionadas.filter(function(n) { return n !== nombre; });
  dibujarSeleccion();
}

function dibujarSeleccion() {
  panelSeleccion.clear();
  if (seleccionadas.length === 0) {
    panelSeleccion.add(ui.Label('Ninguna comuna seleccionada', {fontSize: '11px', color: 'gray'}));
    return;
  }
  seleccionadas.forEach(function(n) {
    panelSeleccion.add(ui.Panel([
      ui.Label('• ' + n, {fontSize: '12px', margin: '6px 4px', stretch: 'horizontal'}),
      ui.Button({label: '✕', onClick: function() { quitarComuna(n); }, style: {margin: '0 4px'}})
    ], ui.Panel.Layout.Flow('horizontal'), {stretch: 'horizontal'}));
  });
}
dibujarSeleccion();

// =====================================================================
// REPORTE
// =====================================================================
function generarReporte() {
  var lista = seleccionadas.slice();
  var anio = parseInt(selAnio.getValue(), 10);
  if (lista.length === 0) {
    resultados.clear();
    resultados.add(ui.Label('Agrega al menos una comuna.', {color: 'red', margin: '4px 8px'}));
    return;
  }

  var fc = comunasApp.filter(ee.Filter.eq('REGION', regionActual))
                     .filter(ee.Filter.inList('COMUNA', lista));
  var geom = fc.geometry();

  // ----- Mapa -----
  var quemado = cfg.fuegoArea.select('burned_area_' + anio).unmask(0).gt(0);
  var preG = grupoPre(anio - 1);
  var post = grupoPost(ANIO_OBS);
  var estado = post.updateMask(quemado.and(preG.gt(0)));

  Map.layers().reset();
  Map.centerObject(fc, lista.length > 1 ? 9 : 10);
  Map.addLayer(ee.Image().byte().paint(comunasApp, 0, 1), {palette: [C_BORDE_GRAL]}, 'Comunas');
  Map.addLayer(PRIO.clip(geom), {min: 1, max: 6, palette: COLORES_PRIO},
               'Prioridades de restauración (' + TXT_PRIO + ')');
  Map.addLayer(estado.clip(geom), {min: 1, max: 7, palette: COLORES_POST},
               'Estado ' + ANIO_OBS + ' de lo quemado en ' + anio, false);
  Map.addLayer(quemado.selfMask().clip(geom), {palette: ['FF0000']}, 'Área quemada ' + anio, false);
    Map.addLayer(cfg.pintarCobertura(cfg.cobertura.select('classification_' + (anio - 1)).updateMask(quemado)).clip(geom),
               cfg.VIS_COBERTURA, 'Cobertura antes del fuego (' + (anio - 1) + ')', false);
  Map.addLayer(ee.Image().byte().paint(fc, 0, 3), {palette: [C_BORDE_SEL]}, 'Comunas seleccionadas');

  resultados.clear();
  resultados.add(ui.Label('Calculando… (puede tardar un minuto, más con varias comunas)',
                          {color: 'gray', margin: '4px 8px'}));

  // ----- Cálculos -----
  function opts(reducer) {
    return {reducer: reducer, geometry: geom, scale: cfg.ESCALA, maxPixels: 1e13, tileScale: 4};
  }

  var combo = preG.multiply(10).add(post).updateMask(quemado.and(preG.gt(0))).rename('combo');
  var rTray = cfg.areaHa.addBands(combo).reduceRegion(
    opts(ee.Reducer.sum().group({groupField: 1, groupName: 'combo'})));
  var rTotal = cfg.areaHa.updateMask(quemado).rename('total').reduceRegion(
    opts(ee.Reducer.sum()));
  var rPrio = ee.Image.cat([1, 2, 3, 4, 5, 6].map(function(k) {
    return cfg.areaHa.multiply(PRIO.eq(k)).unmask(0).rename('c' + k);
  })).reduceRegion(opts(ee.Reducer.sum()));
  var cobPre = cfg.cobertura.select('classification_' + (anio - 1)).updateMask(quemado).rename('clase');
  var rCob = cfg.areaHa.addBands(cobPre).reduceRegion(
    opts(ee.Reducer.sum().group({groupField: 1, groupName: 'clase'})));
    ee.Dictionary({tray: rTray.get('groups'), total: rTotal.get('total'), prio: rPrio, cob: rCob.get('groups')})
    .evaluate(function(res, err) {
      if (err) {
        resultados.clear();
        resultados.add(ui.Label('Error: ' + err, {color: 'red', margin: '4px 8px'}));
        return;
      }
      mostrarResultados(lista, anio, res);
    });
}

function mostrarResultados(lista, anio, res) {
  resultados.clear();

  var t = {1: {}, 2: {}, 3: {}, 4: {}};
  (res.tray || []).forEach(function(g) {
    var pre = Math.floor(g.combo / 10), pos = g.combo % 10;
    if (t[pre]) t[pre][pos] = (t[pre][pos] || 0) + g.sum;
  });
  function suma(o) { var s = 0; for (var k in o) s += o[k]; return s; }

  var haTotal  = res.total || 0;
  var haBosque = suma(t[1]), haMat = suma(t[2]), haHerb = suma(t[3]);
  var haNativo = haBosque + haMat + haHerb;
  var haPlant  = suma(t[4]);
  var prio = res.prio || {};

  // ----- Carbono (solo bosque nativo, criterio CONAF) -----
  var carbono = null;
  if (haBosque > 0) {
    var tipo = TIPOS[TIPO_POR_REGION[regionCut] || 'RRC'];
    var sB = stockBosque(tipo);
    var eSust = (t[1][4] || 0) * sB;
    var eOtros = 0;
    [2, 3, 5, 6, 7].forEach(function(k) { eOtros += (t[1][k] || 0) * (sB - stockPost(k)); });
    var eNoCO2 = haBosque * tipo.agb * FACTOR_NOCO2;
    carbono = {total: eSust + eOtros + eNoCO2, sust: eSust, otros: eOtros, noco2: eNoCO2, tipo: tipo.nombre};
  }

  // ===== ENCABEZADO =====
  var titulo = lista.length === 1 ? lista[0] : lista.length + ' comunas';
  resultados.add(ui.Label(titulo, {fontSize: '20px', fontWeight: 'bold', margin: '12px 8px 0 8px'}));
  if (lista.length > 1) {
    resultados.add(ui.Label(lista.join(', '), {fontSize: '12px', margin: '0 8px'}));
  }
  resultados.add(ui.Label('Incendios de ' + anio + ' · estado en ' + ANIO_OBS,
                          {color: 'gray', margin: '0 8px 6px 8px'}));

  // ===== RESUMEN EN TARJETAS =====
  resultados.add(ui.Panel([
    tarjeta(fmtNum(haTotal), 'ha quemadas', 'C0392B'),
    tarjeta(fmtNum(haBosque), 'ha de bosque nativo quemado', C_TRAY),
    tarjeta(haBosque > 0 ? pct(t[1][4], haBosque) : '—', 'del bosque hoy es plantación', '7A5900'),
    tarjeta(carbono ? fmtDec(carbono.total / 1e6) : '—', 'Mt CO₂e emitidas', C_CARB)
  ], ui.Panel.Layout.Flow('horizontal'), {margin: '0 0 4px 4px'}));

  var enlace = ui.Label('Preparando descarga…', {margin: '6px 8px 10px 8px', color: 'gray', fontSize: '12px'});
  resultados.add(enlace);
  // ===== SECCIÓN 0: QUÉ SE QUEMÓ =====
  var sec0 = crearSeccion('¿Qué se quemó?', C_QUEM, true);
  sec0.contenido.add(ui.Label(
    'Cobertura que había en ' + (anio - 1) + ' en la superficie quemada en ' + anio + '.', ESTILO_NOTA));
  var filasCob = [['Cobertura', 'Hectáreas']];
  var coloresCob = [];
  (res.cob || []).sort(function(x, y) { return y.sum - x.sum; }).forEach(function(g) {
    var idx = cfg.COD_LEY.indexOf(g.clase);
    if (idx === -1 || g.sum < 1) return;
    filasCob.push([cfg.NOM_LEY[idx], g.sum]);
    coloresCob.push(cfg.COL_LEY[idx]);
  });
  if (filasCob.length > 1) {
    sec0.contenido.add(ui.Chart(filasCob).setChartType('PieChart').setOptions({
          title: 'Superficie quemada por cobertura', colors: coloresCob, pieHole: 0.4,
      pieResidueSliceLabel: 'Otras',
      legend: {position: 'bottom', maxLines: 6, textStyle: {fontSize: 10}}, height: 320
    }));
    filasCob.slice(1).forEach(function(f) {
      sec0.contenido.add(indicador(f[0], fmt(f[1]) + ' (' + pct(f[1], haTotal) + ')'));
    });
  }
  resultados.add(sec0.panel);
  // ===== SECCIÓN 1: QUÉ PASÓ DESPUÉS DEL FUEGO =====
  var sec1 = crearSeccion('¿Qué pasó después del fuego?', C_TRAY, true);
  sec1.contenido.add(ui.Label(
    'Lo quemado en ' + anio + ' (según la cobertura de ' + (anio - 1) +
    ') y en qué se convirtió en ' + ANIO_OBS + '.', ESTILO_NOTA));
  sec1.contenido.add(indicador('Superficie quemada', fmt(haTotal)));
  sec1.contenido.add(indicador('Vegetación nativa quemada', fmt(haNativo) + ' (' + pct(haNativo, haTotal) + ')'));
  sec1.contenido.add(indicador('· de ella, bosque nativo', fmt(haBosque)));
  sec1.contenido.add(indicador('Plantación quemada', fmt(haPlant) + ' (' + pct(haPlant, haTotal) + ')'));

  if (haBosque > 0) {
    sec1.contenido.add(ui.Label('Del bosque nativo quemado, en ' + ANIO_OBS + ':', ESTILO_TITULO));
    sec1.contenido.add(indicador('Volvió a ser bosque', pct(t[1][1], haBosque)));
    sec1.contenido.add(indicador('Quedó como matorral', pct(t[1][2], haBosque)));
    sec1.contenido.add(indicador('Pasó a plantación', pct(t[1][4], haBosque)));
    sec1.contenido.add(indicador('Pasó a uso agropecuario', pct(t[1][5], haBosque)));
  }

  if (haPlant > 0) {
    sec1.contenido.add(ui.Label('De la plantación quemada, en ' + ANIO_OBS + ':', ESTILO_TITULO));
    sec1.contenido.add(indicador('Volvió a ser plantación', pct(t[4][4], haPlant)));
    sec1.contenido.add(indicador('Hoy es matorral o bosque nativo', pct((t[4][1] || 0) + (t[4][2] || 0), haPlant)));
    sec1.contenido.add(indicador('Pasó a uso agropecuario', pct(t[4][5], haPlant)));
  }

  if (haNativo + haPlant === 0) {
    sec1.contenido.add(ui.Label('No se registró vegetación nativa ni plantación quemada en ' + anio + '.',
                                ESTILO_NOTA));
  } else {
    var filas = [['Antes del fuego'].concat(NOMBRES_POST)];
    [1, 2, 3, 4].forEach(function(p) {
      if (suma(t[p]) > 0) {
        var fila = [NOMBRES_PRE[p]];
        for (var k = 1; k <= 7; k++) fila.push(t[p][k] || 0);
        filas.push(fila);
      }
    });
    sec1.contenido.add(ui.Chart(filas).setChartType('BarChart').setOptions({
      title: 'Destino en ' + ANIO_OBS + ' (% de la superficie quemada)',
      isStacked: 'percent', colors: COLORES_POST,
      legend: {position: 'bottom', maxLines: 4, textStyle: {fontSize: 10}},
      hAxis: {title: '%'}, height: 340
    }));
  }
  resultados.add(sec1.panel);

  // ===== SECCIÓN 2: PRIORIDADES DE RESTAURACIÓN =====
  var sec2 = crearSeccion('Prioridades de restauración', C_PRIO, false);
  sec2.contenido.add(ui.Label(
    'Considera la vegetación nativa y las plantaciones de ' + PRIO_REF + ' quemadas entre ' + PRIO_INI +
    ' y ' + PRIO_FIN + ' (no solo el año elegido), según su estado en ' + ANIO_OBS + '. ' +
    '"Convertido" no es restauración directa: requiere gestión y fiscalización. ' +
    '"Oportunidad" son plantaciones quemadas que hoy son matorral o bosque nativo: posibles áreas de ' +
    'regeneración natural, a verificar en terreno.', ESTILO_NOTA));
  var filasPrio = [['Categoría', 'Hectáreas']];
  for (var i = 1; i <= 6; i++) filasPrio.push([NOMBRES_PRIO[i - 1], prio['c' + i] || 0]);
  sec2.contenido.add(ui.Chart(filasPrio).setChartType('PieChart').setOptions({
    title: 'Superficie por categoría (' + TXT_PRIO + ')',
        colors: COLORES_PRIO, pieHole: 0.4,
    pieResidueSliceLabel: 'Otras',
    legend: {position: 'bottom', maxLines: 6, textStyle: {fontSize: 10}}, height: 320
  }));
  for (var j = 1; j <= 6; j++) sec2.contenido.add(indicador(NOMBRES_PRIO[j - 1], fmt(prio['c' + j])));
  resultados.add(sec2.panel);

  // ===== SECCIÓN 3: CARBONO Y VALOR SOCIAL =====
  var sec3 = crearSeccion('Carbono y valor social', C_CARB, false);
  if (carbono) {
    sec3.contenido.add(ui.Label(
      'Emisiones asociadas a la pérdida del bosque nativo quemado en ' + anio + ', según su estado en ' +
      ANIO_OBS + '.', ESTILO_NOTA));
    sec3.contenido.add(indicador('Emisiones estimadas', fmtT(carbono.total)));
    sec3.contenido.add(indicador('· Por sustitución a plantación', fmtT(carbono.sust)));
    sec3.contenido.add(indicador('· Por otros cambios de uso', fmtT(carbono.otros)));
    sec3.contenido.add(indicador('· Gases no-CO₂ del incendio', fmtT(carbono.noco2)));
    sec3.contenido.add(indicador('Valor social (USD)', 'USD ' + fmtMill(carbono.total * PSC_USD)));
    sec3.contenido.add(indicador('Valor social (CLP)', '$ ' + fmtMill(carbono.total * PSC_CLP)));
    sec3.contenido.add(ui.Label(
      'Supuestos: tipo forestal ' + carbono.tipo + ' (predominante en la región). No incluye plantaciones, ' +
      'matorral ni carbono del suelo. Precio social del carbono 2025: ' + String(PSC_USD).replace('.', ',') +
      ' USD/t CO₂e.', ESTILO_NOTA));
  } else {
    sec3.contenido.add(ui.Label('No hubo bosque nativo quemado en ' + anio + '; no se estiman emisiones.',
                                ESTILO_NOTA));
  }
  resultados.add(sec3.panel);

  // ===== DESCARGA CSV =====
  var features = [];
  [1, 2, 3, 4].forEach(function(p) {
    for (var k = 1; k <= 7; k++) {
      if (t[p][k]) {
        features.push(ee.Feature(null, {seccion: 'trayectoria_' + anio, origen: NOMBRES_PRE[p],
          destino: NOMBRES_POST[k - 1], valor: t[p][k], unidad: 'ha'}));
      }
    }
  });
  for (var m = 1; m <= 6; m++) {
    features.push(ee.Feature(null, {seccion: 'prioridades_' + PRIO_INI + '_' + PRIO_FIN, origen: '',
      destino: NOMBRES_PRIO[m - 1], valor: prio['c' + m] || 0, unidad: 'ha'}));
  }
  if (carbono) {
    [['Emisiones totales', carbono.total, 't CO2e'],
     ['Sustitucion a plantacion', carbono.sust, 't CO2e'],
     ['Otros cambios de uso', carbono.otros, 't CO2e'],
     ['Gases no-CO2 del incendio', carbono.noco2, 't CO2e'],
     ['Valor social', carbono.total * PSC_USD, 'USD']].forEach(function(f) {
      features.push(ee.Feature(null, {seccion: 'carbono_' + anio, origen: carbono.tipo,
        destino: f[0], valor: f[1], unidad: f[2]}));
    });
  }

  filasCob.slice(1).forEach(function(f) {
    features.push(ee.Feature(null, {seccion: 'cobertura_quemada_' + anio, origen: '',
      destino: f[0], valor: f[1], unidad: 'ha'}));
  });
  var baseNombre = lista.length <= 3 ? lista.join('_') : lista.length + '_comunas';
  var nombreArchivo = 'reporte_' + quitarTildes(baseNombre).replace(/[^A-Za-z0-9]/g, '_') + '_' + anio;

  ee.FeatureCollection(features).getDownloadURL('CSV', ['seccion', 'origen', 'destino', 'valor', 'unidad'],
    nombreArchivo, function(url) {
      enlace.setValue('⬇  Descargar reporte (CSV)');
      enlace.setUrl(url);
      enlace.style().set({color: 'FFFFFF', backgroundColor: '#' + C_TRAY, padding: '6px 10px',
                          fontWeight: 'bold'});
    });
}