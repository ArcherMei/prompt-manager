# Windows 使用 Prompt Manager，Mac 运行 LM Studio

应用仍然同时支持 Windows 和 macOS。你的使用方式是：

Windows：Prompt Manager + 本地 Danbooru SQLite + 查询弹窗 + Builder。
Mac：LM Studio + 已下载的语言模型。
两台电脑通过局域网 HTTP API 通信。标签库和提示词记录留在 Windows；发送给 Mac 的只有当前查询和少量候选标签，不上传整个标签库或提示词库。

## 1. Mac 启动模型服务

1. 在 LM Studio 下载并加载你选择的模型，27B 或更大模型也可，取决于 Mac 内存与量化。
2. 在 Developer 页的服务器设置打开 **Serve on Local Network**，启动服务器。
3. 使用 LM Studio 显示的局域网访问地址，例如 `http://192.168.1.20:1234`。这里是示例地址，替换成你的 Mac 地址。
4. 建议启用 **Require Authentication** 并创建 API Token。
5. 在模型设置中关闭 thinking，或者直接使用非推理 instruct 模型。

Mac 不需要运行 Prompt Manager，也不需要标签库或 Python。若以后在 Mac 上组装提示词，也可以运行同一应用并在 Mac 本地导入标签库。

## 2. Windows 配置应用

1. 启动本次交付的 Prompt Manager 版本，在 Builder 点击「查找 Danbooru Tag」。
2. 展开设置，导入数据包的 `tags.csv.gz` 和 `tag_aliases.csv.gz`。索引将建立在 Windows 应用数据目录。
3. LM Studio 地址填写 Mac 的访问地址，加 `/v1`，例如 `http://192.168.1.20:1234/v1`。也支持可解析的主机名，例如 `http://mac-studio.local:1234/v1`。
4. 若 Mac 启用了认证，填入 API Token，一次输入后自动保存在 Windows 本机，重启软件无需重填；「清除 Token」可删除。Token 随本地设置保存，未加密。
5. 点击「测试连接 / 刷新模型」，看到连接成功后，选择模型 ID。
6. 输入中文描述，选择验证过的标签复制或插入 Builder。

**在 Windows 填 `127.0.0.1` / `localhost` 指向的是 Windows 自己，不是 Mac。** 只有模型服务也运行在 Windows 上时才用这个地址。

已经下载的数据可在两种系统使用。英文标签和别名精确查询不需要 Mac 在线；中文描述的模型检索需要 Mac 服务可连接。断网（互联网断开）不会影响两台电脑之间仍可达的局域网连接。

## 3. 源码启动与打包

两种系统都使用 Node.js 22.13+ 或 24 LTS 和 npm，不需要 Python。解压更新后的源码 ZIP，在项目目录执行：

```sh
npm ci
npm run app:dev
```

在 Windows 构建 Windows x64 安装程序：

```sh
npm run app:build -- --win --x64
```

在 Apple Silicon Mac 构建 macOS 安装程序：

```sh
npm run app:build -- --mac --arm64
```

安装包写入 `dist-electron/`。源码 ZIP 不是已经打包好的 EXE / DMG；本次没有完成两台实机联网验收或安装包验收。

## 4. 连不上时

- 连接超时 / 无法连接：检查 Mac 的实际 IP 和端口、是否开启 Serve on Local Network、两台设备是否可互相访问、Mac 防火墙是否允许 LM Studio。访客 Wi-Fi 的设备隔离可能阻止互访。
- Windows PowerShell 可以用 `Test-NetConnection 192.168.1.20 -Port 1234` 检查端口（替换为实际地址）。
- HTTP 401：检查 Token。
- HTTP 404：确认地址末尾为 `/v1`，端口正确。
- 成功但模型列表为空：在 LM Studio 加载模型后重新刷新。
- 模型推理超时：确认已加载，尝试更小的量化模型。连接测试限时 15 秒，每次模型调用限时 180 秒。
- `.local` 主机名无法解析时，改用 Mac 的局域网 IP；可在路由器给 Mac 固定地址。

HTTP 和 HTTPS 地址均受支持；HTTPS 使用正常的证书验证。无需为了 Electron 客户端打开浏览器 CORS，也无需在路由器上做公网端口映射。

官方参考：[局域网服务](https://lmstudio.ai/docs/developer/core/server/serve-on-network)、[API 认证](https://lmstudio.ai/docs/developer/core/authentication)。


0.0.7 新增场景背景、已有 tags、可选参考图与系统提示词查看，详见 [场景辅助补全](SCENE-LOOKUP.zh-CN.md)。提供上下文时会使用模型判断补充内容；清空上下文和图片后，规范英文标签仍可离线精确查询。
