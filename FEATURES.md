# 功能与兼容性边界

## 新增能力

增加 STAT/LIST 的类型化响应读取和重复编号拒绝。

## 尚未达到上游的部分

仍缺 APOP、STLS 和独立服务器互操作；0.3.0 已补 TCP/隐式 TLS 接入。已有基础能力参见 README 与生成的 `pkg.generated.mbti`。

## 工程交付范围

独立 Git 仓库、独立构建目录、可执行文档、Wasm-GC/JS 测试、真实编译的浏览器与 CLI、边界输入检查、样例基准、CI 配置均随仓库交付。运行记录见 evidence；配置 CI 不代表远端 CI 已运行。没有公开发布或比赛验收结论。


## 0.3.0 开发更新：真实网络客户端

新增 `tools/client.mjs` 的 Pop3Client，直接复用 MoonBit Session 处理命令状态、CRLF 分片、多行终止与点转义。邮件正文以 Buffer 返回，保留非 UTF-8 字节。支持 USER/PASS、STAT、LIST、UIDL、RETR、DELE、TOP、NOOP、RSET、QUIT。

```js
import {Pop3Client} from './tools/client.mjs';
const client = await Pop3Client.connect({host:'mail.example.com'});
try {
  await client.login(process.env.POP3_USER, process.env.POP3_PASSWORD);
  const message = await client.command('RETR', {index:1});
  if (!message.ok) throw new Error(message.message);
  console.log(message.body.length);
  await client.quit();
} finally { client.close(); }
```

默认使用端口 995 的隐式 TLS，强制证书验证，支持通过 `tls:{ca,servername,...}` 提供信任配置。明文连接需显式设置 `secure:false`，默认端口 110。连接/greeting 和每条命令有独立绝对超时（默认 10 秒）；支持 AbortSignal。每次只允许一条待完成命令，繁忙时拒绝并发请求；断线/错误/取消会释放 MoonBit 会话并拒绝待完成请求。最多同时 64 个核心会话。服务端 -ERR 作为 `{ok:false,message,body}` 返回，login 遇到拒绝则抛错。close 立即断开；正常提交删除操作应使用 quit 并检查其响应。

本轮 `node tools/test-network.mjs` 的 5 组真实回环 TCP 测试通过，覆盖分片 greeting、认证、二进制 RETR、-ERR 后恢复、QUIT、超时、截断、取消/并发保护及命令注入拒绝。TLS 接入已实现，但尚未做 TLS 实机测试；测试服务器由本项目编写，不是独立 POP3 实现的互操作证明。仍缺 STLS、APOP、CAPA/SASL 和独立邮件服务器对照。

最新源码/引擎为 0.3.0 开发版，原 ZIP/bundle 保留历史打包快照；未上传，未重复旧测试或重新打包。


## TLS 实机验证更新

`node tools/test-tls.mjs` 的 5 组新增回环 TLS 测试通过：信任测试证书后完成 USER/PASS、二进制多行 RETR 和 QUIT；不可信证书、主机名不匹配均拒绝；握手未完成时仍受绝对超时和 AbortSignal 控制。客户端强制使用 Node 的证书链及主机名校验，传入 `rejectUnauthorized:false` 或自定义 `checkServerIdentity` 不会绕过验证。自建服务端可使用 `ca` 和正确的 `servername` 配置信任。

测试需要 OpenSSL（可通过 OPENSSL 环境变量指定路径），每次在临时目录生成有效期一天、仅用于 localhost 的证书和私钥，结束后清理；不附带可复用私钥。结果见 `evidence/tls-focused-validation.json`。这是实际 TLS 握手和协议传输测试，POP3 响应仍由本项目测试服务器提供，独立邮件服务器互操作仍未完成。

本轮未重复 TCP 或核心测试、未重新构建未变化的 MoonBit 引擎、未打包或上传。
