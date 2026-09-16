///|
fn auth_session() -> @pop3.Session raise {
  let s = @pop3.Session::new()
  ignore(s.feed(b"+OK greeting\r\n"))
  s
}

///|
test "STLS suspends commands until the transport verifies TLS" {
  let s = auth_session()
  ignore(s.issue(@pop3.User("old-user")))
  ignore(s.feed(b"+OK\r\n"))
  assert_eq(s.issue(@pop3.Stls), "STLS\r\n")
  for byte in b"+OK start TLS\r\n" {
    ignore(s.feed(Bytes::from_array([byte])))
  }
  assert_eq(s.phase(), @pop3.TlsHandshake)
  assert_true(
    try {
      ignore(s.issue(@pop3.Capa))
      false
    } catch {
      _ => true
    },
  )
  assert_true(
    try {
      s.finish()
      false
    } catch {
      _ => true
    },
  )
  s.tls_established()
  assert_eq(s.phase(), @pop3.Authorization)
  assert_true(
    try {
      ignore(s.issue(@pop3.Pass("secret")))
      false
    } catch {
      _ => true
    },
  )
  assert_true(
    try {
      ignore(s.issue(@pop3.Stls))
      false
    } catch {
      _ => true
    },
  )
  assert_eq(s.issue(@pop3.Capa), "CAPA\r\n")
}

///|
test "STLS requires authorization and preserves state on refusal" {
  let fresh = @pop3.Session::new()
  assert_true(
    try {
      fresh.tls_established()
      false
    } catch {
      _ => true
    },
  )
  assert_true(
    try {
      ignore(fresh.issue(@pop3.Stls))
      false
    } catch {
      _ => true
    },
  )
  let s = auth_session()
  ignore(s.issue(@pop3.Stls))
  assert_false(s.feed(b"-ERR unavailable\r\n")[0].ok)
  assert_eq(s.phase(), @pop3.Authorization)
  ignore(s.issue(@pop3.User("u")))
  ignore(s.feed(b"+OK\r\n"))
  ignore(s.issue(@pop3.Pass("p")))
  ignore(s.feed(b"+OK\r\n"))
  assert_true(
    try {
      ignore(s.issue(@pop3.Stls))
      false
    } catch {
      _ => true
    },
  )
}

///|
test "STLS rejects complete partial and separately delivered plaintext injection" {
  for suffix in [b"+OK injected\r\n", b"+", b"\x16\x03"] {
    let s = auth_session()
    ignore(s.issue(@pop3.Stls))
    assert_true(
      try {
        ignore(s.feed(b"+OK TLS\r\n" + suffix))
        false
      } catch {
        _ => true
      },
    )
    assert_true(
      try {
        s.tls_established()
        false
      } catch {
        _ => true
      },
    )
  }
  let s = auth_session()
  ignore(s.issue(@pop3.Stls))
  ignore(s.feed(b"+OK TLS\r\n"))
  assert_true(
    try {
      ignore(s.feed(b"+"))
      false
    } catch {
      _ => true
    },
  )
}

///|
test "SASL PLAIN continuation does not authenticate early" {
  let s = auth_session()
  assert_eq(s.issue(@pop3.Auth("PLAIN")), "AUTH PLAIN\r\n")
  let challenge = s.feed(b"+ \r\n")[0]
  assert_true(challenge.continuation)
  assert_eq(challenge.message, "")
  assert_eq(s.phase(), @pop3.Authorization)
  assert_true(
    try {
      ignore(s.issue(@pop3.Capa))
      false
    } catch {
      _ => true
    },
  )
  assert_eq(s.authenticate_response("AHUAcA=="), "AHUAcA==\r\n")
  let reply = s.feed(b"+OK authenticated\r\n")[0]
  assert_false(reply.continuation)
  assert_eq(s.phase(), @pop3.Transaction)
}

///|
test "SASL failure cancellation and response validation" {
  let s = auth_session()
  assert_true(
    try {
      ignore(s.authenticate_response("AHUAcA=="))
      false
    } catch {
      _ => true
    },
  )
  ignore(s.issue(@pop3.Auth("PLAIN")))
  ignore(s.feed(b"+\r\n"))
  for invalid in ["", "a", "A=BC", "A===", "AHUAcA==\r\nQUIT"] {
    assert_true(
      try {
        ignore(s.authenticate_response(invalid))
        false
      } catch {
        _ => true
      },
    )
  }
  assert_eq(s.authenticate_response("*"), "*\r\n")
  ignore(s.feed(b"-ERR cancelled\r\n"))
  assert_eq(s.phase(), @pop3.Authorization)
  ignore(s.issue(@pop3.Auth("PLAIN")))
  ignore(s.feed(b"-ERR unsupported\r\n"))
  assert_eq(s.issue(@pop3.Capa), "CAPA\r\n")
}

///|
test "SASL rejects premature success unsolicited and repeated continuations" {
  let s = auth_session()
  ignore(s.issue(@pop3.Auth("PLAIN")))
  assert_true(
    try {
      ignore(s.feed(b"+OK authenticated\r\n"))
      false
    } catch {
      _ => true
    },
  )
  let u = auth_session()
  assert_true(
    try {
      ignore(u.feed(b"+ \r\n"))
      false
    } catch {
      _ => true
    },
  )
  let r = auth_session()
  ignore(r.issue(@pop3.Auth("PLAIN")))
  ignore(r.feed(b"+ \r\n"))
  ignore(r.authenticate_response("AHUAcA=="))
  assert_true(
    try {
      ignore(r.feed(b"+ \r\n"))
      false
    } catch {
      _ => true
    },
  )
}

///|
test "SASL cancellation cannot be followed by success or another challenge" {
  for suffix in [b"+OK accepted\r\n", b"+ \r\n"] {
    let s = auth_session()
    ignore(s.issue(@pop3.Auth("PLAIN")))
    ignore(s.feed(b"+ \r\n"))
    ignore(s.authenticate_response("*"))
    assert_true(
      try {
        ignore(s.feed(suffix))
        false
      } catch {
        _ => true
      },
    )
  }
}
