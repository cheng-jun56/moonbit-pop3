## 0.5.0

- STLS 升级、明确握手状态、能力刷新及升级失败关闭连接。
- SASL PLAIN 挑战响应、异常挑战取消、失败后显式重试。
- 明文密码认证默认拒绝，受控测试需显式 allowInsecureAuth:true。
- TLS 配置采用字段白名单，保留强制证书/主机名校验。
- 公开核心 TlsHandshake、tls_established、authenticate_response 与 Reply.continuation；Node 增加 startTls、authenticatePlain、state/secure。
- Dovecot 2.4.2 独立互通与针对 TLS/认证边界的可复现验证。
