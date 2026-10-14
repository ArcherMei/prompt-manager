# Third-party notices / 第三方声明

The project's GPL-3.0-only license does not replace licenses on third-party components. Preserve upstream copyright and license notices when redistributing them.

- React / React DOM — MIT; copyright Meta Platforms, Inc. and affiliates. See the LICENSE files in the respective npm packages and https://github.com/facebook/react/blob/main/LICENSE.
- Electron — MIT, with Chromium, Node.js and other bundled components under their respective licenses. Packaged applications retain Electron's LICENSE and LICENSES.chromium.html files. See https://github.com/electron/electron/blob/main/LICENSE.
- Vite and its starter/template graphics — MIT; see https://github.com/vitejs/vite/blob/main/LICENSE. The pre-existing `src/assets/` and `public/` template assets are not part of the newly authored `examples/` artwork.
- yazl and buffer-crc32 — MIT; see their npm package LICENSE files. They are used for ZIP output.
- Build and test tools, including electron-builder, ESLint and their transitive dependencies, retain their own licenses. Exact dependency versions and declared licensing information are recorded in package-lock.json and the installed packages.

The fictional prose, HTML and geometric SVG drawings in `examples/` were newly authored for this project with AI assistance. The model-extension files are text fixtures, not trained models or copied third-party weights. No personal model collection, prompt database or browser archive is included in the examples.

本项目许可证不替换第三方组件的许可证。重新分发时请保留各组件的版权和许可声明。`examples/` 中的虚构文字、HTML 和几何 SVG 为本项目新编写；模型扩展名文件仅为文字占位文件，没有第三方训练权重或个人资料。

- csv-parse — MIT, copyright Adaltas; see node_modules/csv-parse/LICENSE. Used for streaming CSV tag imports. Danbooru metadata is user-supplied or downloaded separately and is not bundled with this application.
