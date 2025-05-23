# run.py (en el directorio raíz de tu_proyecto/)
import os
# Quitar imports de modelos de aquí arriba
from app import create_app, db # Importa la fábrica y la instancia db
from flask_cors import CORS
import traceback # Para mejor info de errores
# Quitar 'from decimal import Decimal' de aquí también

# Crear la aplicación usando la fábrica
print("--- [run.py] Creando la aplicación Flask...")
app = create_app()
CORS(app)
print("--- [run.py] Aplicación Flask creada.")


# --- Bloque Principal para Ejecutar ---
if __name__ == "__main__":
    # --- Mover imports necesarios para seeding AQUÍ DENTRO ---
    from decimal import Decimal
    # Importar modelos DESPUÉS de crear la app y DENTRO del contexto
    # ----------------------------------------------------------

    with app.app_context():
        # --- Importar modelos AHORA ---
        try:
             from app.models import TipoCambio
        except ImportError as e:
             print(f"--- ERROR FATAL [run.py]: No se pudo importar el modelo TipoCambio necesario para el seeding: {e}")
             print(f"--- ERROR FATAL [run.py]: Verifica que app/models.py exista y sea correcto.")
             sys.exit(1) # Salir si no se puede importar el modelo necesario
        # -----------------------------

        # Crear tablas si no existen
        print("--- [run.py] Verificando/Creando tablas de DB si no existen...")
        try:
            db.create_all()
            print("--- [run.py] Tablas creadas/verificadas.")

            # Crear tipos de cambio base si no existen (seeding inicial)
            print("--- [run.py] Verificando/Creando Tipos de Cambio base...")
            tc_oficial = TipoCambio.query.filter_by(nombre='Oficial').first()
            if not tc_oficial:
                db.session.add(TipoCambio(nombre='Oficial', valor=Decimal('850.0'))) # Ejemplo
                print("--- [run.py] TC 'Oficial' creado.")

            tc_empresa = TipoCambio.query.filter_by(nombre='Empresa').first()
            if not tc_empresa:
                db.session.add(TipoCambio(nombre='Empresa', valor=Decimal('1050.0'))) # Ejemplo
                print("--- [run.py] TC 'Empresa' creado.")

            db.session.commit()
            print("--- [run.py] Tipos de Cambio base verificados/creados.")

        except Exception as e:
             print(f"--- ERROR [run.py] durante setup inicial de DB: {e}")
             # ... (resto del manejo de error de DB) ...
             traceback.print_exc()
             # import sys # Descomentar si quieres salir en error de DB
             # sys.exit(1)


    print("\n--- [run.py] Iniciando Servidor de Desarrollo Flask ---")
    port = int(os.environ.get("PORT", 5000))
    try:
        app.run(host='0.0.0.0', port=port, debug=True)
    except Exception as start_err:
        print(f"\n--- ERROR FATAL [run.py] al iniciar Flask: {start_err} ---")
        traceback.print_exc()
