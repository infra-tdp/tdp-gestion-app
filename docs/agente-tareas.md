# Agente de tareas WhatsApp (módulo `/agente`)

Integración con el servicio
[`tdp-agente-tareas`](https://github.com/infra-tdp/tdp-agente-tareas): un
agente de IA vinculado a un número de WhatsApp (Evolution API) que observa los
grupos/chats que se configuren aquí, entiende texto, **notas de voz** y
**vídeos/imágenes**, y mantiene al día el gestor de tareas (Jira) — crea
tickets, comenta, cambia prioridad, reasigna y cierra, **sin duplicar**.

## Reparto de responsabilidades

| | |
|---|---|
| `tdp-agente-tareas` | Solo infraestructura desplegable: webhook de Evolution, pipeline de medios, bucle del agente, API interna `/admin` |
| `tdp-gestion-app` (este repo) | TODA la administración: qué chats se monitorizan, mapeo personas→Jira, modo shadow/activo, instrucciones, auditoría de ejecuciones |

La página `/agente` consume la API del agente en servidor (nunca desde el
navegador) usando dos variables de entorno:

```
TASK_AGENT_URL=http://agente:3100     # o el dominio público del servicio
TASK_AGENT_TOKEN=<AGENT_ADMIN_TOKEN del agente>
```

Sin ellas, la página muestra cómo completar la configuración. El despliegue
completo (Evolution API + agente + webhook) está documentado en
`docs/despliegue.md` del repo del agente.

## Qué se administra desde aquí

- **Chats** — sincronizar el catálogo desde Evolution, activar/desactivar la
  monitorización por chat, permitir respuestas del agente en el chat, notas de
  contexto por chat y botón «Procesar ahora».
- **Personas** — cada participante visto en los chats, con su nombre real,
  alias y usuario de Jira (selector de usuarios asignables del proyecto). Sin
  mapeo, el agente no asigna tickets a esa persona.
- **Ajustes** — modo **shadow** (razona y registra qué haría, sin tocar
  Jira/WhatsApp — el modo por defecto para validar el criterio del agente) o
  **activo**; ventana de silencio y espera máxima del batching; respuestas por
  WhatsApp; instrucciones extra del negocio para el prompt.
- **Auditoría** — últimas ejecuciones con su resumen, errores y tickets
  vinculados por chat (la memoria anti-duplicados del agente).

## RBAC

- `agente.view` — ver el módulo (ADMIN, INFRA, DEV por defecto).
- `agente.manage` — configurar chats/personas/ajustes (ADMIN, INFRA).

Editable como el resto de permisos en `/admin/roles`.
