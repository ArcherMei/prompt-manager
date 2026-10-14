# Prompt Manager 0.0.7

新增本地 Danbooru 标签查询与场景辅助补全，Windows 运行 Prompt Manager，Mac 可通过局域网提供 LM Studio 模型服务。

- 使用本地 SQLite 标签与别名索引，验证模型输出，拒绝虚构或候选范围外的标签。
- 支持中文查询、场景背景、已有 tags 和可选参考图；已有标签及常见加权别名排除重复建议。
- 支持复制、插入 Builder、查看系统提示词与模型结果说明。
- LM Studio 地址、模型 ID 与 Token 在本机保存，提供清除 Token 按钮。Token 本地保存未加密。
- 沿用 Electron / React / Vite；打包应用无需额外安装 Python 或 Node。

下载 Prompt-Manager-Setup-0.0.7.exe，在软件更新入口选择该文件。已有标签库无需重新导入。此版本不包含或更新 Danbooru 数据快照。

附图查询需视觉模型；本功能不执行 ControlNet。标签存在不代表语义正确，未找到也不代表 Danbooru 没有该概念。

验证：12 项自动测试通过，2 项 macOS 专用测试跳过；Windows 安装包构建及 CRC 校验通过。打包程序启动被构建机器的 Windows Application Control 阻止，未完成该版本 GUI 验收或真实 Mac 模型验证。Windows 安装包未签名；未提供 macOS DMG。
