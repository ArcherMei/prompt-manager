# 独立展示示例 / Display-only examples

所有示例文字、HTML 和几何 SVG 均为本项目新编写，没有使用作者的私人 Prompt、HTML 存档或第三方模型权重。示例采用 GPL-3.0-only，使用许可见项目根目录的 LICENSE；依赖库仍遵循各自许可证。

**`.safetensors` 文件仅为纯文字占位文件，不是真实模型，不能生成图片。不要将示例复制进你正在运行的 ComfyUI 模型目录。** 这里使用模型扩展名只是为了演示文件扫描、关联、复制和 ZIP 导出。

## 试用步骤

1. 下载并解压 Releases 中的 `Prompt-Manager-0.0.4-examples.zip`，或使用源码里的 `examples/`。
2. 软件左下角「Restore」选择 `prompts.example.json`。它会新增独立的 `EXAMPLE · 虚构展示数据` 分类；示例不含壁纸和流程设置。
3. 打开「LoRA 文件管理」→「文件夹设置」。把 **LoRA 仓库文件夹** 设置为示例中的 `lora-repository/`；把 **ComfyUI 的 LoRA 模型文件夹** 设置为示例中的 `comfyui-loras/`。后者只是模拟目录，与实际 ComfyUI 无关。记下你原先的路径，演示完切换回去。
4. 查看「模型关联 Prompt」：`demo_paper_hills` 通过 Main Note 关联，`demo_glass_garden` 通过 Complex LoRA Tag 关联。`demo_manual_shapes` 没有准确名称，点击文件后手动关联右侧“手动关联演示”记录。
5. 查看「两个文件夹核对 / 复制」，观察以下结果。复制会改变示例文件夹；再次试用可重新解压一份。
6. 在「HTML 网页存档」查看说明；点击「导出仓库全部文件 ZIP」选择示例仓库以外的位置，检查 HTML 和 `_files` 资源均保留。

| 文件 | 预期结果 |
|---|---|
| demo_paper_hills.safetensors | 两边内容相同，ComfyUI 示例中位于 styles 子文件夹 |
| demo_glass_garden.safetensors | 仅仓库有，可复制到模拟 ComfyUI 文件夹 |
| demo_manual_shapes.safetensors | 仅仓库有，同时演示手动 Prompt 关联 |
| demo_copper_shapes.safetensors | 两边同名但内容不同，提示冲突，不自动覆盖 |
| demo_only_in_comfyui.safetensors | 仅模拟 ComfyUI 的 objects/nested 子文件夹有，可复制回仓库 |

仓库中的每个模型和 HTML 都放在同一层；`_files/` 仅为 HTML 插图资源目录。

English: These are original synthetic demonstration fixtures, not trained model weights. The fake `.safetensors` files are deliberately plain text. Use only the two example folders to try matching, nested-folder comparison, conflict protection, copying and ZIP export. Do not load them into an inference tool.
