# Agent instructions (kidwords-candidates)

## Python: use the project virtualenv first

Before running **any** Python command in this repo (`scripts/publish.py`, `scripts/generate-images.py`, `pytest`, one-off `python` snippets, etc.), use the local environment under **`.venv/`** at the repository root.

### Python version

Use **Python 3.10+** for a full install: `scripts/requirements.txt` pins `google-genai` versions that require 3.10 or newer. On older interpreters, `pip install -r scripts/requirements.txt` may fail; upgrade Python or use 3.10+ when creating `.venv`.

### One-time setup (humans or agents)

From the repo root:

```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install --upgrade pip
pip install -r scripts/requirements.txt
```

### Every session

Activate, then run scripts or tests:

```bash
source .venv/bin/activate   # Windows: .venv\Scripts\activate
```

Examples:

```bash
pytest scripts/tests/test_publish.py -v
python scripts/publish.py --round-id YYYY-MM-DD --word-id myword
```

### Why

- Dependencies are declared in **`scripts/requirements.txt`** (includes runtime deps for generation/publish and **`pytest`** for `scripts/tests/`).
- Do **not** rely on the system Python having `pytest`, `pydantic`, etc.
- **`.venv/`** is gitignored; create it locally as above.

### Admin app (Node)

The **`admin/`** app is separate: use `npm install` / `npm test` there as usual; this file is about **Python** under `scripts/`.
