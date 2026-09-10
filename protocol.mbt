///|
pub suberror PopError {
  Invalid(String)
} derive(Debug)

///|
pub(all) enum Command {
  User(String)
  Pass(String)
  Apop(String, String)
  Capa
  Stat
  List(Int?)
  Uidl(Int?)
  Retr(Int)
  Dele(Int)
  Top(Int, Int)
  Noop
  Rset
  Quit
} derive(Debug, Eq)

///|
pub(all) enum Phase {
  Greeting
  Authorization
  Transaction
  Closed
} derive(Debug, Eq)

///|
pub struct Reply {
  ok : Bool
  message : String
  body : Bytes
} derive(Debug, Eq)

///|
fn Command::multiline(self : Command) -> Bool {
  match self {
    Capa | List(None) | Uidl(None) | Retr(_) | Top(_, _) => true
    _ => false
  }
}

///|
pub fn Command::encode(self : Command) -> String raise PopError {
  fn arg(s : String) -> String raise PopError {
    if s == "" {
      raise Invalid("empty argument")
    }
    for c in s.iter() {
      if c <= ' ' || c > '~' {
        raise Invalid("argument requires printable ASCII without whitespace")
      }
    }
    s
  }
  fn index(n : Int) -> String raise PopError {
    if n < 1 {
      raise Invalid("message number must be positive")
    }
    n.to_string()
  }
  let line = match self {
    User(s) => "USER " + arg(s)
    Pass(s) => "PASS " + arg(s)
    Capa => "CAPA"
    Apop(user, digest) => {
      if digest.length() != 32 {
        raise Invalid("APOP requires 32 hex digits")
      }
      for c in digest.iter() {
        if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) {
          raise Invalid("APOP requires lowercase hex")
        }
      }
      "APOP " + arg(user) + " " + digest
    }
    Stat => "STAT"
    List(n) =>
      "LIST" +
      (match n {
        Some(n) => " " + index(n)
        None => ""
      })
    Uidl(n) =>
      "UIDL" +
      (match n {
        Some(n) => " " + index(n)
        None => ""
      })
    Retr(n) => "RETR " + index(n)
    Dele(n) => "DELE " + index(n)
    Top(n, lines) => {
      if lines < 0 {
        raise Invalid("negative TOP line count")
      }
      "TOP " + index(n) + " " + lines.to_string()
    }
    Noop => "NOOP"
    Rset => "RSET"
    Quit => "QUIT"
  }
  if line.length() > 510 {
    raise Invalid("command too long")
  }
  line + "\r\n"
}
