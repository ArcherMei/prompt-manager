# Prompt Manager

以 Electron、React 和 Vite 製作的本地 Prompt / Tag 與 LoRA 管理工具。

## 功能

- Prompt 分類、標籤、搜尋與組合複製。
- LoRA 倉庫：模型檔案與 HTML 使用方法一起保存，支援自訂目錄。
- 對照 LoRA 名稱與現有 tag；修改顯示名稱並保留歷史名稱匹配。
- 自訂本地 AI 的 LoRA 目錄，只複製模型，不覆蓋不同內容的同名檔案。
- 離線 HTML 預覽，支援配套 `_files` / `.files` 資源資料夾。

## 開發與編譯

需要 Node.js 22.12 或更新版本與 npm。

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

安裝包輸出到 `dist-electron/`。建議在對應平台打包；macOS 交叉打包 Windows 時，electron-builder 需要 Wine 等工具。

## 下載

GitHub Releases 的 `v0.0.2` 提供 Windows x64 EXE 與 macOS Apple Silicon DMG，附 SHA-256 校驗碼。Mac 安裝包未經 Apple 公證；Windows 安裝包未使用發行者憑證簽署。

## 資料與驗證

所有使用者資料保存在本機，不包含在此倉庫或安裝包中。原有 JSON Backup / Restore 針對 prompt；備份 LoRA 倉庫時也要保存倉庫目錄及 userData/repository/library.json 索引。

- [LoRA 倉庫使用說明](build/LORA-REPOSITORY.md)
- [Windows 卸載完整性修正](build/WINDOWS-UNINSTALL.md)

自動測試涵蓋匯入、匹配、HTML 資源保存、自訂目錄與複製衝突。macOS 已實測主要操作；Windows 安裝包已通過 NSIS 完整性驗證，Windows 實際執行仍需在該平台測試。
