# Letterboxd

Siga en Gladys Assistant las películas vistas en [Letterboxd](https://letterboxd.com), la red social de los
cinéfilos: la última película registrada por cada perfil seguido, su nota, las películas del mes y del año, un
disparador de escena con cada nueva película y un widget del panel con los últimos carteles.

Sin afiliación con Letterboxd. La integración lee el feed RSS público de cada perfil, sin cuenta.

## Qué obtiene

- **Un dispositivo por perfil seguido** («Letterboxd Juana»), con cinco funciones:
  - **Última película vista**: «Mouse (2026) · ★★★★», con «vista de nuevo» cuando es un revisionado;
  - **Nota de la última película**: de 0,5 a 5 por medias estrellas, **0 cuando la película no tiene nota**;
  - **Películas vistas este mes** y **Películas vistas este año**, contadas en el diario (según la fecha de
    visionado indicada por el miembro, en la zona horaria de Gladys, revisionados incluidos);
  - **Nota media este año**, de las películas con nota del año, 0 si no hay ninguna.
- **Un disparador de escena** «Letterboxd: nueva película vista», con el título, el año, la nota y una frase lista.
- **Un widget del panel** «Películas de Letterboxd»: las últimas películas con su cartel y sus estrellas, para un
  perfil o para todos.

## Requisitos

- Gladys Assistant 5.1 o posterior.
- Acceso a Internet desde Gladys (la integración lee `letterboxd.com`).
- Uno o varios perfiles **públicos** de Letterboxd. No necesita una cuenta de Letterboxd ni una contraseña: la
  integración solo lee lo que cualquiera puede ver en el perfil.

## Configuración

### Ajustes

| Ajuste                         | Descripción                                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Perfiles de Letterboxd**     | Nombres de usuario o enlaces de perfil (`https://letterboxd.com/juana/`), separados por comas. Diez como máximo. |
| **Intervalo de actualización** | 30 minutos, 1 hora (por defecto), 2 o 6 horas. Una petición por perfil en cada lectura.                          |
| **Idioma de los textos**       | Nombres de las funciones (fijados al crearlas) y frases enviadas a las escenas. Francés por defecto.             |

Guarde, abra la pestaña **Descubrir** de la integración y cree los dispositivos que desee. Un perfil que Letterboxd no
conoce se indica en el estado de la integración y no tiene dispositivo.

### El nombre de usuario

El nombre de usuario es el final de la dirección del perfil: `https://letterboxd.com/juana/` → `juana`. No es el
nombre mostrado en el perfil. Las mayúsculas no importan.

## Dispositivos

El dispositivo de un perfil lo actualiza la propia integración en el intervalo elegido (Gladys no lo consulta). Los
valores se conservan entre dos lecturas; cuando no se puede acceder a Letterboxd, se mantienen los últimos.

**Sobre los recuentos.** El feed RSS contiene las **50 últimas entradas del diario** de un perfil. Las películas del
mes y del año se cuentan sobre ellas: para un miembro que ha registrado más de 50 películas este año, el recuento del
año se detiene en lo que muestra el feed (el widget indica entonces «50+»). Una película marcada como vista sin
entrada en el diario no está en el feed y no se cuenta.

## Widget del panel

Añada el widget **Películas de Letterboxd** a un panel. Ajustes:

- **Perfil**: un perfil, con su nombre y las películas del mes y del año arriba; vacío, todos los perfiles mezclados,
  las películas más recientes primero.
- **Mostrar los carteles**: activado por defecto. La integración carga los carteles desde los servidores de imágenes
  de Letterboxd (nunca su navegador); desactívelo para no cargar ninguno.

Cada fila muestra el cartel, el título y el año, las estrellas, el miembro y la fecha de visionado. Toque una fila
para ver la nota, la fecha, el revisionado y el «me gusta», con un enlace a la entrada en Letterboxd.

## Disparador de escena

**Letterboxd: nueva película vista** se activa cuando un perfil seguido ha registrado una película en su diario, en
la siguiente lectura (dentro del intervalo de actualización). Filtros:

- **Perfil**: un dispositivo, o vacío para todos los perfiles;
- **Visionado**: primer visionado, revisionado, o ambos (vacío).

Variables para las acciones siguientes: `member` (el nombre del dispositivo en Gladys, sin «Letterboxd»), `title`,
`year`, `rating` (0,5 a 5, 0 = sin nota), `liked` (1 si al miembro le gustó la película), `url` (la entrada en
Letterboxd) y `summary`, una frase como «Juana ha visto Mouse (2026), con una nota de 4/5.»

La primera lectura de un perfil no activa nada: las películas que ya están en su feed no son novedades. Las películas
vistas se guardan en los datos de la integración, así que un reinicio no vuelve a activar nada. Se anuncian como
máximo 10 películas por lectura, el resto en la siguiente.

## Ejemplos de escenas

- **Resumen de la noche de cine**: disparador «nueva película vista» → enviar un mensaje con `summary` a la familia.
- **Una favorita**: disparador «nueva película vista» → condición sobre el dispositivo «Nota de la última película»
  igual a 5 → enviar un mensaje con la variable `title`.
- **Salón**: disparador «nueva película vista» para su propio perfil → volver a encender las luces tras la película.

## Fuente de datos, condiciones y cuotas

- Fuente: el feed RSS público `https://letterboxd.com/<usuario>/rss/` de cada perfil. La API de Letterboxd solo se
  concede bajo petición, y la integración no la usa.
- La integración se identifica con un User-Agent honesto y envía una petición por perfil en cada lectura (una vez por
  hora por defecto), más las miniaturas de carteles que muestra el widget, guardadas en memoria.
- **La watchlist no se lee**: no tiene feed RSS, y su página está hecha para navegadores.
- Los títulos, carteles y datos pertenecen a Letterboxd y a sus titulares; la integración solo los muestra en su
  panel.

## Solución de problemas

- **«Perfil no encontrado en Letterboxd»**: compruebe el nombre de usuario en la dirección del perfil, no el nombre
  mostrado.
- **Un perfil sin dispositivo**: el perfil puede ser privado, estar desactivado o no existir.
- **«No se puede acceder a Letterboxd»**: Gladys no tiene acceso a Internet, o Letterboxd no funciona; la integración
  lo vuelve a intentar en cada lectura e indica cuando responde de nuevo.
- **Falta una película**: solo las entradas del diario están en el feed. Registre la película en el diario (con fecha)
  en Letterboxd.
- **Nombres de funciones en el idioma equivocado**: se fijan al crear el dispositivo. Cambie el idioma, luego elimine
  y vuelva a crear el dispositivo.
- Registros: la página de la integración en Gladys muestra sus registros; `LOG_LEVEL=debug` detalla cada lectura.

## Límites

- Desarrollada sin cuenta de Letterboxd propia, sobre feeds públicos: se agradecen comentarios.
- Recuentos basados en las 50 últimas entradas del diario del feed (ver más arriba).
- Ni watchlist, ni listas, ni texto de las reseñas: solo el diario.
- Una película se ve en la siguiente lectura, no al instante.
