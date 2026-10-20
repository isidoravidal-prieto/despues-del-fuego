// =====================================================================
// 00_config — Configuración central del proyecto
// Proyecto "Después del fuego"
// Este script NO se corre solo: lo importan los demás con require()
// =====================================================================

// ===== Datos MapBiomas Chile =====
exports.cobertura = ee.Image('projects/mapbiomas-chile/assets/LULC/COLLECTION-02/CLASSIFICATIONS/classification-final/clasificacion-final-2');
exports.fuegoArea = ee.Image('projects/mapbiomas-public/assets/chile/fire/collection1/mapbiomas_chile_fire_collection1_annual_burned_v1');
exports.fuegoCob  = ee.Image('projects/mapbiomas-public/assets/chile/fire/collection1/mapbiomas_chile_fire_collection1_annual_burned_coverage_v1');

// ===== Límites administrativos =====
exports.comunas = ee.FeatureCollection('projects/proyectos-508313/assets/COMUNAS_simplificadas');

// ===== Caso de estudio: secano costero del Maule =====
var CASO_NOMBRES = ['Constitucion', 'Empedrado', 'Cauquenes', 'San Javier'];  // nombres sin tildes
exports.CASO_NOMBRES = CASO_NOMBRES;
exports.ETIQUETA_CASO = 'maule';
exports.casoComunas = exports.comunas.filter(ee.Filter.inList('COMUNA_ST', CASO_NOMBRES));
exports.casoGeom    = exports.casoComunas.geometry();
exports.fichaComuna = exports.comunas.filter(ee.Filter.eq('COMUNA_ST', 'Empedrado'));


// ===== Períodos disponibles (actualizar aquí cuando MapBiomas publique datos nuevos) =====
exports.ULTIMO_ANIO_COBERTURA = 2024;
exports.ULTIMO_ANIO_FUEGO     = 2025;
exports.PRIMER_ANIO_FUEGO     = 2013;
exports.ANIOS_SEGUIMIENTO_MIN = 2;   // años mínimos después del fuego para evaluar recuperación

// ===== Leyenda Colección 2.0 (códigos, nombres y colores oficiales) =====
var COD_LEY = [3, 59, 60, 67, 11, 12, 63, 66, 29, 9, 18, 15, 24, 23, 61, 25, 33, 34, 27];
var NOM_LEY = ['Bosque', 'Bosque primario', 'Bosque secundario', 'Bosque achaparrado',
               'Humedal', 'Pastizal', 'Estepa', 'Matorral', 'Afloramiento rocoso',
               'Silvicultura', 'Agricultura', 'Pastura', 'Infraestructura',
               'Arena, playa y duna', 'Salar', 'Otra área sin vegetación',
               'Río, lago u océano', 'Hielo y nieve', 'No observado'];
var COL_LEY = ['1F8D49', '1F8D49', '5CB85D', 'C8FFB4', '519799', 'D6BC74', 'C7E0AB',
               'A89358', 'FFAA5F', '7A5900', 'E974ED', 'EDDE8E', 'D4271E', 'FFA07A',
               'F5D5D5', 'DB4D4F', '2532E4', '93DFE6', 'FFFFFF'];

exports.COD_LEY = COD_LEY;
exports.NOM_LEY = NOM_LEY;
exports.COL_LEY = COL_LEY;

// Pinta una banda de cobertura con los colores oficiales
exports.pintarCobertura = function(img) {
  return img.remap(COD_LEY, ee.List.sequence(0, COD_LEY.length - 1));
};
exports.VIS_COBERTURA = {min: 0, max: COD_LEY.length - 1, palette: COL_LEY};

exports.NATIVOS = [3, 59, 60, 67, 66, 12, 11, 63];
exports.NOMBRES_PRE = ee.Dictionary({
  '3': 'Bosque', '59': 'Bosque primario', '60': 'Bosque secundario', '67': 'Bosque achaparrado',
  '66': 'Matorral', '12': 'Pastizal', '11': 'Humedal', '63': 'Estepa'
});
// ===== Agrupación para la trayectoria (después del fuego) =====
exports.CODIGOS_POST = [3, 59, 60, 67, 66, 12, 63, 11, 9, 14, 15, 18, 22, 23, 24, 25, 29, 61, 26, 27, 33, 34];
exports.GRUPOS_POST  = [1,  1,  1,  1,  2,  3,  3,  3, 4,  5,  5,  5,  6,  6,  6,  6,  6,  6,  7,  7,  7,  7];
exports.NOMBRES_POST = ee.Dictionary({
  '0': 'Sin clasificar', '1': 'Bosque nativo', '2': 'Matorral',
  '3': 'Herbáceo natural/humedal', '4': 'Plantación', '5': 'Agropecuario',
  '6': 'Sin vegetación', '7': 'Agua/nieve/no obs.'
});

// ===== Utilidades =====
exports.areaHa = ee.Image.pixelArea().divide(10000);
exports.ESCALA = 30;