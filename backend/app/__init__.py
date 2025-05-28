# app/__init__.py
import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from decimal import Decimal
import traceback
from flask_login import LoginManager

# Imports para los filtros (Babel)
try:
    from babel.numbers import format_currency as babel_format_currency, format_decimal as babel_format_decimal
    from babel.dates import format_datetime as babel_format_datetime
    import datetime
except ImportError:
    print("WARN: [app/__init__.py] 'Babel' no está instalado. Los filtros de formato no funcionarán.")
    # Funciones dummy
    def babel_format_currency(value, currency, locale): return f"{value} {currency}"
    def babel_format_decimal(value, format, locale): return str(value)
    def babel_format_datetime(value, format, locale): return str(value)
    import datetime

# 1. Crear instancias de extensiones
db = SQLAlchemy()
login_manager = LoginManager()
login_manager.login_view = 'auth.login' # AJUSTA ESTO a tu ruta de login real
login_manager.login_message = "Por favor, inicia sesión para acceder."
login_manager.login_message_category = "info"
print("--- INFO [app/__init__.py]: Instancias SQLAlchemy y LoginManager creadas.")

# 2. User Loader (se importa el modelo dentro)
@login_manager.user_loader
def load_user(user_id):
    from .models import UsuarioInterno # Importar aquí
    try:
        return db.session.get(UsuarioInterno, int(user_id))
    except (ValueError, TypeError):
        return None

# 3. Fábrica de Aplicación
def create_app(config_object='config.Config'):
    app = Flask(__name__, instance_relative_config=True)
    print("--- INFO [app/__init__.py]: App Flask creada.")

    # --- Cargar Configuración ---
    try:
        # Configuración DB
        app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
        DB_USER = os.environ.get("DB_USER", "root")
        DB_PASSWORD = os.environ.get("DB_PASSWORD", "")
        DB_HOST = os.environ.get("DB_HOST", "localhost")
        DB_PORT = os.environ.get("DB_PORT", "3306")
        DB_NAME = os.environ.get("DB_NAME", "quimex_db")
        database_uri = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4"
        app.config['SQLALCHEMY_DATABASE_URI'] = database_uri

        # SECRET KEY (¡MUY IMPORTANTE!)
