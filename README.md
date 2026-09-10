# POP3 协议核心

可接入任意传输层的增量响应解析与会话状态机。本地候选版 0.2.0，供比较和代码审查；尚未作为完整竞赛作品提交。

## 运行

安装 MoonBit 后在本目录执行：

```sh
moon check
moon test
moon run cmd/main
```

也可在本目录运行 `./verify.ps1` 验证本项目。`pkg.generated.mbti` 是真实工具链生成的公共 API。命名空间 `localreview` 仅用于本地，正式发布前应替换为申请人的账号。

## 本版范围

实现目标：命令校验、状态转换、增量 CRLF、dot-unstuffing。

未承诺：TCP/TLS 适配器、真实邮箱互通、SASL。

## 来源与实现方式

规格/算法参考：https://www.rfc-editor.org/rfc/rfc1939。

当前代码是本地新写的 MoonBit 实现，不声称是上游完整移植；未复制上游源代码、词库或测试集。测试输入为本项目新写。MIT 仅适用于本目录原创代码。将来如移植上游文件，需要另行保存其版权声明并核查许可证，不能直接沿用当前说明。

## 审查

先看 `cmd/main/main.mbt` 的实际使用，再看公共 API 与测试文件。联网兼容性、性能数据或官方验收未执行的部分不得从本地单元测试成功推断。

## 下一阶段与明确限制

增加 TCP/TLS 适配与真实测试服务器互通；USER/PASS 当前限制为不含空白的可打印 ASCII；RETR 正文保留原始字节，状态行用 UTF-8 解码。

本分装包自带 `web/index.html`（用 `start-review.ps1` 启动）。`cmd/web/main.mbt` 为薄适配层，网页调用编译后的真实 MoonBit 模块。

## 独立分装使用

本文件夹可以单独移动或建立仓库，不依赖其他候选项目。浏览器演示已编译，无须安装 MoonBit 即可试用（需要 Python 3）：

```powershell
./start-review.ps1
```

打开 http://127.0.0.1:8773/web/ 。修改和测试源码需安装 MoonBit 与 Node.js，再运行 `./verify.ps1`。本机尚未将 MoonBit 加入 PATH 时，可传入 `-MoonPath`。独立包不捆绑编译器。

仅含本项目源码和构建产物；没有上传仓库或发布包。`DUPLICATION.md`、`evidence/current-validation.json` 和本次分装清单 提供查重、测试和完整性资料。

## 独立仓库工作流

本目录是该项目后续开发的唯一主仓库，旧批次目录及 ZIP 为历史审查快照。没有 Git remote，没有共享构建目录，没有上级 moon.work。

真实 CLI 支持输入参数、文件和标准输入：

```powershell
node tools/cli.mjs --help
node tools/cli.mjs --file sample.txt --json
```

需要安装 MoonBit 后传 `-MoonPath` 或将 moon 加入 PATH；不依赖工作区之外的私有脚本。详见 [TESTING.md](TESTING.md) 和 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 本轮功能升级

增加 STAT/LIST 的类型化响应读取和重复编号拒绝。

仍缺 APOP、STLS 和独立服务器互操作；0.3.0 已补 TCP/隐式 TLS 接入。

[可执行 API 示例](README.mbt.md)会随测试运行；[功能边界](FEATURES.md)和[测试说明](TESTING.md)用于独立审查。网页与 CLI 展示示例入口，新 API 的完整使用见可执行示例。


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
