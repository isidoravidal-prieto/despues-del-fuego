// =====================================================================
// 04_recurrencia — Vegetación nativa quemada más de una vez
//  Proyecto "Después del fuego" — Paso 4
// =====================================================================

var cfg = require('users/vistokk31/mapbiomas:00_config');

// ===== Parámetros =====
var zona = cfg.casoGeom;   // caso de estudio: secano costero del Maule
var ANIO_REF = 2012;       // vegetación nativa de referencia (antes de Fuego)
var ANIO_OBS = 2024;       // año en que se mide la recuperación
var BOSQUE   = [3, 59, 60, 67];

// ===== FUNCIÓN: número de años quemados en un período =====
function frecuencia(anioIni, anioFin) {
  var bandas = [];
  for (var a = anioIni; a <= anioFin; a++) bandas.push('burned_area_' + a);
  return cfg.fuegoArea.select(bandas).unmask(0).gt(0)
    .reduce(ee.Reducer.sum()).rename('frecuencia');
}

// ===== Coberturas de referencia y observación =====
var cobRef = cfg.cobertura.select('classification_' + ANIO_REF);
var cobObs = cfg.cobertura.select('classification_' + ANIO_OBS);

var esNativoRef = cobRef.remap(cfg.NATIVOS, ee.List.repeat(1, cfg.NATIVOS.length), 0).eq(1);
var esBosqueRef = cobRef.remap(BOSQUE, ee.List.repeat(1, BOSQUE.length), 0).eq(1);
var esBosqueObs = cobObs.remap(BOSQUE, ee.List.repeat(1, BOSQUE.length), 0);

var nativoRef = cobRef.updateMask(esNativoRef);

// =====================================================================
// PREGUNTA 1: ¿Cuánta vegetación nativa se quemó 1, 2 o 3+ veces? (2013–2025)
// =====================================================================
var frecTotal = frecuencia(2013, 2025);
var frecCat1  = frecTotal.min(3);

var combo1 = nativoRef.multiply(10).add(frecCat1)
  .updateMask(frecTotal.gt(0)).rename('combo');

var res1 = cfg.areaHa.addBands(combo1).reduceRegion({
  reducer: ee.Reducer.sum().group({groupField: 1, groupName: 'combo'}),
  geometry: zona, scale: cfg.ESCALA, maxPixels: 1e13, tileScale: 4
});

var tabla1 = ee.FeatureCollection(ee.List(res1.get('groups')).map(function(g) {
  g = ee.Dictionary(g);
  var c = ee.Number(g.get('combo')).int();
  var clase = c.divide(10).floor().int();
  return ee.Feature(null, {
    clase: clase,
    nombre: cfg.NOMBRES_PRE.get(clase.format('%d')),
    veces: c.mod(10).int(),
    ha: g.get('sum')
  });
}));

var base1 = ee.Dictionary({f1: 0, f2: 0, f3: 0});
var pivot1 = ee.FeatureCollection(tabla1.aggregate_array('nombre').distinct().map(function(n) {
  var sub = tabla1.filter(ee.Filter.eq('nombre', n));
  var claves = sub.aggregate_array('veces').map(function(v) {
    return ee.String('f').cat(ee.Number(v).format('%d'));
  });
  var d = ee.Dictionary.fromLists(claves, sub.aggregate_array('ha'));
  return ee.Feature(null, base1.combine(d, true).set('nombre', n));
}));

print(ui.Chart.feature.byFeature(pivot1, 'nombre', ['f1', 'f2', 'f3'])
  .setSeriesNames(['1 vez', '2 veces', '3 o más'])
  .setChartType('BarChart')
  .setOptions({
    title: 'P1 · Vegetación nativa (2012) quemada entre 2013 y 2025, según recurrencia — Maule',
    isStacked: true,
    colors: ['E2AF1A', 'B76011', '600407'],
    hAxis: {title: 'Hectáreas'},
    legend: {position: 'top'}
  }));
print('P1 · Tabla (ha):', ui.Chart.feature.byFeature(pivot1, 'nombre', ['f1', 'f2', 'f3'])
  .setSeriesNames(['1 vez', '2 veces', '3 o más']).setChartType('Table'));

