# Translation Proofreader — Plan 1: Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Python FastAPI server that exposes all spec functionality via HTTP — book ingestion, per-chapter Editor→Reviewer rounds via OpenRouter, prompt version history, file-backed persistence under `~/.translate/`, and single-instance enforcement. Fully testable via curl/httpx without any UI.

**Architecture:** Python 3.11+, FastAPI for HTTP + Server-Sent Events, `python-docx` for Word file handling, `httpx` for async OpenRouter calls. All state lives on disk under `~/.translate/`. TDD throughout: write the failing test, watch it fail, write the minimal code, watch it pass, commit.

**Tech Stack:** Python 3.11+ · FastAPI · uvicorn · python-docx · httpx · pytest · pytest-asyncio · pydantic v2

**Spec reference:** [docs/superpowers/specs/2026-05-02-translation-proofreader-design_v2.md](../specs/2026-05-02-translation-proofreader-design_v2.md)

**Plan 2 (client) will follow.** Plan 1 produces a working headless server. It is shippable on its own (operable via curl) and testable end-to-end with real OpenRouter calls.

---

## Conventions used in this plan

- All paths are repo-relative unless they begin with `~/` or `/`.
- The repo root is the directory containing `.gitignore` and `docs/`.
- "Run" lines show the command to execute. "Expected" lines show what success looks like.
- "Commit" steps batch the listed files into one commit with the shown message.
- Test files live under `tests/server/` and import from `server.<module>`.
- Type hints are required everywhere. Pydantic v2 models for any structured payload.
- Functions are async wherever they touch HTTP or perform potentially-long I/O; sync everywhere else.

---

## File structure (target)

```
.
├── .gitignore                                 # exists
├── README.md                                  # written in Phase 20
├── pyproject.toml                             # Phase 1
├── server/
│   ├── __init__.py
│   ├── main.py                                # FastAPI app factory + CLI launcher (Phase 19)
│   ├── slug.py                                # Phase 2
│   ├── lock.py                                # Phase 3
│   ├── config.py                              # Phase 4
│   ├── prompts.py                             # Phase 5
│   ├── docx_io.py                             # Phase 6 + 7
│   ├── chapter_split.py                       # Phase 8
│   ├── ingest.py                              # Phase 9
│   ├── state.py                               # Phase 10
│   ├── payload.py                             # Phase 11 + 12
│   ├── openrouter.py                          # Phase 13
│   ├── rounds.py                              # Phase 14 + 15
│   ├── finalize.py                            # Phase 16
│   ├── sse.py                                 # Phase 17
│   ├── errors.py                              # Phase 1 (skeleton); extended throughout
│   └── routes/
│       ├── __init__.py
│       ├── settings.py                        # Phase 18a
│       ├── prompts.py                         # Phase 18b
│       ├── books.py                           # Phase 18c
│       └── chapters.py                        # Phase 18d
└── tests/
    └── server/
        ├── conftest.py
        ├── fixtures/
        │   ├── sample-en-folder/              # 3 chapter .docx files
        │   ├── sample-fr-folder/              # 3 chapter .docx files (paired)
        │   ├── sample-en-whole.docx           # whole-book single .docx
        │   └── sample-fr-whole.docx
        ├── test_slug.py
        ├── test_lock.py
        ├── test_config.py
        ├── test_prompts.py
        ├── test_docx_io.py
        ├── test_chapter_split.py
        ├── test_ingest.py
        ├── test_state.py
        ├── test_payload.py
        ├── test_openrouter.py
        ├── test_rounds.py
        ├── test_finalize.py
        ├── test_sse.py
        ├── test_routes_settings.py
        ├── test_routes_prompts.py
        ├── test_routes_books.py
        ├── test_routes_chapters.py
        └── test_e2e_smoke.py                  # manual real-OpenRouter test (Phase 20)
```

---

## Phase 1 — Project Scaffolding

### Task 1.1: Create `pyproject.toml`

**Files:**
- Create: `pyproject.toml`

- [ ] **Step 1: Write `pyproject.toml`**

```toml
[project]
name = "translate"
version = "0.1.0"
description = "Local web app for AI-assisted bilingual chapter proofreading"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.110",
    "uvicorn[standard]>=0.29",
    "python-docx>=1.1",
    "httpx>=0.27",
    "pydantic>=2.7",
    "click>=8.1",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.23",
    "ruff>=0.5",
    "mypy>=1.10",
    "respx>=0.21",  # httpx mocking
]

[project.scripts]
translate = "server.main:cli"

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
include = ["server*"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

- [ ] **Step 2: Create virtualenv and install**

Run:
```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

Expected: installs without error, `pip list` shows fastapi, python-docx, httpx, pytest.

- [ ] **Step 3: Commit**

```bash
git add pyproject.toml
git commit -m "chore: scaffold Python project with FastAPI + python-docx"
```

### Task 1.2: Create empty package and conftest

**Files:**
- Create: `server/__init__.py`
- Create: `server/errors.py`
- Create: `tests/__init__.py`
- Create: `tests/server/__init__.py`
- Create: `tests/server/conftest.py`

- [ ] **Step 1: Write `server/__init__.py`**

```python
__version__ = "0.1.0"
```

- [ ] **Step 2: Write `server/errors.py` skeleton**

```python
"""Server error class hierarchy.

Maps to the three error classes in the spec:
- TransientError -> retried with backoff in OpenRouter calls
- RecoverableError -> surfaced immediately, requires user action
- ConfigurationError -> blocks the action, routes to settings
"""


class TranslateError(Exception):
    """Base for all server errors."""


class TransientError(TranslateError):
    """Network blip, 5xx, rate limit. Subject to retry."""


class RecoverableError(TranslateError):
    """Bad model output, malformed response. No retry; surface to user."""


class ConfigurationError(TranslateError):
    """Bad API key, missing config. Block action; route to settings."""
```

- [ ] **Step 3: Write `tests/server/conftest.py`**

```python
"""Shared pytest fixtures for server tests."""
from __future__ import annotations

from pathlib import Path

import pytest


@pytest.fixture
def translate_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Isolated ~/.translate/ rooted in tmp_path for one test.

    Sets the TRANSLATE_ROOT env var so server modules read/write here.
    """
    root = tmp_path / "translate"
    root.mkdir()
    monkeypatch.setenv("TRANSLATE_ROOT", str(root))
    return root


@pytest.fixture
def fixtures_dir() -> Path:
    """Path to the bundled test fixture .docx files."""
    return Path(__file__).parent / "fixtures"
```

- [ ] **Step 4: Run pytest to confirm collection works**

Run: `pytest tests/server/ -v --collect-only`
Expected: `0 tests collected` (no test files yet) and no errors.

- [ ] **Step 5: Commit**

```bash
git add server/__init__.py server/errors.py tests/__init__.py tests/server/__init__.py tests/server/conftest.py
git commit -m "chore: add server package skeleton, error hierarchy, conftest"
```

### Task 1.3: Add `TRANSLATE_ROOT` resolution helper

**Files:**
- Create: `server/paths.py`
- Test: `tests/server/test_paths.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/server/test_paths.py
from pathlib import Path

from server.paths import translate_root


def test_translate_root_uses_env_var_when_set(translate_root: Path) -> None:
    assert translate_root == Path(translate_root.as_posix())
    # The fixture sets TRANSLATE_ROOT; our function should honor it.
    from server.paths import translate_root as fn
    assert fn() == translate_root


def test_translate_root_defaults_to_home_translate(monkeypatch) -> None:
    monkeypatch.delenv("TRANSLATE_ROOT", raising=False)
    from server.paths import translate_root as fn
    assert fn() == Path.home() / ".translate"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/server/test_paths.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'server.paths'`

- [ ] **Step 3: Write `server/paths.py`**

```python
"""Resolve filesystem paths under ~/.translate/.

TRANSLATE_ROOT env var overrides for tests; production reads ~/.translate/.
"""
from __future__ import annotations

import os
from pathlib import Path


def translate_root() -> Path:
    env = os.environ.get("TRANSLATE_ROOT")
    return Path(env) if env else Path.home() / ".translate"


def lock_path() -> Path:
    return translate_root() / ".lock"


def config_path() -> Path:
    return translate_root() / "config.json"


def prompts_dir() -> Path:
    return translate_root() / "prompts"


def book_dir(slug: str) -> Path:
    return translate_root() / slug
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/server/test_paths.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add server/paths.py tests/server/test_paths.py
git commit -m "feat(server): add TRANSLATE_ROOT-aware path resolution"
```

---

## Phase 2 — Slug Derivation

### Task 2.1: Implement slug derivation from filename or folder name

**Files:**
- Create: `server/slug.py`
- Test: `tests/server/test_slug.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/server/test_slug.py
from server.slug import derive_slug


def test_strips_docx_extension():
    assert derive_slug("Le Voleur de Pluie.docx") == "le-voleur-de-pluie"


def test_strips_other_extensions():
    assert derive_slug("Book.DOC") == "book"


def test_uses_folder_name_when_no_extension():
    assert derive_slug("My Book Folder") == "my-book-folder"


def test_lowercases():
    assert derive_slug("UPPER.docx") == "upper"


def test_replaces_spaces_with_hyphens():
    assert derive_slug("a b c.docx") == "a-b-c"


def test_collapses_runs_of_separators():
    assert derive_slug("a   b___c.docx") == "a-b-c"


def test_strips_illegal_filesystem_chars():
    assert derive_slug("name/with:weird*chars?.docx") == "namewithweirdchars"


def test_keeps_unicode_letters():
    assert derive_slug("café résumé.docx") == "café-résumé"


def test_handles_path_input():
    assert derive_slug("/some/path/Book Title.docx") == "book-title"


def test_empty_returns_book():
    assert derive_slug("") == "book"


def test_only_illegal_chars_returns_book():
    assert derive_slug("/?:*.docx") == "book"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/server/test_slug.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'server.slug'`

- [ ] **Step 3: Write `server/slug.py`**

```python
"""Derive a filesystem-safe slug from a filename or folder name."""
from __future__ import annotations

import re
import unicodedata
from pathlib import Path

_ILLEGAL = re.compile(r"[/\\:*?\"<>|]")
_SEP_RUN = re.compile(r"[\s_\-]+")
_KEEP = re.compile(r"[^\w\-]", re.UNICODE)


def derive_slug(name: str) -> str:
    """Return a filesystem-safe slug for use as a book directory name.

    - Takes the basename if a path is passed.
    - Strips file extension.
    - Lowercases.
    - Removes illegal filesystem characters.
    - Collapses runs of whitespace/underscore/hyphen into single hyphen.
    - Returns "book" if input would otherwise be empty.
    """
    base = Path(name).name
    stem = Path(base).stem if "." in base else base
    stem = stem.lower()
    stem = _ILLEGAL.sub("", stem)
    stem = _SEP_RUN.sub("-", stem)
    stem = _KEEP.sub("", stem)  # remove anything still non-word/non-hyphen
    stem = stem.strip("-")
    return stem or "book"
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `pytest tests/server/test_slug.py -v`
Expected: 11 passed.

- [ ] **Step 5: Commit**

```bash
git add server/slug.py tests/server/test_slug.py
git commit -m "feat(server): derive filesystem-safe book slugs from filenames"
```

---

## Phase 3 — Single-Instance Lock

### Task 3.1: Lock acquire / release / takeover

**Files:**
- Create: `server/lock.py`
- Test: `tests/server/test_lock.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/server/test_lock.py
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from server.lock import LockHeld, acquire_lock, read_lock, release_lock


def test_acquire_writes_pid_and_url(translate_root: Path) -> None:
    acquire_lock(url="http://localhost:5180")
    data = read_lock()
    assert data is not None
    assert data["pid"] == os.getpid()
    assert data["url"] == "http://localhost:5180"
    release_lock()


def test_release_removes_lock_file(translate_root: Path) -> None:
    acquire_lock(url="http://localhost:5180")
    release_lock()
    assert read_lock() is None


def test_acquire_when_held_by_live_pid_raises_lockheld(translate_root: Path) -> None:
    # Simulate another live process holding the lock by writing this PID.
    (translate_root / ".lock").write_text(
        json.dumps({"pid": os.getpid(), "url": "http://localhost:5180"})
    )
    with pytest.raises(LockHeld) as exc:
        acquire_lock(url="http://localhost:5181")
    assert exc.value.url == "http://localhost:5180"
    assert exc.value.pid == os.getpid()


def test_acquire_takes_over_stale_lock(translate_root: Path) -> None:
    # PID 1 should always be alive, but PID 2**31-1 is essentially never live.
    dead_pid = 2**31 - 1
    (translate_root / ".lock").write_text(
        json.dumps({"pid": dead_pid, "url": "http://localhost:5180"})
    )
    acquire_lock(url="http://localhost:5181")
    data = read_lock()
    assert data["pid"] == os.getpid()
    assert data["url"] == "http://localhost:5181"
    release_lock()


