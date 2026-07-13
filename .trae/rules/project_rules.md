# 项目规则

## 版本号修改规则

修改版本号时，必须同步更新以下所有文件：

| 文件 | 字段/位置 | 说明 |
|------|----------|------|
| `src/version.ts` | `APP_VERSION` | 网页版水印显示的版本号（格式：`V1.0.1`） |
| `package.json` | `version` | CMD 终端显示的版本号（格式：`1.0.1`） |
| `README.md` | 徽章链接、说明表格、下载链接 | 项目主页显示的版本号 |

修改步骤：
1. 先修改 `src/version.ts` 中的 `APP_VERSION`
2. 再同步修改 `package.json` 中的 `version`
3. 最后更新 `README.md` 中所有相关的版本号文本