// =====================================================================
// PREGUNTA 2: ¿El bosque se recupera menos si se quema más veces? (fuego 2013–2021, estado 2024)
// =====================================================================
var frecCat2  = frecuencia(2013, 2021).min(3);
var fuegoPost = frecuencia(2022, 2024).gt(0);   // excluir fuegos posteriores al período

var combo2 = frecCat2.multiply(10).add(esBosqueObs)
  .updateMask(esBosqueRef.and(fuegoPost.not())).rename('combo');
var res2 = cfg.areaHa.addBands(combo2).reduceRegion({
  reducer: ee.Reducer.sum().group({groupField: 1, groupName: 'combo'}),
  geometry: zona, scale: cfg.ESCALA, maxPixels: 1e13, tileScale: 4
});

var grupos2 = ee.List(res2.get('groups'));
var d2 = ee.Dictionary.fromLists(
  grupos2.map(function(g) { return ee.Number(ee.Dictionary(g).get('combo')).int().format('%d'); }),
  grupos2.map(function(g) { return ee.Dictionary(g).get('sum'); })
);

var ETIQUETAS = ee.List(['Nunca quemado', '1 vez', '2 veces', '3 o más']);
var tabla2 = ee.FeatureCollection(ee.List([0, 1, 2, 3]).map(function(k) {
  k = ee.Number(k);
  var si = ee.Number(d2.get(k.multiply(10).add(1).format('%d'), 0));
  var no = ee.Number(d2.get(k.multiply(10).format('%d'), 0));
  var total = si.add(no);
  return ee.Feature(null, {
    veces: k,
    etiqueta: ETIQUETAS.get(k),
    ha_bosque_2012: total,
    ha_bosque_2024: si,
    pct_sigue_bosque: si.divide(total.max(0.0001)).multiply(100)
  });
}));

print(ui.Chart.feature.byFeature(tabla2, 'etiqueta', ['pct_sigue_bosque'])
  .setChartType('ColumnChart')
  .setSeriesNames(['% que sigue siendo bosque en 2024'])
  .setOptions({
    title: 'P2 · Bosque nativo de 2012 que sigue siendo bosque en 2024, según veces quemado (2013–2021) — Maule',
    vAxis: {title: '% sigue siendo bosque', viewWindow: {min: 0, max: 100}},
    colors: ['1F8D49'],
    legend: {position: 'none'}
  }));
print('P2 · Tabla:', ui.Chart.feature.byFeature(tabla2, 'etiqueta',
  ['ha_bosque_2012', 'ha_bosque_2024', 'pct_sigue_bosque']).setChartType('Table'));

// =====================================================================
// MAPA
// =====================================================================
var PALETA_FREC = ['FAF3CD', 'E2AF1A', 'B76011', '600407', '220505', '020000'];  // leyenda oficial Fuego
Map.centerObject(cfg.casoComunas, 9);
Map.addLayer(cfg.pintarCobertura(cobRef).clip(zona), cfg.VIS_COBERTURA, 'Cobertura ' + ANIO_REF, false);
Map.addLayer(frecTotal.updateMask(frecTotal.gt(0)).updateMask(esNativoRef).clip(zona),
             {min: 1, max: 6, palette: PALETA_FREC}, 'Recurrencia nativa 2013-2025');
Map.addLayer(ee.Image().byte().paint(cfg.casoComunas, 0, 2), {palette: ['000000']}, 'Comunas del caso');

// =====================================================================
// EXPORTAR
// =====================================================================
Export.table.toDrive({
  collection: tabla1, description: '04_recurrencia_por_clase_' + cfg.ETIQUETA_CASO,
  folder: 'despues_del_fuego', fileFormat: 'CSV',
  selectors: ['clase', 'nombre', 'veces', 'ha']
});
Export.table.toDrive({
  collection: tabla2, description: '04_recurrencia_vs_bosque_' + cfg.ETIQUETA_CASO,
  folder: 'despues_del_fuego', fileFormat: 'CSV',
  selectors: ['veces', 'etiqueta', 'ha_bosque_2012', 'ha_bosque_2024', 'pct_sigue_bosque']
});