def test_read_lock_missing_returns_none(translate_root: Path) -> None:
    assert read_lock() is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/server/test_lock.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'server.lock'`

- [ ] **Step 3: Write `server/lock.py`**

```python
"""Single-instance lock under ~/.translate/.lock.

Lock file contains JSON {"pid": int, "url": str}. The url is the
URL the running server bound (e.g., "http://localhost:5180").
A second launch reads this URL, opens a browser tab there, and exits.

Stale locks (PID no longer alive) are taken over silently.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Optional, TypedDict

from server.paths import lock_path, translate_root


class LockData(TypedDict):
    pid: int
    url: str


@dataclass
class LockHeld(Exception):
    pid: int
    url: str

    def __str__(self) -> str:
        return f"Lock held by PID {self.pid} at {self.url}"


def _pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True  # exists but not ours
    return True


def read_lock() -> Optional[LockData]:
    p = lock_path()
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except (json.JSONDecodeError, OSError):
        return None


def acquire_lock(*, url: str) -> None:
    """Acquire the lock; raise LockHeld if another live process holds it."""
    translate_root().mkdir(parents=True, exist_ok=True)
    existing = read_lock()
    if existing is not None and _pid_alive(existing["pid"]) and existing["pid"] != os.getpid():
        raise LockHeld(pid=existing["pid"], url=existing["url"])
    lock_path().write_text(json.dumps({"pid": os.getpid(), "url": url}))


def release_lock() -> None:
    p = lock_path()
    if p.exists():
        try:
            data = json.loads(p.read_text())
            if data.get("pid") == os.getpid():
                p.unlink()
        except (json.JSONDecodeError, OSError):
            p.unlink(missing_ok=True)
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `pytest tests/server/test_lock.py -v`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add server/lock.py tests/server/test_lock.py
git commit -m "feat(server): single-instance lock with PID + URL handoff"
```

---

## Phase 4 — Config Persistence

### Task 4.1: Config read/write with mode 600 enforcement

**Files:**
- Create: `server/config.py`
- Test: `tests/server/test_config.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/server/test_config.py
from __future__ import annotations

import os
import stat
from pathlib import Path

from server.config import Config, load_config, save_config


def test_load_returns_default_when_missing(translate_root: Path) -> None:
    cfg = load_config()
    assert cfg.openrouter_api_key == ""
    assert cfg.default_models.editor == ""
    assert cfg.default_models.reviewer == ""
    assert cfg.ingestion.heading_style == "Heading 1"
    assert cfg.ingestion.fallback_patterns  # non-empty


def test_save_writes_json_and_round_trips(translate_root: Path) -> None:
    cfg = Config(
        openrouter_api_key="sk-or-test",
        default_models={"editor": "anthropic/claude-sonnet-4", "reviewer": "openai/gpt-5"},
    )
    save_config(cfg)
    loaded = load_config()
    assert loaded.openrouter_api_key == "sk-or-test"
    assert loaded.default_models.editor == "anthropic/claude-sonnet-4"
    assert loaded.default_models.reviewer == "openai/gpt-5"


def test_save_sets_mode_600(translate_root: Path) -> None:
    save_config(Config(openrouter_api_key="x"))
    p = translate_root / "config.json"
    mode = stat.S_IMODE(p.stat().st_mode)
    assert mode == 0o600, f"expected 0o600, got {oct(mode)}"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/server/test_config.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'server.config'`

- [ ] **Step 3: Write `server/config.py`**

```python
"""Read and write ~/.translate/config.json with mode 600."""
from __future__ import annotations

import json
import os
from typing import List

from pydantic import BaseModel, Field

from server.paths import config_path, translate_root


class DefaultModels(BaseModel):
    editor: str = ""
    reviewer: str = ""


class IngestionConfig(BaseModel):
    heading_style: str = "Heading 1"
    fallback_patterns: List[str] = Field(
        default_factory=lambda: [
            r"^Chapter\s+\d+",
            r"^Chapitre\s+\d+",
            r"^Capítulo\s+\d+",
            r"^Chapter\s+[IVXLCM]+",
        ]
    )


class Config(BaseModel):
    openrouter_api_key: str = ""
    default_models: DefaultModels = Field(default_factory=DefaultModels)
    ingestion: IngestionConfig = Field(default_factory=IngestionConfig)


def load_config() -> Config:
    p = config_path()
    if not p.exists():
        return Config()
    return Config.model_validate_json(p.read_text())


def save_config(cfg: Config) -> None:
    translate_root().mkdir(parents=True, exist_ok=True)
    p = config_path()
    # Write with restricted permissions from the start.
    fd = os.open(str(p), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        with os.fdopen(fd, "w") as f:
            f.write(cfg.model_dump_json(indent=2))
    except Exception:
        try:
            os.close(fd)
        except OSError:
            pass
        raise
    os.chmod(str(p), 0o600)  # in case file pre-existed with looser perms
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `pytest tests/server/test_config.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add server/config.py tests/server/test_config.py
git commit -m "feat(server): config persistence with mode-600 enforcement"
```

---

## Phase 5 — Prompts Versioning

### Task 5.1: Prompt model + load/save/list-versions/restore/delete

**Files:**
- Create: `server/prompts.py`
- Test: `tests/server/test_prompts.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/server/test_prompts.py
from __future__ import annotations

from pathlib import Path

import pytest

from server.prompts import (
    PromptKind,
    delete_version,
    list_versions,
    load_prompts,
    restore_version,
    save_new_version,
)


def test_load_returns_seeded_v1_when_missing(translate_root: Path) -> None:
    data = load_prompts(PromptKind.EDITOR)
    assert data.current == "v1"
    assert len(data.versions) == 1
    assert data.versions[0].id == "v1"
    assert "proofreading" in data.versions[0].text.lower()


def test_save_new_version_increments_id_and_promotes_current(translate_root: Path) -> None:
    save_new_version(PromptKind.EDITOR, "Edited prompt v2 text.")
    data = load_prompts(PromptKind.EDITOR)
    assert data.current == "v2"
    assert len(data.versions) == 2
    assert data.versions[-1].text == "Edited prompt v2 text."


def test_list_versions_returns_in_save_order(translate_root: Path) -> None:
    save_new_version(PromptKind.EDITOR, "v2 text")
    save_new_version(PromptKind.EDITOR, "v3 text")
    versions = list_versions(PromptKind.EDITOR)
    assert [v.id for v in versions] == ["v1", "v2", "v3"]


def test_restore_creates_new_entry_with_old_text(translate_root: Path) -> None:
    save_new_version(PromptKind.EDITOR, "v2 text")
    save_new_version(PromptKind.EDITOR, "v3 text")
    restore_version(PromptKind.EDITOR, "v1")
    data = load_prompts(PromptKind.EDITOR)
    assert data.current == "v4"
    assert data.versions[-1].id == "v4"
    assert data.versions[-1].text == data.versions[0].text  # v1's text


def test_delete_removes_historical_version(translate_root: Path) -> None:
    save_new_version(PromptKind.EDITOR, "v2 text")
    save_new_version(PromptKind.EDITOR, "v3 text")
    delete_version(PromptKind.EDITOR, "v1")
    versions = list_versions(PromptKind.EDITOR)
    assert [v.id for v in versions] == ["v2", "v3"]


def test_delete_current_version_raises(translate_root: Path) -> None:
    save_new_version(PromptKind.EDITOR, "v2 text")
    with pytest.raises(ValueError, match="current"):
        delete_version(PromptKind.EDITOR, "v2")


def test_reviewer_seeded_independently(translate_root: Path) -> None:
    e = load_prompts(PromptKind.EDITOR)
    r = load_prompts(PromptKind.REVIEWER)
    assert e.versions[0].text != r.versions[0].text
    assert "json" in r.versions[0].text.lower()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/server/test_prompts.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'server.prompts'`

- [ ] **Step 3: Write `server/prompts.py`**

```python
"""Prompt versioning for the Editor and Reviewer system prompts.

Each prompt file stores: {"current": "vN", "versions": [{"id":..., "saved_at":..., "text":...}]}.
- Restoring an old version creates a new entry with its text and promotes it to current.
- Deleting the current version is forbidden.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from enum import Enum
from typing import List

from pydantic import BaseModel, Field

from server.paths import prompts_dir, translate_root


class PromptKind(str, Enum):
    EDITOR = "editor"
    REVIEWER = "reviewer"


class PromptVersion(BaseModel):
    id: str
    saved_at: str
    text: str


class PromptFile(BaseModel):
    current: str
    versions: List[PromptVersion] = Field(default_factory=list)


SEED_EDITOR = (
    "You are proofreading a chapter of a novel that has been translated by AI into "
    "{TARGET_LANG_NAME}. You will receive the English original and the current "
    "translation, paragraph by paragraph and aligned by index.\n\n"
    "Proof the translation only. Do not edit the book itself — do not change plot, "
    "characters, voice, pacing, or authorial choices. Your job is linguistic, not "
    "editorial.\n\n"
    "Use the English source as a reference for the author's voice, style, and tone. "
    "Fix awkward phrasing, unnatural word order, translation artifacts, register "
    "mismatches, idioms that don't land, and anything that sounds machine-translated. "
    "Preserve the author's style and tone — if the original is informal, stay informal; "
    "if it's literary, stay literary.\n\n"
    "If a previous reviewer's suggestions are provided, incorporate the ones you agree "
    "with and ignore those you don't. Do not explain your decisions.\n\n"
    "Return only the revised translation, in the exact paragraph-aligned format you "
    "received, with one `{TARGET_LANG_CODE}:` line per paragraph and nothing else."
)

SEED_REVIEWER = (
    "You are reviewing a chapter of a novel that has been translated by AI into "
    "{TARGET_LANG_NAME} and then proofread. You will receive the English original and "
    "the current translation, paragraph by paragraph and aligned by index.\n\n"
    "Identify what should change to make the translation read like it was written by "
    "a native speaker of the target language while remaining faithful to the author's "
    "voice, style, and tone in the English source. Do not suggest editorial changes — "
    "your suggestions must be linguistic, not creative.\n\n"
    "The user does not speak the target language. Communicate to them in English.\n\n"
    "Return a JSON list of suggestions. Each entry must have `quote` (the translation "
    "snippet to change) and `comment` (what should change and why). Return only the "
    "JSON list, no preamble or commentary."
)


def _path(kind: PromptKind):
    return prompts_dir() / f"{kind.value}.json"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _seed(kind: PromptKind) -> PromptFile:
    text = SEED_EDITOR if kind == PromptKind.EDITOR else SEED_REVIEWER
    return PromptFile(
        current="v1",
        versions=[PromptVersion(id="v1", saved_at=_now(), text=text)],
    )


def load_prompts(kind: PromptKind) -> PromptFile:
    p = _path(kind)
    if not p.exists():
        seeded = _seed(kind)
        prompts_dir().mkdir(parents=True, exist_ok=True)
        p.write_text(seeded.model_dump_json(indent=2))
        return seeded
    return PromptFile.model_validate_json(p.read_text())


def list_versions(kind: PromptKind) -> List[PromptVersion]:
    return load_prompts(kind).versions


def _next_id(existing: List[PromptVersion]) -> str:
    nums = [int(v.id[1:]) for v in existing if v.id.startswith("v") and v.id[1:].isdigit()]
    return f"v{(max(nums) if nums else 0) + 1}"


def save_new_version(kind: PromptKind, text: str) -> str:
    data = load_prompts(kind)
    new_id = _next_id(data.versions)
    data.versions.append(PromptVersion(id=new_id, saved_at=_now(), text=text))
    data.current = new_id
    _path(kind).write_text(data.model_dump_json(indent=2))
    return new_id


def restore_version(kind: PromptKind, version_id: str) -> str:
    data = load_prompts(kind)
    target = next((v for v in data.versions if v.id == version_id), None)
    if target is None:
        raise ValueError(f"unknown version {version_id}")
    return save_new_version(kind, target.text)


def delete_version(kind: PromptKind, version_id: str) -> None:
    data = load_prompts(kind)
    if data.current == version_id:
        raise ValueError(f"cannot delete current version {version_id}")
    data.versions = [v for v in data.versions if v.id != version_id]
    _path(kind).write_text(data.model_dump_json(indent=2))
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `pytest tests/server/test_prompts.py -v`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add server/prompts.py tests/server/test_prompts.py
git commit -m "feat(server): editor/reviewer prompt versioning with seed prompts"
```

---

## Phase 6 — `.docx` Parsing → JSON

### Task 6.1: Add fixture `.docx` files

**Files:**
- Create: `tests/server/fixtures/_make_fixtures.py` (one-time generator script, kept for re-runs)
- Create: `tests/server/fixtures/sample-en-folder/ch01.docx`, `ch02.docx`, `ch03.docx`
- Create: `tests/server/fixtures/sample-fr-folder/ch01.docx`, `ch02.docx`, `ch03.docx`
- Create: `tests/server/fixtures/sample-en-whole.docx`
- Create: `tests/server/fixtures/sample-fr-whole.docx`

- [ ] **Step 1: Write `tests/server/fixtures/_make_fixtures.py`**

```python
"""Generate test fixture .docx files. Run once; fixtures committed to git.

Usage:
    python tests/server/fixtures/_make_fixtures.py
"""
from __future__ import annotations

from pathlib import Path

from docx import Document
from docx.shared import Pt

HERE = Path(__file__).parent

EN_CHAPTERS = [
    ("Chapter 1", [
        ("normal", "The morning when it all began, it was still raining."),
        ("normal", 'She thought, "Why me?"'),
        ("normal", "The window was *cold* under her hand."),
    ]),
    ("Chapter 2", [
        ("normal", "By noon the rain had stopped."),
        ("normal", "He carried the **letter** to the door."),
    ]),
    ("Chapter 3", [
        ("normal", "Three days passed without a word."),
        ("normal", "She decided to leave."),
    ]),
]

FR_CHAPTERS = [
    ("Chapitre 1", [
        ("normal", "Le matin où tout commença, il pleuvait encore."),
        ("normal", 'Elle pensa : « Pourquoi moi ? »'),
        ("normal", "La fenêtre était *froide* sous sa main."),
    ]),
    ("Chapitre 2", [
        ("normal", "À midi la pluie avait cessé."),
        ("normal", "Il porta la **lettre** à la porte."),
    ]),
    ("Chapitre 3", [
        ("normal", "Trois jours passèrent sans un mot."),
        ("normal", "Elle décida de partir."),
    ]),
]


def _add_paragraph(doc, style_name: str, text: str) -> None:
    if style_name.startswith("heading"):
        level = int(style_name.split("-")[1])
        p = doc.add_heading(text, level=level)
    else:
        p = doc.add_paragraph()
        # Render *italic*/**bold** markers as runs.
        i = 0
        while i < len(text):
            if text[i:i+2] == "**":
                end = text.find("**", i + 2)
                if end == -1:
                    p.add_run(text[i:])
                    break
                run = p.add_run(text[i+2:end])
                run.bold = True
                i = end + 2
            elif text[i] == "*":
                end = text.find("*", i + 1)
                if end == -1:
                    p.add_run(text[i:])
                    break
                run = p.add_run(text[i+1:end])
                run.italic = True
                i = end + 1
            else:
                # Take a chunk up to the next marker.
                next_marker = min(
                    [j for j in (text.find("*", i), text.find("**", i)) if j != -1] or [len(text)]
                )
                p.add_run(text[i:next_marker])
                i = next_marker


def write_folder(out_dir: Path, chapters):
    out_dir.mkdir(parents=True, exist_ok=True)
    for n, (heading, paras) in enumerate(chapters, start=1):
        doc = Document()
        _add_paragraph(doc, "heading-1", heading)
        for style, text in paras:
            _add_paragraph(doc, style, text)
        doc.save(str(out_dir / f"ch{n:02d}.docx"))


def write_whole(out_path: Path, chapters):
    doc = Document()
    for heading, paras in chapters:
        _add_paragraph(doc, "heading-1", heading)
        for style, text in paras:
            _add_paragraph(doc, style, text)
    doc.save(str(out_path))


if __name__ == "__main__":
    write_folder(HERE / "sample-en-folder", EN_CHAPTERS)
    write_folder(HERE / "sample-fr-folder", FR_CHAPTERS)
    write_whole(HERE / "sample-en-whole.docx", EN_CHAPTERS)
    write_whole(HERE / "sample-fr-whole.docx", FR_CHAPTERS)
    print("Fixtures written to:", HERE)
```

- [ ] **Step 2: Generate the fixture files**

Run:
```bash
mkdir -p tests/server/fixtures
python tests/server/fixtures/_make_fixtures.py
ls tests/server/fixtures/
ls tests/server/fixtures/sample-en-folder/
```

Expected:
- `sample-en-folder/`, `sample-fr-folder/`, `sample-en-whole.docx`, `sample-fr-whole.docx`, `_make_fixtures.py`
- 3 `.docx` files in each folder

- [ ] **Step 3: Commit fixtures**

```bash
git add tests/server/fixtures/
git commit -m "test: add bilingual .docx fixtures for parsing/splitting"
```

### Task 6.2: Parse `.docx` → paragraph JSON

**Files:**
- Create: `server/docx_io.py`
- Test: `tests/server/test_docx_io.py`

- [ ] **Step 1: Write the failing tests for parsing**

```python
# tests/server/test_docx_io.py
from __future__ import annotations

from pathlib import Path

from server.docx_io import ParsedDoc, Paragraph, parse_docx


def test_parse_returns_heading_and_paragraphs(fixtures_dir: Path) -> None:
    parsed = parse_docx(fixtures_dir / "sample-en-folder" / "ch01.docx")
    assert isinstance(parsed, ParsedDoc)
    assert parsed.paragraphs[0] == Paragraph(style="heading-1", text="Chapter 1")
    assert parsed.paragraphs[1].style == "normal"
    assert parsed.paragraphs[1].text.startswith("The morning when")


def test_parse_encodes_italic_with_single_asterisks(fixtures_dir: Path) -> None:
    parsed = parse_docx(fixtures_dir / "sample-en-folder" / "ch01.docx")
    cold_para = next(p for p in parsed.paragraphs if "cold" in p.text)
    assert "*cold*" in cold_para.text


def test_parse_encodes_bold_with_double_asterisks(fixtures_dir: Path) -> None:
    parsed = parse_docx(fixtures_dir / "sample-en-folder" / "ch02.docx")
    letter_para = next(p for p in parsed.paragraphs if "letter" in p.text)
    assert "**letter**" in letter_para.text


