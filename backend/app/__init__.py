# app/__init__.py
import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from decimal import Decimal
import traceback
# Imports para los filtros (asegúrate que Babel esté instalado: pip install Babel)
try:
    from babel.numbers import format_currency as babel_format_currency, format_decimal as babel_format_decimal
    from babel.dates import format_datetime as babel_format_datetime
    import datetime # Necesario para el filtro de datetime
except ImportError:
    print("WARN: [app/__init__.py] 'Babel' no está instalado. Los filtros de formato no funcionarán.")
    # Definir funciones dummy para evitar errores si Babel no está
    def babel_format_currency(value, currency, locale): return f"{value} {currency}"
    def babel_format_decimal(value, format, locale): return str(value)
    def babel_format_datetime(value, format, locale): return str(value)
    import datetime # Aún necesario si se usa en filtros


# 1. Crear instancia de SQLAlchemy ANTES de cualquier import relativo a modelos
db = SQLAlchemy()
print("--- INFO [app/__init__.py]: Instancia SQLAlchemy 'db' creada.")

def create_app(config_object='config.Config'):
    """Fábrica de la aplicación."""
    app = Flask(__name__, instance_relative_config=True)
    print("--- INFO [app/__init__.py]: App Flask creada.")

    # --- Cargar Configuración ---
    try:
        app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
        DB_USER = os.environ.get("DB_USER", "root")
        DB_PASSWORD = os.environ.get("DB_PASSWORD", "")
        DB_HOST = os.environ.get("DB_HOST", "localhost")
        DB_PORT = os.environ.get("DB_PORT", "3306")
        DB_NAME = os.environ.get("DB_NAME", "quimex_db")
        database_uri = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
        app.config['SQLALCHEMY_DATABASE_URI'] = database_uri
        print(f"--- INFO [app/__init__.py]: Configurando DB URI: {database_uri.replace(DB_PASSWORD, '***') if DB_PASSWORD else database_uri}")
    except Exception as config_err:
         print(f"--- ERROR [app/__init__.py]: Error configurando la base de datos: {config_err}")
         traceback.print_exc()
         raise config_err

    # 2. Inicializar extensiones con la aplicación
    try:
        db.init_app(app)
        print("--- INFO [app/__init__.py]: SQLAlchemy inicializado con la app.")
    except Exception as db_init_err:
        print(f"--- ERROR [app/__init__.py]: Error inicializando SQLAlchemy con la app: {db_init_err}")
        traceback.print_exc()
        raise db_init_err

    # --- MOVER AQUÍ: Registrar Filtros de Jinja2 DESPUÉS de crear 'app' ---
    print("--- INFO [app/__init__.py]: Registrando filtros de plantilla...")
    @app.template_filter('format_currency')
    def format_currency_filter(value, currency='ARS'):
        """Formatea un número como moneda."""
        if value is None: return ""
        try:
            return babel_format_currency(value, currency, locale='es_AR') # Ajusta locale si es necesario
        except Exception as fmt_err:
            print(f"WARN: Error formateando moneda ({value}): {fmt_err}")
            return str(value) # Fallback

    @app.template_filter('format_decimal')
    def format_decimal_filter(value, precision=2):
        """Formatea un número decimal con precisión específica."""
        if value is None: return ""
        try:
            format_str = '#,##0.' + ('0' * precision) # Usar '0' para forzar decimales
            return babel_format_decimal(value, format=format_str, locale='es_AR')
        except Exception as fmt_err:
            print(f"WARN: Error formateando decimal ({value}): {fmt_err}")
            return str(value) # Fallback

    @app.template_filter('format_datetime')
    def format_datetime_filter(value, format='medium'):
        """Formatea una fecha/hora."""
        if value is None: return ""
        the_datetime = None
        if isinstance(value, str):
            try:
                the_datetime = datetime.datetime.fromisoformat(value)
            except ValueError:
                 print(f"WARN: No se pudo convertir string '{value}' a datetime.")
                 return value # Devolver string original si no se puede convertir
        elif isinstance(value, datetime.datetime):
            the_datetime = value
        else:
             print(f"WARN: Tipo no soportado para format_datetime: {type(value)}")
             return str(value)

        try:
            # Definir formatos estándar o usar patrones
            if format == 'short_date': format_pattern = 'dd/MM/yy'
            elif format == 'medium_date': format_pattern = 'dd/MM/yyyy'
            elif format == 'short_datetime': format_pattern = 'dd/MM/yy HH:mm'
            elif format == 'medium_datetime': format_pattern = 'dd/MM/yyyy HH:mm'
            elif format == 'long_datetime': format_pattern = 'dd/MM/yyyy HH:mm:ss'
            else: format_pattern = format # Permitir patrones custom

            return babel_format_datetime(the_datetime, format=format_pattern, locale='es_AR')
        except Exception as fmt_err:
            print(f"WARN: Error formateando datetime ({value}): {fmt_err}")
            return str(value) # Fallback
    print("--- INFO [app/__init__.py]: Filtros de plantilla registrados.")
    # --- FIN Filtros ---


    # 3. Importar y Registrar Blueprints DENTRO de la fábrica y el contexto
    with app.app_context():
        print("--- INFO [app/__init__.py]: Dentro de app_context...")

        # 4. Importar modelos AHORA, DESPUÉS de que 'db' esté inicializado
        print("--- INFO [app/__init__.py]: Importando modelos desde .models...")
        try:
            from . import models
            print("--- INFO [app/__init__.py]: Modelos importados correctamente.")
        except ImportError as model_import_err:
             print(f"--- ERROR [app/__init__.py]: ¡Fallo al importar modelos desde .models! Verifica app/models.py. Error: {model_import_err}")
             traceback.print_exc()
             raise model_import_err
        except Exception as model_err:
             print(f"--- ERROR [app/__init__.py]: ¡Excepción inesperada al importar modelos! Error: {model_err}")
             traceback.print_exc()
             raise model_err


        print("--- INFO [app/__init__.py]: Registrando Blueprints...")
        try:
            # Importar blueprints DESDE sus módulos específicos
            from .blueprints.productos import productos_bp
            from .blueprints.recetas import recetas_bp
            from .blueprints.tipos_cambio import tipos_cambio_bp
            from .blueprints.compras import compras_bp
            from .blueprints.ventas import ventas_bp # Asegúrate que este exista

            app.register_blueprint(productos_bp)
            print("--- INFO [app/__init__.py]: Blueprint 'productos' registrado.")
            app.register_blueprint(recetas_bp)
            print("--- INFO [app/__init__.py]: Blueprint 'recetas' registrado.")
            app.register_blueprint(tipos_cambio_bp)
            print("--- INFO [app/__init__.py]: Blueprint 'tipos_cambio' registrado.")
            app.register_blueprint(compras_bp)
            print("--- INFO [app/__init__.py]: Blueprint 'compras' registrado.")
            app.register_blueprint(ventas_bp)
            print("--- INFO [app/__init__.py]: Blueprint 'ventas' registrado.")
        except ImportError as bp_import_err:
             print(f"--- ERROR [app/__init__.py]: ¡Fallo al importar un Blueprint! Verifica la ruta y el archivo. Error: {bp_import_err}")
             traceback.print_exc()
             raise bp_import_err
        except Exception as bp_err:
             print(f"--- ERROR [app/__init__.py]: ¡Excepción inesperada al registrar Blueprints! Error: {bp_err}")
             traceback.print_exc()
             raise bp_err

        # Ruta de prueba simple
        @app.route('/hello')
        def hello():
            return 'API Funcionando!'

        print("--- INFO [app/__init__.py]: Fábrica de aplicación completada.")
        return app