#        app.config['SECRET_KEY'] = os.environ.get('FLASK_SECRET_KEY', 'dev-secret-key-change-in-prod')
#       if app.config['SECRET_KEY'] == 'dev-secret-key-change-in-prod' and app.env == 'production':
#             print("\n\n--- ¡¡¡ADVERTENCIA!!! ---")
#             print("Estás usando la SECRET_KEY por defecto en PRODUCCIÓN.")
#             print("Genera una clave segura y configúrala mediante la variable de entorno FLASK_SECRET_KEY.")
#             print("---\n\n")

        # Log seguro de URI
        log_uri = database_uri.replace(f":{DB_PASSWORD}@", ":***@") if DB_PASSWORD else database_uri
        print(f"--- INFO [app/__init__.py]: Configurando DB URI: {log_uri}")
        print(f"--- INFO [app/__init__.py]: SECRET_KEY {'configurada desde entorno' if os.environ.get('FLASK_SECRET_KEY') else 'usando valor por defecto (¡SOLO DESARROLLO!)'}.")

    except Exception as config_err:
         print(f"--- ERROR FATAL [app/__init__.py]: Error configurando la aplicación: {config_err}")
         traceback.print_exc()
         raise config_err

    # --- Inicializar Extensiones ---
    try:
        db.init_app(app)
        print("--- INFO [app/__init__.py]: SQLAlchemy inicializado.")
        login_manager.init_app(app)
        print("--- INFO [app/__init__.py]: LoginManager inicializado.")
        # Inicializar otras extensiones aquí (Migrate, etc.)
    except Exception as ext_init_err:
        print(f"--- ERROR FATAL [app/__init__.py]: Error inicializando extensiones: {ext_init_err}")
        traceback.print_exc()
        raise ext_init_err

    # --- Registrar Filtros Jinja2 ---
    print("--- INFO [app/__init__.py]: Registrando filtros de plantilla...")
    @app.template_filter('format_currency')
    def format_currency_filter(value, currency='ARS'):
        if value is None: return ""
        try: return babel_format_currency(value, currency, locale='es_AR')
        except Exception: return str(value) # Log omitido por brevedad
    @app.template_filter('format_decimal')
    def format_decimal_filter(value, precision=2):
        if value is None: return ""
        try: format_str = '#,##0.' + ('0' * precision); return babel_format_decimal(value, format=format_str, locale='es_AR')
        except Exception: return str(value)
    @app.template_filter('format_datetime')
    def format_datetime_filter(value, format='medium'):
        if value is None: return ""
        the_datetime = None
        if isinstance(value, str):
            try: the_datetime = datetime.datetime.fromisoformat(value)
            except ValueError: return value
        elif isinstance(value, datetime.datetime): the_datetime = value
        else: return str(value)
        try:
            fmts = {'short_date':'dd/MM/yy', 'medium_date':'dd/MM/yyyy', 'short_datetime':'dd/MM/yy HH:mm', 'medium_datetime':'dd/MM/yyyy HH:mm', 'long_datetime':'dd/MM/yyyy HH:mm:ss'}
            format_pattern = fmts.get(format, format) # Usar lookup o custom
            return babel_format_datetime(the_datetime, format=format_pattern, locale='es_AR')
        except Exception: return str(value)
    print("--- INFO [app/__init__.py]: Filtros de plantilla registrados.")

    # --- Importar Modelos y Registrar Blueprints/Rutas dentro del Contexto ---
    with app.app_context():
        print("--- INFO [app/__init__.py]: Dentro de app_context...")

        # Importar Modelos
        print("--- INFO [app/__init__.py]: Importando modelos...")
        try:
            from . import models
            print("--- INFO [app/__init__.py]: Modelos importados.")
        except Exception as model_err:
             print(f"--- ERROR FATAL [app/__init__.py]: ¡Fallo al importar modelos! Error: {model_err}")
             traceback.print_exc()
             raise model_err

        # Registrar Blueprints
        print("--- INFO [app/__init__.py]: Registrando Blueprints...")
        try:
            from .blueprints.auth import auth_bp
            from .blueprints.productos import productos_bp
            from .blueprints.combos import combos_bp
            from .blueprints.proveedores import proveedores_bp
            from .blueprints.clientes import clientes_bp
            from .blueprints.recetas import recetas_bp
            from .blueprints.tipos_cambio import tipos_cambio_bp
            from .blueprints.compras import compras_bp
            from .blueprints.ventas import ventas_bp
            from .blueprints.costos import costos_bp
            from .blueprints.precios_especiales import precios_especiales_bp # <<<--- NUEVO

            app.register_blueprint(auth_bp)
            app.register_blueprint(clientes_bp)
            app.register_blueprint(productos_bp)
            app.register_blueprint(combos_bp)
            app.register_blueprint(proveedores_bp)
            app.register_blueprint(recetas_bp)
            app.register_blueprint(tipos_cambio_bp)
            app.register_blueprint(compras_bp)
            app.register_blueprint(ventas_bp)
            app.register_blueprint(costos_bp)
            app.register_blueprint(precios_especiales_bp)
            print("--- INFO [app/__init__.py]: Todos los blueprints registrados.")

        except Exception as bp_err:
             print(f"--- ERROR FATAL [app/__init__.py]: ¡Fallo al importar/registrar un Blueprint! Error: {bp_err}")
             traceback.print_exc()
             raise bp_err

        # Registrar rutas adicionales (si las tienes)
        try:
            from .routes import register_routes # Asume app/routes.py
            register_routes(app)
            print("--- INFO [app/__init__.py]: Rutas adicionales registradas.")
        except ImportError:
            print("--- INFO [app/__init__.py]: No se encontraron rutas adicionales (app/routes.py).")
        except Exception as routes_err:
            print(f"--- ERROR [app/__init__.py]: Error registrando rutas adicionales: {routes_err}")
            # Decidir si este error debe detener la app

        # Ruta de prueba
        @app.route('/hello')
        def hello():
            return 'API Quimex Funcionando!'

        print("--- INFO [app/__init__.py]: Fábrica de aplicación completada.")
        return app



