// =====================================================================
// 03b_plantaciones — Qué pasó con las plantaciones después del fuego
// Proyecto "Después del fuego" — Paso 3b
// =====================================================================

var cfg = require('users/vistokk31/mapbiomas:00_config');

// ===== Parámetros =====
var zona = cfg.casoGeom;   // caso de estudio: secano costero del Maule
var ANIO_FUEGO = 2017;
var ANIOS_POST = [2018, 2019, 2020, 2021, 2022, 2023, 2024];

// ===== Plantación quemada (según la cobertura del año anterior) =====
var quemado  = cfg.fuegoArea.select('burned_area_' + ANIO_FUEGO).unmask(0).gt(0);
var plantPre = cfg.cobertura.select('classification_' + (ANIO_FUEGO - 1)).eq(9);
var mascara  = quemado.and(plantPre);

print('Plantación quemada en ' + ANIO_FUEGO + ' (ha):',
  cfg.areaHa.updateMask(mascara).reduceRegion({
    reducer: ee.Reducer.sum(), geometry: zona,
    scale: cfg.ESCALA, maxPixels: 1e13, tileScale: 4
  }));

// ===== Destino año a año =====
var CLAVES  = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g0'];
var SERIES  = ['Bosque nativo', 'Matorral', 'Herbáceo natural/humedal', 'Plantación',
               'Agropecuario', 'Sin vegetación', 'Agua/nieve/no obs.', 'Sin clasificar'];
var COLORES = ['1F8D49', 'A89358', 'D6BC74', '7A5900', 'E974ED', 'DB4D4F', '2532E4', 'BBBBBB'];
var base = ee.Dictionary.fromLists(CLAVES, ee.List.repeat(0, CLAVES.length));

var tabla = ee.FeatureCollection(ee.List(ANIOS_POST).map(function(anio) {
  anio = ee.Number(anio).int();
  var post = cfg.cobertura.select(ee.String('classification_').cat(anio.format('%d')))
    .remap(cfg.CODIGOS_POST, cfg.GRUPOS_POST, 0)
    .updateMask(mascara).rename('g');

  var res = cfg.areaHa.addBands(post).reduceRegion({
    reducer: ee.Reducer.sum().group({groupField: 1, groupName: 'g'}),
    geometry: zona, scale: cfg.ESCALA, maxPixels: 1e13, tileScale: 4
  });

  var grupos = ee.List(res.get('groups'));
  var d = ee.Dictionary.fromLists(
    grupos.map(function(g) {
      return ee.String('g').cat(ee.Number(ee.Dictionary(g).get('g')).int().format('%d'));
    }),
    grupos.map(function(g) { return ee.Dictionary(g).get('sum'); })
  );
  return ee.Feature(null, base.combine(d, true).set('anio', anio.format('%d')));
}));

// ===== Gráfico: evolución del destino (%) =====
print(ui.Chart.feature.byFeature(tabla, 'anio', CLAVES)
  .setSeriesNames(SERIES)
  .setChartType('AreaChart')
  .setOptions({
    title: 'Plantaciones quemadas en ' + ANIO_FUEGO + ': en qué se convirtieron año a año — Maule',
    isStacked: 'percent',
    colors: COLORES,
    vAxis: {title: '% de la plantación quemada'},
    legend: {position: 'top', maxLines: 3}
  }));

print('Tabla (ha):', ui.Chart.feature.byFeature(tabla, 'anio', CLAVES)
  .setSeriesNames(SERIES).setChartType('Table'));

// ===== Mapa: estado en 2024 de las plantaciones quemadas =====
var PALETA_POST = ['BBBBBB', '1F8D49', 'A89358', 'D6BC74', '7A5900', 'E974ED', 'DB4D4F', '2532E4'];
var estado2024 = cfg.cobertura.select('classification_2024')
  .remap(cfg.CODIGOS_POST, cfg.GRUPOS_POST, 0).updateMask(mascara);

Map.centerObject(cfg.casoComunas, 9);
Map.setOptions('SATELLITE');
Map.addLayer(estado2024.clip(zona), {min: 0, max: 7, palette: PALETA_POST},
             'Estado 2024 de plantaciones quemadas en ' + ANIO_FUEGO);
Map.addLayer(ee.Image().byte().paint(cfg.casoComunas, 0, 2), {palette: ['FFEB3B']}, 'Comunas del caso');

// ===== Exportar =====
Export.table.toDrive({
  collection: tabla,
  description: '03b_plantaciones_' + ANIO_FUEGO + '_' + cfg.ETIQUETA_CASO,
  folder: 'despues_del_fuego', fileFormat: 'CSV',
  selectors: ['anio'].concat(CLAVES)
});