# Después del fuego

**Herramienta abierta para analizar qué pasa con el territorio después de un incendio en Chile: qué se quemó, qué se recupera, qué se convierte y dónde restaurar.**

🌐 **App:**  [https://proyectos-508313.projects.earthengine.app/view/despues-del-fuego]

Construida con datos abiertos de MapBiomas Chile y Google Earth Engine, para que municipios, servicios públicos y organizaciones puedan responder en minutos preguntas que antes requerían semanas de trabajo SIG.

## ¿Qué hace?

Para una o varias comunas entre Valparaíso y La Araucanía, y un año de incendio entre 2013 y 2022, la App muestra:

- **¿Qué se quemó?** Superficie quemada por tipo de cobertura.
- **¿Qué pasó después?** En qué se convirtieron la vegetación nativa y las plantaciones quemadas hacia 2024.
- **¿Dónde restaurar?** Prioridades de restauración en seis categorías, incluidas las plantaciones quemadas donde hoy volvió la vegetación nativa.
- **¿Cuánto carbono se perdió?** Emisiones por la pérdida de bosque nativo y su valor social.

## Datos

- MapBiomas Chile: Cobertura y Uso del Suelo, Colección 2.0 (1999–2024), y Fuego, Colección 1 (2013–2025).
- CONAF: factores de emisión del Nivel de Referencia de Emisiones Forestales de Chile (2023).
- Precio social del carbono 2025 (71,1 USD/t CO₂e), Ministerio de Desarrollo Social y Familia.

> MapBiomas – Colección 2.0 de la Serie Anual de Mapas de Cobertura y Uso del Suelo de Chile y Colección 1 de MapBiomas Fuego Chile, consultadas el 19/10/2026 a través del enlace: https://chile.mapbiomas.org/

## Scripts (`gee/`)

| Script | Qué hace |
|---|---|
| `00_config.js` | Configuración central (datos, leyenda, caso de estudio). Lo usan todos los demás |
| `01_exploracion.js` | Verificación de datos y superficie quemada por cobertura |
| `02_area_estudio.js` | Ranking de comunas afectadas |
| `03_trayectoria.js` | Destino de la vegetación nativa quemada |
| `03b_plantaciones.js` | Destino de las plantaciones quemadas |
| `04_recurrencia.js` | Efecto de quemarse más de una vez |
| `04b_destino_bosque.js` | Bosque quemado vs. no quemado (grupo de control) |
| `04c_validacion.js` | Muestra para validación visual |
| `05_prioridades.js` | Mapa de prioridades de restauración |
| `06_carbono.js` | Emisiones y valor social |
| `07_app.js` | App "Después del fuego" |

**Para reproducir:** abre el repositorio en Earth Engine ([enlace](https://code.earthengine.google.com/?accept_repo=users/vistokk31/mapbiomas)) y corre los scripts en orden.

## Decisiones metodológicas 

- **La clase antes del fuego se toma de la cobertura del año anterior,** porque la capa de cobertura quemada de MapBiomas Fuego ya muestra el daño del incendio.
- **El efecto del fuego se mide contra un grupo de control** (bosque no quemado del mismo territorio). Los resultados indican asociación, no causalidad.
- **El carbono usa factores oficiales de CONAF** por tipo forestal, asignado según la región. Solo se contabiliza bosque nativo.
- **Validación visual de 60 puntos** con imágenes de alta resolución: el 80% de la conversión "bosque → plantación" en áreas quemadas se confirmó como plantación real.

## Caso de estudio: secano costero del Maule (incendios de 2017)

Constitución, Empedrado, Cauquenes y San Javier:

- **199.163 ha quemadas:** 67% plantación, 22% matorral y 9% bosque nativo.
- Del bosque nativo quemado, en 2024 **el 46% es plantación** y el 42% volvió a ser bosque.
- **24.118 ha de plantaciones quemadas tienen hoy vegetación nativa:** una oportunidad de restauración ocho veces mayor que el bosque nativo degradado.
- **5,3 millones de t CO₂e** emitidas, con un valor social de **USD 378 millones**.

*Para ver este caso en la App: elige la región del Maule, agrega las cuatro comunas y selecciona el año 2017. El análisis completo está en el informe técnico.*

## Limitaciones

- Los cambios se asocian al fuego, pero no demuestran causalidad.
- La categoría "Oportunidad" requiere verificación en terreno.
- MapBiomas Fuego cubre solo de Valparaíso a La Araucanía.

## Autoría y licencia
 
[Isidora Vidal Prieto] · Código bajo licencia MIT · Datos de MapBiomas bajo CC BY 4.0
 


















- Los cambios se asocian al fuego, pero no demuestran causalidad.
- La categoría "Oportunidad" requiere verificación en terreno.
- MapBiomas Fuego cubre solo de Valparaíso a La Araucanía.

## Autoría y licencia

[Tu nombre] · Código bajo licencia MIT · Datos de MapBiomas bajo CC BY 4.0
