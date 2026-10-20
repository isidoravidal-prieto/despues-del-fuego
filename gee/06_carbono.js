// =====================================================================
// 06_carbono — Emisiones y valor social de la pérdida de bosque nativo post-fuego
// Proyecto "Después del fuego" — Paso 6
// Factores: CONAF, NREF/NRF Nacional de Chile (2023), Tablas 26, 27 y 30
// =====================================================================

var cfg = require('users/vistokk31/mapbiomas:00_config');

// ===== Parámetros =====
var ANIO_FUEGO = 2017;
var ANIO_OBS   = cfg.ULTIMO_ANIO_COBERTURA;   // 2024
var BOSQUE     = [3, 59, 60, 67];

// ===== Factores de carbono (iguales a la App) =====
var FRAC_C  = 0.47;      // fracción de carbono (IPCC 2006, usada por CONAF)
var C_A_CO2 = 44 / 12;

// Tipos forestales (t materia seca/ha; necromasa en tC/ha) — Tabla 26
var TIPOS = {
  ESC: {nombre: 'Esclerófilo',                  agb: 18.57,  bgb: 5.33,  dom: 16.70},
  RH:  {nombre: 'Roble-Hualo',                  agb: 114.93, bgb: 32.97, dom: 62.11},
  RRC: {nombre: 'Roble-Raulí-Coihue (renoval)', agb: 152.77, bgb: 43.83, dom: 52.90}
};
// Tipo forestal predominante asignado por región (código CUT)
var TIPO_POR_REGION = {'05': 'ESC', '13': 'ESC', '06': 'ESC',
                       '07': 'RH',  '16': 'RH',
                       '08': 'RRC', '09': 'RRC'};

// Biomasa del uso posterior (t materia seca/ha, aérea + subterránea) — Tabla 27
// 2 matorral, 3 herbáceo (pradera), 4 plantación, 5 agropecuario, 6 sin vegetación, 7 agua
var BIOMASA_POST = {2: 9.04 + 14.99, 3: 4.73 + 8.13, 4: 0, 5: 10 + 2, 6: 0, 7: 0};

// Gases no-CO2 del fuego — Tabla 30
var FACTOR_NOCO2 = 0.45 * (4.70 * 28 + 0.26 * 265) / 1000;

// Precio social del carbono 2025 (SNI, Ministerio de Desarrollo Social y Familia)
var PSC_USD = 71.1;
var PSC_CLP = 70540;

// ===== Stocks en t CO2e/ha =====
function stockBosque(t) { return ((t.agb + t.bgb) * FRAC_C + t.dom) * C_A_CO2; }
var STOCK_POST = {};
for (var k in BIOMASA_POST) STOCK_POST[k] = BIOMASA_POST[k] * FRAC_C * C_A_CO2;

// Parámetros por región: [stock bosque, no-CO2 por ha, nombre del tipo]
var paramReg = {};
for (var cut in TIPO_POR_REGION) {
  var t = TIPOS[TIPO_POR_REGION[cut]];
  paramReg[cut] = [stockBosque(t), t.agb * FACTOR_NOCO2, t.nombre];
}
var PARAM = ee.Dictionary(paramReg);

print('Stock de carbono del bosque (t CO2e/ha):', {
  'Esclerófilo': stockBosque(TIPOS.ESC),
  'Roble-Hualo': stockBosque(TIPOS.RH),
  'Roble-Raulí-Coihue (renoval)': stockBosque(TIPOS.RRC)
});
print('Stock del uso posterior (t CO2e/ha):', STOCK_POST);

// ===== Bosque nativo quemado y su destino =====
var quemado  = cfg.fuegoArea.select('burned_area_' + ANIO_FUEGO).unmask(0).gt(0);
var cobPre   = cfg.cobertura.select('classification_' + (ANIO_FUEGO - 1));
var bosqueQuemado = cobPre.remap(BOSQUE, ee.List.repeat(1, BOSQUE.length), 0).eq(1).and(quemado);
var post = cfg.cobertura.select('classification_' + ANIO_OBS)
  .remap(cfg.CODIGOS_POST, cfg.GRUPOS_POST, 0)
  .updateMask(bosqueQuemado).rename('g');

