# Credits & Acknowledgements

## Contents

- [Translate](#translate)
- [The AI tools it drives](#the-ai-tools-it-drives)
- [The model browser](#the-model-browser)
- [Built with](#built-with)
- [License](#license)

## Translate

Created by **GML Publishing LLC** for members of the **Future Fiction Academy**.

The editorial method the program automates — the repeated Editor → Reviewer → Editor round, the bilingual paragraph-by-paragraph pairing that keeps a translation aligned with its original, and the prompts that drive both passes — is the author's work. The software just runs it at book scale.

## The AI tools it drives

Translate doesn't contain an AI. It talks to tools you install and sign into, over the open **Agent Client Protocol**:

- **Claude Code** — Anthropic, via the `@agentclientprotocol/claude-agent-acp` connector
- **Codex** — OpenAI, via Zed Industries' `@zed-industries/codex-acp` connector
- **Gemini CLI** — Google
- **Qwen Code** — Alibaba
- **OpenRouter** — the metered gateway behind the paid model list, and the source of the model names, prices and descriptions you see in the picker

## The model browser

The model picker's design — its Tier and Sort filters, the Model / Writing / Context / Price table, red for thinking models, the description pane — is modelled on **ModelRouter**, a desktop OpenRouter browser. Credit for that interface belongs to its author.

The **Writing** column comes from the **EQ-Bench Creative Writing benchmark**, which scores models on prose rather than code — the most useful number in the table when you're choosing who edits a novel.

## Built with

Python, FastAPI and Uvicorn on the server; React, Vite and Tailwind CSS in the browser; python-docx for reading and writing Word files.

## License

Restricted MIT License. © 2026 GML Publishing LLC. All rights reserved. Use is limited to Future Fiction Academy members — the full terms are in `LICENSE.txt`, included with the program.
