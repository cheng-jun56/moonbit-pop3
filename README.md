# POP3 取信与删除事务会话核心

**本项目仓库：[https://github.com/cheng-jun56/moonbit-pop3](https://github.com/cheng-jun56/moonbit-pop3)**

模块 `cheng-jun56/pop3`，本地版本 **0.5.0**，MIT。当前评审状态：**条件复审**。本文件是当前入口，旧轮次说明与详细用法保存在 [历史/完整使用说明](README-BEFORE-VALUE-REWORK.md)。

## 解决什么任务

供需要接入 POP3 的取信程序保留原始邮件字节并区分 DELE 请求和 QUIT 提交；UIDL 接口可供调用方建立去重清单。项目本身尚不是完整增量备份应用。

仅为必须接入 POP3 的端点提供协议取信和事务边界；支持现代 IMAP 的新应用不应只为本库改用 POP3。

## 直接复现

安装 MoonBit 和 Node.js 24，在本仓库根目录运行：

```sh
moon build --target js
node -e "require('node:fs').copyFileSync('_build/js/debug/build/cmd/web/web.js','web/engine.mjs')"
node examples/run-use-case.mjs
```

流程：**还原 RETR 的点转义邮件字节**。运行器创建新的系统临时目录，保留每一步的 stdout/stderr、产物及 `report.json`，打印实际目录；重复运行不会覆盖之前产物。它只执行仓库内的本地样例，不连接公网或发送消息。`report.json` 的 `expected` 是应观察的结果，实际结果在各步输出中；成功退出不替代内容核对。

输入性质：离线合成报文；没有声称完整 UIDL 备份调度已经实现。

应观察：正文中的两个点还原为一个，终止行不进入正文；不会请求 DELE。

具体命令和输入路径见 [使用任务](USE-CASE.md) 与 [机器可读流程](examples/use-case.json)。只把这个脚本当复现入口，不把通用运行器计作核心技术贡献。

## 实现与已有项目的关系

MoonBit 实现命令/会话、增量 CRLF、多行终止和点转义；Node 负责 socket、TLS/STLS、超时与取消。

SMTP/MIME 已有邻接组件；本项目的 POP3 取信与删除提交语义不同于 IMAP 同步和 Maildir 归档。没有宣称整个邮件生态空白，也没有把多个层写成同一功能。

同类项目和检索边界见 [DUPLICATION](DUPLICATION.md)。查重用于避免错误的首创表述；关键词零结果不能证明生态空白，Node 宿主能力也不计为 MoonBit 原生 I/O。

库使用从 [公共 API](pkg.generated.mbti) 和根包源码开始；可在本 checkout 的消费包中导入 `"cheng-jun56/pop3"`。源码中的网络/文件宿主入口及完整参数仍见 [完整使用说明](README-BEFORE-VALUE-REWORK.md)。是否已发布到 Mooncakes 需另核实，本文不把 `moon add` 的下载成功作为已完成事项。

## 验证与边界

已有本地 TCP/TLS 字节取信与事务边界检查；本轮离线 RETR 样例演示点转义。UIDL 核心检查不等于完整 UIDL 备份端到端验证。

[上一轮工程验证](evidence/innovation-review-20260922/results.json) 与 [本轮最小任务回执](evidence/value-rework-20260922/use-case.json) 分开。历史参考版本、golden 重放、本机 peer、真实第三方服务端和本次样例是不同证据，不能合并成“全部生产验证”。

常规核心检查可运行 `moon check --target js`、`moon test --target js`、`moon test --target wasm-gc`。专项命令：

```sh
node tools/test-extensions.mjs
```

专项所需的参考环境和历史版本见原使用说明及 TESTING 文档；本轮回执只记录实际执行项，不声称上面所有参考服务在任意环境即装即跑。

这里只提供协议与客户端，完整备份调度/去重数据库由应用承担。QUIT 丢响应时提交状态不确定，不能承诺已撤销删除。

## 复审材料状态

尚未交付完整 UIDL 去重备份程序；不再以“增量备份工具”标题超出实现。

2026-09-22 匿名新克隆成功；默认分支 `main`，核验公开提交 `1506239811443f4e896f70fa50dcd1613656e038`。本轮源码修订仅在本地，尚未推送；此记录不证明当时报名表中的地址正确，也不证明新修订已上线。

[申报草稿](PROPOSAL.md) 已压缩为 30 行以内，并单独标明本项目仓库；[复核说明](REVIEW-RESPONSE.md) 区分材料错误、功能变化及尚未解决的问题。没有编造用户、设备接入、生产部署或评审认可。
