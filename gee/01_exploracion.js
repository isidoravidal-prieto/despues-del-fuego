// =====================================================================
// 01_exploracion — Verificación de datos y qué se quemó
// Proyecto "Después del fuego"
//  Pasos 1 y 2
// =====================================================================

var cfg = require('users/vistokk31/mapbiomas:00_config');

// ===== Parámetros =====
var zona = ee.Geometry.Rectangle([-73.0, -37.0, -71.0, -34.0]);  // zona de prueba
var ANIO = 2017;

// ===== 1. Verificación de datos =====
print('Bandas cobertura:', cfg.cobertura.bandNames());
print('Bandas Fuego área:', cfg.fuegoArea.bandNames());
print('Bandas Fuego cobertura:', cfg.fuegoCob.bandNames());

// ===== 2. Mapa =====
   var cobAntes = cfg.cobertura.select('classification_' + (ANIO - 1));
var quemado  = cfg.fuegoArea.select('burned_area_' + ANIO).gt(0);

Map.centerObject(zona, 8);
Map.addLayer(cfg.pintarCobertura(cobAntes), cfg.VIS_COBERTURA, 'Cobertura ' + (ANIO - 1));
Map.addLayer(quemado.selfMask(), {palette: ['FF0000']}, 'Área quemada ' + ANIO);
Map.addLayer(zona, {color: 'yellow'}, 'Zona de prueba', false);

// ===== 3. Función: hectáreas por clase =====
var NOMBRES = ee.Dictionary.fromLists(cfg.COD_LEY.map(String), cfg.NOM_LEY);

function haPorClase(img, geom) {
  var res = cfg.areaHa.addBands(img.rename('clase')).reduceRegion({
    reducer: ee.Reducer.sum().group({groupField: 1, groupName: 'clase'}),
    geometry: geom,
    scale: cfg.ESCALA,
    maxPixels: 1e13,
    tileScale: 4
  });
  return ee.FeatureCollection(ee.List(res.get('groups')).map(function(g) {
    g = ee.Dictionary(g);
    var c = ee.Number(g.get('clase')).int();
    return ee.Feature(null, {
      codigo: c,
      nombre: NOMBRES.get(c.format('%d'), 'No en leyenda'),
      ha: g.get('sum')
    });
  }));
}

// ===== 4. Qué se quemó (según Fuego) =====
var tablaFuego = haPorClase(cfg.fuegoCob.select('burned_coverage_' + ANIO), zona);
print('Quemado ' + ANIO + ' según Fuego (ha):', tablaFuego);

// ===== 5. Verificación: cobertura del año anterior en lo quemado =====
var tablaCob = haPorClase(cobAntes.updateMask(quemado), zona);
print('Cobertura ' + (ANIO - 1) + ' en lo quemado ' + ANIO + ' (ha):', tablaCob);

// ===== 6. Exportar a Drive =====
Export.table.toDrive({
  collection: tablaFuego,
  description: '01_quemado_' + ANIO + '_segun_fuego',
  folder: 'despues_del_fuego',
  fileFormat: 'CSV',
  selectors: ['codigo', 'nombre', 'ha']
});

Export.table.toDrive({
  collection: tablaCob,
  description: '01_quemado_' + ANIO + '_segun_cobertura',
  folder: 'despues_del_fuego',
  fileFormat: 'CSV',
  selectors: ['codigo', 'nombre', 'ha']
});

// =====================================================================
// 7. Visualización de resultados en la consola
// =====================================================================

// Convierte una tabla de haPorClase en diccionario {código: ha}
function dictHa(img, geom) {
  var fc = haPorClase(img, geom);
  var claves = fc.aggregate_array('codigo').map(function(c) {
    return ee.Number(c).format('%d');
  });
  return ee.Dictionary.fromLists(claves, fc.aggregate_array('ha'));
}

// Las tres versiones, sobre los mismos píxeles quemados
var dCobAntes = dictHa(cobAntes.updateMask(quemado), zona);
var dCobMismo = dictHa(cfg.cobertura.select('classification_' + ANIO).updateMask(quemado), zona);
var dFuego    = dictHa(cfg.fuegoCob.select('burned_coverage_' + ANIO), zona);

// Unir en una sola tabla comparativa
var claves = dCobAntes.keys().cat(dCobMismo.keys()).cat(dFuego.keys()).distinct();

var comparacion = ee.FeatureCollection(claves.map(function(k) {
  k = ee.String(k);
  return ee.Feature(null, {
    clase: NOMBRES.get(k, ee.String('Código ').cat(k)),
    cobertura_anterior: dCobAntes.get(k, 0),
    cobertura_mismo_anio: dCobMismo.get(k, 0),
    fuego: dFuego.get(k, 0)
  });
}));

var series = ['cobertura_anterior', 'cobertura_mismo_anio', 'fuego'];

// Gráfico de barras
print(ui.Chart.feature.byFeature(comparacion, 'clase', series)
  .setChartType('ColumnChart')
  .setOptions({
    title: 'Qué se quemó en ' + ANIO + ': tres fuentes comparadas',
    vAxis: {title: 'Hectáreas'},
    hAxis: {slantedText: true, slantedTextAngle: 45},
    colors: ['1F8D49', 'A89358', 'D4271E'],
    legend: {position: 'top'}
  }));

// Tabla
print(ui.Chart.feature.byFeature(comparacion, 'clase', series)
  .setChartType('Table'));
  
  



