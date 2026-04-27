# Mi Aplicación de Inventario y Ventas

Esta es una aplicación web para gestionar el inventario y las ventas de un negocio de ropa. Permite a los administradores realizar un seguimiento de los productos, registrar ventas y monitorear los niveles de stock.

## Estructura del Proyecto

- `/frontend`: Contiene la interfaz de usuario construida con HTML, CSS y JavaScript vanilla.
  - `index.html`: La página principal que define la estructura de la UI.
  - `styles.css`: Hoja de estilos que da formato a los elementos HTML.
  - `app.js`: Contiene la lógica interactiva del frontend (aún no proporcionado).
  - `config.js`: Define la URL base para las llamadas a la API.

- `/backend`: Contiene la API REST construida con Node.js y Express.
  - `server.js`: El punto de entrada que configura el servidor Express (aún no proporcionado).
  - `db.js`: Establece la conexión a la base de datos PostgreSQL usando `pg`.
  - `package.json`: Lista las dependencias y define los scripts.

- `/db`: Contiene los archivos SQL para configurar la base de datos.
  - `01_schema.sql`: Define la estructura de la base de datos (tablas y relaciones).
  - `02_seed.sql`: Inserta datos de ejemplo para pruebas.

## Tecnologías Clave

- **Frontend**: HTML, CSS, JavaScript (Vanilla)
- **Backend**: Node.js, Express, PostgreSQL
- **Base de Datos**: PostgreSQL

## Modelos de Datos

- `products`: Representa un producto con propiedades como nombre, categoría, precios, etc.
- `product_variants`: Representa una variante específica de un producto, como un color o talla. 
- `sales`: Representa una venta, incluyendo el producto, variante, cantidad, precio, etc.
- `inventory_movements`: Rastrea los cambios en el inventario de cada variante de producto.

## Flujo de Datos

1. El usuario interactúa con la interfaz en `index.html`.
2. Los eventos disparan peticiones a la API REST definida en `/backend/server.js`.
3. La API interactúa con la base de datos PostgreSQL usando las funciones definidas en `/backend/db.js`.
4. Los datos se devuelven al frontend y se renderizan en la UI.

## Próximos Pasos

- Implementar los endpoints de la API en `/backend/server.js`.
- Escribir la lógica interactiva del frontend en `/frontend/app.js`.
- Agregar autenticación y autorización para asegurar la API.
- Desplegar la aplicación en un servidor en la nube.

Por favor, considera este contexto al asistir con tareas en este proyecto. Si necesitas aclaraciones adicionales, no dudes en preguntar.