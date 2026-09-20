# POP3 会话与客户端

> 2026-09-21 本地构建修复：命令包 import 已同步到当前 moon.mod 模块名；moon info/check、JS 构建、MoonBit 示例和 Node 引擎示例通过。算法未改，本轮未重跑历史全部行为/性能套件。当前提交指纹见 evidence/module-import-fix.json。

本地开发版 **0.5.0**。MoonBit 负责命令校验、会话状态、增量 CRLF、多行终止和点转义；Node.js 提供 TCP、隐式 TLS、STLS、超时和取消。源码、生成接口和编译后的客户端核心均包含在本目录。

## 实际使用

默认使用 995 端口的隐式 TLS，并验证证书链与主机名：

```js
import {Pop3Client} from './tools/client.mjs';
const client = await Pop3Client.connect({host: process.env.POP3_HOST});
try {
  await client.login(process.env.POP3_USER, process.env.POP3_PASSWORD);
  const reply = await client.command('RETR', {index: 1});
  if (!reply.ok) throw new Error(reply.message);
  console.log(reply.body); // Buffer，保留原始邮件字节。
  const quit = await client.quit();
  if (!quit.ok) throw new Error(quit.message);
} finally { client.close(); }
```

使用 110 端口并要求先升级 TLS：

```js
const client = await Pop3Client.connect({
  host: process.env.POP3_HOST,
  secure: false,
  startTls: true,
  // 自签名服务可提供 tls: {ca: trustedPem, servername: expectedHost}。
});
try {
  await client.authenticatePlain(process.env.POP3_USER, process.env.POP3_PASSWORD);
  const stat = await client.command('STAT');
  if (!stat.ok) throw new Error(stat.message);
  console.log(stat.message);
  await client.quit();
} finally { client.close(); }
```

也可先 `connect({secure:false})`，再 `await client.startTls()`；它返回通过 TLS 重新读取的能力 Map。`client.secure` 仅在证书验证完成且连接未关闭时为 true。`client.state` 反映 MoonBit 会话状态。

TLS 升级会独占整个会话。服务器必须公布 STLS；能力缺失、拒绝、错误证书、握手超时或取消都会关闭连接，不自动退回明文。握手前已接受的 USER 会被清除。原始 `command('STLS')` / `command('AUTH')` 被禁止，请使用专用方法。

**0.5 行为变更：** 明文连接上的 USER/PASS 和 PLAIN 默认被拒绝。只有明确设置 `allowInsecureAuth:true` 才允许，适合受控的本地兼容测试。`secure:false` 本身不再允许发送密码。TLS 无关闭验证的选项；`rejectUnauthorized:false` 和自定义验证回调不会绕过检查。

## 命令与会话

支持 USER/PASS、APOP、CAPA、STLS、AUTH PLAIN、STAT、LIST、UIDL、RETR、DELE、TOP、NOOP、RSET、QUIT。

- `command(verb, {argument, index, lines})` 返回 `{ok,message,body}`。普通服务器 `-ERR` 保留为 `ok:false`；`login/apop/authenticatePlain` 则在认证被拒绝时抛错。
- `capabilities()` 返回能力名到参数数组的 Map。`apop(user, secret)` 使用 greeting 中的唯一挑战和 MD5，不自动降级认证。
- PLAIN 等待空挑战再发送响应；异常挑战触发取消并消耗拒绝响应。失败后可显式重试。当前 PLAIN 限制为可打印 ASCII；完整 SASLprep 和其它 SASL 机制尚未实现。
- 一次只允许一个待完成命令。升级和 USER/PASS 组合操作也阻止命令插入；没有 PIPELINING。
- 连接、命令、TLS 握手分别采用固定总截止时间，默认 10 秒；支持 AbortSignal 取消整个连接。没有自动重连或自动重试。
- `close()` 直接断开；提交删除使用 `quit()` 并检查结果。正文最多 8 MiB，正文行最多 64 KiB，同时最多 64 个核心会话。

MoonBit 的 `Session::issue(Stls)` 在成功响应后进入 `TlsHandshake`；传输层必须完成证书和主机名验证后才可调用 `tls_established()`。`Auth("PLAIN")` 使用 `Reply.continuation` 和 `authenticate_response()` 进行交换。核心不实现 socket 或密码算法，不能将模拟状态转换当成真实 TLS。

## 验证与边界

本版通过 JS/Wasm-GC 核心测试、17 组升级网络场景及既有 TCP/TLS/APOP 回归检查。**Dovecot 2.4.2 独立服务器 10 项流程通过**，覆盖升级、认证、读取、UIDL、删除回滚、QUIT 提交、错误密码和证书拒绝。实际证据与复现方法见 [TESTING.md](TESTING.md)。

仍缺完整 SASL/SASLprep、UTF8/LANG 等扩展、PIPELINING、流式大邮件、连接池与长期/负载/更多服务器证据；USER/PASS 仍只接受不含空白的可打印 ASCII。尚不能认定已追平完整成熟客户端。

## 构建与本地审查

```sh
moon test --target js --deny-warn
moon test --target wasm-gc --deny-warn
node tools/test-starttls.mjs
node tools/cli.mjs --file sample.txt --json
```

`./verify.ps1` 构建并检查本项目；未配置 MoonBit 时传 `-MoonPath`。`./start-review.ps1` 启动离线响应审查网页。真实网络入口为 `tools/client.mjs`，无需安装 MoonBit 即可使用。公共接口见 `pkg.generated.mbti`，可执行示例见 [README.mbt.md](README.mbt.md)。

依据 [RFC 1939](https://www.rfc-editor.org/rfc/rfc1939)、[RFC 2449](https://www.rfc-editor.org/rfc/rfc2449)、[RFC 2595](https://www.rfc-editor.org/rfc/rfc2595)、[RFC 5034](https://www.rfc-editor.org/rfc/rfc5034) 和 [RFC 4616](https://www.rfc-editor.org/rfc/rfc4616) 原创实现。MIT 仅适用于本仓库原创文件。Dovecot 是独立测试依赖，其二进制不随仓库分发；测试适配器为原创。

本目录是独立本地 Git 主仓库，无 remote、未上传或发布。旧 ZIP/bundle 仍是历史快照，本轮没有重打包；本版以仓库源码及 evidence 为准。
