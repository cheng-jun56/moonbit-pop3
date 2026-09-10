# Validation contract

- Explicit Wasm-GC and JS targets: no inference from the toolchain default.
- Public API tests plus compiled browser engine, CLI stdin/file/argument and failure exit-code checks.
- 307 seeded bounded malformed inputs including UTF-16 surrogates. The worker has a 20-second limit.
- Local code coverage: `moon coverage analyze -p localreview/pop3 -- -f summary`. No coverage upload is configured. Coverage is evidence about current code, not upstream feature coverage.
- Benchmark: 5 warmups and 30 measured documented-example executions; median and p95 recorded locally.
- Generated API and browser artifact must match the same source revision.

CI files are prepared locally; remote CI has not run because this repository has not been uploaded. Compatibility beyond README scope remains unverified.


网络开发检查：`node tools/test-network.mjs`。仅本地回环 TCP，详情见 `evidence/network-focused-validation.json`；TLS 和独立服务器尚未验证。


## TLS 实机验证更新

`node tools/test-tls.mjs` 的 5 组新增回环 TLS 测试通过：信任测试证书后完成 USER/PASS、二进制多行 RETR 和 QUIT；不可信证书、主机名不匹配均拒绝；握手未完成时仍受绝对超时和 AbortSignal 控制。客户端强制使用 Node 的证书链及主机名校验，传入 `rejectUnauthorized:false` 或自定义 `checkServerIdentity` 不会绕过验证。自建服务端可使用 `ca` 和正确的 `servername` 配置信任。

测试需要 OpenSSL（可通过 OPENSSL 环境变量指定路径），每次在临时目录生成有效期一天、仅用于 localhost 的证书和私钥，结束后清理；不附带可复用私钥。结果见 `evidence/tls-focused-validation.json`。这是实际 TLS 握手和协议传输测试，POP3 响应仍由本项目测试服务器提供，独立邮件服务器互操作仍未完成。

本轮未重复 TCP 或核心测试、未重新构建未变化的 MoonBit 引擎、未打包或上传。
