///|
let sessions : Map[String, @lib.Session] = Map([])

///|
fn hex(bytes : Bytes) -> String {
  let digits : Array[Char] = "0123456789abcdef".iter().collect()
  let out = StringBuilder()
  for b in bytes {
    out.write_char(digits[b.to_int() / 16])
    out.write_char(digits[b.to_int() % 16])
  }
  out.to_string()
}

///|
fn unhex(s : String) -> Bytes raise Failure {
  if s.length() % 2 != 0 || s.length() > 2097152 {
    raise Failure("invalid chunk length")
  }
  let out = []
  let mut value = 0
  for i in 0..<s.length() {
    let c = s[i].to_int()
    let n = if c >= 48 && c <= 57 {
      c - 48
    } else if c >= 97 && c <= 102 {
      c - 87
    } else {
      -1
    }
    if n < 0 {
      raise Failure("invalid hex")
    }
    value = value * 16 + n
    if i % 2 == 1 {
      out.push(value.to_byte())
      value = 0
    }
  }
  Bytes::from_array(out)
}

///|
fn session(key : String) -> @lib.Session raise Failure {
  match sessions.get(key) {
    Some(s) => s
    None => raise Failure("unknown session")
  }
}

///|
pub fn session_open(key : String) -> String {
  if sessions.length() >= 64 || sessions.contains(key) {
    return "ERROR: session limit or duplicate"
  }
  sessions[key] = @lib.Session::new()
  ""
}

///|
pub fn session_close(key : String) -> Unit {
  sessions.remove(key)
}

///|
pub fn session_feed(key : String, chunk : String) -> String {
  session(key)
  .feed(unhex(chunk))
  .map(fn(r) {
    (if r.ok { "1" } else { "0" }) +
    ":" +
    hex(@utf8.encode(r.message)) +
    ":" +
    hex(r.body)
  })
  .join("\n") catch {
    e => "ERROR: " + Repr(e).to_string()
  }
}

///|
pub fn session_finish(key : String) -> String {
  try {
    session(key).finish()
    ""
  } catch {
    e => "ERROR: " + Repr(e).to_string()
  }
}

///|
pub fn session_issue(
  key : String,
  verb : String,
  text : String,
  index : Int,
  lines : Int,
  digest : String,
) -> String {
  try {
    let c = match verb {
      "USER" => @lib.User(text)
      "PASS" => @lib.Pass(text)
      "CAPA" => @lib.Capa
      "APOP" => @lib.Apop(text, digest)
      "STAT" => @lib.Stat
      "LIST" => @lib.List(if index < 0 { None } else { Some(index) })
      "UIDL" => @lib.Uidl(if index < 0 { None } else { Some(index) })
      "RETR" => @lib.Retr(index)
      "DELE" => @lib.Dele(index)
      "TOP" => @lib.Top(index, lines)
      "NOOP" => @lib.Noop
      "RSET" => @lib.Rset
      "QUIT" => @lib.Quit
      _ => raise Failure("unsupported command")
    }
    session(key).issue(c)
  } catch {
    e => "ERROR: " + Repr(e).to_string()
  }
}
