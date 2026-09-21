# MoonBit POP3 会话与客户端 · 项目申报书

## 一、项目名称

MoonBit POP3 会话与客户端

## 二、项目说明

MoonBit 实现命令校验、状态、CRLF 增量解析和点转义；Node 宿主提供 TCP、隐式 TLS、STLS、超时与取消。

## 三、方向与通用性

基础软件与邮件协议。用于邮箱备份、UIDL 增量拉取及删除事务检查；不提供所有 SASL 机制或 PIPELINING。

## 四、应用场景

默认 995 TLS 连接后拉取原始邮件字节；以 UIDL 比对新增消息；STLS 必须成功才允许后续认证。DELE 仅标记删除，应用须单独判断 QUIT 结果。

## 五、功能与验证边界

含 USER/PASS、APOP、CAPA、AUTH PLAIN、STAT/LIST/UIDL/RETR/DELE/TOP/RSET/QUIT 等范围。QUIT 回复丢失或连接异常时提交结果可能不确定，不能保证“没有已删/未删歧义”；应重新连接按 UIDL 核对，避免盲目重试删除。

## 六、原创性与参考材料

原创代码 MIT。依据 RFC 1939/2449/2595/5034/4616 独立编写，https://www.rfc-editor.org/rfc/rfc1939。Dovecot 2.4.2 仅为测试依赖，许可证按文件为 LGPL-2.1/MIT 等（https://github.com/dovecot/core/blob/main/COPYING），二进制不随源码分发。

## 七、仓库链接

https://github.com/cheng-jun56/moonbit-pop3
