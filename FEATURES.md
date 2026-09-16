# 功能与兼容性边界

0.5.0 已实现可用的 POP3 网络会话，仍不是完整成熟客户端。

| 能力 | 当前状态 | 验证与限制 |
|---|---|---|
| 命令/响应 | USER/PASS、APOP、CAPA、STAT/LIST/UIDL、RETR/TOP、DELE/RSET/NOOP/QUIT | 增量 CRLF、多行点转义、二进制正文和类型化 STAT/LIST |
| 状态机 | Greeting/Authorization/TlsHandshake/Transaction/Closed | STLS 成功后的明文注入与握手期命令均拒绝；认证失败可重试 |
| 传输 | TCP、默认隐式 TLS、显式/连接时要求 STLS | 证书链和主机名验证、超时、AbortSignal；无降级与自动重试 |
| 认证 | USER/PASS、APOP、SASL PLAIN 空挑战响应 | 默认保护明文密码；PLAIN 暂限可打印 ASCII；无完整 SASLprep |
| 独立互通 | Dovecot 2.4.2 的 TLS 升级、认证、读取、删除与重连 | 10 个实际流程通过，隔离临时邮箱，未测试外部邮箱账号 |
| 错误路径 | 升级缺失/拒绝、证书错误、取消/超时、异常挑战、注入 | 17 组专项网络测试；原有 TCP/TLS/APOP 检查也通过 |

仍缺其它 SASL、UTF8/LANG 等扩展、PIPELINING、流式大邮件、连接池、长期和负载验证。正文 8 MiB、正文行 64 KiB、核心同时 64 会话；状态行严格 UTF-8。USER/PASS 不接受空格与 Unicode，PLAIN 不接受 Unicode；这些限制仍需后续处理。

源码 0.5.0 与旧 ZIP/bundle 不同。CI 配置已准备，本地测试通过不等于远端 CI、公开发布或比赛验收。详见 README 和 TESTING。