# # app/__init__.py
# import os
# from flask import Flask
# from flask_sqlalchemy import SQLAlchemy
# from decimal import Decimal
# import traceback
# from flask_login import LoginManager
# from your_app.models import UsuarioInterno
# from app.routes import register_routes
# # Imports para los filtros (asegúrate que Babel esté instalado: pip install Babel)
# try:
#     from babel.numbers import format_currency as babel_format_currency, format_decimal as babel_format_decimal
#     from babel.dates import format_datetime as babel_format_datetime
#     import datetime # Necesario para el filtro de datetime
# except ImportError:
#     print("WARN: [app/__init__.py] 'Babel' no está instalado. Los filtros de formato no funcionarán.")
#     # Definir funciones dummy para evitar errores si Babel no está
#     def babel_format_currency(value, currency, locale): return f"{value} {currency}"
#     def babel_format_decimal(value, format, locale): return str(value)
#     def babel_format_datetime(value, format, locale): return str(value)
#     import datetime # Aún necesario si se usa en filtros


# # 1. Crear instancia de SQLAlchemy ANTES de cualquier import relativo a modelos
# db = SQLAlchemy()
# print("--- INFO [app/__init__.py]: Instancia SQLAlchemy 'db' creada.")

# @login_manager.user_loader
# def load_user(user_id):
#     return UsuarioInterno.query.get(int(user_id))

# def create_app(config_object='config.Config'):
#     """Fábrica de la aplicación."""
#     app = Flask(__name__, instance_relative_config=True)
#     print("--- INFO [app/__init__.py]: App Flask creada.")

    
#     login_manager = LoginManager()
#     login_manager.init_app(app)
#     register_routes(app)

#     # --- Cargar Configuración ---
#     try:
#         app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
#         DB_USER = os.environ.get("DB_USER", "root")
#         DB_PASSWORD = os.environ.get("DB_PASSWORD", "")
#         DB_HOST = os.environ.get("DB_HOST", "localhost")
#         DB_PORT = os.environ.get("DB_PORT", "3306")
#         DB_NAME = os.environ.get("DB_NAME", "quimex_db")
#         database_uri = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
#         app.config['SQLALCHEMY_DATABASE_URI'] = database_uri
#         print(f"--- INFO [app/__init__.py]: Configurando DB URI: {database_uri.replace(DB_PASSWORD, '***') if DB_PASSWORD else database_uri}")
#     except Exception as config_err:
#          print(f"--- ERROR [app/__init__.py]: Error configurando la base de datos: {config_err}")
#          traceback.print_exc()
#          raise config_err

#     # 2. Inicializar extensiones con la aplicación
#     try:
#         db.init_app(app)
#         print("--- INFO [app/__init__.py]: SQLAlchemy inicializado con la app.")
#     except Exception as db_init_err:
#         print(f"--- ERROR [app/__init__.py]: Error inicializando SQLAlchemy con la app: {db_init_err}")
#         traceback.print_exc()
#         raise db_init_err

#     # --- MOVER AQUÍ: Registrar Filtros de Jinja2 DESPUÉS de crear 'app' ---
#     print("--- INFO [app/__init__.py]: Registrando filtros de plantilla...")
#     @app.template_filter('format_currency')
#     def format_currency_filter(value, currency='ARS'):
#         """Formatea un número como moneda."""
#         if value is None: return ""
#         try:
#             return babel_format_currency(value, currency, locale='es_AR') # Ajusta locale si es necesario
#         except Exception as fmt_err:
#             print(f"WARN: Error formateando moneda ({value}): {fmt_err}")
#             return str(value) # Fallback

#     @app.template_filter('format_decimal')
#     def format_decimal_filter(value, precision=2):
#         """Formatea un número decimal con precisión específica."""
#         if value is None: return ""
#         try:
#             format_str = '#,##0.' + ('0' * precision) # Usar '0' para forzar decimales
#             return babel_format_decimal(value, format=format_str, locale='es_AR')
#         except Exception as fmt_err:
#             print(f"WARN: Error formateando decimal ({value}): {fmt_err}")
#             return str(value) # Fallback

