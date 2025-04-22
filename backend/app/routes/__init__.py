from flask import Blueprint

# Importar los Blueprints definidos en otros archivos
from .auth import auth_bp
from .usuarios import usuarios_bp
from .productos import productos_bp
# Agregá aquí más rutas según crezca tu app

def register_routes(app):
    """Registra todos los Blueprints en la app principal."""
    app.register_blueprint(auth_bp)
    app.register_blueprint(usuarios_bp)
    app.register_blueprint(productos_bp)
    # Más blueprints aquí si los agregás
