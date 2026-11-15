"""
Shared fixtures for the local Flask app's tests.

Importing app.py runs startup side effects: it creates temp_audio/ and deletes every
file in it (_purge_temp_dir). Running pytest while the app is open would wipe the track
being edited. To avoid that, pure helpers are loaded straight from app.py's source with
`ast` instead of `import app`: only the requested function definitions are executed.
"""

import ast
from pathlib import Path

import pytest

APP_PY = Path(__file__).resolve().parent.parent / "app.py"


def load_app_functions(*names: str) -> dict:
    """Execute only the named top-level function definitions from app.py."""
    tree = ast.parse(APP_PY.read_text(encoding="utf-8"), filename=str(APP_PY))
    wanted = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names]
    missing = set(names) - {n.name for n in wanted}
    if missing:
        raise LookupError(f"app.py has no top-level function(s): {sorted(missing)}")
    namespace: dict = {}
    exec(compile(ast.Module(body=wanted, type_ignores=[]), str(APP_PY), "exec"), namespace)
    return namespace


@pytest.fixture(scope="session")
def invert_regions():
    return load_app_functions("_invert_regions")["_invert_regions"]