#     @app.template_filter('format_datetime')
#     def format_datetime_filter(value, format='medium'):
#         """Formatea una fecha/hora."""
#         if value is None: return ""
#         the_datetime = None
#         if isinstance(value, str):
#             try:
#                 the_datetime = datetime.datetime.fromisoformat(value)
#             except ValueError:
#                  print(f"WARN: No se pudo convertir string '{value}' a datetime.")
#                  return value # Devolver string original si no se puede convertir
#         elif isinstance(value, datetime.datetime):
#             the_datetime = value
#         else:
#              print(f"WARN: Tipo no soportado para format_datetime: {type(value)}")
#              return str(value)

#         try:
#             # Definir formatos estándar o usar patrones
#             if format == 'short_date': format_pattern = 'dd/MM/yy'
#             elif format == 'medium_date': format_pattern = 'dd/MM/yyyy'
#             elif format == 'short_datetime': format_pattern = 'dd/MM/yy HH:mm'
#             elif format == 'medium_datetime': format_pattern = 'dd/MM/yyyy HH:mm'
#             elif format == 'long_datetime': format_pattern = 'dd/MM/yyyy HH:mm:ss'
#             else: format_pattern = format # Permitir patrones custom

#             return babel_format_datetime(the_datetime, format=format_pattern, locale='es_AR')
#         except Exception as fmt_err:
#             print(f"WARN: Error formateando datetime ({value}): {fmt_err}")
#             return str(value) # Fallback
#     print("--- INFO [app/__init__.py]: Filtros de plantilla registrados.")
#     # --- FIN Filtros ---


#     # 3. Importar y Registrar Blueprints DENTRO de la fábrica y el contexto
#     with app.app_context():
#         print("--- INFO [app/__init__.py]: Dentro de app_context...")

#         # 4. Importar modelos AHORA, DESPUÉS de que 'db' esté inicializado
#         print("--- INFO [app/__init__.py]: Importando modelos desde .models...")
#         try:
#             from . import models
#             print("--- INFO [app/__init__.py]: Modelos importados correctamente.")
#         except ImportError as model_import_err:
#              print(f"--- ERROR [app/__init__.py]: ¡Fallo al importar modelos desde .models! Verifica app/models.py. Error: {model_import_err}")
#              traceback.print_exc()
#              raise model_import_err
#         except Exception as model_err:
#              print(f"--- ERROR [app/__init__.py]: ¡Excepción inesperada al importar modelos! Error: {model_err}")
#              traceback.print_exc()
#              raise model_err


#         print("--- INFO [app/__init__.py]: Registrando Blueprints...")
#         try:
#             # Importar blueprints DESDE sus módulos específicos
#             from .blueprints.clientes import clientes_bp
#             from .blueprints.productos import productos_bp
#             from .blueprints.recetas import recetas_bp
#             from .blueprints.tipos_cambio import tipos_cambio_bp
#             from .blueprints.compras import compras_bp
#             from .blueprints.ventas import ventas_bp # Asegúrate que este exista

#             app.register_blueprint(clientes_bp)
#             print("--- INFO [app/__init__.py]: Blueprint 'clientes' registrado.")
#             app.register_blueprint(productos_bp)
#             print("--- INFO [app/__init__.py]: Blueprint 'productos' registrado.")
#             app.register_blueprint(recetas_bp)
#             print("--- INFO [app/__init__.py]: Blueprint 'recetas' registrado.")
#             app.register_blueprint(tipos_cambio_bp)
#             print("--- INFO [app/__init__.py]: Blueprint 'tipos_cambio' registrado.")
#             app.register_blueprint(compras_bp)
#             print("--- INFO [app/__init__.py]: Blueprint 'compras' registrado.")
#             app.register_blueprint(ventas_bp)
#             print("--- INFO [app/__init__.py]: Blueprint 'ventas' registrado.")
#         except ImportError as bp_import_err:
#              print(f"--- ERROR [app/__init__.py]: ¡Fallo al importar un Blueprint! Verifica la ruta y el archivo. Error: {bp_import_err}")
#              traceback.print_exc()
#              raise bp_import_err
#         except Exception as bp_err:
#              print(f"--- ERROR [app/__init__.py]: ¡Excepción inesperada al registrar Blueprints! Error: {bp_err}")
#              traceback.print_exc()
#              raise bp_err

#         # Ruta de prueba simple
#         @app.route('/hello')
#         def hello():
#             return 'API Funcionando!'

#         print("--- INFO [app/__init__.py]: Fábrica de aplicación completada.")
#         return app
