// =====================================================================
// 03_trayectoria — Qué pasó con la vegetación nativa después del fuego
// Proyecto "Después del fuego" — Paso 3
// =====================================================================

var cfg = require('users/vistokk31/mapbiomas:00_config');

// ===== Parámetros =====
var zona = cfg.casoGeom;   // caso de estudio: secano costero del Maule
var ANIO_FUEGO = 2017;
var ANIOS_POST = [2018, 2020, 2022, 2024];

// Verificación: deben ser 4 comunas
print('Comunas del caso:', cfg.casoComunas.aggregate_array('COMUNA'));

// ===== Píxeles nativos quemados, con su clase del año ANTERIOR =====
function nativoQuemado(anioFuego) {
  var quemado = cfg.fuegoArea.select('burned_area_' + anioFuego).gt(0);
  var pre = cfg.cobertura.select('classification_' + (anioFuego - 1));
  var esNativo = pre.remap(cfg.NATIVOS, ee.List.repeat(1, cfg.NATIVOS.length), 0).eq(1);
  return pre.updateMask(quemado.and(esNativo));
}

// ===== Estado de esos píxeles en un año posterior (agrupado 1–7) =====
function estadoPost(anioFuego, anioObs) {
  var mascara = nativoQuemado(anioFuego).mask();
  return cfg.cobertura.select('classification_' + anioObs)
    .remap(cfg.CODIGOS_POST, cfg.GRUPOS_POST, 0)
    .updateMask(mascara);
}

// ===== FUNCIÓN PRINCIPAL: tabla antes → después =====
function trayectoria(geom, anioFuego, aniosPost) {
  var pre = nativoQuemado(anioFuego);

  var filas = ee.List(aniosPost).map(function(anio) {
    anio = ee.Number(anio).int();
    var banda = ee.String('classification_').cat(anio.format('%d'));
    var post  = cfg.cobertura.select(banda).remap(cfg.CODIGOS_POST, cfg.GRUPOS_POST, 0);
    var combo = pre.multiply(100).add(post).rename('combo');

    var res = cfg.areaHa.addBands(combo).reduceRegion({
      reducer: ee.Reducer.sum().group({groupField: 1, groupName: 'combo'}),
      geometry: geom,
      scale: cfg.ESCALA,
      maxPixels: 1e13,
      tileScale: 4
    });

    return ee.List(res.get('groups')).map(function(g) {
      g = ee.Dictionary(g);
      var c    = ee.Number(g.get('combo')).int();
      var cPre = c.divide(100).floor().int();
      var cPos = c.mod(100).int();
      return ee.Feature(null, {
        anio_fuego:  anioFuego,
        anio_obs:    anio,
        clase_pre:   cPre,
        nombre_pre:  cfg.NOMBRES_PRE.get(cPre.format('%d')),
        grupo_post:  cPos,
        nombre_post: cfg.NOMBRES_POST.get(cPos.format('%d')),
        ha: g.get('sum')
      });
    });
  }).flatten();

  return ee.FeatureCollection(filas);
}

// ===== Correr =====
var tabla = trayectoria(zona, ANIO_FUEGO, ANIOS_POST);

// ===== MAPA =====
var PALETA_POST = ['BBBBBB', '1F8D49', 'A89358', 'D6BC74', '7A5900', 'E974ED', 'DB4D4F', '2532E4'];
Map.centerObject(cfg.casoComunas, 9);
Map.addLayer(cfg.pintarCobertura(cfg.cobertura.select('classification_' + (ANIO_FUEGO - 1))).clip(zona),
             cfg.VIS_COBERTURA, 'Cobertura ' + (ANIO_FUEGO - 1), false);
Map.addLayer(nativoQuemado(ANIO_FUEGO).mask().selfMask().clip(zona), {palette: ['FF0000']},
             'Nativo quemado ' + ANIO_FUEGO, false);
Map.addLayer(estadoPost(ANIO_FUEGO, 2024).clip(zona), {min: 0, max: 7, palette: PALETA_POST},
             'Estado 2024 de lo nativo quemado');
Map.addLayer(ee.Image().byte().paint(cfg.casoComunas, 0, 2), {palette: ['000000']}, 'Comunas del caso');

// ===== GRÁFICO: destino en 2024 de cada ecosistema quemado (%) =====
var CLAVES  = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g0'];
var SERIES  = ['Bosque nativo', 'Matorral', 'Herbáceo natural/humedal', 'Plantación',
               'Agropecuario', 'Sin vegetación', 'Agua/nieve/no obs.', 'Sin clasificar'];
var COLORES = ['1F8D49', 'A89358', 'D6BC74', '7A5900', 'E974ED', 'DB4D4F', '2532E4', 'BBBBBB'];
var base = ee.Dictionary.fromLists(CLAVES, ee.List.repeat(0, CLAVES.length));

var t2024 = tabla.filter(ee.Filter.eq('anio_obs', 2024));
var pivot = ee.FeatureCollection(t2024.aggregate_array('nombre_pre').distinct().map(function(p) {
  var sub = t2024.filter(ee.Filter.eq('nombre_pre', p));
  var claves = sub.aggregate_array('grupo_post').map(function(g) {
    return ee.String('g').cat(ee.Number(g).format('%d'));
  });
  var d = ee.Dictionary.fromLists(claves, sub.aggregate_array('ha'));
  return ee.Feature(null, base.combine(d, true).set('clase_pre', p));
}));

print(ui.Chart.feature.byFeature(pivot, 'clase_pre', CLAVES)
  .setSeriesNames(SERIES)
  .setChartType('BarChart')
  .setOptions({
    title: 'Destino en 2024 de la vegetación nativa quemada en ' + ANIO_FUEGO + ' — secano costero del Maule',
    isStacked: 'percent',
    colors: COLORES,
    hAxis: {title: '% de la superficie quemada'},
    legend: {position: 'top', maxLines: 3}
  }));

print('Tabla 2024 (ha):', ui.Chart.feature.byFeature(pivot, 'clase_pre', CLAVES)
  .setSeriesNames(SERIES)
  .setChartType('Table'));

// ===== Exportar tabla completa (4 años) a Drive =====
Export.table.toDrive({
  collection: tabla,
  description: '03_trayectoria_' + ANIO_FUEGO + '_' + cfg.ETIQUETA_CASO,
  folder: 'despues_del_fuego',
  fileFormat: 'CSV',
  selectors: ['anio_fuego', 'anio_obs', 'clase_pre', 'nombre_pre', 'grupo_post', 'nombre_post', 'ha']
});