# Mi Negocio separado en frontend, backend y base de datos

Este proyecto sale del archivo HTML original y queda dividido en tres partes:

- `frontend/`: interfaz web
- `backend/`: API REST con Node.js + Express + PostgreSQL
- `database/`: scripts SQL para crear y poblar la base de datos

## Estructura

```bash
mi-negocio-separado/
├── frontend/
│   ├── index.html
│   ├── styles.css
│   ├── config.js
│   └── app.js
├── backend/
│   ├── package.json
│   ├── .env.example
│   ├── db.js
│   └── server.js
└── database/
    ├── 01_schema.sql
    └── 02_seed.sql
```

## 1) Base de datos

Crear la base `mi_negocio` en PostgreSQL y luego ejecutar:

```sql
\i database/01_schema.sql
\i database/02_seed.sql
```

## 2) Backend

Dentro de `backend/`:

```bash
npm install
cp .env.example .env
npm run dev
```

En local, el puerto lo define `PORT` (por defecto `3001`). En producción (p. ej. Render) la URL pública es la que te da el proveedor.

## 3) Frontend

Abrir `frontend/index.html` con Live Server o cualquier servidor estático.

La URL del backend se configura en:

```js
frontend/config.js
```

Debe ser la URL pública de tu API, incluyendo `/api` al final, por ejemplo:

```js
API_BASE_URL: 'https://tu-backend.onrender.com/api'
```

Para desarrollo local podés apuntar a tu máquina usando la misma variable (sin dejar URLs fijas en el código fuera de `config.js`).

## Pensando en Vercel

Como quieres desplegarlo después en Vercel, esta separación ya ayuda bastante:

- el frontend se puede migrar fácil a Vercel
- el backend conviene adaptarlo luego a funciones o rutas API
- la base de datos no va dentro de Vercel; normalmente se conecta a una base externa compatible con PostgreSQL, mientras Vercel Functions maneja el código servidor

## Qué cambió respecto al HTML original

El archivo original mezclaba:

- estilos
- lógica de interfaz
- datos en `localStorage`

Ahora quedó separado así:

- la UI vive en el frontend
- los datos viven en PostgreSQL
- la lógica de negocio vive en el backend
- el frontend consume la API con `fetch`

## Siguiente paso recomendado

Cuando quieras, el siguiente paso ideal es convertir este backend Express a una estructura preparada directamente para Vercel Functions o a Next.js App Router.