def test_parse_preserves_unicode(fixtures_dir: Path) -> None:
    parsed = parse_docx(fixtures_dir / "sample-fr-folder" / "ch01.docx")
    assert any("« Pourquoi moi ? »" in p.text for p in parsed.paragraphs)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/server/test_docx_io.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'server.docx_io'`

- [ ] **Step 3: Write `server/docx_io.py` (parsing only for now)**

```python
"""Parse .docx -> ParsedDoc and render ParsedDoc -> .docx.

Inline markup convention:
- *text* for italic
- **text** for bold
- Headings are captured by the `style` field, not inline markup.
"""
from __future__ import annotations

from pathlib import Path
from typing import List

from docx import Document
from pydantic import BaseModel


class Paragraph(BaseModel):
    style: str  # "heading-1" .. "heading-6" or "normal"
    text: str


class ParsedDoc(BaseModel):
    paragraphs: List[Paragraph]


def _style_name(p) -> str:
    name = (p.style.name or "").lower()
    if name.startswith("heading "):
        try:
            level = int(name.split(" ")[1])
            return f"heading-{level}"
        except (ValueError, IndexError):
            return "normal"
    return "normal"


def _runs_to_marked_text(p) -> str:
    """Encode a paragraph's runs as inline-marked text.

    Adjacent runs sharing the same style are merged. Bold takes precedence
    over italic when both are set.
    """
    out: list[str] = []
    cur_text = ""
    cur_style: tuple[bool, bool] = (False, False)  # (bold, italic)

    def flush():
        if not cur_text:
            return
        bold, italic = cur_style
        if bold:
            out.append(f"**{cur_text}**")
        elif italic:
            out.append(f"*{cur_text}*")
        else:
            out.append(cur_text)

    for run in p.runs:
        style = (bool(run.bold), bool(run.italic))
        if style == cur_style:
            cur_text += run.text
        else:
            flush()
            cur_text = run.text
            cur_style = style
    flush()
    return "".join(out)


def parse_docx(path: Path | str) -> ParsedDoc:
    doc = Document(str(path))
    paras: list[Paragraph] = []
    for p in doc.paragraphs:
        text = _runs_to_marked_text(p)
        if not text.strip():
            continue
        paras.append(Paragraph(style=_style_name(p), text=text))
    return ParsedDoc(paragraphs=paras)
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `pytest tests/server/test_docx_io.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add server/docx_io.py tests/server/test_docx_io.py
git commit -m "feat(server): parse .docx into structured paragraph JSON with inline markers"
```

---

## Phase 7 — `.docx` Emission ← JSON

### Task 7.1: Render ParsedDoc back to a `.docx` file

**Files:**
- Modify: `server/docx_io.py` (add `write_docx`)
- Modify: `tests/server/test_docx_io.py` (add round-trip tests)

- [ ] **Step 1: Add the failing tests**

Append to `tests/server/test_docx_io.py`:

```python
from server.docx_io import write_docx


def test_write_then_parse_round_trips(tmp_path: Path, fixtures_dir: Path) -> None:
    parsed = parse_docx(fixtures_dir / "sample-en-folder" / "ch01.docx")
    out = tmp_path / "out.docx"
    write_docx(parsed, out)
    re_parsed = parse_docx(out)
    assert re_parsed.paragraphs == parsed.paragraphs


def test_write_emits_heading_at_correct_level(tmp_path: Path) -> None:
    parsed = ParsedDoc(paragraphs=[
        Paragraph(style="heading-1", text="Chapter 9"),
        Paragraph(style="normal", text="Body."),
    ])
    out = tmp_path / "out.docx"
    write_docx(parsed, out)
    doc = Document(str(out))
    assert doc.paragraphs[0].style.name == "Heading 1"
    assert doc.paragraphs[0].text == "Chapter 9"


def test_write_emits_inline_italic_and_bold(tmp_path: Path) -> None:
    parsed = ParsedDoc(paragraphs=[
        Paragraph(style="normal", text="Plain *italic* and **bold** end."),
    ])
    out = tmp_path / "out.docx"
    write_docx(parsed, out)
    re_parsed = parse_docx(out)
    assert re_parsed.paragraphs == parsed.paragraphs


def test_write_handles_unicode(tmp_path: Path) -> None:
    parsed = ParsedDoc(paragraphs=[
        Paragraph(style="normal", text="« Pourquoi moi ? » pensa-t-elle."),
    ])
    out = tmp_path / "out.docx"
    write_docx(parsed, out)
    re_parsed = parse_docx(out)
    assert re_parsed.paragraphs == parsed.paragraphs
```

- [ ] **Step 2: Add the missing import at top of test file**

The test references `Document`. Add at top of `tests/server/test_docx_io.py`:

```python
from docx import Document
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pytest tests/server/test_docx_io.py -v`
Expected: FAIL on the new tests with `ImportError: cannot import name 'write_docx'`.

- [ ] **Step 4: Add `write_docx` to `server/docx_io.py`**

Append to `server/docx_io.py`:

```python
def _emit_runs(p, text: str) -> None:
    """Walk inline markers and append correctly-styled runs to a paragraph."""
    i = 0
    n = len(text)
    while i < n:
        if text.startswith("**", i):
            end = text.find("**", i + 2)
            if end == -1:
                p.add_run(text[i:])
                return
            run = p.add_run(text[i + 2:end])
            run.bold = True
            i = end + 2
        elif text[i] == "*":
            end = text.find("*", i + 1)
            if end == -1:
                p.add_run(text[i:])
                return
            run = p.add_run(text[i + 1:end])
            run.italic = True
            i = end + 1
        else:
            # Find next marker.
            next_star = text.find("*", i)
            chunk_end = next_star if next_star != -1 else n
            p.add_run(text[i:chunk_end])
            i = chunk_end


def write_docx(parsed: ParsedDoc, out_path: Path | str) -> None:
    doc = Document()
    for para in parsed.paragraphs:
        if para.style.startswith("heading-"):
            level = int(para.style.split("-")[1])
            p = doc.add_heading(level=level)
            # add_heading inserts placeholder text; clear and add runs explicitly.
            for r in list(p.runs):
                r.text = ""
            _emit_runs(p, para.text)
        else:
            p = doc.add_paragraph()
            _emit_runs(p, para.text)
    doc.save(str(out_path))
```

- [ ] **Step 5: Run tests to verify all pass**

Run: `pytest tests/server/test_docx_io.py -v`
Expected: 8 passed (4 from previous task + 4 new).

- [ ] **Step 6: Commit**

```bash
git add server/docx_io.py tests/server/test_docx_io.py
git commit -m "feat(server): emit ParsedDoc back to .docx with paragraph + inline-style preservation"
```

---

## Phase 8 — Chapter Splitting

### Task 8.1: Split a whole-book `.docx` into chapter `ParsedDoc`s

**Files:**
- Create: `server/chapter_split.py`
- Test: `tests/server/test_chapter_split.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/server/test_chapter_split.py
from __future__ import annotations

from pathlib import Path

import pytest

from server.chapter_split import (
    ChapterSplitError,
    SplitChapter,
    split_by_heading_style,
    split_by_pattern,
    split_docx,
)
from server.docx_io import parse_docx


def test_split_by_heading_style_returns_three_chapters(fixtures_dir: Path) -> None:
    parsed = parse_docx(fixtures_dir / "sample-en-whole.docx")
    chapters = split_by_heading_style(parsed, heading_style="heading-1")
    assert len(chapters) == 3
    assert [c.title for c in chapters] == ["Chapter 1", "Chapter 2", "Chapter 3"]
    # Each chapter retains its heading paragraph plus its body.
    assert chapters[0].doc.paragraphs[0].style == "heading-1"
    assert any("morning" in p.text for p in chapters[0].doc.paragraphs)


def test_split_by_pattern_works_when_no_headings(tmp_path: Path) -> None:
    # Construct a doc with no heading styles, just plain paragraphs whose
    # first lines match a chapter pattern.
    from docx import Document
    d = Document()
    d.add_paragraph("Chapter 1")
    d.add_paragraph("Body of one.")
    d.add_paragraph("Chapter 2")
    d.add_paragraph("Body of two.")
    p = tmp_path / "no_headings.docx"
    d.save(str(p))
    parsed = parse_docx(p)
    chapters = split_by_pattern(parsed, patterns=[r"^Chapter\s+\d+$"])
    assert [c.title for c in chapters] == ["Chapter 1", "Chapter 2"]


def test_split_docx_prefers_heading_style(fixtures_dir: Path) -> None:
    chapters = split_docx(
        fixtures_dir / "sample-en-whole.docx",
        heading_style="heading-1",
        fallback_patterns=[r"^Chapter\s+\d+"],
    )
    assert len(chapters) == 3


def test_split_docx_falls_back_to_patterns_when_headings_yield_one(tmp_path: Path) -> None:
    from docx import Document
    d = Document()
    d.add_paragraph("Chapter 1")  # not a heading style
    d.add_paragraph("Body one.")
    d.add_paragraph("Chapter 2")
    d.add_paragraph("Body two.")
    p = tmp_path / "patterned.docx"
    d.save(str(p))
    chapters = split_docx(
        p,
        heading_style="heading-1",
        fallback_patterns=[r"^Chapter\s+\d+"],
    )
    assert len(chapters) == 2


def test_split_docx_raises_when_unable_to_split(tmp_path: Path) -> None:
    from docx import Document
    d = Document()
    d.add_paragraph("Just a single block of text.")
    p = tmp_path / "unsplittable.docx"
    d.save(str(p))
    with pytest.raises(ChapterSplitError):
        split_docx(
            p,
            heading_style="heading-1",
            fallback_patterns=[r"^Chapter\s+\d+"],
        )
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/server/test_chapter_split.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'server.chapter_split'`

- [ ] **Step 3: Write `server/chapter_split.py`**

```python
"""Split a whole-book ParsedDoc into a list of per-chapter ParsedDocs.

Strategy (matches spec §6 Settings > Ingestion):
1. Try the configured heading style. If it yields >= 2 chapters, use it.
2. Otherwise, try each fallback regex against the first line of each paragraph.
   The first pattern yielding >= 2 chapters wins.
3. If neither works, raise ChapterSplitError.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import List

from server.docx_io import ParsedDoc, Paragraph, parse_docx


class ChapterSplitError(Exception):
    pass


@dataclass
class SplitChapter:
    title: str
    doc: ParsedDoc


def split_by_heading_style(parsed: ParsedDoc, *, heading_style: str = "heading-1") -> List[SplitChapter]:
    """Split on paragraphs whose style equals `heading_style`."""
    target = heading_style.lower()
    chapters: List[SplitChapter] = []
    current: List[Paragraph] | None = None
    title = ""
    for p in parsed.paragraphs:
        if p.style == target:
            if current is not None:
                chapters.append(SplitChapter(title=title, doc=ParsedDoc(paragraphs=current)))
            title = p.text
            current = [p]
        else:
            if current is None:
                continue  # skip preamble before the first heading
            current.append(p)
    if current is not None:
        chapters.append(SplitChapter(title=title, doc=ParsedDoc(paragraphs=current)))
    return chapters


def split_by_pattern(parsed: ParsedDoc, *, patterns: List[str]) -> List[SplitChapter]:
    """Split on paragraphs whose text matches any of the regex patterns."""
    compiled = [re.compile(pat) for pat in patterns]
    chapters: List[SplitChapter] = []
    current: List[Paragraph] | None = None
    title = ""
    for p in parsed.paragraphs:
        if any(c.match(p.text.strip()) for c in compiled):
            if current is not None:
                chapters.append(SplitChapter(title=title, doc=ParsedDoc(paragraphs=current)))
            title = p.text
            current = [p]
        else:
            if current is None:
                continue
            current.append(p)
    if current is not None:
        chapters.append(SplitChapter(title=title, doc=ParsedDoc(paragraphs=current)))
    return chapters


def split_docx(
    path: Path | str,
    *,
    heading_style: str,
    fallback_patterns: List[str],
) -> List[SplitChapter]:
    parsed = parse_docx(path)
    by_heading = split_by_heading_style(parsed, heading_style=heading_style.lower().replace(" ", "-"))
    if len(by_heading) >= 2:
        return by_heading
    for pat in fallback_patterns:
        result = split_by_pattern(parsed, patterns=[pat])
        if len(result) >= 2:
            return result
    raise ChapterSplitError(
        f"Could not split {path!r}: heading style yielded {len(by_heading)} chapters, "
        "no fallback pattern matched."
    )
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `pytest tests/server/test_chapter_split.py -v`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add server/chapter_split.py tests/server/test_chapter_split.py
git commit -m "feat(server): split whole-book .docx into chapters via heading style or pattern"
```

---

## Phase 9 — Book Ingestion

### Task 9.1: Detect input format (folder vs single file)

**Files:**
- Create: `server/ingest.py`
- Test: `tests/server/test_ingest.py`

- [ ] **Step 1: Write the failing tests for format detection**

```python
# tests/server/test_ingest.py
from __future__ import annotations

from pathlib import Path

import pytest

from server.ingest import (
    ChapterCountMismatch,
    IngestResult,
    SourceFormat,
    detect_format,
    ingest_book,
)


def test_detect_format_folder(fixtures_dir: Path) -> None:
    assert detect_format(fixtures_dir / "sample-en-folder") == SourceFormat.FOLDER


def test_detect_format_single_docx(fixtures_dir: Path) -> None:
    assert detect_format(fixtures_dir / "sample-en-whole.docx") == SourceFormat.SINGLE_DOCX


def test_detect_format_empty_folder_raises(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="no .docx"):
        detect_format(tmp_path)


def test_detect_format_unknown_path_raises(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        detect_format(tmp_path / "nope")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/server/test_ingest.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'server.ingest'`

- [ ] **Step 3: Write `server/ingest.py` (format detection only for now)**

```python
"""Book ingestion: detect format, split chapters, pair English with translated, write source folders."""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import List

from server.chapter_split import SplitChapter


class SourceFormat(str, Enum):
    FOLDER = "folder"
    SINGLE_DOCX = "single-docx"


class ChapterCountMismatch(Exception):
    def __init__(self, en_count: int, tr_count: int, en_titles: List[str], tr_titles: List[str]):
        self.en_count = en_count
        self.tr_count = tr_count
        self.en_titles = en_titles
        self.tr_titles = tr_titles
        super().__init__(
            f"English: {en_count} chapters | Translated: {tr_count} chapters"
        )


@dataclass
class IngestResult:
    slug: str
    chapters: List[SplitChapter]  # translated chapters; English mirror lives on disk
    book_dir: Path


def detect_format(path: Path | str) -> SourceFormat:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(p)
    if p.is_dir():
        if not any(child.suffix.lower() == ".docx" for child in p.iterdir()):
            raise ValueError(f"no .docx files in {p}")
        return SourceFormat.FOLDER
    if p.suffix.lower() == ".docx":
        return SourceFormat.SINGLE_DOCX
    raise ValueError(f"unsupported source: {p}")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/server/test_ingest.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add server/ingest.py tests/server/test_ingest.py
git commit -m "feat(server): detect ingestion source format (folder vs single .docx)"
```

### Task 9.2: Read chapters from each format

**Files:**
- Modify: `server/ingest.py`
- Modify: `tests/server/test_ingest.py`

- [ ] **Step 1: Add the failing tests**

Append to `tests/server/test_ingest.py`:

```python
from server.ingest import read_chapters
from server.config import IngestionConfig


def test_read_chapters_from_folder_returns_three(fixtures_dir: Path) -> None:
    cfg = IngestionConfig()
    chapters = read_chapters(fixtures_dir / "sample-en-folder", cfg)
    assert len(chapters) == 3
    # Folder ingestion uses the filename (without extension) as the title.
    assert [c.title for c in chapters] == ["ch01", "ch02", "ch03"]


def test_read_chapters_from_single_docx_returns_three(fixtures_dir: Path) -> None:
    cfg = IngestionConfig()
    chapters = read_chapters(fixtures_dir / "sample-en-whole.docx", cfg)
    assert len(chapters) == 3
    assert [c.title for c in chapters] == ["Chapter 1", "Chapter 2", "Chapter 3"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/server/test_ingest.py -v`
