# Prompt Manager

[简体中文](README.zh-CN.md) · **English**

A local desktop app for organizing Prompt / Tag records, linking them to LoRA files, and keeping HTML usage guides alongside your models. Built with Electron, React and Vite for Windows and macOS. The app is currently only available in Chinese. English might be added later. 

**AI development disclosure:** Most of this project's code was generated with AI assistance, under the maintainer's direction, and then iterated through testing and real use. This is an early personal project, not professionally audited software. Contributions, bug reports and independent review are welcome.

[Download v0.0.4](https://github.com/ArcherMei/prompt-manager/releases/tag/v0.0.4) · [Try the examples](examples/README.md) · [Report an issue](https://github.com/ArcherMei/prompt-manager/issues)

## What it does

- Organize prompts into categories, search notes, and combine selected tags into a prompt string.
- Manage two explicit folders: a **LoRA repository** containing models and HTML guides, and a **ComfyUI LoRA folder** containing models used for inference.
- Scan nested folders, compare model contents, and copy selected missing models in either direction. Different contents with the same filename are reported, not overwritten.
- Match filenames against **Main Note**, **Complex LoRA Tag**, prompt text and Sub-Note. See the matching field, or link records using a button or drag and drop.
- Store newly imported models and HTML at the same folder level. Preview a proposed cleanup before reorganizing legacy numbered folders.
- View HTML guides offline and export the whole repository, including HTML resources and subfolders, as a ZIP.
- Select a newer local EXE / DMG in the software update screen.

## Download and start

Get the assets from [v0.0.4 Releases](https://github.com/ArcherMei/prompt-manager/releases/tag/v0.0.4):

| File | Purpose |
|---|---|
| `Prompt.Manager.Setup.0.0.4.exe` | Windows x64 installer |
| `Prompt.Manager-0.0.4-arm64.dmg` | macOS Apple Silicon installer |
| `Prompt-Manager-0.0.4-examples.zip` | Separate fictional demonstration folders and prompts |
| `Prompt-Manager-0.0.4-source.zip` | Corresponding source code, build instructions and examples |
| `SHA256SUMS-0.0.4.txt` | Checksums for the downloadable files |

The Mac package is not Apple-notarized. The Windows package is not signed with a publisher certificate. Windows installers are built and integrity-checked on macOS; native Windows installation and runtime behavior still need broader testing.

Open **LoRA 文件管理** (LoRA file management), expand **文件夹设置** (folder settings), and select:

1. **LoRA 仓库文件夹**: your model archive and HTML guides.
2. **ComfyUI 的 LoRA 模型文件夹**: your actual model folder, usually `ComfyUI/models/loras`.

Selecting a folder indexes existing files in place; it does not migrate them. The two folders must be separate and cannot contain one another. Make a backup before trying file operations on a valuable collection.

## Safe demonstration data

The separate [`examples/`](examples/) folder contains newly written fictional prompts, HTML guides and simple geometric SVG illustrations. It does **not** contain the maintainer's personal prompt database, model collection, browser archives or third-party trained weights.

**The example `.safetensors` files are plain-text placeholders, not usable models. Do not load them in ComfyUI or place them in your live model directory.** Use the two example directories to try matching, nested scans, same-name conflicts, copying and ZIP export. See [the example walkthrough](examples/README.md).

## Build from source

Requires Node.js 22.12+ and npm. Build on the target platform when possible. Cross-building Windows on macOS requires Wine and electron-builder's Windows tooling.

```sh
npm ci
npm run app:dev
```

```sh
npm test
npm run build
npm run app:build -- --win --x64
npm run app:build -- --mac --arm64
```

Installers are written to `dist-electron/`. Dependencies are pinned by `package-lock.json`; Electron distributions retain their bundled third-party license notices.

## Data and current limits

- User data stays in the local Electron user-data folder. Model and HTML files stay in the folders you select.
- The original JSON Backup / Restore covers prompts. Use the repository ZIP export to include model and HTML files. ZIP metadata is included for reference; one-click ZIP restoration is not implemented.
- Precise names can match automatically; descriptive prose is only suggested as a candidate. Duplicate basenames need a subfolder path or a manual link.
- Manual links use full file paths. Moving or renaming files outside the app may require relinking.
- Content comparison reads model files and can take time on a large collection. Symbolic links are not followed.
- HTML preview is offline and does not execute page scripts or load remote resources.

The release passed 18 automated tests covering folder comparison, copying, collision protection, matching, HTML resources, ZIP export, legacy cleanup and local update helpers. macOS UI checks covered linking, copying and ZIP export. Windows installer and embedded uninstaller NSIS CRC checks passed. These checks are not a guarantee that every environment or large-file scenario has been tested.

[Detailed folder guide (Chinese)](build/LORA-REPOSITORY.md) · [Local update notes](build/LOCAL-UPDATE.md) · [Windows uninstall fix](build/WINDOWS-UNINSTALL.md)

## License

Copyright (C) 2026 ArcherMei and contributors.

This project and its original demonstration content are licensed under the **GNU General Public License, version 3 only (GPL-3.0-only)**. See [LICENSE](LICENSE) for the full terms. If you distribute a modified version, the GPL requires you to provide its corresponding source under the GPL. The software is provided without warranty.

Third-party dependencies and template assets remain under their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
