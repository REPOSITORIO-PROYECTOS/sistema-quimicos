import io
import os


def test_localidad_strings_present_in_reportes_file():
    repo_path = os.path.join(os.path.dirname(__file__), '..', 'backend', 'app', 'blueprints', 'reportes.py')
    repo_path = os.path.normpath(repo_path)
    assert os.path.exists(repo_path), f"File not found: {repo_path}"
    with open(repo_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Check that 'Localidad' was added to ventas headers and clientes headers
    assert '"Localidad", "Forma de Pago"' in content or "'Localidad', 'Forma de Pago'" in content
    assert '"Cliente", "Localidad", "Fecha Alta"' in content or "'Cliente', 'Localidad', 'Fecha Alta'" in content
