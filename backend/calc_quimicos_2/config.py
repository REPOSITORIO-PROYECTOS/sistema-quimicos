# Reemplaza con tus datos reales de MySQL
SQLALCHEMY_DATABASE_URI = 'mysql+mysqlconnector://tu_usuario_mysql:tu_contraseña_mysql@localhost:3306/quimex_db'

# --- DESGLOSE ---
# 'mysql+mysqlconnector://' : Indica usar MySQL con el driver mysql-connector-python
# 'tu_usuario_mysql'       : El nombre de usuario que creaste o usas en MySQL (¡NO 'root' en producción!)
# ':tu_contraseña_mysql'   : La contraseña para ese usuario MySQL.
# '@localhost:3306'        : La dirección del servidor MySQL ('localhost' si está en la misma máquina) y el puerto (3306 es el predeterminado). Cambia si es diferente.
# '/quimex_db'             : El nombre EXACTO de la base de datos que creaste en MySQL.

SQLALCHEMY_TRACK_MODIFICATIONS = False