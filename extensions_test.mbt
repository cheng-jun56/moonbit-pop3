///|
test "extensions CAPA available before and after authentication" {
  let s = @pop3.Session::new()
  ignore(s.feed(b"+OK hi\r\n"))
  assert_eq(s.issue(@pop3.Capa), "CAPA\r\n")
  let r = s.feed(b"+OK capabilities\r\nUSER\r\nUIDL\r\n.\r\n")
  assert_eq(r[0].body, b"USER\r\nUIDL\r\n")
  ignore(s.issue(@pop3.Apop("mrose", "c4c9334bac560ecc979e58001b3e22fb")))
  ignore(s.feed(b"+OK\r\n"))
  assert_eq(s.phase(), @pop3.Transaction)
  assert_eq(s.issue(@pop3.Capa), "CAPA\r\n")
}

///|
test "extensions APOP failure allows retry and blocks transaction calls" {
  let s = @pop3.Session::new()
  ignore(s.feed(b"+OK hi\r\n"))
  ignore(s.issue(@pop3.Apop("mrose", "c4c9334bac560ecc979e58001b3e22fb")))
  ignore(s.feed(b"-ERR rejected\r\n"))
  assert_eq(s.phase(), @pop3.Authorization)
  assert_true(
    try {
      ignore(s.issue(@pop3.Stat))
      false
    } catch {
      _ => true
    },
  )
  ignore(s.issue(@pop3.User("mrose")))
}

///|
test "extensions APOP digest validation" {
  for
    digest in [
      "", "1234", "C4C9334BAC560ECC979E58001B3E22FB", "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
    ] {
    assert_true(
      try {
        ignore(@pop3.Apop("mrose", digest).encode())
        false
      } catch {
        _ => true
      },
    )
  }
}
