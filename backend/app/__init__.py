# app/__init__.py

import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS  # Importación para CORS
from decimal import Decimal
import traceback
from flask_migrate import Migrate
from flask_login import LoginManager
from flask_caching import Cache

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

db = SQLAlchemy()
migrate = Migrate()
login_manager = LoginManager()
login_manager.login_view = 'auth.login'
login_manager.login_message = "Por favor, inicia sesión para acceder."
login_manager.login_message_category = "info"
cache = Cache(config={'CACHE_TYPE': 'SimpleCache'})
print("--- INFO [app/__init__.py]: Instancias SQLAlchemy, LoginManager y Cache creadas.")

# 2. User Loader
@login_manager.user_loader
def load_user(user_id):
    from .models import UsuarioInterno
    try:
        return db.session.get(UsuarioInterno, int(user_id))
    except (ValueError, TypeError):
        return None

# 3. Fábrica de Aplicación
def create_app(config_object='config.Config'):
    app = Flask(__name__, instance_relative_config=True)
    print("--- INFO [app/__init__.py]: App Flask creada.")

    # --- CONFIGURACIÓN DE CORS ---
    # Orígenes permitidos (tu frontend).
    # Asegúrate que la URL de Netlify sea exacta.
    allowed_origins = [
        "https://quimex.netlify.app",
        "http://localhost:3000",      # Para desarrollo local
        "http://127.0.0.1:3000",
        "https://quimex.sistemataup.online",# Alternativa para desarrollo local
    ]

    # Aplicar la configuración de CORS a toda la aplicación.
    # Esto manejará automáticamente las peticiones OPTIONS (preflight).
    CORS(
        app,
        origins=allowed_origins,
        supports_credentials=True
    )
    print(f"--- INFO [app/__init__.py]: CORS configurado para orígenes: {allowed_origins}")
    # --- FIN DE CONFIGURACIÓN DE CORS ---

    # --- Cargar Configuración ---
    try:
        app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
        DB_USER = os.environ.get("DB_USER", "root")
        DB_PASSWORD = os.environ.get("DB_PASSWORD", "")
        DB_HOST = os.environ.get("DB_HOST", "localhost")
        DB_PORT = os.environ.get("DB_PORT", "3306")
        DB_NAME = os.environ.get("DB_NAME", "quimex_db")
        database_uri = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4"
        app.config['SQLALCHEMY_DATABASE_URI'] = database_uri
        
        app.config['SECRET_KEY'] = os.environ.get('FLASK_SECRET_KEY', 'dev-secret-key-change-in-prod')
        
        log_uri = database_uri.replace(f":{DB_PASSWORD}@", ":***@") if DB_PASSWORD else database_uri
        print(f"--- INFO [app/__init__.py]: Configurando DB URI: {log_uri}")

    except Exception as config_err:
         print(f"--- ERROR FATAL [app/__init__.py]: Error configurando la aplicación: {config_err}")
         raise config_err

    # --- Inicializar Extensiones ---
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    cache.init_app(app)
    print("--- INFO [app/__init__.py]: Extensiones (SQLAlchemy, Migrate, LoginManager, Cache) inicializadas.")

    # --- Registrar Filtros Jinja2 ---
    print("--- INFO [app/__init__.py]: Registrando filtros de plantilla...")
    @app.template_filter('format_currency')
    def format_currency_filter(value, currency='ARS'):
        if value is None: return ""
        try: return babel_format_currency(value, currency, locale='es_AR')
        except Exception: return str(value)
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
            format_pattern = fmts.get(format, format)
            return babel_format_datetime(the_datetime, format=format_pattern, locale='es_AR')
        except Exception: return str(value)
    print("--- INFO [app/__init__.py]: Filtros de plantilla registrados.")

    # --- Importar Modelos y Registrar Blueprints ---
    with app.app_context():
        print("--- INFO [app/__init__.py]: Dentro de app_context...")
        from . import models

        print("--- INFO [app/__init__.py]: Registrando Blueprints...")
        from .blueprints.auth import auth_bp
        from .blueprints.productos import productos_bp
        from .blueprints.proveedores import proveedores_bp
        from .blueprints.clientes import clientes_bp
        from .blueprints.importar_csv import import_csv_bp
        from .blueprints.recetas import recetas_bp
        from .blueprints.combos import combos_bp
        from .blueprints.tipos_cambio import tipos_cambio_bp
        from .blueprints.compras import compras_bp
        from .blueprints.ventas import ventas_bp
        from .blueprints.costos import costos_bp
        from .blueprints.precios_especiales import precios_especiales_bp
        from .blueprints.reportes import reportes_bp
        from .blueprints.dashboard import dashboard_bp
        from .blueprints.categorias import categorias_bp
        from .blueprints.categoria_productos import categoria_productos_bp
        from .blueprints.finanzas import finanzas_bp

        
        app.register_blueprint(auth_bp)
        app.register_blueprint(clientes_bp)
        app.register_blueprint(productos_bp)
        app.register_blueprint(combos_bp)
        app.register_blueprint(import_csv_bp)
        app.register_blueprint(proveedores_bp)
        app.register_blueprint(recetas_bp)
        app.register_blueprint(tipos_cambio_bp)
        app.register_blueprint(compras_bp)
        app.register_blueprint(ventas_bp)
        app.register_blueprint(costos_bp)
        app.register_blueprint(precios_especiales_bp)
        app.register_blueprint(reportes_bp)
        app.register_blueprint(dashboard_bp)
        app.register_blueprint(categorias_bp)
        app.register_blueprint(categoria_productos_bp)
        app.register_blueprint(finanzas_bp)

        print("--- INFO [app/__init__.py]: Todos los blueprints registrados.")

        try:
            from .routes import register_routes
            register_routes(app)
            print("--- INFO [app/__init__.py]: Rutas adicionales registradas.")
        except ImportError:
            print("--- INFO [app/__init__.py]: No se encontraron rutas adicionales (app/routes.py).")

        @app.route('/hello')
        def hello():
            return 'API Quimex Funcionando!'

        print("--- INFO [app/__init__.py]: Fábrica de aplicación completada.")
        return app
