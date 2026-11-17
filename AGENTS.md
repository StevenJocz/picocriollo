# PICO CRIOLLO - INSTRUCCIONES PARA CODEX

## 1. Objetivo

Desarrollar y mantener Pico Criollo utilizando:

- .NET 10
- Expo / React Native
- PostgreSQL

Next.js es la implementación original y sirve
como referencia funcional y visual.

La migración debe conservar todas las funcionalidades
y el diseño existente.

## 2. Documento de referencia

Existe un documento que describe el estado
de la migración de Next.js a .NET + Expo.

Consultar sus secciones relevantes cuando sea necesario.

No interpretar ese documento como una orden
para implementar todos los módulos pendientes.

El documento representa el plan general del proyecto.

## 3. Reglas de alcance

IMPORTANTE:

Trabajar exclusivamente en la tarea solicitada.

No comenzar automáticamente otros módulos.

No realizar refactorizaciones generales.

No modificar archivos ajenos a la funcionalidad actual,
salvo que sea estrictamente necesario.

No eliminar Next.js sin autorización explícita.

No modificar el diseño original sin autorización.

No ejecutar migraciones destructivas de base de datos.

## 4. Lectura del repositorio

Antes de comenzar:

1. Identificar los archivos relacionados con la tarea.
2. Leer únicamente los archivos necesarios.
3. Consultar Next.js solo cuando sea necesario
   comparar diseño o comportamiento.
4. Evitar recorrer carpetas generadas.

No inspeccionar innecesariamente:

- node_modules
- .next
- bin
- obj
- dist
- build
- coverage

Si se necesita ampliar el análisis,
explicar primero por qué.

## 5. Ejecución

Implementar una funcionalidad por solicitud.

Preferir cambios pequeños y verificables.

No ejecutar suites completas de pruebas
cuando basten pruebas específicas.

No repetir comandos que ya produjeron
resultados válidos.

No instalar dependencias sin necesidad.

No realizar tareas adicionales por iniciativa propia.

## 6. Diseño

Conservar:

- Paleta verde original.
- Tarjetas.
- Encabezados.
- Menú flotante.
- Navegación.
- Componentes visuales.
- Experiencia de usuario.

Las funcionalidades deben conservar
el comportamiento del sistema original.

## 7. Base de datos

La base PostgreSQL es compartida
por Next.js y la nueva API.

No modificar estructuras existentes
sin comprobar compatibilidad.

No eliminar tablas ni datos.

No ejecutar operaciones destructivas
sin autorización.

## 8. Control del trabajo

Al terminar cada tarea:

1. Indicar qué se implementó.
2. Enumerar archivos modificados.
3. Informar qué pruebas se realizaron.
4. Indicar problemas pendientes.
5. Detener la ejecución.

No continuar con la siguiente funcionalidad
sin una nueva instrucción.

## 9. Consumo de recursos

Priorizar operaciones necesarias.

Evitar análisis extensos sin justificación.

No realizar auditorías completas del proyecto
si la tarea no las requiere.

Si una tarea es demasiado grande,
proponer dividirla en partes.

Estas instrucciones buscan mejorar
la eficiencia del trabajo, pero no
establecen límites técnicos de consumo.