Expected: FAIL — `ImportError: cannot import name 'read_chapters'`

- [ ] **Step 3: Add `read_chapters` to `server/ingest.py`**

Append to `server/ingest.py`:

```python
from server.chapter_split import split_docx
from server.config import IngestionConfig
from server.docx_io import parse_docx


def read_chapters(source: Path | str, ingestion: IngestionConfig) -> List[SplitChapter]:
    """Return ordered chapters from either a folder of .docx files or one whole-book .docx."""
    fmt = detect_format(source)
    p = Path(source)
    if fmt == SourceFormat.FOLDER:
        files = sorted(child for child in p.iterdir() if child.suffix.lower() == ".docx")
        return [SplitChapter(title=f.stem, doc=parse_docx(f)) for f in files]
    # single-docx
    return split_docx(
        p,
        heading_style=ingestion.heading_style,
        fallback_patterns=ingestion.fallback_patterns,
    )
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `pytest tests/server/test_ingest.py -v`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add server/ingest.py tests/server/test_ingest.py
git commit -m "feat(server): read ordered chapters from folder or whole-book .docx"
```

### Task 9.3: Full `ingest_book` — pair, write source folders, return result

**Files:**
- Modify: `server/ingest.py`
- Modify: `tests/server/test_ingest.py`

- [ ] **Step 1: Add the failing tests**

Append to `tests/server/test_ingest.py`:

```python
def test_ingest_book_writes_source_folders_and_meta(fixtures_dir: Path, translate_root: Path) -> None:
    result = ingest_book(
        translated_path=fixtures_dir / "sample-fr-folder",
        english_path=fixtures_dir / "sample-en-folder",
        language_pair=("en", "fr"),
        ingestion=IngestionConfig(),
    )
    assert result.slug == "sample-fr-folder"
    book_dir = translate_root / result.slug
    assert (book_dir / "source-en" / "ch01.docx").exists()
    assert (book_dir / "source-en" / "ch01.json").exists()
    assert (book_dir / "source-translated" / "ch01.docx").exists()
    assert (book_dir / "source-translated" / "ch01.json").exists()
    # Three chapters total.
    assert len(list((book_dir / "source-en").glob("ch*.docx"))) == 3
    assert len(list((book_dir / "source-translated").glob("ch*.docx"))) == 3


def test_ingest_book_raises_on_chapter_count_mismatch(
    fixtures_dir: Path, translate_root: Path, tmp_path: Path
) -> None:
    # Build an EN folder with only 2 chapters.
    short = tmp_path / "short-en"
    short.mkdir()
    for f in sorted((fixtures_dir / "sample-en-folder").iterdir())[:2]:
        (short / f.name).write_bytes(f.read_bytes())
    with pytest.raises(ChapterCountMismatch) as exc:
        ingest_book(
            translated_path=fixtures_dir / "sample-fr-folder",
            english_path=short,
            language_pair=("en", "fr"),
            ingestion=IngestionConfig(),
        )
    assert exc.value.en_count == 2
    assert exc.value.tr_count == 3


def test_ingest_book_uses_existing_slug_with_suffix_on_collision(
    fixtures_dir: Path, translate_root: Path
) -> None:
    first = ingest_book(
        translated_path=fixtures_dir / "sample-fr-folder",
        english_path=fixtures_dir / "sample-en-folder",
        language_pair=("en", "fr"),
        ingestion=IngestionConfig(),
    )
    second = ingest_book(
        translated_path=fixtures_dir / "sample-fr-folder",
        english_path=fixtures_dir / "sample-en-folder",
        language_pair=("en", "fr"),
        ingestion=IngestionConfig(),
        on_collision="new-session",
    )
    assert second.slug == first.slug + "-2"
    assert (translate_root / second.slug).exists()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/server/test_ingest.py -v`
Expected: FAIL — `ingest_book` not yet implemented in full.

- [ ] **Step 3: Add `ingest_book` to `server/ingest.py`**

Append to `server/ingest.py`:

```python
import json
from typing import Literal, Tuple

from server.docx_io import write_docx
from server.paths import book_dir as _book_dir
from server.paths import translate_root as _translate_root
from server.slug import derive_slug


def _next_free_slug(base: str) -> str:
    root = _translate_root()
    if not (root / base).exists():
        return base
    n = 2
    while (root / f"{base}-{n}").exists():
        n += 1
    return f"{base}-{n}"


def ingest_book(
    *,
    translated_path: Path,
    english_path: Path,
    language_pair: Tuple[str, str],
    ingestion: IngestionConfig,
    on_collision: Literal["resume", "new-session"] = "new-session",
) -> IngestResult:
    """Ingest a translated book + its English original.

    Side effects: writes <book-slug>/source-en/, <book-slug>/source-translated/,
    and <book-slug>/meta.json.
    """
    en_chapters = read_chapters(english_path, ingestion)
    tr_chapters = read_chapters(translated_path, ingestion)
    if len(en_chapters) != len(tr_chapters):
        raise ChapterCountMismatch(
            en_count=len(en_chapters),
            tr_count=len(tr_chapters),
            en_titles=[c.title for c in en_chapters],
            tr_titles=[c.title for c in tr_chapters],
        )

    base_slug = derive_slug(translated_path.name)
    if on_collision == "new-session":
        slug = _next_free_slug(base_slug)
    else:  # resume
        slug = base_slug
    bdir = _book_dir(slug)
    (bdir / "source-en").mkdir(parents=True, exist_ok=True)
    (bdir / "source-translated").mkdir(parents=True, exist_ok=True)
    (bdir / "chapters").mkdir(parents=True, exist_ok=True)

    for n, (en, tr) in enumerate(zip(en_chapters, tr_chapters), start=1):
        name = f"ch{n:02d}"
        write_docx(en.doc, bdir / "source-en" / f"{name}.docx")
        (bdir / "source-en" / f"{name}.json").write_text(en.doc.model_dump_json(indent=2))
        write_docx(tr.doc, bdir / "source-translated" / f"{name}.docx")
        (bdir / "source-translated" / f"{name}.json").write_text(tr.doc.model_dump_json(indent=2))

    meta = {
        "slug": slug,
        "created_at": _now(),
        "sources": {
            "translated": {"path": str(translated_path), "format": detect_format(translated_path).value},
            "english":    {"path": str(english_path),    "format": detect_format(english_path).value},
        },
        "language_pair": {"from": language_pair[0], "to": language_pair[1]},
        "chapters": [
            {"n": n, "title": tr.title, "status": "untouched"}
            for n, tr in enumerate(tr_chapters, start=1)
        ],
    }
    (bdir / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False))
    return IngestResult(slug=slug, chapters=tr_chapters, book_dir=bdir)


def _now() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `pytest tests/server/test_ingest.py -v`
Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add server/ingest.py tests/server/test_ingest.py
git commit -m "feat(server): full ingest writes source-en/, source-translated/, meta.json"
```

---

## Phase 10 — State Model

### Task 10.1: Book + chapter `meta.json` read/write helpers

**Files:**
- Create: `server/state.py`
- Test: `tests/server/test_state.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/server/test_state.py
from __future__ import annotations

from pathlib import Path

import pytest

from server.config import IngestionConfig
from server.ingest import ingest_book
from server.state import (
    BookMeta,
    ChapterMeta,
    ChapterStatus,
    list_books,
    load_book_meta,
    load_chapter_meta,
    save_chapter_meta,
)


@pytest.fixture
def ingested(translate_root: Path, fixtures_dir: Path):
    return ingest_book(
        translated_path=fixtures_dir / "sample-fr-folder",
        english_path=fixtures_dir / "sample-en-folder",
        language_pair=("en", "fr"),
        ingestion=IngestionConfig(),
    )


def test_load_book_meta_returns_typed(ingested) -> None:
    meta = load_book_meta(ingested.slug)
    assert isinstance(meta, BookMeta)
    assert meta.slug == ingested.slug
    assert meta.language_pair.from_ == "en"
    assert meta.language_pair.to == "fr"
    assert len(meta.chapters) == 3
    assert all(c.status == ChapterStatus.UNTOUCHED for c in meta.chapters)


def test_load_chapter_meta_returns_default_when_missing(ingested) -> None:
    cm = load_chapter_meta(ingested.slug, n=1)
    assert isinstance(cm, ChapterMeta)
    assert cm.n == 1
    assert cm.status == ChapterStatus.UNTOUCHED
    assert cm.current_round == 0
    assert cm.rounds == []


def test_save_chapter_meta_persists(ingested) -> None:
    cm = ChapterMeta(n=2, status=ChapterStatus.IN_PROGRESS, current_round=1)
    cm.models.editor = "anthropic/claude-sonnet-4"
    save_chapter_meta(ingested.slug, cm)
    loaded = load_chapter_meta(ingested.slug, n=2)
    assert loaded.status == ChapterStatus.IN_PROGRESS
    assert loaded.current_round == 1
    assert loaded.models.editor == "anthropic/claude-sonnet-4"


def test_list_books_returns_only_book_dirs(ingested, translate_root: Path) -> None:
    # ingested is one book; the prompts/ and config.json should not be returned.
    from server.config import save_config, Config
    save_config(Config())
    from server.prompts import load_prompts, PromptKind
    load_prompts(PromptKind.EDITOR)  # creates prompts dir
    slugs = list_books()
    assert ingested.slug in slugs
    assert "prompts" not in slugs
    assert "config.json" not in slugs
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/server/test_state.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'server.state'`

- [ ] **Step 3: Write `server/state.py`**

```python
"""Typed read/write of book and chapter meta.json files."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import List, Optional

from pydantic import BaseModel, Field

from server.paths import book_dir, translate_root


class ChapterStatus(str, Enum):
    UNTOUCHED = "untouched"
    IN_PROGRESS = "in_progress"
    DONE = "done"


class LanguagePair(BaseModel):
    from_: str = Field(alias="from")
    to: str

    model_config = {"populate_by_name": True}


class SourceRef(BaseModel):
    path: str
    format: str


class BookSources(BaseModel):
    translated: SourceRef
    english: SourceRef


class ChapterEntry(BaseModel):
    n: int
    title: str
    status: ChapterStatus = ChapterStatus.UNTOUCHED


class BookMeta(BaseModel):
    slug: str
    created_at: str
    sources: BookSources
    language_pair: LanguagePair
    chapters: List[ChapterEntry]


class Models(BaseModel):
    editor: str = ""
    reviewer: str = ""


class PromptsUsed(BaseModel):
    editor_version: Optional[str] = None
    reviewer_version: Optional[str] = None


class RoundEntry(BaseModel):
    n: int
    editor_completed_at: Optional[str] = None
    reviewer_completed_at: Optional[str] = None


class ChapterMeta(BaseModel):
    n: int
    status: ChapterStatus = ChapterStatus.UNTOUCHED
    current_round: int = 0
    models: Models = Field(default_factory=Models)
    prompts_used: PromptsUsed = Field(default_factory=PromptsUsed)
    rounds: List[RoundEntry] = Field(default_factory=list)


def load_book_meta(slug: str) -> BookMeta:
    p = book_dir(slug) / "meta.json"
    return BookMeta.model_validate_json(p.read_text())


def save_book_meta(meta: BookMeta) -> None:
    p = book_dir(meta.slug) / "meta.json"
    p.write_text(meta.model_dump_json(indent=2, by_alias=True))


def load_chapter_meta(slug: str, *, n: int) -> ChapterMeta:
    p = book_dir(slug) / "chapters" / f"ch{n:02d}" / "meta.json"
    if not p.exists():
        return ChapterMeta(n=n)
    return ChapterMeta.model_validate_json(p.read_text())


def save_chapter_meta(slug: str, meta: ChapterMeta) -> None:
    cdir = book_dir(slug) / "chapters" / f"ch{meta.n:02d}"
    cdir.mkdir(parents=True, exist_ok=True)
    (cdir / "meta.json").write_text(meta.model_dump_json(indent=2))


def list_books() -> List[str]:
    root = translate_root()
    if not root.exists():
        return []
    return sorted(
        d.name
        for d in root.iterdir()
        if d.is_dir() and (d / "meta.json").exists()
    )


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `pytest tests/server/test_state.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add server/state.py tests/server/test_state.py
git commit -m "feat(server): typed book + chapter meta.json read/write helpers"
```

---

## Phase 11 — Bilingual Payload Rendering

### Task 11.1: Render `[N]\nXX:\nYY:` blocks from two `ParsedDoc`s

**Files:**
- Create: `server/payload.py`
- Test: `tests/server/test_payload.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/server/test_payload.py
from __future__ import annotations

import pytest

from server.docx_io import ParsedDoc, Paragraph
from server.payload import (
    PayloadParseError,
    parse_target_lines,
    render_payload,
)


def test_render_basic_two_paragraph_pair():
    en = ParsedDoc(paragraphs=[
        Paragraph(style="heading-1", text="Chapter 1"),
        Paragraph(style="normal", text="Hello."),
    ])
    fr = ParsedDoc(paragraphs=[
        Paragraph(style="heading-1", text="Chapitre 1"),
        Paragraph(style="normal", text="Bonjour."),
    ])
    rendered = render_payload(en, fr, source_code="EN", target_code="FR")
    assert rendered == (
        "[1]\n"
        "EN: # Chapter 1\n"
        "FR: # Chapitre 1\n"
        "\n"
        "[2]\n"
        "EN: Hello.\n"
        "FR: Bonjour.\n"
    )


def test_render_inline_markup_passthrough():
    en = ParsedDoc(paragraphs=[Paragraph(style="normal", text="The *cold* hand.")])
    fr = ParsedDoc(paragraphs=[Paragraph(style="normal", text="La main *froide*.")])
    out = render_payload(en, fr, source_code="EN", target_code="FR")
    assert "EN: The *cold* hand." in out
    assert "FR: La main *froide*." in out


def test_render_paragraph_count_mismatch_raises():
    en = ParsedDoc(paragraphs=[Paragraph(style="normal", text="a")])
    fr = ParsedDoc(paragraphs=[
        Paragraph(style="normal", text="a"),
        Paragraph(style="normal", text="b"),
    ])
    with pytest.raises(ValueError, match="paragraph count"):
        render_payload(en, fr, source_code="EN", target_code="FR")


def test_parse_target_lines_round_trips_render():
    en = ParsedDoc(paragraphs=[
        Paragraph(style="heading-1", text="Chapter 1"),
        Paragraph(style="normal", text="Hello *there*."),
    ])
    fr = ParsedDoc(paragraphs=[
        Paragraph(style="heading-1", text="Chapitre 1"),
        Paragraph(style="normal", text="Bonjour *là*."),
    ])
    rendered = render_payload(en, fr, source_code="EN", target_code="FR")
    # Simulate what an Editor would return: only target-language lines.
    editor_response = "\n".join([
        "[1]",
        "FR: # Chapitre Un",
        "",
        "[2]",
        "FR: Salut *là*.",
    ])
    parsed = parse_target_lines(editor_response, target_code="FR", expected_count=2)
    assert parsed.paragraphs[0].style == "heading-1"
    assert parsed.paragraphs[0].text == "Chapitre Un"
    assert parsed.paragraphs[1].style == "normal"
    assert parsed.paragraphs[1].text == "Salut *là*."


def test_parse_target_lines_wrong_count_raises():
    response = "[1]\nFR: only one\n"
    with pytest.raises(PayloadParseError):
        parse_target_lines(response, target_code="FR", expected_count=2)