// ===== FUNCIÓN: emisiones para un territorio =====
function emisiones(geom, cutRegion) {
  var res = cfg.areaHa.addBands(post).reduceRegion({
    reducer: ee.Reducer.sum().group({groupField: 1, groupName: 'g'}),
    geometry: geom, scale: cfg.ESCALA, maxPixels: 1e13, tileScale: 4
  });
  var grupos = ee.List(res.get('groups'));
  var d = ee.Dictionary.fromLists(
    grupos.map(function(g) { return ee.Number(ee.Dictionary(g).get('g')).int().format('%d'); }),
    grupos.map(function(g) { return ee.Dictionary(g).get('sum'); })
  );
  function ha(k) { return ee.Number(d.get(String(k), 0)); }

  var p  = ee.List(PARAM.get(cutRegion, paramReg['08']));
  var sB = ee.Number(p.get(0));
  var nc = ee.Number(p.get(1));

  var haBosque = ee.Number(d.values().reduce(ee.Reducer.sum()));
  var eSust  = ha(4).multiply(sB);
  var eOtros = ee.Number(0);
  [2, 3, 5, 6, 7].forEach(function(k) {
    eOtros = eOtros.add(ha(k).multiply(sB.subtract(STOCK_POST[k])));
  });
  var eNoCO2 = haBosque.multiply(nc);
  var eTotal = eSust.add(eOtros).add(eNoCO2);

  return ee.Dictionary({
    tipo_forestal: p.get(2),
    ha_bosque_quemado: haBosque,
    ha_volvio_bosque: ha(1),
    ha_a_plantacion: ha(4),
    e_sustitucion: eSust,
    e_otros_cambios: eOtros,
    e_no_co2: eNoCO2,
    e_total: eTotal,
    valor_usd: eTotal.multiply(PSC_USD),
    valor_clp: eTotal.multiply(PSC_CLP)
  });
}

// ===== Por comuna y total del caso =====
var porComuna = cfg.casoComunas.map(function(f) {
  return f.set(emisiones(f.geometry(), f.get('CUT_REG')));
});

var cutCaso = cfg.casoComunas.first().get('CUT_REG');
var total = ee.Feature(null, emisiones(cfg.casoGeom, cutCaso)).set('COMUNA', 'Total caso de estudio');
var tabla = porComuna.merge(ee.FeatureCollection([total]));

var COLUMNAS = ['ha_bosque_quemado', 'ha_a_plantacion', 'e_sustitucion', 'e_otros_cambios',
                'e_no_co2', 'e_total', 'valor_usd', 'valor_clp'];

print('Emisiones y valor social (fuego ' + ANIO_FUEGO + ', estado ' + ANIO_OBS + '):',
  ui.Chart.feature.byFeature(tabla, 'COMUNA', COLUMNAS).setChartType('Table'));

print(ui.Chart.feature.byFeature(porComuna, 'COMUNA', ['e_sustitucion', 'e_otros_cambios', 'e_no_co2'])
  .setSeriesNames(['Sustitución a plantación', 'Otros cambios de uso', 'Gases no-CO₂ del incendio'])
  .setChartType('ColumnChart')
  .setOptions({
    title: 'Emisiones asociadas a la pérdida de bosque nativo post-fuego, por comuna (t CO₂e)',
    isStacked: true,
    colors: ['7A5900', 'A89358', '4A6572'],
    vAxis: {title: 't CO₂e'},
    legend: {position: 'top'}
  }));

// ===== Exportar =====
Export.table.toDrive({
  collection: tabla,
  description: '06_carbono_' + ANIO_FUEGO + '_' + cfg.ETIQUETA_CASO,
  folder: 'despues_del_fuego', fileFormat: 'CSV',
  selectors: ['CUT_COM', 'COMUNA', 'tipo_forestal'].concat(COLUMNAS)
});