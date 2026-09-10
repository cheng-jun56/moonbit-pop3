///|
fn login() -> @pop3.Session raise {
  let s = @pop3.Session::new()
  ignore(s.feed(b"+OK ready\r\n"))
  assert_eq(s.issue(@pop3.User("alice")), "USER alice\r\n")
  ignore(s.feed(b"+OK\r\n"))
  ignore(s.issue(@pop3.Pass("secret")))
  ignore(s.feed(b"+OK logged in\r\n"))
  s
}

///|
test "login multiline retrieval and quit" {
  let s = login()
  assert_eq(s.phase(), @pop3.Transaction)
  ignore(s.issue(@pop3.Retr(1)))
  let replies = []
  for b in b"+OK message\r\nSubject: hello\r\n\r\n..dot\r\n.\r\n" {
    for r in s.feed(Bytes::from_array([b])) {
      replies.push(r)
    }
  }
  assert_eq(replies.length(), 1)
  assert_eq(replies[0].body, b"Subject: hello\r\n\r\n.dot\r\n")
  ignore(s.issue(@pop3.Quit))
  ignore(s.feed(b"+OK bye\r\n"))
  assert_eq(s.phase(), @pop3.Closed)
  s.finish()
}

///|
test "negative multiline reply terminates without dot" {
  let s = login()
  ignore(s.issue(@pop3.List(None)))
  let replies = s.feed(b"-ERR temporarily unavailable\r\n")
  assert_eq(replies.length(), 1)
  assert_false(replies[0].ok)
  ignore(s.issue(@pop3.Noop))
  ignore(s.feed(b"+OK\r\n"))
  s.finish()
}

///|
test "phase and injection defenses" {
  let s = @pop3.Session::new()
  assert_true(
    try {
      ignore(s.issue(@pop3.User("x")))
      false
    } catch {
      _ => true
    },
  )
  ignore(s.feed(b"+OK\r\n"))
  assert_true(
    try {
      ignore(s.issue(@pop3.Pass("x")))
      false
    } catch {
      _ => true
    },
  )
  assert_true(
    try {
      ignore(@pop3.User("x\r\nQUIT").encode())
      false
    } catch {
      _ => true
    },
  )
  assert_true(
    try {
      ignore(@pop3.Retr(0).encode())
      false
    } catch {
      _ => true
    },
  )
  ignore(s.issue(@pop3.User("x")))
  assert_true(
    try {
      ignore(s.issue(@pop3.User("y")))
      false
    } catch {
      _ => true
    },
  )
}

///|
test "partial response and malformed status rejected" {
  let s = login()
  ignore(s.issue(@pop3.Stat))
  ignore(s.feed(b"+OK 1"))
  assert_true(
    try {
      s.finish()
      false
    } catch {
      _ => true
    },
  )
  let bad = @pop3.Session::new()
  assert_true(
    try {
      ignore(bad.feed(b"+OKAY\r\n"))
      false
    } catch {
      _ => true
    },
  )
}