def test_parse_target_lines_missing_prefix_raises():
    response = "[1]\nXX: wrong prefix\n[2]\nFR: ok\n"
    with pytest.raises(PayloadParseError):
        parse_target_lines(response, target_code="FR", expected_count=2)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/server/test_payload.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'server.payload'`

- [ ] **Step 3: Write `server/payload.py`**

```python
"""Bilingual paragraph-aligned payload format used to talk to LLMs.

Wire format:
    [1]
    EN: <english paragraph 1, with optional `# ` heading prefix>
    FR: <french paragraph 1>

    [2]
    ...

Headings are prefixed with `# ` on the line. Italic/bold inline markers (`*x*`,
`**x**`) are passed through verbatim.
"""
from __future__ import annotations

import re
from typing import List

from server.docx_io import ParsedDoc, Paragraph


class PayloadParseError(Exception):
    pass


def _prefix(p: Paragraph) -> str:
    return "# " if p.style.startswith("heading-") else ""


def render_payload(
    en: ParsedDoc,
    target: ParsedDoc,
    *,
    source_code: str,
    target_code: str,
) -> str:
    if len(en.paragraphs) != len(target.paragraphs):
        raise ValueError(
            f"paragraph count mismatch: source={len(en.paragraphs)}, target={len(target.paragraphs)}"
        )
    src = source_code.upper()
    tgt = target_code.upper()
    out: list[str] = []
    for i, (e, t) in enumerate(zip(en.paragraphs, target.paragraphs), start=1):
        out.append(f"[{i}]")
        out.append(f"{src}: {_prefix(e)}{e.text}")
        out.append(f"{tgt}: {_prefix(t)}{t.text}")
        out.append("")
    return "\n".join(out)


_BLOCK_RE = re.compile(r"\[(\d+)\]")


def parse_target_lines(
    text: str,
    *,
    target_code: str,
    expected_count: int,
) -> ParsedDoc:
    """Extract target-language paragraphs from a model response.

    Discards the source lines (if present), expects one target line per [N] block,
    and reconstructs heading vs normal style from a leading `# ` marker.
    """
    tgt = f"{target_code.upper()}:"
    blocks = _split_blocks(text)
    if len(blocks) != expected_count:
        raise PayloadParseError(
            f"expected {expected_count} blocks, found {len(blocks)}"
        )
    paragraphs: List[Paragraph] = []
    for idx, block in enumerate(blocks, start=1):
        target_line = next(
            (line for line in block.splitlines() if line.lstrip().startswith(tgt)),
            None,
        )
        if target_line is None:
            raise PayloadParseError(f"block {idx}: no `{tgt}` line found")
        body = target_line.lstrip()[len(tgt):].strip()
        style = "normal"
        if body.startswith("# "):
            style = "heading-1"
            body = body[2:]
        paragraphs.append(Paragraph(style=style, text=body))
    return ParsedDoc(paragraphs=paragraphs)


def _split_blocks(text: str) -> List[str]:
    """Split a payload-style response into per-`[N]` blocks (ignoring header prefix text)."""
    parts = _BLOCK_RE.split(text)
    # Pattern split returns: [pre, "1", block1_text, "2", block2_text, ...]
    if len(parts) < 3:
        return []
    blocks: List[str] = []
    # parts[0] is anything before the first [N]; ignore.
    # parts[1::2] are the indices, parts[2::2] are the block bodies.
    for body in parts[2::2]:
        blocks.append(body.strip())
    return blocks
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `pytest tests/server/test_payload.py -v`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add server/payload.py tests/server/test_payload.py
git commit -m "feat(server): bilingual paragraph-aligned payload renderer + parser"
```

---

## Phase 12 — OpenRouter Client with Retry

### Task 12.1: HTTP client with auto-retry on transient failures

**Files:**
- Create: `server/openrouter.py`
- Test: `tests/server/test_openrouter.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/server/test_openrouter.py
from __future__ import annotations

import json
from typing import List

import httpx
import pytest
import respx

from server.errors import ConfigurationError, TransientError
from server.openrouter import OpenRouterClient


@pytest.fixture
def client() -> OpenRouterClient:
    return OpenRouterClient(api_key="sk-or-test", base_url="https://openrouter.example/api/v1")


@respx.mock
async def test_chat_returns_response_text(client: OpenRouterClient) -> None:
    respx.post("https://openrouter.example/api/v1/chat/completions").mock(
        return_value=httpx.Response(200, json={
            "choices": [{"message": {"content": "hello"}}]
        })
    )
    out = await client.chat(
        model="anthropic/claude-sonnet-4",
        system="be brief",
        user="hi",
    )
    assert out == "hello"


@respx.mock
async def test_chat_retries_on_5xx(client: OpenRouterClient) -> None:
    route = respx.post("https://openrouter.example/api/v1/chat/completions")
    route.side_effect = [
        httpx.Response(503),
        httpx.Response(503),
        httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]}),
    ]
    out = await client.chat(
        model="m", system="s", user="u",
        retry_delays=[0, 0, 0],  # no real sleeps in tests
    )
    assert out == "ok"
    assert route.call_count == 3


@respx.mock
async def test_chat_raises_transient_after_three_failures(client: OpenRouterClient) -> None:
    respx.post("https://openrouter.example/api/v1/chat/completions").mock(
        return_value=httpx.Response(500)
    )
    with pytest.raises(TransientError):
        await client.chat(
            model="m", system="s", user="u",
            retry_delays=[0, 0, 0],
        )


@respx.mock
async def test_chat_raises_configuration_on_401(client: OpenRouterClient) -> None:
    respx.post("https://openrouter.example/api/v1/chat/completions").mock(
        return_value=httpx.Response(401, json={"error": {"message": "bad key"}})
    )
    with pytest.raises(ConfigurationError):
        await client.chat(model="m", system="s", user="u")


@respx.mock
async def test_list_models_returns_ids(client: OpenRouterClient) -> None:
    respx.get("https://openrouter.example/api/v1/models").mock(
        return_value=httpx.Response(200, json={
            "data": [
                {"id": "anthropic/claude-sonnet-4"},
                {"id": "openai/gpt-5"},
            ]
        })
    )
    ids = await client.list_models()
    assert ids == ["anthropic/claude-sonnet-4", "openai/gpt-5"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/server/test_openrouter.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'server.openrouter'`

- [ ] **Step 3: Write `server/openrouter.py`**

```python
"""Minimal OpenRouter HTTP client with auto-retry on transient failures."""
from __future__ import annotations

import asyncio
from typing import List, Optional, Sequence

import httpx

from server.errors import ConfigurationError, TransientError

DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_RETRY_DELAYS = (1.0, 2.0, 4.0)  # 3 attempts at 1s, 2s, 4s


class OpenRouterClient:
    def __init__(self, *, api_key: str, base_url: str = DEFAULT_BASE_URL):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://localhost.translate.local",
            "X-Title": "Translate",
        }

    async def list_models(self) -> List[str]:
        async with httpx.AsyncClient(timeout=30) as h:
            r = await h.get(f"{self.base_url}/models", headers=self._headers)
            r.raise_for_status()
            return [m["id"] for m in r.json()["data"]]

    async def chat(
        self,
        *,
        model: str,
        system: str,
        user: str,
        retry_delays: Sequence[float] = DEFAULT_RETRY_DELAYS,
        on_retry=None,  # callable(attempt:int, total:int)
    ) -> str:
        body = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        total = len(retry_delays)
        last_exc: Optional[Exception] = None
        async with httpx.AsyncClient(timeout=120) as h:
            for attempt, delay in enumerate(retry_delays, start=1):
                if attempt > 1 and on_retry is not None:
                    on_retry(attempt, total)
                try:
                    r = await h.post(
                        f"{self.base_url}/chat/completions",
                        headers=self._headers,
                        json=body,
                    )
                    if r.status_code in (401, 403):
                        raise ConfigurationError(f"OpenRouter rejected the API key ({r.status_code})")
                    if r.status_code == 404:
                        raise ConfigurationError(f"Model not available: {model}")
                    if r.status_code >= 500 or r.status_code == 429:
                        last_exc = TransientError(f"HTTP {r.status_code}")
                        if attempt < total:
                            await asyncio.sleep(delay)
                            continue
                        raise last_exc
                    r.raise_for_status()
                    return r.json()["choices"][0]["message"]["content"]
                except httpx.HTTPError as exc:
                    last_exc = TransientError(str(exc))
                    if attempt < total:
                        await asyncio.sleep(delay)
                        continue
                    raise last_exc
        raise TransientError("retry loop exited without result")  # unreachable
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `pytest tests/server/test_openrouter.py -v`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add server/openrouter.py tests/server/test_openrouter.py
git commit -m "feat(server): OpenRouter client with auto-retry and error classification"
```

---

## Phase 13 — Editor Pass

### Task 13.1: Run an Editor pass against parsed source + translation

**Files:**
- Create: `server/rounds.py`
- Test: `tests/server/test_rounds.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/server/test_rounds.py
from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from server.config import IngestionConfig
from server.docx_io import ParsedDoc, Paragraph
from server.errors import RecoverableError
from server.ingest import ingest_book
from server.rounds import (
    LANGUAGE_NAMES,
    render_editor_prompt,
    render_reviewer_prompt,
    run_editor_pass,
)


@pytest.fixture
def ingested(translate_root: Path, fixtures_dir: Path):
    return ingest_book(
        translated_path=fixtures_dir / "sample-fr-folder",
        english_path=fixtures_dir / "sample-en-folder",
        language_pair=("en", "fr"),
        ingestion=IngestionConfig(),
    )


def test_render_editor_prompt_substitutes_target_language():
    rendered = render_editor_prompt(
        template="Translate to {TARGET_LANG_NAME}; return {TARGET_LANG_CODE}: lines.",
        target_code="fr",
    )
    assert rendered == "Translate to French; return FR: lines."


def test_render_reviewer_prompt_substitutes_target_language():
    rendered = render_reviewer_prompt(
        template="reviewing {TARGET_LANG_NAME}",
        target_code="es",
    )
    assert rendered == "reviewing Spanish"


async def test_run_editor_pass_writes_round_files(ingested) -> None:
    en = ParsedDoc(paragraphs=[
        Paragraph(style="heading-1", text="Chapter 1"),
        Paragraph(style="normal", text="Hello."),
    ])
    tr = ParsedDoc(paragraphs=[
        Paragraph(style="heading-1", text="Chapitre 1"),
        Paragraph(style="normal", text="Bonjour."),
    ])

    fake_response = "[1]\nFR: # Chapitre Un\n\n[2]\nFR: Salut.\n"
    fake_client = AsyncMock()
    fake_client.chat = AsyncMock(return_value=fake_response)

    result = await run_editor_pass(
        client=fake_client,
        slug=ingested.slug,
        chapter_n=1,
        round_n=1,
        en_doc=en,
        target_doc=tr,
        source_code="en",
        target_code="fr",
        editor_prompt_template="be brief, target {TARGET_LANG_NAME}",
        prior_reviewer_suggestions=None,
        model="anthropic/claude-sonnet-4",
    )
    assert result.paragraphs[0].style == "heading-1"
    assert result.paragraphs[0].text == "Chapitre Un"
    # Round files written.
    chdir = Path(ingested.book_dir) / "chapters" / "ch01"
    assert (chdir / "round-1-editor.docx").exists()
    assert (chdir / "round-1-editor.json").exists()


