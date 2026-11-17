# Identificación individual por anillos

## Funcionalidad

- El inventario muestra los números 1–100 como disponibles, asignados o temporalmente sin uso.
- Una asignación vigente relaciona el número con el ID permanente del ave. Al cambiar el anillo, el registro anterior queda retirado con sus fechas; los números con historial pueden reutilizarse después de quedar libres.
- Las aves nuevas se pueden crear durante la asignación. Su fotografía elegida se guarda como `Bird.photo` y se usa como foto de perfil en la ficha y el árbol genealógico.
- Identificar permite escribir el número, elegir una foto o abrir la cámara con una acción explícita. La captura es temporal y no se guarda salvo que el usuario elija esa imagen como foto de perfil durante el registro.
- Tesseract.js ejecuta el OCR dentro del navegador, filtra a dígitos y normaliza 1, 01 y 001 al mismo número. La interfaz nunca abre una ficha automáticamente después de OCR: el usuario confirma la lectura y luego pulsa para buscar.
- Las observaciones, controles de salud y eventos reproductivos se guardan con `birdId`, no con el número del anillo. El historial de postura individual solo se registra cuando se elige explícitamente una gallina en Recolección.
- Vender, marcar como fallecida o dejar inactiva un ave retira su asignación actual sin borrar la ficha ni el historial. El sistema bloquea borrar una ficha con eventos o asociaciones.

## Privacidad y ejecución

La foto enviada al OCR no se sube a un servicio de reconocimiento. Tesseract.js hace el procesamiento en el navegador. Con la configuración predeterminada de Tesseract.js 7, el worker, el núcleo WebAssembly y el modelo de inglés se descargan desde jsDelivr cuando se usa OCR por primera vez; el modelo se puede reutilizar desde caché. Por ello, OCR requiere conexión de red para esa primera carga. Si esos recursos no están disponibles, permanece disponible la búsqueda manual. La captura temporal permanece en memoria de la página y se descarta al salir.

El acceso a cámara necesita permiso del navegador y un contexto seguro: HTTPS o `localhost`. Si el navegador no da permiso o no tiene cámara, se puede usar la galería o el número manual. El archivo elegido para una nueva foto de perfil se limita a JPG, PNG o WEBP de máximo 2 MB.

## Persistencia

Las nuevas listas `rings` y `birdEvents`, junto con `henId` opcional en cada recolección, viajan dentro del objeto `FarmData` que ya guarda la aplicación. En servidor, el API conserva ese objeto completo en la fila JSONB por cuenta; se actualizaron los arreglos requeridos por el API. Los datos anteriores se complementan con listas vacías al cargarse. La modalidad local de prueba usa el `localStorage` existente.

Las fotos continúan como data URL dentro del objeto de granja, siguiendo el almacenamiento actual del proyecto. Como aumenta el tamaño del JSON de la granja, para muchas aves o fotos de alta resolución conviene migrar las imágenes a almacenamiento de objetos y guardar una URL. La aplicación no requiere cambiar el esquema SQL para este módulo.

## Ejecución manual

En «Identificar ave», elige un número en la cuadrícula o escribe uno en el campo. Para OCR: abre cámara o elige imagen, espera la lectura, revisa las alternativas si aparecen, confirma el número y busca. Para crear un ave, usa «Registrar ave nueva» y completa su foto de perfil, nombre, sexo, raza, gallinero y fecha de nacimiento o edad estimada.

