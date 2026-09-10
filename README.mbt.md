# 可执行 API 示例

增加 STAT/LIST 的类型化响应读取和重复编号拒绝。这些例子调用公开 API，并随 `moon test` 执行。

```mbt check
///|
test "typed STAT and LIST reply consumers" {
  let s = @pop3.Session::new()
  ignore(s.feed(b"+OK\r\n"))
  ignore(s.issue(@pop3.User("u")))
  ignore(s.feed(b"+OK\r\n"))
  ignore(s.issue(@pop3.Pass("p")))
  ignore(s.feed(b"+OK\r\n"))
  ignore(s.issue(@pop3.Stat))
  let r = s.feed(b"+OK 2 300\r\n")
  assert_eq(r[0].stat(), (2, 300))
  ignore(s.issue(@pop3.List(None)))
  let r = s.feed(b"+OK list\r\n1 100\r\n2 200\r\n.\r\n")
  assert_eq(r[0].listing(), [(1, 100), (2, 200)])
}
```

限制：无 TLS/socket/APOP 及真实服务器互操作。
