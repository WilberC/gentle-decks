---
title: Decks para gentle-shell
theme: gentleman-cute
brand: gentle-decks
lang: es
---

kicker: Decks · Markdown a presentación
class: cover
lead: Escribís el contenido en markdown, el renderer aplica el tema y produce un solo archivo HTML autocontenido. Navegación, responsive y export a PDF incluidos.

# Presentar ya no es<br>[[grad|escribir HTML a mano]].

---

kicker: El problema

## Hoy cada deck es [[pink|artesanal]]

::: grid-2 cards
::: card icon=✍️
### HTML a mano
Cada slide es HTML escrito a mano: caro de corregir y sin template real.
:::
::: card icon=🎨
### Tema copiado y pegado
El CSS es idéntico en cada deck, pero vive copiado dentro de cada gist.
:::
:::

> El contenido debería ser markdown. El resto, mecánica.

---

kicker: La idea

## Un skill, un renderer, [[pink|el canvas]]

::: steps
::: step num=01 title=Escribí
El agente escribe el contenido en markdown con convenciones simples.
:::
::: step num=02 title=Renderizá
Un comando convierte el markdown en un HTML autocontenido, siempre igual.
:::
::: step num=03 title=Miralo
El deck se abre en el canvas de gentle-design, con comentarios.
:::
:::

---

kicker: El formato

## Markdown con [[gold|intención]]

::: split
El markdown mapea directo: `#` título, `##` slide, `>` cita, tablas y listas estándar. Los componentes especiales son containers:

::: pills
- grid-2
- card
- step
- term
- bars
- stat
:::
:::

::: term
[[c|# ejemplo real de este deck]]
[[p|:::]] [[k|split]]
texto a la izquierda…
[[p|:::]] [[k|card]] accent icon=⚡
[[s|tarjeta destacada]]
[[p|:::]]
[[p|:::]]
:::

---

kicker: Los números

## Por qué [[mint|conviene]]

::: grid-3 cards
::: card
<span class="stat">1<small>archivo</small></span>
<p>El deck completo viaja en un solo HTML, sin dependencias externas.</p>
:::
::: card
<span class="stat">0<small>repetición</small></span>
<p>El tema vive en un único CSS del paquete, no copiado por deck.</p>
:::
::: card
<span class="stat">PDF<small>incluido</small></span>
<p>La tecla P exporta una slide por página, listo para compartir.</p>
:::
:::

---

kicker: El pipeline

## Qué pasa [[pink|debajo]]

::: bars
- Contenido (agente) | 30 | mid
- Convenciones (skill) | 25 | mid
- Renderer (determinista) | 45 | good
:::

> El agente nunca escribe el CSS ni el motor: mismo markdown, mismo HTML.

---

kicker: La frontera

## Qué es skill y qué es [[gold|tool]]

| Parte | Quién | Por qué |
| --- | --- | --- |
| Contenido y ritmo | El agente | Elegir layout y kicker es creativo. |
| Markdown a HTML | Renderer | Determinista: un diff chico por corrección. |
| Tema y motor | Assets del paquete | El LLM no toca CSS ni JS. |
| Vista y comentarios | Canvas | Reutiliza lo que gentle-design ya tiene. |

---

kicker: Después

class: cover

## El [[grad|roadmap]]

::: grid-2 cards
::: card icon=🧪
### Ahora
Prototipo en Sandbox: formato validado con este mismo deck.
:::
::: card icon=📦
### Portar
Skill + assets en gentle-shell, integrado al canvas.
:::
::: card icon=🤖
### Automotion
Un flow que pide un deck por Telegram y devuelve el HTML.
:::
::: card icon=♻️
### Importar
Recuperar los gists existentes de vuelta a markdown.
:::
:::

> La primera presentación del plugin es, sí, [[mint|sobre el plugin]].
