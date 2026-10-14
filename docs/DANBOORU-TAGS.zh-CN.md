# Danbooru 标签查询（macOS / Windows）

推荐使用场景：**Windows 组装 prompt，Mac 运行 LM Studio**。先看 [Windows ↔ Mac 配置说明](WINDOWS-MAC-LM-STUDIO.zh-CN.md)。应用仍支持两种系统。

## 启动

沿用 Electron + React + Vite，不运行 Python 服务，不需要安装任何全局 Python 包。开发环境使用 Node.js **22.13+ 或 24 LTS**（测试需要内置 node:sqlite）；已打包应用使用 Electron 自带 Node/SQLite，不需要另装 Node。

```sh
git clone https://github.com/ArcherMei/prompt-manager.git
cd prompt-manager
git switch feature/danbooru-tag-lookup
npm ci
npm run app:dev
```

Windows 打包：`npm run app:build -- --win --x64`。Apple Silicon 打包：`npm run app:build -- --mac --arm64`。产物位于 `dist-electron/`。本次未在 Mac 真机验证打包或运行。

## 获取完整标签和别名

应用不内置演示标签冒充完整数据库。可以使用 Danbooru 提供的数据库导出中的 `tags.csv.gz` 和 `tag_aliases.csv.gz`（同一快照）。也可以在项目目录运行随附的官方 API 下载器：

```sh
node scripts/download-danbooru.js ./danbooru-data
```

输出目录必须不存在，以免覆盖旧文件。下载器逐页遍历官方 `tags.json` 和 `tag_aliases.json`，每次最多 1000 行、请求间隔至少 1.1 秒；遇到 429 / 5xx 有限重试。大量标签可能下载很久，磁盘大小取决于当日数据，不在这里虚报固定大小。只有整个表下载完成才生成 `tags.csv` / `tag_aliases.csv`；`.partial.csv` 不应导入。失败后用新的目录重试；目前不支持断点续传。站点访问限制或网络错误会明确报告，不会把部分数据当作完整结果。该 API 抓取跨多个时刻，不是事务一致的快照，优先使用官方同日导出。

在 Builder 点击 **查找 Danbooru Tag → 数据库与 LM Studio 设置 → 导入**，依次选择 tags 和 aliases 文件。数据仅有标签元数据，不下载图片。

支持带表头的 UTF-8 CSV 或 gzip CSV：

- tags 必须包含 `name,category,post_count`，可选 `is_deprecated`；其他列忽略。弃用标签排除，零使用量标签保留。
- aliases 必须包含 `antecedent_name,consequent_name,status`；只收录 `active`。
- SQLite 文件位于 Electron `userData` 下的 `danbooru-tags.sqlite`。界面显示数量与导入日期。
- 后台流式导入，成功才提交；失败回滚，保留旧索引。更新时重新导入两份完整数据。
- 应用原有 JSON 备份不包含此可重建索引。请保留源 CSV；不要在应用运行时单独复制 SQLite 文件而漏掉 WAL。

## LM Studio

1. 加载你选择的本地模型，启动 Developer 页的服务器；跨电脑使用时打开 Serve on Local Network。
2. 同机地址默认 `http://127.0.0.1:1234/v1`。Windows 连接 Mac 时填写 Mac 的局域网地址，例如 `http://192.168.1.20:1234/v1`；支持 HTTP / HTTPS 和主机名。无需开启浏览器 CORS，网络调用由 Electron 后台完成。
3. 点 **刷新模型**，从列表选择或手动填写准确模型 ID。不限制参数规模，可使用 27B 或更大模型；是否装得下由 Mac 内存、量化和 LM Studio 设置决定。
4. 如果服务器启用了认证，填写 API Token。Token、地址和模型 ID 自动保存在当前电脑的应用本地设置中，重启后自动恢复；点击「清除 Token」可删除保存的 Token。Token 使用本地 localStorage 保存，未加密，不包含在原有提示词 JSON 备份中。
5. 在 LM Studio 关闭该模型的 thinking，或使用非推理 instruct 模型。请求包含不推理指令及 `/no_think`，只读取最终内容；通用 OpenAI 兼容接口无法保证所有模型都能关闭内部推理，不假装有通用开关。每次调用 180 秒超时，中文查询最多两次调用。

## 使用与可信度边界

- 输入规范标签或有效别名：直接查 SQLite，**精确匹配**，不需要 LM Studio。
- 输入中文：模型生成英文检索词 → SQLite FTS5 召回至多 80 个候选 → 模型只从候选选取 → 再次校验每个名称及别名。
- 一个标签显示 **单标签建议**；多个显示 **组合建议**。数据库验证的是名称存在，不能证明中文语义或标签间的空间关系准确。
- 任何一个模型标签不存在或不在候选中，整组结果丢弃，不会默默输出不完整组合。
- **未找到** 表示当前本地快照与本次候选召回没有可靠结果，不证明整个 Danbooru 绝对没有。尝试拆分概念、英文词或更新索引。
- “蹲在墙角”这类关系不能仅凭几个存在的标签保证生成效果；请确认组合是否满足原意。
- **复制 / 复制组合** 输出规范名称；**插入 / 插入组合** 加到现有 Builder，按名称去重，不创建永久提示词记录。Esc 关闭弹窗，Tab 在原生 modal dialog 内移动。

## 实现与验证

SQLite 与导入在一个 Worker 中串行执行，避免阻塞 Electron 主线程。IPC 校验主窗口和主 frame；renderer 不能指定任意文件路径，只能通过原生选择器导入。索引和模型网络模块独立于 UI，未更换现有提示词存储。

```sh
node --test tests/tag-lookup.test.js
npm test
npm run build
```

新增测试覆盖 gzip 导入/回滚、别名链/循环、幻觉/候选范围校验、本机 / 局域网 URL、认证和连接错误、worker 与模拟 LM Studio 流程。实际模型语义质量仍需用你的模型实测。Windows 上原有四项 symlink 测试可能因缺乏创建符号链接权限报 EPERM，两个 Mac 专用测试会跳过。

参考：[Danbooru API](https://danbooru.donmai.us/wiki_pages/help:api)、[Danbooru tag model / search](https://github.com/danbooru/danbooru/blob/master/app/models/tag.rb)、[LM Studio Chat Completions](https://lmstudio.ai/docs/developer/openai-compat/chat-completions)、[LM Studio models](https://lmstudio.ai/docs/developer/openai-compat/models)。

本次环境验证限制：后续已交付独立的本地数据包（10 月 2 日完整基线 + 新标签增量 + 别名表）；9 项新增自动测试与生产构建通过，真实 LM Studio 模型和 Mac GUI 尚未实测。


0.0.7 新增场景背景、已有 tags、可选参考图与系统提示词查看，详见 [场景辅助补全](SCENE-LOOKUP.zh-CN.md)。提供上下文时会使用模型判断补充内容；清空上下文和图片后，规范英文标签仍可离线精确查询。
