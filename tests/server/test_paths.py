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
