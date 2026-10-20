// =====================================================================
// 02_area_estudio — Ranking de comunas afectadas y elección del caso
// Proyecto "Después del fuego"
// =====================================================================

var cfg = require('users/vistokk31/mapbiomas:00_config');

// ===== Parámetros =====
var ANIO_FUEGO = 2017;
var BOSQUE = [3, 59, 60, 67];
var zonaBusqueda = ee.Geometry.Rectangle([-73.0, -38.0, -70.5, -33.5]);  // centro-sur

// ===== Comunas de la zona =====
var comunas = cfg.comunas.filterBounds(zonaBusqueda);
print('Comunas en la zona:', comunas.size());
print('Ejemplo de comuna:', comunas.first());

// ===== Capas: quemado, nativo y bosque (cobertura del año anterior) =====
var quemado  = cfg.fuegoArea.select('burned_area_' + ANIO_FUEGO).unmask(0).gt(0);
var cobPre   = cfg.cobertura.select('classification_' + (ANIO_FUEGO - 1));
var esNativo = cobPre.remap(cfg.NATIVOS, ee.List.repeat(1, cfg.NATIVOS.length), 0).eq(1);
var esBosque = cobPre.remap(BOSQUE, ee.List.repeat(1, BOSQUE.length), 0).eq(1);

var img = ee.Image.cat([
  cfg.areaHa.multiply(quemado).rename('ha_quemado'),
  cfg.areaHa.multiply(quemado.and(esNativo)).rename('ha_nativo_quemado'),
  cfg.areaHa.multiply(quemado.and(esBosque)).rename('ha_bosque_quemado')
]);

// ===== Suma por comuna =====
var stats = img.reduceRegions({
  collection: comunas,
  reducer: ee.Reducer.sum(),
  scale: cfg.ESCALA,
  tileScale: 4
}).map(function(f) {
  var areaComuna = f.geometry().area(100).divide(10000);
  return f.set({
    ha_comuna: areaComuna,
    pct_comuna_quemada: ee.Number(f.get('ha_quemado')).divide(areaComuna).multiply(100)
  });
});

// ===== Ranking por vegetación nativa quemada =====
var ranking = stats.filter(ee.Filter.gt('ha_quemado', 0))
  .sort('ha_nativo_quemado', false);

var COLUMNAS = ['ha_quemado', 'ha_nativo_quemado', 'ha_bosque_quemado', 'pct_comuna_quemada'];

print('Top 15 comunas por vegetación nativa quemada en ' + ANIO_FUEGO + ':',
  ui.Chart.feature.byFeature(ranking.limit(15), 'COMUNA', COLUMNAS)
    .setSeriesNames(['Total quemado (ha)', 'Nativo quemado (ha)', 'Bosque quemado (ha)', '% de la comuna quemada'])
    .setChartType('Table'));

// ===== MAPA =====
var top5 = ranking.limit(5);
Map.centerObject(zonaBusqueda, 7);
Map.addLayer(quemado.selfMask(), {palette: ['FF0000']}, 'Área quemada ' + ANIO_FUEGO);
Map.addLayer(ee.Image().byte().paint(comunas, 0, 1), {palette: ['444444']}, 'Comunas');
Map.addLayer(ee.Image().byte().paint(top5, 0, 3), {palette: ['FFD700']}, 'Top 5 comunas');

// ===== Exportar ranking completo =====
Export.table.toDrive({
  collection: ranking,
  description: '02_ranking_comunas_' + ANIO_FUEGO,
  folder: 'despues_del_fuego',
  fileFormat: 'CSV',
  selectors: ['CUT_REG', 'CUT_COM', 'COMUNA', 'COMUNA_ST', 'PROVINCIA', 'REGION',
              'ha_comuna', 'ha_quemado', 'ha_nativo_quemado', 'ha_bosque_quemado', 'pct_comuna_quemada']
});