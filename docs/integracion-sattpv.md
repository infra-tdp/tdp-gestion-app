# Integración con SatTPV (API v3)

Análisis de `https://app.sattpv.net/docs/` (OpenAPI 3.1, servidor
`https://api-v3.sattpv.net`) para las fases 2–3 del roadmap: qué datos podemos
extraer, cómo, y qué tendremos que gestionar en TDP Gestión porque la API no
lo cubre.

## Autenticación

- `POST /auth/login` con `{ username, pass, app_domain: "app.sattpv.net" }` →
  JWT Bearer para el resto de llamadas.
- `POST /auth/change/{id}` permite cambiar de usuario/empleado.
- Multitienda: el listado de ventas soporta `sale_multishop=1` (todas mis
  tiendas). Aun así, el plan es guardar **credenciales por tienda** (cifradas
  en nuestra BD) y sincronizar cuenta a cuenta — así el dato queda atribuido a
  su tienda sin ambigüedad y una credencial caída no rompe el resto.

## Qué SÍ nos da la API (se sincroniza automáticamente)

| Necesidad del panel | Endpoint | Campos clave / filtros |
|---|---|---|
| Ventas por tienda y día | `GET /sales` | `sale_from`/`sale_to`, `sale_multishop`, paginación; `amount`, `created_at` (epoch), `refound` |
| Detalle de venta (productos) | `GET /sales/{id}` | `sale_products[]` (nombre, precio, unidades, serial, categoría implícita), `movement` (método de pago, estado) |
| Facturación | `GET /invoices` | `invoice_from`/`invoice_to`, serie, estado, método de pago |
| Resumen de facturación | `GET /print/invoice/resume` | CSV/PDF por rango |
| Reparaciones | `GET /repairs` | `status`, `date_from`/`date_to`; `status_name`+`status_color` (abierta/finalizada/entregada), marca/modelo, cliente |
| Detalle reparación | `GET /repairs/{id}` | presupuesto, técnico, tiempos, anticipo, cobro (`PUT /repairs/checkout/{id}`) |
| Stock por tienda | `GET /products` | `product_units` (stock), `product_min_stock`, precio compra/venta, código de barras |
| Movimientos de caja | `GET /movements` | tipo, método, estado, importes |
| Clientes / proveedores / empleados / categorías | `GET /customers` `/providers` `/employees` `/categories` | maestros para enriquecer dashboards |

Con esto salen directamente: facturación de hoy / mes / últimos 30 días,
nº de ventas, ticket medio (`amount` medio), comparativa y ranking de tiendas,
actividad diaria (ventas + reparaciones recibidas/finalizadas/entregadas),
ranking de modelos vendidos (agregando `sale_products.product_name`),
separación venta patinete vs recambio (por categoría de producto) y
facturación de ventas vs taller (ventas ligadas a `sale_concept`/reparación).

## Qué NO da la API (lo gestiona TDP Gestión en su BD)

| Necesidad | Por qué no | Nuestra solución |
|---|---|---|
| Traspasos entre tiendas | Cada cuenta ve su stock; no hay entidad "traspaso" | Tabla `stock_movements` (origen, destino, unidades, estado enviado/recibido) + confirmación por la tienda en el panel |
| Pendiente de recibir | ídem | Estado `sent` sin `received_at` |
| Reposición recomendada | No hay lógica de reposición | Regla propia: venta detectada → si `stock < mínimo` → necesidad de reposición con unidades recomendadas |
| Stock mínimo por tienda+modelo centralizado | `product_min_stock` existe pero es por cuenta y editable solo allí | Tabla propia `stock_minimums` (editable desde central) reconciliada con la de SatTPV |
| Descuadres | — | Job nocturno: stock esperado (según nuestros movimientos) vs `product_units` real → alerta |
| Historial unificado multi-tienda | Cada cuenta aislada | Todo el sync aterriza en tablas nuestras con `store_id` |

## Estrategia de sincronización (fase 2)

1. **Incremental frecuente** (cada 2–5 min): `/sales?sale_from=hoy`,
   `/repairs?date_from=hoy` por tienda → upsert idempotente
   (`store_id + sale_id`).
2. **Detalle bajo demanda**: `GET /sales/{id}` solo para ventas nuevas
   (productos vendidos → dispara la lógica de reposición).
3. **Reconciliación nocturna**: día completo + `/products` (stock) +
   `/invoices` del mes.
4. **Rate limits**: la API devuelve 429 — el worker respeta `Retry-After`
   y serializa por cuenta.
5. Payload crudo en columna JSONB (auditoría / reproceso) + campos tipados
   para agregación rápida.

## Esquema previsto (fase 2, tablas nuevas)

`stores` (tienda ↔ credenciales SatTPV cifradas) · `sales` · `sale_items` ·
`repairs` · `invoices` · `products` · `stock_levels` · `stock_minimums` ·
`stock_movements` · `replenishment_needs`.
El RBAC ya contempla `STORE` con `storeId` en `users`.
