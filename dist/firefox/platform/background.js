// ENTRADA DEL BACKGROUND EN FIREFOX (Manifest V3 → "event page" con background.scripts).
// Firefox no admite service_worker en MV3: los módulos comunes se listan en manifest.json
// (background.scripts) y se cargan en orden antes que este archivo.
PG.backgroundCore.start();
