// =====================================================================
// 04b_destino_bosque — ¿En qué se convirtió el bosque nativo de 2012?
// Proyecto "Después del fuego" — Verificación del paso 4
// =====================================================================

var cfg = require('users/vistokk31/mapbiomas:00_config');

// ===== Parámetros =====
var zona = cfg.casoGeom;   // caso de estudio: secano costero del Maule
var ANIO_REF = 2012;
var ANIO_OBS = 2024;
var BOSQUE   = [3, 59, 60, 67];

// ===== Frecuencia de fuego 2013–2021 (0, 1, 2 o más) =====
var bandas = [];
for (var a = 2013; a <= 2021; a++) bandas.push('burned_area_' + a);
var frec = cfg.fuegoArea.select(bandas).unmask(0).gt(0)
  .reduce(ee.Reducer.sum()).min(2).rename('frec');

// ===== Bosque de referencia y su destino agrupado =====
var cobRef = cfg.cobertura.select('classification_' + ANIO_REF);
var esBosqueRef = cobRef.remap(BOSQUE, ee.List.repeat(1, BOSQUE.length), 0).eq(1);

var destino = cfg.cobertura.select('classification_' + ANIO_OBS)
  .remap(cfg.CODIGOS_POST, cfg.GRUPOS_POST, 0);

// Excluir píxeles quemados después del período (2022–2024)
var bandasPost = ['burned_area_2022', 'burned_area_2023', 'burned_area_2024'];
var fuegoPost = cfg.fuegoArea.select(bandasPost).unmask(0).gt(0).reduce(ee.Reducer.max());

var combo = frec.multiply(10).add(destino)
  .updateMask(esBosqueRef.and(fuegoPost.not())).rename('combo');
var res = cfg.areaHa.addBands(combo).reduceRegion({
  reducer: ee.Reducer.sum().group({groupField: 1, groupName: 'combo'}),
  geometry: zona, scale: cfg.ESCALA, maxPixels: 1e13, tileScale: 4
});

// ===== Tabla pivote: fila = veces quemado, columnas = destino =====
var grupos = ee.List(res.get('groups'));
var d = ee.Dictionary.fromLists(
  grupos.map(function(g) { return ee.Number(ee.Dictionary(g).get('combo')).int().format('%d'); }),
  grupos.map(function(g) { return ee.Dictionary(g).get('sum'); })
);

var CLAVES  = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g0'];
var SERIES  = ['Bosque nativo', 'Matorral', 'Herbáceo natural/humedal', 'Plantación',
               'Agropecuario', 'Sin vegetación', 'Agua/nieve/no obs.', 'Sin clasificar'];
var COLORES = ['1F8D49', 'A89358', 'D6BC74', '7A5900', 'E974ED', 'DB4D4F', '2532E4', 'BBBBBB'];
var ETIQUETAS = ee.List(['Nunca quemado', 'Quemado 1 vez', 'Quemado 2+ veces']);
var NUM_GRUPO = [1, 2, 3, 4, 5, 6, 7, 0];

var tabla = ee.FeatureCollection(ee.List([0, 1, 2]).map(function(k) {
  k = ee.Number(k);
  var props = ee.Dictionary.fromLists(CLAVES, NUM_GRUPO.map(function(gr) {
    return d.get(k.multiply(10).add(gr).format('%d'), 0);
  }));
  return ee.Feature(null, props.set('etiqueta', ETIQUETAS.get(k)));
}));

print(ui.Chart.feature.byFeature(tabla, 'etiqueta', CLAVES)
  .setSeriesNames(SERIES)
  .setChartType('BarChart')
  .setOptions({
    title: 'Destino en ' + ANIO_OBS + ' del bosque nativo de ' + ANIO_REF + ', según fuego 2013–2021 — Maule',
    isStacked: 'percent',
    colors: COLORES,
    hAxis: {title: '% de la superficie de bosque ' + ANIO_REF},
    legend: {position: 'top', maxLines: 3}
  }));

print('Tabla (ha):', ui.Chart.feature.byFeature(tabla, 'etiqueta', CLAVES)
  .setSeriesNames(SERIES).setChartType('Table'));

// ===== MAPA: bosque NUNCA quemado que dejó de ser bosque, por destino =====
var PALETA_POST = ['BBBBBB', '1F8D49', 'A89358', 'D6BC74', '7A5900', 'E974ED', 'DB4D4F', '2532E4'];
var perdidaSinFuego = destino.updateMask(esBosqueRef.and(frec.eq(0)).and(fuegoPost.not()).and(destino.neq(1)));
Map.centerObject(cfg.casoComunas, 9);
Map.addLayer(cfg.pintarCobertura(cobRef).clip(zona), cfg.VIS_COBERTURA, 'Cobertura ' + ANIO_REF, false);
Map.addLayer(perdidaSinFuego.clip(zona), {min: 0, max: 7, palette: PALETA_POST}, 'Perdida bosque sin fuego');
Map.addLayer(ee.Image().byte().paint(cfg.casoComunas, 0, 2), {palette: ['000000']}, 'Comunas del caso');

// ===== Exportar =====
Export.table.toDrive({
  collection: tabla, description: 'destino_bosque_' + cfg.ETIQUETA_CASO,
  folder: 'despues_del_fuego', fileFormat: 'CSV'
});