# Reemplaza con tus datos reales de MySQL
import os

# Get database connection from environment or use defaults
db_user = os.getenv('DB_USER', 'quimex')
db_password = os.getenv('DB_PASSWORD', 'quimex')
db_host = os.getenv('DB_HOST', 'quimex-db')
db_port = os.getenv('DB_PORT', '3306')
db_name = os.getenv('DB_NAME', 'quimex_db')

SQLALCHEMY_DATABASE_URI = f'mysql+pymysql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}?charset=utf8mb4'

# --- DESGLOSE ---
# 'mysql+pymysql://' : Indica usar MySQL con el driver PyMySQL
# Estos valores se toman del environment o usan defaults para Docker

SQLALCHEMY_TRACK_MODIFICATIONS = False