async def test_run_editor_pass_raises_recoverable_on_paragraph_count_mismatch(ingested) -> None:
    en = ParsedDoc(paragraphs=[Paragraph(style="normal", text="a"), Paragraph(style="normal", text="b")])
    tr = ParsedDoc(paragraphs=[Paragraph(style="normal", text="a"), Paragraph(style="normal", text="b")])
    bad_response = "[1]\nFR: only one\n"  # missing block 2
    fake_client = AsyncMock()
    fake_client.chat = AsyncMock(return_value=bad_response)
    with pytest.raises(RecoverableError):
        await run_editor_pass(
            client=fake_client,
            slug=ingested.slug, chapter_n=1, round_n=1,
            en_doc=en, target_doc=tr,
            source_code="en", target_code="fr",
            editor_prompt_template="x",
            prior_reviewer_suggestions=None,
            model="m",
        )
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/server/test_rounds.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'server.rounds'`

- [ ] **Step 3: Write `server/rounds.py` (Editor pass only for now)**

```python
"""Editor and Reviewer round passes."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from server.docx_io import ParsedDoc, write_docx
from server.errors import RecoverableError
from server.openrouter import OpenRouterClient
from server.paths import book_dir
from server.payload import PayloadParseError, parse_target_lines, render_payload

LANGUAGE_NAMES = {
    "en": "English",
    "fr": "French",
    "es": "Spanish",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "nl": "Dutch",
    "pl": "Polish",
    "ru": "Russian",
    "ja": "Japanese",
    "zh": "Chinese",
    "ko": "Korean",
    "ar": "Arabic",
    "he": "Hebrew",
}


def _lang_name(code: str) -> str:
    return LANGUAGE_NAMES.get(code.lower(), code.upper())


def render_editor_prompt(*, template: str, target_code: str) -> str:
    return template.replace("{TARGET_LANG_CODE}", target_code.upper()).replace(
        "{TARGET_LANG_NAME}", _lang_name(target_code)
    )


def render_reviewer_prompt(*, template: str, target_code: str) -> str:
    return template.replace("{TARGET_LANG_CODE}", target_code.upper()).replace(
        "{TARGET_LANG_NAME}", _lang_name(target_code)
    )


def _chapter_dir(slug: str, n: int) -> Path:
    d = book_dir(slug) / "chapters" / f"ch{n:02d}"
    d.mkdir(parents=True, exist_ok=True)
    return d


async def run_editor_pass(
    *,
    client: OpenRouterClient,
    slug: str,
    chapter_n: int,
    round_n: int,
    en_doc: ParsedDoc,
    target_doc: ParsedDoc,
    source_code: str,
    target_code: str,
    editor_prompt_template: str,
    prior_reviewer_suggestions: Optional[list],
    model: str,
    on_retry=None,
) -> ParsedDoc:
    """Run the Editor pass and persist round-N-editor.{docx,json}."""
    payload = render_payload(en_doc, target_doc, source_code=source_code, target_code=target_code)
    user_msg = payload
    if prior_reviewer_suggestions:
        user_msg = (
            "Prior reviewer suggestions (incorporate the ones you agree with):\n"
            + json.dumps(prior_reviewer_suggestions, ensure_ascii=False, indent=2)
            + "\n\n"
            + payload
        )
    system = render_editor_prompt(template=editor_prompt_template, target_code=target_code)
    raw = await client.chat(model=model, system=system, user=user_msg, on_retry=on_retry)

    try:
        edited = parse_target_lines(
            raw,
            target_code=target_code,
            expected_count=len(en_doc.paragraphs),
        )
    except PayloadParseError as exc:
        raise RecoverableError(str(exc)) from exc

    cdir = _chapter_dir(slug, chapter_n)
    write_docx(edited, cdir / f"round-{round_n}-editor.docx")
    (cdir / f"round-{round_n}-editor.json").write_text(edited.model_dump_json(indent=2))
    return edited
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `pytest tests/server/test_rounds.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add server/rounds.py tests/server/test_rounds.py
git commit -m "feat(server): Editor round pass with prompt rendering and persistence"
```

---

## Phase 14 — Reviewer Pass

### Task 14.1: Run a Reviewer pass and persist suggestions JSON

**Files:**
- Modify: `server/rounds.py` (add `run_reviewer_pass` + suggestion parser)
- Modify: `tests/server/test_rounds.py`

- [ ] **Step 1: Add the failing tests**

Append to `tests/server/test_rounds.py`:

```python
import json as _json

from server.rounds import run_reviewer_pass


async def test_run_reviewer_pass_persists_suggestions(ingested) -> None:
    en = ParsedDoc(paragraphs=[Paragraph(style="normal", text="Hello.")])
    tr = ParsedDoc(paragraphs=[Paragraph(style="normal", text="Bonjour.")])
    suggestions_json = '[{"quote": "Bonjour.", "comment": "consider Salut"}]'
    fake_client = AsyncMock()
    fake_client.chat = AsyncMock(return_value=suggestions_json)

    result = await run_reviewer_pass(
        client=fake_client,
        slug=ingested.slug,
        chapter_n=1,
        round_n=1,
        en_doc=en,
        target_doc=tr,
        source_code="en",
        target_code="fr",
        reviewer_prompt_template="x",
        model="openai/gpt-5",
    )
    assert result.suggestions[0].quote == "Bonjour."
    f = Path(ingested.book_dir) / "chapters" / "ch01" / "round-1-reviewer.json"
    assert f.exists()
    data = _json.loads(f.read_text())
    assert data["raw_response"] == suggestions_json


async def test_run_reviewer_pass_keeps_raw_when_parse_fails(ingested) -> None:
    en = ParsedDoc(paragraphs=[Paragraph(style="normal", text="Hello.")])
    tr = ParsedDoc(paragraphs=[Paragraph(style="normal", text="Bonjour.")])
    bad_json = "this is not JSON at all"
    fake_client = AsyncMock()
    fake_client.chat = AsyncMock(return_value=bad_json)

    result = await run_reviewer_pass(
        client=fake_client,
        slug=ingested.slug, chapter_n=1, round_n=1,
        en_doc=en, target_doc=tr,
        source_code="en", target_code="fr",
        reviewer_prompt_template="x",
        model="m",
    )
    assert result.suggestions == []
    assert result.raw_response == bad_json
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/server/test_rounds.py -v`
Expected: FAIL — `ImportError: cannot import name 'run_reviewer_pass'`

- [ ] **Step 3: Add reviewer pass and result model to `server/rounds.py`**

Append to `server/rounds.py`:

```python
import re
from typing import List

from pydantic import BaseModel, Field

from server.state import now_iso


class Suggestion(BaseModel):
    id: int
    quote: str
    comment: str


class ReviewerResult(BaseModel):
    round: int
    model: str
    completed_at: str
    suggestions: List[Suggestion] = Field(default_factory=list)
    raw_response: str


_JSON_LIST_RE = re.compile(r"\[\s*[\{\]].*\]", re.DOTALL)


def _try_parse_suggestions(raw: str) -> List[Suggestion]:
    candidate = raw.strip()
    # If the model wrapped JSON in prose, try to extract the first JSON list.
    if not candidate.startswith("["):
        m = _JSON_LIST_RE.search(candidate)
        if m:
            candidate = m.group(0)
        else:
            return []
    try:
        data = json.loads(candidate)
    except json.JSONDecodeError:
        return []
    out: List[Suggestion] = []
    for i, item in enumerate(data, start=1):
        if not isinstance(item, dict):
            continue
        q = item.get("quote")
        c = item.get("comment")
        if isinstance(q, str) and isinstance(c, str):
            out.append(Suggestion(id=i, quote=q, comment=c))
    return out


async def run_reviewer_pass(
    *,
    client: OpenRouterClient,
    slug: str,
    chapter_n: int,
    round_n: int,
    en_doc: ParsedDoc,
    target_doc: ParsedDoc,
    source_code: str,
    target_code: str,
    reviewer_prompt_template: str,
    model: str,
    on_retry=None,
) -> ReviewerResult:
    payload = render_payload(en_doc, target_doc, source_code=source_code, target_code=target_code)
    system = render_reviewer_prompt(template=reviewer_prompt_template, target_code=target_code)
    raw = await client.chat(model=model, system=system, user=payload, on_retry=on_retry)

    suggestions = _try_parse_suggestions(raw)
    result = ReviewerResult(
        round=round_n,
        model=model,
        completed_at=now_iso(),
        suggestions=suggestions,
        raw_response=raw,
    )
    cdir = _chapter_dir(slug, chapter_n)
    (cdir / f"round-{round_n}-reviewer.json").write_text(result.model_dump_json(indent=2))
    return result
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `pytest tests/server/test_rounds.py -v`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add server/rounds.py tests/server/test_rounds.py
git commit -m "feat(server): Reviewer round pass with tolerant JSON parsing"
```

---

## Phase 15 — Finalize

### Task 15.1: Write `final.docx` from the latest Editor output

**Files:**
- Create: `server/finalize.py`
- Test: `tests/server/test_finalize.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/server/test_finalize.py
from __future__ import annotations

from pathlib import Path

import pytest

from server.config import IngestionConfig
from server.docx_io import ParsedDoc, Paragraph, parse_docx, write_docx
from server.finalize import FinalizeError, finalize_chapter
from server.ingest import ingest_book
from server.state import ChapterMeta, ChapterStatus, load_book_meta, save_chapter_meta


@pytest.fixture
def ingested(translate_root: Path, fixtures_dir: Path):
    return ingest_book(
        translated_path=fixtures_dir / "sample-fr-folder",
        english_path=fixtures_dir / "sample-en-folder",
        language_pair=("en", "fr"),
        ingestion=IngestionConfig(),
    )


def test_finalize_writes_final_docx_and_marks_done(ingested) -> None:
    # Simulate a completed round 1 by writing round-1-editor.docx + meta.
    cdir = Path(ingested.book_dir) / "chapters" / "ch01"
    cdir.mkdir(parents=True, exist_ok=True)
    parsed = ParsedDoc(paragraphs=[
        Paragraph(style="heading-1", text="Chapitre Un"),
        Paragraph(style="normal", text="Salut."),
    ])
    write_docx(parsed, cdir / "round-1-editor.docx")
    save_chapter_meta(ingested.slug, ChapterMeta(n=1, status=ChapterStatus.IN_PROGRESS, current_round=1))
    finalize_chapter(slug=ingested.slug, chapter_n=1)
    final = cdir / "final.docx"
    assert final.exists()
    re_parsed = parse_docx(final)
    assert re_parsed.paragraphs[0].text == "Chapitre Un"
    # Book meta updated.
    bm = load_book_meta(ingested.slug)
    assert bm.chapters[0].status == ChapterStatus.DONE


def test_finalize_raises_when_no_round_complete(ingested) -> None:
    with pytest.raises(FinalizeError):
        finalize_chapter(slug=ingested.slug, chapter_n=1)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/server/test_finalize.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'server.finalize'`

- [ ] **Step 3: Write `server/finalize.py`**

```python
"""Finalize a chapter by promoting the latest Editor output to final.docx."""
from __future__ import annotations

import shutil

from server.paths import book_dir
from server.state import ChapterStatus, load_book_meta, load_chapter_meta, save_book_meta, save_chapter_meta


class FinalizeError(Exception):
    pass


def finalize_chapter(*, slug: str, chapter_n: int) -> None:
    cm = load_chapter_meta(slug, n=chapter_n)
    if cm.current_round < 1:
        raise FinalizeError(
            f"chapter {chapter_n} has no completed Editor round yet"
        )
    cdir = book_dir(slug) / "chapters" / f"ch{chapter_n:02d}"
    src = cdir / f"round-{cm.current_round}-editor.docx"
    if not src.exists():
        raise FinalizeError(f"missing {src.name}")
    shutil.copyfile(src, cdir / "final.docx")
    cm.status = ChapterStatus.DONE
    save_chapter_meta(slug, cm)
    bm = load_book_meta(slug)
    for entry in bm.chapters:
        if entry.n == chapter_n:
            entry.status = ChapterStatus.DONE
    save_book_meta(bm)
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `pytest tests/server/test_finalize.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add server/finalize.py tests/server/test_finalize.py
git commit -m "feat(server): finalize chapter to final.docx and mark done"
```

---

## Phase 16 — SSE Progress Events

### Task 16.1: In-process pub/sub for round progress events

**Files:**
- Create: `server/sse.py`
- Test: `tests/server/test_sse.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/server/test_sse.py
from __future__ import annotations

import asyncio

import pytest

from server.sse import EventBus


async def test_publish_then_subscribe_delivers_event() -> None:
    bus = EventBus()
    received: list[dict] = []

    async def consume():
        async for evt in bus.subscribe(timeout=0.5):
            received.append(evt)
            if evt["type"] == "stop":
                break

    task = asyncio.create_task(consume())
    await asyncio.sleep(0)  # let consumer enter the loop
    bus.publish({"type": "status", "text": "Round 1 — calling Editor..."})
    bus.publish({"type": "stop"})
    await task
    assert received[0]["text"].startswith("Round 1")
    assert received[-1]["type"] == "stop"


async def test_multiple_subscribers_each_get_events() -> None:
    bus = EventBus()
    a: list[dict] = []
    b: list[dict] = []

    async def consume(target: list[dict]):
        async for evt in bus.subscribe(timeout=0.3):
            target.append(evt)
            if evt.get("type") == "stop":
                break

    ta = asyncio.create_task(consume(a))
    tb = asyncio.create_task(consume(b))
    await asyncio.sleep(0)
    bus.publish({"type": "status", "text": "x"})
    bus.publish({"type": "stop"})
    await asyncio.gather(ta, tb)
    assert len(a) == len(b) == 2
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/server/test_sse.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'server.sse'`

- [ ] **Step 3: Write `server/sse.py`**

```python
"""In-process pub/sub for streaming round progress to SSE subscribers."""
from __future__ import annotations

import asyncio
from typing import AsyncIterator, Set


class EventBus:
    def __init__(self) -> None:
        self._subscribers: Set[asyncio.Queue] = set()

    def publish(self, event: dict) -> None:
        for q in list(self._subscribers):
            q.put_nowait(event)

    async def subscribe(self, *, timeout: float | None = None) -> AsyncIterator[dict]:
        q: asyncio.Queue = asyncio.Queue()
        self._subscribers.add(q)
        try:
            while True:
                if timeout is None:
                    evt = await q.get()
                else:
                    try:
                        evt = await asyncio.wait_for(q.get(), timeout=timeout)
                    except asyncio.TimeoutError:
                        return
                yield evt
        finally:
            self._subscribers.discard(q)
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `pytest tests/server/test_sse.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add server/sse.py tests/server/test_sse.py
git commit -m "feat(server): in-process pub/sub for SSE progress events"
```

---

## Phase 17 — HTTP Routes

### Task 17.1: App factory + dependency wiring

**Files:**
- Create: `server/main.py` (the FastAPI app + lifespan)
- Create: `server/routes/__init__.py`
- Test: `tests/server/test_app_health.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/server/test_app_health.py
from fastapi.testclient import TestClient

from server.main import create_app


def test_health_returns_ok():
    app = create_app()
    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/server/test_app_health.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'server.main'`

- [ ] **Step 3: Write `server/main.py` (skeleton) and `server/routes/__init__.py`**

`server/routes/__init__.py`:

```python
"""HTTP route modules — each registers its own APIRouter."""
```

`server/main.py`:

```python
"""FastAPI app factory + CLI launcher."""
from __future__ import annotations

from fastapi import FastAPI

from server.sse import EventBus

# Process-global event bus shared across requests.
EVENT_BUS = EventBus()


def create_app() -> FastAPI:
    app = FastAPI(title="Translate", version="0.1.0")

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    return app
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/server/test_app_health.py -v`
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add server/main.py server/routes/__init__.py tests/server/test_app_health.py
git commit -m "feat(server): FastAPI app factory + /health"
```

### Task 17.2: Settings routes (`GET/PUT /settings`)

**Files:**
- Create: `server/routes/settings.py`
- Modify: `server/main.py` (register router)
- Test: `tests/server/test_routes_settings.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/server/test_routes_settings.py
from pathlib import Path

from fastapi.testclient import TestClient

from server.main import create_app


def test_get_settings_returns_defaults_when_unset(translate_root: Path) -> None:
    client = TestClient(create_app())
    r = client.get("/settings")
    assert r.status_code == 200
    assert r.json()["openrouter_api_key"] == ""


def test_put_settings_persists(translate_root: Path) -> None:
    client = TestClient(create_app())
    r = client.put("/settings", json={
        "openrouter_api_key": "sk-or-test",
        "default_models": {"editor": "anthropic/claude-sonnet-4", "reviewer": "openai/gpt-5"},
    })
    assert r.status_code == 200
    r2 = client.get("/settings")
    assert r2.json()["openrouter_api_key"] == "sk-or-test"
    assert r2.json()["default_models"]["editor"] == "anthropic/claude-sonnet-4"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/server/test_routes_settings.py -v`
Expected: FAIL — 404 (route not registered).

- [ ] **Step 3: Write `server/routes/settings.py`**

```python
from fastapi import APIRouter

from server.config import Config, load_config, save_config

router = APIRouter()


@router.get("/settings", response_model=Config)
def get_settings() -> Config:
    return load_config()


@router.put("/settings", response_model=Config)
def put_settings(cfg: Config) -> Config:
    save_config(cfg)
    return load_config()
```

- [ ] **Step 4: Register the router in `server/main.py`**

In `create_app`, after the `health` route:

```python
    from server.routes import settings as settings_routes
    app.include_router(settings_routes.router)
```

- [ ] **Step 5: Run tests to verify all pass**

Run: `pytest tests/server/test_routes_settings.py -v`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add server/routes/settings.py server/main.py tests/server/test_routes_settings.py
git commit -m "feat(server): GET/PUT /settings"
```

### Task 17.3: Prompts routes (`GET/PUT /prompts/<kind>`, history actions)

**Files:**
- Create: `server/routes/prompts.py`
- Modify: `server/main.py`
- Test: `tests/server/test_routes_prompts.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/server/test_routes_prompts.py
from pathlib import Path

from fastapi.testclient import TestClient

from server.main import create_app


def test_get_prompts_returns_seeded_v1(translate_root: Path) -> None:
    client = TestClient(create_app())
    r = client.get("/prompts/editor")
    assert r.status_code == 200
    body = r.json()
    assert body["current"] == "v1"
    assert len(body["versions"]) == 1


def test_put_prompts_creates_new_version(translate_root: Path) -> None:
    client = TestClient(create_app())
    r = client.put("/prompts/editor", json={"text": "Edited."})
    assert r.status_code == 200
    body = r.json()
    assert body["current"] == "v2"
    assert body["versions"][-1]["text"] == "Edited."


def test_post_restore_creates_new_entry(translate_root: Path) -> None:
    client = TestClient(create_app())
    client.put("/prompts/editor", json={"text": "v2"})  # creates v2
    r = client.post("/prompts/editor/restore/v1")
    assert r.status_code == 200
    body = r.json()
    assert body["current"] == "v3"
    # v3's text equals v1's text.
    assert body["versions"][-1]["text"] == body["versions"][0]["text"]


def test_delete_historical_version(translate_root: Path) -> None:
    client = TestClient(create_app())
    client.put("/prompts/editor", json={"text": "v2"})
    r = client.delete("/prompts/editor/v1")
    assert r.status_code == 200
    body = r.json()
    assert [v["id"] for v in body["versions"]] == ["v2"]


def test_delete_current_version_returns_400(translate_root: Path) -> None:
    client = TestClient(create_app())
    client.put("/prompts/editor", json={"text": "v2"})
    r = client.delete("/prompts/editor/v2")
    assert r.status_code == 400


def test_unknown_kind_returns_404(translate_root: Path) -> None:
    client = TestClient(create_app())
    r = client.get("/prompts/foo")
    assert r.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/server/test_routes_prompts.py -v`
Expected: FAIL — 404s.

- [ ] **Step 3: Write `server/routes/prompts.py`**

```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from server.prompts import (
    PromptKind,
    delete_version,
    load_prompts,
    restore_version,
    save_new_version,
)

router = APIRouter(prefix="/prompts")


class PromptUpdate(BaseModel):
    text: str


def _kind(kind: str) -> PromptKind:
    try:
        return PromptKind(kind)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"unknown prompt kind: {kind}")


@router.get("/{kind}")
def get_prompts(kind: str) -> dict:
    return load_prompts(_kind(kind)).model_dump()


@router.put("/{kind}")
def put_prompts(kind: str, update: PromptUpdate) -> dict:
    save_new_version(_kind(kind), update.text)
    return load_prompts(_kind(kind)).model_dump()


@router.post("/{kind}/restore/{version_id}")
def post_restore(kind: str, version_id: str) -> dict:
    try:
        restore_version(_kind(kind), version_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return load_prompts(_kind(kind)).model_dump()


@router.delete("/{kind}/{version_id}")
def delete_v(kind: str, version_id: str) -> dict:
    try:
        delete_version(_kind(kind), version_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return load_prompts(_kind(kind)).model_dump()
```

- [ ] **Step 4: Register router in `server/main.py`**

In `create_app`:

```python
    from server.routes import prompts as prompts_routes
    app.include_router(prompts_routes.router)
```

- [ ] **Step 5: Run tests to verify all pass**

Run: `pytest tests/server/test_routes_prompts.py -v`
Expected: 6 passed.

- [ ] **Step 6: Commit**

```bash
git add server/routes/prompts.py server/main.py tests/server/test_routes_prompts.py
git commit -m "feat(server): /prompts CRUD with version history"
```

### Task 17.4: Books routes — list, ingest, get state

**Files:**
- Create: `server/routes/books.py`
- Modify: `server/main.py`
- Test: `tests/server/test_routes_books.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/server/test_routes_books.py
from pathlib import Path

from fastapi.testclient import TestClient

from server.main import create_app


def test_get_books_empty(translate_root: Path) -> None:
    client = TestClient(create_app())
    r = client.get("/books")
    assert r.status_code == 200
    assert r.json() == []


def test_post_book_ingests_and_lists(translate_root: Path, fixtures_dir: Path) -> None:
    client = TestClient(create_app())
    r = client.post("/books", json={
        "translated_path": str(fixtures_dir / "sample-fr-folder"),
        "english_path":    str(fixtures_dir / "sample-en-folder"),
        "language_pair":   {"from": "en", "to": "fr"},
    })
    assert r.status_code == 200
    slug = r.json()["slug"]
    list_r = client.get("/books")
    assert slug in list_r.json()


def test_post_book_returns_409_on_chapter_count_mismatch(
    translate_root: Path, fixtures_dir: Path, tmp_path: Path
) -> None:
    short = tmp_path / "short-en"
    short.mkdir()
    src = sorted((fixtures_dir / "sample-en-folder").iterdir())[:2]
    for f in src:
        (short / f.name).write_bytes(f.read_bytes())
    client = TestClient(create_app())
    r = client.post("/books", json={
        "translated_path": str(fixtures_dir / "sample-fr-folder"),
        "english_path":    str(short),
        "language_pair":   {"from": "en", "to": "fr"},
    })
    assert r.status_code == 409
    body = r.json()
    assert body["detail"]["en_count"] == 2
    assert body["detail"]["tr_count"] == 3


def test_get_book_state_returns_meta(translate_root: Path, fixtures_dir: Path) -> None:
    client = TestClient(create_app())
    r = client.post("/books", json={
        "translated_path": str(fixtures_dir / "sample-fr-folder"),
        "english_path":    str(fixtures_dir / "sample-en-folder"),
        "language_pair":   {"from": "en", "to": "fr"},
    })
    slug = r.json()["slug"]
    state = client.get(f"/books/{slug}").json()
    assert state["slug"] == slug
    assert len(state["chapters"]) == 3
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/server/test_routes_books.py -v`
Expected: FAIL — 404s.

- [ ] **Step 3: Write `server/routes/books.py`**

```python
from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from server.config import IngestionConfig, load_config
from server.ingest import ChapterCountMismatch, ingest_book
from server.state import LanguagePair, list_books, load_book_meta

router = APIRouter()


class IngestRequest(BaseModel):
    translated_path: str
    english_path: str
    language_pair: LanguagePair


class IngestResponse(BaseModel):
    slug: str


@router.get("/books", response_model=List[str])
def get_books() -> List[str]:
    return list_books()


@router.post("/books", response_model=IngestResponse)
def post_book(req: IngestRequest) -> IngestResponse:
    cfg = load_config()
    from pathlib import Path
    try:
        result = ingest_book(
            translated_path=Path(req.translated_path),
            english_path=Path(req.english_path),
            language_pair=(req.language_pair.from_, req.language_pair.to),
            ingestion=cfg.ingestion,
        )
    except ChapterCountMismatch as exc:
        raise HTTPException(status_code=409, detail={
            "message": str(exc),
            "en_count": exc.en_count,
            "tr_count": exc.tr_count,
            "en_titles": exc.en_titles,
            "tr_titles": exc.tr_titles,
        })
    return IngestResponse(slug=result.slug)


@router.get("/books/{slug}")
def get_book(slug: str) -> dict:
    try:
        return load_book_meta(slug).model_dump(by_alias=True)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"book not found: {slug}")
```

- [ ] **Step 4: Register router in `server/main.py`**

```python
    from server.routes import books as books_routes
    app.include_router(books_routes.router)
```

- [ ] **Step 5: Run tests to verify all pass**

Run: `pytest tests/server/test_routes_books.py -v`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add server/routes/books.py server/main.py tests/server/test_routes_books.py
git commit -m "feat(server): GET /books, POST /books (ingest), GET /books/<slug>"
```

### Task 17.5: Chapters routes — state, run round, finalize

**Files:**
- Create: `server/routes/chapters.py`
- Modify: `server/main.py`
- Test: `tests/server/test_routes_chapters.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/server/test_routes_chapters.py
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from server.config import Config, save_config
from server.main import create_app
from server.routes import chapters as chapters_routes


@pytest.fixture
def app_with_book(translate_root: Path, fixtures_dir: Path, monkeypatch):
    save_config(Config(openrouter_api_key="sk-or-test",
                       default_models={"editor": "ed", "reviewer": "rv"}))
    client = TestClient(create_app())
    r = client.post("/books", json={
        "translated_path": str(fixtures_dir / "sample-fr-folder"),
        "english_path":    str(fixtures_dir / "sample-en-folder"),
        "language_pair":   {"from": "en", "to": "fr"},
    })
    slug = r.json()["slug"]
    return client, slug


def test_get_chapter_state_initial(app_with_book) -> None:
    client, slug = app_with_book
    r = client.get(f"/books/{slug}/chapter/1/state")
    assert r.status_code == 200
    body = r.json()
    assert body["n"] == 1
    assert body["status"] == "untouched"
    assert body["current_round"] == 0


def test_post_round_editor_runs_pass(app_with_book, monkeypatch) -> None:
    client, slug = app_with_book

    # Force the route to use a mocked client.
    fake_client = AsyncMock()
    fake_client.chat = AsyncMock(return_value="[1]\nFR: # Chapitre 1\n\n[2]\nFR: Salut\n\n[3]\nFR: La main *froide*\n")
    monkeypatch.setattr(chapters_routes, "_make_client", lambda cfg: fake_client)

    r = client.post(
        f"/books/{slug}/chapter/1/round/editor",
        json={"model": "anthropic/claude-sonnet-4"},
    )
    assert r.status_code == 200
    state = client.get(f"/books/{slug}/chapter/1/state").json()
    assert state["current_round"] == 1
    assert state["status"] == "in_progress"


def test_post_round_reviewer_after_editor(app_with_book, monkeypatch) -> None:
    client, slug = app_with_book
    fake_client = AsyncMock()
    fake_client.chat = AsyncMock(side_effect=[
        "[1]\nFR: # Chapitre 1\n\n[2]\nFR: Salut\n\n[3]\nFR: La main *froide*\n",
        '[{"quote": "Salut", "comment": "consider Bonjour"}]',
    ])
    monkeypatch.setattr(chapters_routes, "_make_client", lambda cfg: fake_client)
    client.post(f"/books/{slug}/chapter/1/round/editor", json={"model": "ed"})
    r = client.post(f"/books/{slug}/chapter/1/round/reviewer", json={"model": "rv"})
    assert r.status_code == 200
    body = r.json()
    assert body["suggestions"][0]["quote"] == "Salut"


def test_post_finalize_marks_done(app_with_book, monkeypatch) -> None:
    client, slug = app_with_book
    fake_client = AsyncMock()
    fake_client.chat = AsyncMock(return_value="[1]\nFR: # Chapitre 1\n\n[2]\nFR: Salut\n\n[3]\nFR: La main *froide*\n")
    monkeypatch.setattr(chapters_routes, "_make_client", lambda cfg: fake_client)
    client.post(f"/books/{slug}/chapter/1/round/editor", json={"model": "ed"})
    r = client.post(f"/books/{slug}/chapter/1/finalize")
    assert r.status_code == 200
    state = client.get(f"/books/{slug}/chapter/1/state").json()
    assert state["status"] == "done"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/server/test_routes_chapters.py -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `server/routes/chapters.py`**

```python
from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from server.config import Config, load_config
from server.docx_io import ParsedDoc
from server.errors import ConfigurationError, RecoverableError
from server.finalize import FinalizeError, finalize_chapter
from server.openrouter import OpenRouterClient
from server.paths import book_dir
from server.prompts import PromptKind, load_prompts
from server.rounds import (
    ReviewerResult,
    run_editor_pass,
    run_reviewer_pass,
)
from server.state import (
    ChapterMeta,
    ChapterStatus,
    Models,
    PromptsUsed,
    RoundEntry,
    load_book_meta,
    load_chapter_meta,
    now_iso,
    save_chapter_meta,
)

router = APIRouter()


class RoundRequest(BaseModel):
    model: str


def _make_client(cfg: Config) -> OpenRouterClient:
    if not cfg.openrouter_api_key:
        raise ConfigurationError("OpenRouter API key not configured")
    return OpenRouterClient(api_key=cfg.openrouter_api_key)


def _load_source(slug: str, n: int) -> tuple[ParsedDoc, ParsedDoc]:
    bd = book_dir(slug)
    en = ParsedDoc.model_validate_json((bd / "source-en" / f"ch{n:02d}.json").read_text())
    tr = ParsedDoc.model_validate_json((bd / "source-translated" / f"ch{n:02d}.json").read_text())
    return en, tr


def _current_target_doc(slug: str, n: int, current_round: int) -> ParsedDoc:
    bd = book_dir(slug)
    if current_round < 1:
        return ParsedDoc.model_validate_json((bd / "source-translated" / f"ch{n:02d}.json").read_text())
    return ParsedDoc.model_validate_json(
        (bd / "chapters" / f"ch{n:02d}" / f"round-{current_round}-editor.json").read_text()
    )


def _last_reviewer_suggestions(slug: str, n: int, round_n: int) -> Optional[list]:
    if round_n < 1:
        return None
    p = book_dir(slug) / "chapters" / f"ch{n:02d}" / f"round-{round_n}-reviewer.json"
    if not p.exists():
        return None
    import json
    data = json.loads(p.read_text())
    return data.get("suggestions") or None


@router.get("/books/{slug}/chapter/{n}/state")
def get_chapter_state(slug: str, n: int) -> dict:
    try:
        load_book_meta(slug)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"book not found: {slug}")
    return load_chapter_meta(slug, n=n).model_dump()


@router.post("/books/{slug}/chapter/{n}/round/editor")
async def post_round_editor(slug: str, n: int, req: RoundRequest) -> dict:
    cfg = load_config()
    try:
        client = _make_client(cfg)
    except ConfigurationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    bm = load_book_meta(slug)
    cm = load_chapter_meta(slug, n=n)
    next_round = cm.current_round + 1
    en_doc, _ = _load_source(slug, n)
    target_doc = _current_target_doc(slug, n, cm.current_round)
    suggestions = _last_reviewer_suggestions(slug, n, cm.current_round)
    editor_prompt = load_prompts(PromptKind.EDITOR)
    editor_template = next(v.text for v in editor_prompt.versions if v.id == editor_prompt.current)

    try:
        await run_editor_pass(
            client=client,
            slug=slug,
            chapter_n=n,
            round_n=next_round,
            en_doc=en_doc,
            target_doc=target_doc,
            source_code=bm.language_pair.from_,
            target_code=bm.language_pair.to,
            editor_prompt_template=editor_template,
            prior_reviewer_suggestions=suggestions,
            model=req.model,
        )
    except RecoverableError as exc:
        raise HTTPException(status_code=422, detail={"message": str(exc), "kind": "recoverable"})
    except ConfigurationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    cm.current_round = next_round
    cm.status = ChapterStatus.IN_PROGRESS
    cm.models.editor = req.model
    cm.prompts_used.editor_version = editor_prompt.current
    cm.rounds.append(RoundEntry(n=next_round, editor_completed_at=now_iso()))
    save_chapter_meta(slug, cm)
    return cm.model_dump()


@router.post("/books/{slug}/chapter/{n}/round/reviewer")
async def post_round_reviewer(slug: str, n: int, req: RoundRequest) -> dict:
    cfg = load_config()
    try:
        client = _make_client(cfg)
    except ConfigurationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    bm = load_book_meta(slug)
    cm = load_chapter_meta(slug, n=n)
    if cm.current_round < 1:
        raise HTTPException(status_code=400, detail="no Editor pass yet for this chapter")
    en_doc, _ = _load_source(slug, n)
    target_doc = _current_target_doc(slug, n, cm.current_round)
    reviewer_prompt = load_prompts(PromptKind.REVIEWER)
    reviewer_template = next(v.text for v in reviewer_prompt.versions if v.id == reviewer_prompt.current)

    result: ReviewerResult = await run_reviewer_pass(
        client=client,
        slug=slug,
        chapter_n=n,
        round_n=cm.current_round,
        en_doc=en_doc,
        target_doc=target_doc,
        source_code=bm.language_pair.from_,
        target_code=bm.language_pair.to,
        reviewer_prompt_template=reviewer_template,
        model=req.model,
    )
    cm.models.reviewer = req.model
    cm.prompts_used.reviewer_version = reviewer_prompt.current
    # Update the round's reviewer_completed_at.
    for entry in cm.rounds:
        if entry.n == cm.current_round:
            entry.reviewer_completed_at = now_iso()
            break
    save_chapter_meta(slug, cm)
    return result.model_dump()


@router.post("/books/{slug}/chapter/{n}/finalize")
def post_finalize(slug: str, n: int) -> dict:
    try:
        finalize_chapter(slug=slug, chapter_n=n)
    except FinalizeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return load_chapter_meta(slug, n=n).model_dump()
```

- [ ] **Step 4: Register router in `server/main.py`**

```python
    from server.routes import chapters as chapters_routes
    app.include_router(chapters_routes.router)
```

- [ ] **Step 5: Run tests to verify all pass**

Run: `pytest tests/server/test_routes_chapters.py -v`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add server/routes/chapters.py server/main.py tests/server/test_routes_chapters.py
git commit -m "feat(server): chapter state + editor/reviewer round + finalize routes"
```

### Task 17.6: Models route + cached list

**Files:**
- Modify: `server/routes/settings.py` (add `/models`)
- Test: `tests/server/test_routes_settings.py`

- [ ] **Step 1: Add the failing test**

Append to `tests/server/test_routes_settings.py`:

```python
import httpx
import respx

from server.config import Config, save_config


@respx.mock
def test_get_models_returns_ids(translate_root: Path) -> None:
    save_config(Config(openrouter_api_key="sk-or-test"))
    respx.get("https://openrouter.ai/api/v1/models").mock(
        return_value=httpx.Response(200, json={"data": [{"id": "a"}, {"id": "b"}]})
    )
    client = TestClient(create_app())
    r = client.get("/models")
    assert r.status_code == 200
    assert r.json() == ["a", "b"]


def test_get_models_returns_400_when_no_api_key(translate_root: Path) -> None:
    client = TestClient(create_app())
    r = client.get("/models")
    assert r.status_code == 400
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/server/test_routes_settings.py -v`
Expected: FAIL — 404.

- [ ] **Step 3: Add `/models` to `server/routes/settings.py`**

Append to `server/routes/settings.py`:

```python
from fastapi import HTTPException

from server.errors import ConfigurationError, TransientError
from server.openrouter import OpenRouterClient


@router.get("/models")
async def get_models() -> list[str]:
    cfg = load_config()
    if not cfg.openrouter_api_key:
        raise HTTPException(status_code=400, detail="OpenRouter API key not configured")
    client = OpenRouterClient(api_key=cfg.openrouter_api_key)
    try:
        return await client.list_models()
    except (ConfigurationError, TransientError) as exc:
        raise HTTPException(status_code=502, detail=str(exc))
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `pytest tests/server/test_routes_settings.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add server/routes/settings.py tests/server/test_routes_settings.py
git commit -m "feat(server): GET /models proxies OpenRouter model list"
```

### Task 17.7: SSE events endpoint

**Files:**
- Create: `server/routes/events.py`
- Modify: `server/main.py`
- Test: `tests/server/test_routes_events.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/server/test_routes_events.py
from __future__ import annotations

import json

from fastapi.testclient import TestClient

from server.main import EVENT_BUS, create_app


def test_sse_stream_delivers_published_event() -> None:
    client = TestClient(create_app())
    with client.stream("GET", "/events") as r:
        assert r.status_code == 200
        EVENT_BUS.publish({"type": "status", "text": "hello"})
        EVENT_BUS.publish({"type": "stop"})
        lines: list[str] = []
        for raw in r.iter_lines():
            if raw:
                lines.append(raw)
            if any('"type": "stop"' in l for l in lines):
                break
        # SSE format prefix `data: `
        assert any('"text": "hello"' in l for l in lines)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/server/test_routes_events.py -v`
Expected: FAIL — 404.

- [ ] **Step 3: Write `server/routes/events.py`**

```python
from __future__ import annotations

import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

router = APIRouter()


@router.get("/events")
async def events_stream():
    from server.main import EVENT_BUS

    async def gen():
        async for evt in EVENT_BUS.subscribe(timeout=60.0):
            yield f"data: {json.dumps(evt)}\n\n"
            if evt.get("type") == "stop":
                return

    return StreamingResponse(gen(), media_type="text/event-stream")
```

- [ ] **Step 4: Register in `server/main.py`**

```python
    from server.routes import events as events_routes
    app.include_router(events_routes.router)
```

- [ ] **Step 5: Run tests to verify all pass**

Run: `pytest tests/server/test_routes_events.py -v`
Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add server/routes/events.py server/main.py tests/server/test_routes_events.py
git commit -m "feat(server): SSE /events endpoint for live progress"
```

### Task 17.8: Wire round routes to publish progress events

**Files:**
- Modify: `server/routes/chapters.py`
- Modify: `tests/server/test_routes_chapters.py`

- [ ] **Step 1: Add the failing test**

Append to `tests/server/test_routes_chapters.py`:

```python
import asyncio


def test_editor_round_publishes_status_events(app_with_book, monkeypatch) -> None:
    client, slug = app_with_book
    fake_client = AsyncMock()
    fake_client.chat = AsyncMock(return_value="[1]\nFR: # Chapitre 1\n\n[2]\nFR: Salut\n\n[3]\nFR: La main *froide*\n")
    monkeypatch.setattr(chapters_routes, "_make_client", lambda cfg: fake_client)

    from server.main import EVENT_BUS
    captured: list[dict] = []

    async def collect():
        async for evt in EVENT_BUS.subscribe(timeout=2.0):
            captured.append(evt)
            if evt.get("type") == "round_complete":
                return

    async def run():
        consumer = asyncio.create_task(collect())
        await asyncio.sleep(0)
        client.post(f"/books/{slug}/chapter/1/round/editor", json={"model": "ed"})
        await consumer

    asyncio.run(run())
    assert any(evt.get("type") == "status" and "Editor" in evt.get("text", "") for evt in captured)
    assert any(evt.get("type") == "round_complete" for evt in captured)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/server/test_routes_chapters.py::test_editor_round_publishes_status_events -v`
Expected: FAIL — no events captured.

- [ ] **Step 3: Modify `server/routes/chapters.py` to publish events**

At the top of `server/routes/chapters.py`, add:

```python
from server.main import EVENT_BUS
```

In `post_round_editor`, replace the body with the same logic but wrapped with publishes:

```python
    EVENT_BUS.publish({"type": "status", "text": f"Round {next_round} — calling Editor ({req.model})..."})
    try:
        await run_editor_pass(
            client=client,
            slug=slug,
            chapter_n=n,
            round_n=next_round,
            en_doc=en_doc,
            target_doc=target_doc,
            source_code=bm.language_pair.from_,
            target_code=bm.language_pair.to,
            editor_prompt_template=editor_template,
            prior_reviewer_suggestions=suggestions,
            model=req.model,
            on_retry=lambda attempt, total: EVENT_BUS.publish(
                {"type": "status", "text": f"Round {next_round} — retry {attempt}/{total}..."}
            ),
        )
    except RecoverableError as exc:
        EVENT_BUS.publish({"type": "error", "text": str(exc)})
        raise HTTPException(status_code=422, detail={"message": str(exc), "kind": "recoverable"})
    except ConfigurationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    EVENT_BUS.publish({"type": "round_complete", "round": next_round, "stage": "editor"})
```

Apply the same `status` + `round_complete` pattern in `post_round_reviewer`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/server/test_routes_chapters.py -v`
Expected: 5 passed (4 prior + 1 new).

- [ ] **Step 5: Commit**

```bash
git add server/routes/chapters.py tests/server/test_routes_chapters.py
git commit -m "feat(server): publish status + round_complete events during rounds"
```

---

## Phase 18 — CLI Launcher with Single-Instance Handoff

### Task 18.1: `translate` command — start server, open browser, handle existing instance

**Files:**
- Modify: `server/main.py`
- Test: `tests/server/test_cli.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/server/test_cli.py
from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from click.testing import CliRunner

from server.lock import acquire_lock, release_lock
from server.main import cli


def test_cli_exits_quickly_when_lock_is_held(translate_root: Path) -> None:
    acquire_lock(url="http://localhost:5180")
    try:
        with patch("server.main.webbrowser.open") as opener:
            runner = CliRunner()
            result = runner.invoke(cli, ["--no-browser-on-existing"])
            assert result.exit_code == 0
            assert "already running" in result.output.lower()
            opener.assert_not_called()
    finally:
        release_lock()


def test_cli_opens_browser_to_existing_url_by_default(translate_root: Path) -> None:
    acquire_lock(url="http://localhost:5180")
    try:
        with patch("server.main.webbrowser.open") as opener:
            runner = CliRunner()
            result = runner.invoke(cli, [])
            assert result.exit_code == 0
            opener.assert_called_once_with("http://localhost:5180")
    finally:
        release_lock()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/server/test_cli.py -v`
Expected: FAIL — `cli` not implemented.

- [ ] **Step 3: Add `cli` to `server/main.py`**

Append to `server/main.py`:

```python
import socket
import sys
import webbrowser

import click

from server.lock import LockHeld, acquire_lock, read_lock, release_lock


def _free_port(start: int = 5180) -> int:
    for port in range(start, start + 100):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise RuntimeError("no free port in range")


@click.command(name="translate")
@click.option("--port", type=int, default=None, help="Bind port (default: first free 5180+)")
@click.option("--no-browser", is_flag=True, help="Do not open the browser on launch")
@click.option(
    "--no-browser-on-existing",
    is_flag=True,
    help="When another instance is running, do not open browser; print message and exit",
)
def cli(port: int | None, no_browser: bool, no_browser_on_existing: bool) -> None:
    """Launch the translate local web app."""
    # Pre-check the lock: if held, hand off without starting a server.
    existing = read_lock()
    if existing is not None:
        from server.lock import _pid_alive  # type: ignore
        if _pid_alive(existing["pid"]):
            url = existing["url"]
            click.echo(f"Translate is already running at {url}")
            if not no_browser_on_existing:
                webbrowser.open(url)
            return

    chosen_port = port if port is not None else _free_port()
    url = f"http://localhost:{chosen_port}"
    try:
        acquire_lock(url=url)
    except LockHeld as exc:
        click.echo(f"Translate is already running at {exc.url}")
        if not no_browser_on_existing:
            webbrowser.open(exc.url)
        return

    if not no_browser:
        webbrowser.open(url)

    import uvicorn
    try:
        uvicorn.run(create_app(), host="127.0.0.1", port=chosen_port, log_level="info")
    finally:
        release_lock()
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `pytest tests/server/test_cli.py -v`
Expected: 2 passed.

- [ ] **Step 5: Smoke test the CLI manually (do not commit yet)**

Run (in one terminal):
```bash
translate --no-browser
```
Expected: server starts, prints uvicorn banner.

Run (in another terminal):
```bash
curl http://localhost:5180/health
```
Expected: `{"status":"ok"}`

Run (in a third terminal):
```bash
translate --no-browser-on-existing
```
Expected: prints "Translate is already running at http://localhost:5180" and exits cleanly.

Stop the first server with Ctrl-C; verify `~/.translate/.lock` is gone.

- [ ] **Step 6: Commit**

```bash
git add server/main.py tests/server/test_cli.py
git commit -m "feat(server): translate CLI with single-instance lock handoff"
```

---

## Phase 19 — End-to-End Smoke Test (manual, real OpenRouter)

### Task 19.1: Document the manual smoke procedure and write a guarded e2e test

**Files:**
- Create: `tests/server/test_e2e_smoke.py`
- Create: `README.md`

- [ ] **Step 1: Write the e2e test (skipped by default)**

```python
# tests/server/test_e2e_smoke.py
"""Real-OpenRouter smoke test. Skipped unless OPENROUTER_API_KEY is set.

