# Branding — Elevator

La herramienta usa la identidad de marca de **Elevator** (fuente: brand book
"ELEVATOR COMPANY New").

## Paleta

| Token        | Hex       | Uso                                                   |
| ------------ | --------- | ----------------------------------------------------- |
| Negro        | `#000000` | Fondo (modo oscuro), contraste                        |
| Azul Intenso | `#1858FB` | Primario — botones, acentos, ROAS/charts              |
| Azul Cielo   | `#18BAFB` | Secundario — highlights, degradados, acento en oscuro |
| Blanco       | `#FFFFFF` | Fondo (modo claro), texto sobre azul                  |

Definidos como variables en [`src/ui/styles.css`](src/ui/styles.css). Los
colores semánticos `brand` / `danger` / `warn` cambian de tono según el tema
para mantener contraste.

## Temas claro / oscuro

- Botón de cambio en el header ([`src/components/theme-toggle.tsx`](src/components/theme-toggle.tsx)).
- La preferencia se guarda en `localStorage` (`drdiente-theme`) y se aplica
  antes del primer render con un script inline en [`index.html`](index.html)
  (default: oscuro).
- `brand` = `#18BAFB` (vibrante) en oscuro y `#1858FB` (intenso) en claro.

## Logo

- Monograma **"VA"** (degradado azul) en [`src/ui/elevator-mark.png`](src/ui/elevator-mark.png),
  extraído del isotipo nuevo. Aparece como "Plataforma por Elevator" en el
  footer del sidebar.

## Tipografía

Sans-serif geométrica — **Geist** (cumple el estilo del brand book).
