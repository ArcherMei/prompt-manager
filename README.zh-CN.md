# Prompt Manager

**简体中文** · [English](README.md)

一个在本地整理 Prompt / Tag、关联 LoRA 文件并保存 HTML 使用说明的桌面工具。使用 Electron、React 和 Vite 开发，支持 Windows 和 macOS。

**AI 开发说明：本项目大部分代码由 AI 辅助生成，由维护者提出需求，并通过测试和实际使用不断调整。** 这是一个仍在完善的个人项目，尚未经过专业审计。欢迎提交问题、参与代码检查和改进。

[下载 v0.0.4](https://github.com/ArcherMei/prompt-manager/releases/tag/v0.0.4) · [试用展示示例](examples/README.md) · [反馈问题](https://github.com/ArcherMei/prompt-manager/issues)

## 能做什么

- 分类管理 Prompt，搜索备注，将选中的 Tag 组合成提示词。
- 明确管理两个文件夹：**LoRA 仓库文件夹**存放模型和 HTML 使用说明；**ComfyUI 的 LoRA 模型文件夹**存放实际生成图片时使用的模型。
- 递归扫描所有子文件夹，核对两边模型内容，勾选缺少的模型双向复制。同名但内容不同会提示冲突，不会自动覆盖。
- 根据 **Main Note、Complex LoRA Tag、Prompt 正文、Sub-Note** 中的准确名称关联模型，并显示关联依据。也支持点击按钮或拖动记录手动关联。
- 新增模型和 HTML 放在同一层；旧版编号文件夹先预览整理路径，确认后再整理。
- 离线查看 HTML，将整个仓库的模型、HTML、网页资源和子文件夹导出为 ZIP。
- 在软件更新入口选择新版 EXE / DMG 安装包进行本地更新。

## 下载与开始使用

在 [v0.0.4 发布页](https://github.com/ArcherMei/prompt-manager/releases/tag/v0.0.4) 下载：

| 文件 | 用途 |
|---|---|
| `Prompt.Manager.Setup.0.0.4.exe` | Windows x64 安装包 |
| `Prompt.Manager-0.0.4-arm64.dmg` | Apple Silicon Mac 安装包 |
| `Prompt-Manager-0.0.4-examples.zip` | 独立的虚构演示文件夹和 Prompt |
| `Prompt-Manager-0.0.4-source.zip` | 对应版本源码、构建说明和示例 |
| `SHA256SUMS-0.0.4.txt` | 下载文件的 SHA-256 校验码 |

Mac 安装包未经过 Apple 公证；Windows 安装包没有发行者证书签名。Windows 安装包在 Mac 上构建并检查完整性，Windows 实际安装与运行仍需要更多实机验证。

进入 **「LoRA 文件管理」→「文件夹设置」**：

1. **LoRA 仓库文件夹**：选择你保存模型和 HTML 使用说明的文件夹。
2. **ComfyUI 的 LoRA 模型文件夹**：选择实际使用的模型位置，通常为 `ComfyUI/models/loras`。

选择文件夹只读取已有文件，不自动搬家。两个文件夹不能相同或互相包含。首次用重要资料尝试文件操作前，请先备份。

## 独立展示示例

[`examples/`](examples/) 包含本项目新编写的虚构 Prompt、HTML 说明和几何 SVG 插图，没有使用维护者的私人 Prompt 数据库、模型收藏、网页存档或第三方训练权重。

**示例 `.safetensors` 是纯文字占位文件，不是真实模型，不能生成图片，也不要放进真实 ComfyUI 模型目录。** 请仅使用示例里的两个模拟文件夹，体验自动关联、手动关联、子文件夹扫描、同名冲突、双向复制和 ZIP 导出。具体步骤见 [示例说明](examples/README.md)。

## 从源码构建

需要 Node.js 22.12 或更新版本及 npm。建议在目标系统打包；macOS 交叉打包 Windows 需要 Wine 和 electron-builder 的 Windows 构建组件。

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

安装包输出到 `dist-electron/`。依赖版本记录在 `package-lock.json`；Electron 安装包保留其自带的第三方许可声明。

## 数据与当前限制

- 用户数据保存在本机 Electron 用户数据目录，模型和 HTML 保存在你选择的文件夹。
- 原来的 JSON Backup / Restore 针对 Prompt。模型与 HTML 请使用仓库 ZIP 导出；ZIP 附带关联记录供备份核对，目前没有一键恢复 ZIP 功能。
- 准确名称可自动关联，混有说明文字的备注仅作为候选。同名模型需要子文件夹路径或手动关联。
- 手动关联按完整文件路径保存；在软件外移动或重命名文件后可能需要重新关联。
- 内容核对需要读取模型文件，大仓库可能耗时较长；不跟随符号链接。
- HTML 预览不执行网页脚本，也不加载远程资源。

当前通过了 18 项自动测试，涵盖文件夹核对、复制、冲突保护、关联、HTML 资源、ZIP、旧目录整理及本地更新辅助程序。Mac 已实际检查按钮关联、复制和 ZIP 导出。Windows 安装包及内嵌卸载程序通过 NSIS CRC 完整性校验。上述检查不代表所有系统和超大文件场景都经过验证。

[详细文件夹说明](build/LORA-REPOSITORY.md) · [本地更新说明](build/LOCAL-UPDATE.md) · [Windows 卸载修复说明](build/WINDOWS-UNINSTALL.md)

## 许可证

Copyright (C) 2026 ArcherMei and contributors.

项目及其原创展示内容采用 **GNU GPL 第 3 版，仅此版本（GPL-3.0-only）**，完整条款见 [LICENSE](LICENSE)。发布基于本项目修改的版本时，需要遵循 GPL 提供对应源码。软件不提供担保。

第三方依赖和模板素材仍遵循其各自许可证，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
