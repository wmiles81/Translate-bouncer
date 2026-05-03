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
