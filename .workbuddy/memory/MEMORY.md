# MEMORY.md — building 项目长期备注

## 验证/构建约定
- **sha256 锚必须行尾不敏感**：graybox-vs.html 的哈希随工作树 EOL 状态变化（autocrlf pull 重写 CRLF / 本地构建混合 / blob 纯 LF 三态互异）。日志里 `8d79cee7…` 锚在 2026-09-23 验证中确认失效。内容完整性用 `git diff`（归一化）+ build 幂等 + 静态校验判定；如需哈希锚，用 LF 归一化哈希或 blob 哈希，或加 .gitattributes 钉 eol。
- **计时敏感检查（vs4-check.js C8.3 等墙钟断言）必须走 PowerShell 通道**：Bash 工具沙箱开销会把 generatePlans worst 推到 12-14ms 撞 10ms 预算（连挂 7/7），PowerShell 通道同命令 53 全 PASS。
- PowerShell 工具输出不回显 + `>` 产出 UTF-16：结果一律 Set-Content -Encoding ASCII 落盘后用 Read/node 读回。
- Bash 通道缺 coreutils（grep/cat/tail/head 部分缺失），文本筛选用 node -e 或 Grep 工具替代。

## 项目状态锚点（2026-09-23）
- Phase 5 制作期 · VS-5 门批五账全清（F-1~F-5），收官。下一步 = **VS-6 真人试玩**（EXT-01 认定的唯一真缺口）。
- c4 隔离区三失败项是反篡改锚（[DISPUTED·待 VS-7 D1]），禁止修改；VS-6 前冻结数值。
- 浏览器 check 毫秒级噪声属常态；aiTiming budget=10ms 边界偏紧，放宽容差已挂账未批。
