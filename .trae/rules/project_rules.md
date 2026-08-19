# 项目规则

## 版本号修改规则

修改版本号时，必须同步更新以下所有文件：

| 文件 | 字段/位置 | 说明 |
|------|----------|------|
| `src/version.ts` | `APP_VERSION` | 可视化面板水印显示的版本号（格式：`V2.0.0`） |
| `package.json` | `version` | CMD 终端显示的版本号（格式：`2.0.0`） |
| `README.md` | 徽章链接、说明表格、下载链接 | 项目主页显示的版本号 |
| `server/public/index.html` | footer 中的版本号 | 数据管理面板底部显示的版本号（格式：`V2.0.0`） |

修改步骤：
1. 先修改 `src/version.ts` 中的 `APP_VERSION`
2. 再同步修改 `package.json` 中的 `version`
3. 更新 `README.md` 中所有相关的版本号文本
4. 最后更新 `server/public/index.html` 中 footer 里的版本号

> ⚠️ **重要**：README.md 中的 `稳定版版本号详解，例：V2.3.26.820` 是版本号格式说明示例，修改版本号时**不要改动这一行**。

---

## 署名水印格式规则

可视化面板与数据管理面板的底部署名水印必须保持格式一致：

| 文件 | 位置 | 左侧格式 | 右侧格式 |
|------|------|----------|----------|
| `src/App.vue` | `.watermark` 元素 | `ZzIOT-可视化面板 \| {{ APP_VERSION }}` | `By—雪菱(mio-kitten)` |
| `server/public/index.html` | `.footer` 元素 | `ZzIOT-内网数据面板 \| V2.0.0` | `By—雪菱(mio-kitten)` |

注意事项：
- 可视化面板使用 `{{ APP_VERSION }}` 自动引用 `src/version.ts` 的值
- 数据管理面板是静态 HTML，需要手动同步版本号
- 左右两侧使用 `flex` + `justify-content: space-between` 布局