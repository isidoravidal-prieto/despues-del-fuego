// =====================================================================
// 04c_validacion — Muestra para revisión visual (bosque → plantación)
// Proyecto "Después del fuego" — Validación
// =====================================================================

var cfg = require('users/vistokk31/mapbiomas:00_config');

// ===== Parámetros =====
var zona    = cfg.casoGeom;
var BOSQUE  = [3, 59, 60, 67];
var N       = 30;   // puntos por grupo
var SEMILLA = 42;   // fija el azar: misma muestra cada vez que se corre

// ===== Capas =====
function quemadoPeriodo(ini, fin) {
  var bandas = [];
  for (var a = ini; a <= fin; a++) bandas.push('burned_area_' + a);
  return cfg.fuegoArea.select(bandas).unmask(0).gt(0).reduce(ee.Reducer.max());
}

var cobRef      = cfg.cobertura.select('classification_2012');
var esBosqueRef = cobRef.remap(BOSQUE, ee.List.repeat(1, BOSQUE.length), 0).eq(1);
var esPlant2024 = cfg.cobertura.select('classification_2024').eq(9);
var quemado     = quemadoPeriodo(2013, 2021);
var fuegoPost   = quemadoPeriodo(2022, 2024);

var base = esBosqueRef.and(esPlant2024).and(fuegoPost.not());

// Estrato 1 = quemado, 2 = no quemado
var estrato = ee.Image(0)
  .where(base.and(quemado), 1)
  .where(base.and(quemado.not()), 2)
  .rename('estrato').int();

// ===== Muestreo estratificado =====
var puntos = estrato.addBands(cobRef.rename('clase_2012')).stratifiedSample({
  numPoints: N,
  classBand: 'estrato',
  classValues: [1, 2],
  classPoints: [N, N],
  region: zona,
  scale: cfg.ESCALA,
  seed: SEMILLA,
  geometries: true,
  tileScale: 4
});

// ===== Nombres (Q01…, N01…) y coordenadas =====
function nombrar(fc, prefijo, grupo) {
  var lista = fc.toList(fc.size());
  return ee.FeatureCollection(ee.List.sequence(0, lista.size().subtract(1)).map(function(i) {
    var f = ee.Feature(lista.get(i));
    var coords = f.geometry().coordinates();
    return f.set({
      Name: ee.String(prefijo).cat(ee.Number(i).add(1).format('%02d')),
      grupo: grupo,
      lon: coords.get(0),
      lat: coords.get(1),
      interpretacion: ''
    });
  }));
}

var muestra = nombrar(puntos.filter(ee.Filter.eq('estrato', 1)), 'Q', 'Quemado')
  .merge(nombrar(puntos.filter(ee.Filter.eq('estrato', 2)), 'N', 'No quemado'));

print('Puntos por grupo:', muestra.aggregate_histogram('grupo'));
print('Muestra:', muestra.limit(5));

// ===== Mapa =====
Map.centerObject(cfg.casoComunas, 9);
Map.addLayer(ee.Image().byte().paint(cfg.casoComunas, 0, 2), {palette: ['000000']}, 'Comunas del caso');
Map.addLayer(muestra.filter(ee.Filter.eq('grupo', 'Quemado')), {color: 'FF0000'}, 'Puntos quemado');
Map.addLayer(muestra.filter(ee.Filter.eq('grupo', 'No quemado')), {color: '0000FF'}, 'Puntos no quemado');

// ===== Exportar =====
Export.table.toDrive({
  collection: muestra, description: '04c_validacion_' + cfg.ETIQUETA_CASO,
  folder: 'despues_del_fuego', fileFormat: 'KML'
});
Export.table.toDrive({
  collection: muestra, description: '04c_validacion_planilla_' + cfg.ETIQUETA_CASO,
  folder: 'despues_del_fuego', fileFormat: 'CSV',
  selectors: ['Name', 'grupo', 'clase_2012', 'lon', 'lat', 'interpretacion']
});