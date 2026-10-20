// =====================================================================
// 05_prioridades — Mapa de prioridades de restauración post-fuego
// Proyecto "Después del fuego" — Paso 5
// =====================================================================

var cfg = require('users/vistokk31/mapbiomas:00_config');

// ===== Parámetros (mismos que la App) =====
var zona     = cfg.casoGeom;                       // caso de estudio: secano costero del Maule
var ANIO_OBS = cfg.ULTIMO_ANIO_COBERTURA;          // 2024
var PRIO_REF = cfg.PRIMER_ANIO_FUEGO - 1;          // 2012
var PRIO_INI = cfg.PRIMER_ANIO_FUEGO;              // 2013
var PRIO_FIN = ANIO_OBS - 3;                       // 2021

var BOSQUE     = [3, 59, 60, 67];
var MATORRAL   = [66];
var HERBACEO   = [12, 11, 63];
var PLANTACION = [9];

var NOMBRES = ['En recuperación', 'Prioridad media (matorral degradado)',
               'Prioridad alta (bosque degradado)', 'Prioridad muy alta (bosque, 2+ fuegos)',
               'Convertido (plantación/agropecuario)',
               'Oportunidad (plantación quemada con regeneración nativa)'];
var COLORES = ['1F8D49', 'F2D16B', 'F28C28', 'C0392B', '7A5900', '00ACC1'];
var CLAVES  = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];

// ===== Utilidades =====
function esClase(img, codigos) {
  return img.remap(codigos, ee.List.repeat(1, codigos.length), 0).eq(1);
}
function frecuencia(ini, fin) {
  var bandas = [];
  for (var a = ini; a <= fin; a++) bandas.push('burned_area_' + a);
  return cfg.fuegoArea.select(bandas).unmask(0).gt(0).reduce(ee.Reducer.sum());
}

// Grupo antes: 1 bosque, 2 matorral, 3 herbáceo natural, 4 plantación, 0 otro
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

// ===== FUNCIÓN PRINCIPAL: imagen de prioridades (1–6) =====
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

var prio = prioridades().clip(zona);

// ===== Hectáreas por categoría =====
var bandasHa = ee.Image.cat([1, 2, 3, 4, 5, 6].map(function(k) {
  return cfg.areaHa.multiply(prio.eq(k)).unmask(0).rename('c' + k);
}));

// Total del caso (territorio unido: mismo cálculo que la App)
var total = bandasHa.reduceRegion({
  reducer: ee.Reducer.sum(), geometry: zona,
  scale: cfg.ESCALA, maxPixels: 1e13, tileScale: 4
});
var tablaTotal = ee.FeatureCollection([ee.Feature(null, total).set('COMUNA', 'Total caso de estudio')]);

print('Total del caso de estudio (ha):',
  ui.Chart.feature.byFeature(tablaTotal, 'COMUNA', CLAVES).setSeriesNames(NOMBRES).setChartType('Table'));

// Por comuna
var stats = bandasHa.reduceRegions({
  collection: cfg.casoComunas, reducer: ee.Reducer.sum(),
  scale: cfg.ESCALA, tileScale: 4
});

print(ui.Chart.feature.byFeature(stats, 'COMUNA', CLAVES)
  .setSeriesNames(NOMBRES)
  .setChartType('BarChart')
  .setOptions({
    title: 'Prioridades de restauración por comuna (fuegos ' + PRIO_INI + '–' + PRIO_FIN + ', estado ' + ANIO_OBS + ')',
    isStacked: true, colors: COLORES,
    hAxis: {title: 'Hectáreas'},
    legend: {position: 'top', maxLines: 3}
  }));

print('Tabla por comuna (ha):', ui.Chart.feature.byFeature(stats, 'COMUNA', CLAVES)
  .setSeriesNames(NOMBRES).setChartType('Table'));

// ===== MAPA =====
Map.centerObject(cfg.casoComunas, 9);
Map.setOptions('SATELLITE');
Map.addLayer(prio, {min: 1, max: 6, palette: COLORES}, 'Prioridades de restauración');
Map.addLayer(ee.Image().byte().paint(cfg.casoComunas, 0, 2), {palette: ['FFEB3B']}, 'Comunas del caso');

var leyenda = ui.Panel({style: {position: 'bottom-right', padding: '8px 12px'}});
leyenda.add(ui.Label('Prioridad de restauración', {fontWeight: 'bold', margin: '0 0 6px 0'}));
NOMBRES.forEach(function(nombre, i) {
  leyenda.add(ui.Panel([
    ui.Label('', {backgroundColor: '#' + COLORES[i], padding: '8px', margin: '0 6px 4px 0'}),
    ui.Label(nombre, {margin: '0 0 4px 0', fontSize: '12px'})
  ], ui.Panel.Layout.Flow('horizontal')));
});
Map.add(leyenda);

// ===== EXPORTAR =====
Export.table.toDrive({
  collection: stats.merge(tablaTotal),
  description: '05_prioridades_por_comuna_' + cfg.ETIQUETA_CASO,
  folder: 'despues_del_fuego', fileFormat: 'CSV',
  selectors: ['CUT_COM', 'COMUNA'].concat(CLAVES)
});

Export.image.toDrive({
  image: prio, description: '05_prioridades_raster_' + cfg.ETIQUETA_CASO,
  folder: 'despues_del_fuego', region: zona, scale: cfg.ESCALA,
  crs: 'EPSG:32719', maxPixels: 1e13
});