# 按周分支发布

周报使用 `codex/weekly/<ISO周次>` 独立分支，例如 `codex/weekly/2026-W45`。本流程不把周报提交推送到 main。

1. 首期从正式配置所在的 main 建立周分支；后续周可从上一期已验证的周分支建立，以保留导出修复和历史快照，同时检查 main 中正式部门配置是否更新。
2. 按完整的 Asia/Shanghai 周一至周日采集，完成候选初审、一手来源核验、中文精读、导入与审核。
3. 运行 Python 测试和公开构建检查。保留历史快照；来源缺失必须写入当期说明。配置允许零条的部门以明确空刊结论发布。
4. 用户授权发布后，运行 `approve-and-export`，按明确文件清单提交并仅推送当期周分支。
5. GitHub Pages 的 `github-pages` 环境须允许该周分支部署。仅为需要发布的具体周分支增加规则，不开放所有分支。
6. 使用现有 `publish-pages.yml` 的 workflow_dispatch，从当期分支运行，输入 `confirm=publish`、`issue=<ISO周次>`。不依赖 main 的 push 事件。
7. 等待 verify、build、deploy 全部成功，并验证公网周次、部门内容及 CSS；最后提供网页和周分支链接。

Pages 总入口保持 `https://guanyu-tech.github.io/weekly_report/`，展示最近一次成功部署的周报；每周的代码、数据、周报 Markdown、精读 JSON 与调查索引保留在相应周分支，已批准历史期次也可通过站点历史周报查看。

此按周分支约定取代手动采集文档和旧脚本中“直接推送 main”的操作要求；不要运行仍会自动推送 main 的旧同步脚本。
