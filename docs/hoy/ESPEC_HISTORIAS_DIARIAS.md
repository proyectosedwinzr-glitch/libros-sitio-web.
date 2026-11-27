# Historias diarias para la web · cómo se escriben y se generan

Para «La historia del día» (`ediciones-edwin-zar.pages.dev/hoy/`). Cada día lleva **una efeméride de esa misma fecha**
(«un día como hoy…»), corta, con una sopa pequeña para el móvil.

- **Diciembre de 2026, hecho el 22 de noviembre:** 31 historias, 0 fallos y 9 defectos plantados detectados.
  - Datos: `privado/hoy/hoy_2026-12.json`.
  - Código: `privado/motor_hoy/`.
- **Cada mes siguiente se hace igual.**

## Reglas de contenido (las de la casa)

- **Dos fuentes por dato.** Las leyendas se cuentan como leyendas. Sin superlativos frágiles: «se considera», «uno de
  los primeros».
- **Tono:** serio, riguroso, académico, respetuoso, ameno y jovial. Ni guerras, ni política, ni crímenes, ni desastres
  como tema.
- **Sin repetir** historias ni personajes de:
  - los volúmenes 1 y 2 (en todos los idiomas);
  - «Navidad con historia» (Adviento y cuatro historias);
  - el planificador «Planear y recordar» (52 semanas).
  - Tampoco se repiten entre los meses de la web. Un personaje, una historia.
- **El final escondido aporta lo que el relato calla**, sin repetirlo, y también lleva sus dos fuentes.
- **La fecha:** el hecho ocurrió ese día (día y mes), comprobado con dos fuentes. Si el calendario era otro (juliano),
  se dice.

## Formato (lo que el motor acepta, medido en diciembre)

| Pieza | Medida |
|---|---|
| Relato | 50–70 palabras |
| Frase | literal del relato, 15–25 letras |
| Lista | 4–6 palabras del relato, de 6 a 10 letras, fuera de la frase y del final |
| Final | 25–45 letras (unas 6–9 palabras) |
| Cuadrícula | 9 × 9 o 10 × 10, la más pequeña en la que cierre la cuenta |

- **Nivel según el día de la semana:**
  - lunes a miércoles, nivel 1: → ↓ ↘, nunca al revés; se ve más de la mitad de la frase;
  - jueves a domingo, nivel 2: ocho direcciones, al menos una palabra al revés; se ve un tercio de la frase.
- **Figura de la frase:** rectángulo, U, casa, culebra o escalera, con pasos rectos. **Recorrido único** (en diciembre,
  31 de 31): el generador prueba semillas hasta conseguirlo.
- **Familias:** ninguna palabra de la lista se repite en el mes, ni su familia. Son familia si una es el principio de la
  otra, o si comparten una raíz larga (CELEBRABA/CELEBRARON, EUROPA/EUROPEO, PREMIADOS/PREMIOS). La regla es estricta a
  propósito: descarta algún par que no lo es (REFORMAS/REFORZO), y eso no importa.
- **Vetadas:** ninguna vulgar en ninguna dirección. Las malsonantes, solo dentro de una palabra, de la frase o de una
  palabra del final. CORTOS se cae porque lleva ORTO.
- En cada historia van de 7 a 10 candidatas: el generador se queda con las que cierran la cuenta exacta.

## Cómo se genera un mes (en `privado/motor_hoy/`)

1. Escribir `contenido_AAAA_MM.py` con las historias:
   - `titulo`, `fecha_del_hecho`, `relato`, `frase`, `candidatas`, `mensaje` y `fuentes`;
   - diciembre sirve de modelo: `contenido_diciembre.py`.
2. `python3 -I generar_diciembre.py hoy_AAAA-MM.json`. Cambiar en el script el mes y el módulo de contenido.
   - Avisa de las candidatas descartadas y por qué.
   - Si una historia no cierra, se añaden candidatas o se ajusta el final.
3. `python3 -I verificar_diciembre.py hoy_AAAA-MM.json --prueba`. Comprobador independiente:
   - 0 fallos;
   - los 9 defectos plantados detectados, cada uno por su propia regla.
4. `python3 -I pdf_revision.py hoy_AAAA-MM.json revision.pdf`: un cuadernillo para revisar a lápiz, con todos los días
   y, al final, las soluciones.
5. **Lectura a lápiz** de una muestra de 3 a 5 días, como mínimo.
6. Copiar el JSON en `privado/hoy/` del repositorio de la web y construir.

## Esquema (el del planificador, con `fecha`, `libro` y `recorrido_unico`)

```
{"mes": "2026-12", "titulo": "...", "autor": "Edwin Zar", "historias": [
  {"fecha": "2026-12-01", "dia_mes": "12-01", "tipo": "nivel1", "antetitulo": "La historia del día",
   "titulo": "…", "fecha_del_hecho": "1 de diciembre de AAAA · Lugar",
   "relato": "…", "frase": "…", "mensaje": "…", "mensaje_letras": 25, "fuentes": ["…", "…"],
   "libro": "letras-con-historia",
   "cuadricula": {"lado": 9, "filas": [["S", …], …], "colocadas": [["FRASE", "…", [[f, c], …], null, 1],
                  ["PALABRA", "PALABRA", [[f, c], …], [df, dc], 1], …], "figura": ["U", 7, 9]},
   "frase_recorrido": [[f, c], …], "recorrido_unico": true,
   "pagina": {"rotulo_frase": "La frase", "frase_visible": ["E_______", …], "figura_visible": true,
              "rotulo_lista": "Las 5 palabras", "lista": ["…"], "indicaciones": "…"},
   "pagina_cuadricula": {"rotulo_final": "El final del relato · 25 letras", "ranuras": [1, 4, 2, …]}}
]}
```

## Entrega y ritmo

- **Un archivo por mes**, `hoy_AAAA-MM.json`, **antes del día 15 del mes anterior**. Enero de 2027: antes del 15 de
  diciembre.
- **Los JSON no se suben a GitHub**: el repositorio es público y son contenido futuro. Sí pueden ir al proyecto.
- **Ritmo:** unas 30 historias verificadas al mes. Si no se puede sostener, el autor decide entre:
  - publicar solo de lunes a viernes;
  - o repetir, el año siguiente, las del año anterior (por `dia_mes`).