Run manually before each release:

    OPENROUTER_API_KEY=sk-or-... pytest tests/server/test_e2e_smoke.py -v -s
"""
from __future__ import annotations

import os
from pathlib import Path

import pytest

from server.config import Config, save_config
from server.docx_io import parse_docx
from server.ingest import ingest_book
from server.openrouter import OpenRouterClient
from server.rounds import run_editor_pass, run_reviewer_pass

pytestmark = pytest.mark.skipif(
    "OPENROUTER_API_KEY" not in os.environ,
    reason="set OPENROUTER_API_KEY to run e2e test",
)


async def test_real_round_against_openrouter(translate_root: Path, fixtures_dir: Path) -> None:
    save_config(Config(openrouter_api_key=os.environ["OPENROUTER_API_KEY"]))
    result = ingest_book(
        translated_path=fixtures_dir / "sample-fr-folder",
        english_path=fixtures_dir / "sample-en-folder",
        language_pair=("en", "fr"),
        ingestion=Config().ingestion,
    )
    en = parse_docx(translate_root / result.slug / "source-en" / "ch01.docx")
    fr = parse_docx(translate_root / result.slug / "source-translated" / "ch01.docx")
    client = OpenRouterClient(api_key=os.environ["OPENROUTER_API_KEY"])

    edited = await run_editor_pass(
        client=client,
        slug=result.slug,
        chapter_n=1,
        round_n=1,
        en_doc=en,
        target_doc=fr,
        source_code="en",
        target_code="fr",
        editor_prompt_template=(
            "Proofread the {TARGET_LANG_NAME} translation. Return target lines only "
            "in `{TARGET_LANG_CODE}:` format, one per `[N]` block. Preserve italic and bold."
        ),
        prior_reviewer_suggestions=None,
        model=os.environ.get("EDITOR_MODEL", "anthropic/claude-sonnet-4"),
    )
    assert len(edited.paragraphs) == len(en.paragraphs)

    reviewer_result = await run_reviewer_pass(
        client=client,
        slug=result.slug,
        chapter_n=1,
        round_n=1,
        en_doc=en,
        target_doc=edited,
        source_code="en",
        target_code="fr",
        reviewer_prompt_template=(
            "Review the {TARGET_LANG_NAME} translation. Return JSON list of "
            '{"quote", "comment"} only. Be concise.'
        ),
        model=os.environ.get("REVIEWER_MODEL", "openai/gpt-5"),
    )
    assert reviewer_result.raw_response  # something came back
```

- [ ] **Step 2: Confirm the test is skipped without an env var**

Run: `pytest tests/server/test_e2e_smoke.py -v`
Expected: 1 skipped.

- [ ] **Step 3: Write `README.md`**

```markdown
# Translate

A local web app for AI-assisted bilingual chapter proofreading. Point it at a
translated book and its English original, pick chapters to proof, and run a
multi-round Editor → Reviewer loop using any pair of OpenRouter-routed models.

## Status

Plan 1 (server) is complete. Plan 2 (web client) is pending — for now, drive
the server via HTTP/curl.

## Install (development)

```
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

## Run

```
translate
```

The server picks a free port (5180+), opens your default browser, and prints
the URL. Lock file lives at `~/.translate/.lock`. A second `translate` invocation
detects the running instance, opens a browser tab to the existing URL, and
exits.

## API surface

- `GET  /health` — liveness check
- `GET  /settings`, `PUT /settings` — config (API key, default models, ingestion patterns)
- `GET  /models` — proxied OpenRouter model list
- `GET  /prompts/{kind}`, `PUT /prompts/{kind}` — prompts with version history
  - `POST /prompts/{kind}/restore/{version_id}` — restore a past version
  - `DELETE /prompts/{kind}/{version_id}` — delete a historical version
- `GET  /books`, `POST /books`, `GET /books/{slug}` — list, ingest, get state
- `GET  /books/{slug}/chapter/{n}/state` — chapter state
- `POST /books/{slug}/chapter/{n}/round/editor`   — run an Editor pass
- `POST /books/{slug}/chapter/{n}/round/reviewer` — run a Reviewer pass
- `POST /books/{slug}/chapter/{n}/finalize` — write `final.docx`, mark done
- `GET  /events` — Server-Sent Events stream of round progress

## Manual smoke procedure (real OpenRouter)

```
export OPENROUTER_API_KEY=sk-or-...
pytest tests/server/test_e2e_smoke.py -v -s
```

## Tests

```
pytest tests/server/ -v
```

## Where state lives

- `~/.translate/config.json` (mode 600) — API key + default models + ingestion patterns
- `~/.translate/prompts/{editor,reviewer}.json` — current prompt + version history
- `~/.translate/<book-slug>/` — per-book working folder
- `~/.translate/.lock` — single-instance lock (PID + URL)
```

- [ ] **Step 4: Final full test run**

Run: `pytest tests/server/ -v`
Expected: All tests pass; the e2e test is skipped unless `OPENROUTER_API_KEY` is set.

- [ ] **Step 5: Commit**

```bash
git add tests/server/test_e2e_smoke.py README.md
git commit -m "docs+test: e2e smoke harness against real OpenRouter; README"
```

---

## Done

The server is shippable. Users can:

1. Install with `pip install -e .`
2. Run `translate` to start the server
3. Use any HTTP client to ingest books, run rounds, finalize, and stream progress
4. The web UI in Plan 2 will consume exactly this API surface

Plan 2 (web client) will be written separately and built against this server with no further server-side changes anticipated.
