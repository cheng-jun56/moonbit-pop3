///|
pub struct Session {
  priv mut phase : Phase
  priv mut user_ok : Bool
  priv mut pending : Command?
  priv line : Array[Byte]
  priv body : Array[Byte]
  priv mut status : String?
  priv mut failed : Bool
} derive(Debug)

///|
pub fn Session::new() -> Session {
  {
    phase: Greeting,
    user_ok: false,
    pending: None,
    line: [],
    body: [],
    status: None,
    failed: false,
  }
}

///|
pub fn Session::phase(self : Session) -> Phase {
  self.phase
}

///|
pub fn Session::issue(
  self : Session,
  command : Command,
) -> String raise PopError {
  if self.failed ||
    self.pending is Some(_) ||
    self.phase == Greeting ||
    self.phase == Closed {
    raise Invalid("session not ready for command")
  }
  match command {
    User(_) | Apop(_, _) =>
      if self.phase != Authorization {
        raise Invalid("USER outside authorization")
      }
    Pass(_) =>
      if self.phase != Authorization || !self.user_ok {
        raise Invalid("PASS requires successful USER")
      }
    Quit | Capa => ()
    _ =>
      if self.phase != Transaction {
        raise Invalid("command requires authentication")
      }
  }
  let wire = command.encode()
  self.pending = Some(command)
  wire
}

///|
fn Session::complete(self : Session, ok : Bool, message : String) -> Reply {
  if self.phase == Greeting {
    self.phase = if ok { Authorization } else { Closed }
  } else if self.pending is Some(command) {
    match command {
      User(_) => self.user_ok = ok
      Pass(_) | Apop(_, _) => if ok { self.phase = Transaction }
      Quit => self.phase = Closed
      _ => ()
    }
  }
  self.pending = None
  self.status = None
  let reply : Reply = { ok, message, body: Bytes::from_array(self.body), }
  self.body.clear()
  reply
}

///|
pub fn Session::feed(
  self : Session,
  input : Bytes,
) -> Array[Reply] raise PopError {
  if self.failed || self.phase == Closed {
    raise Invalid("closed or failed session")
  }
  errdefer {
    self.failed = true
  }
  let replies = []
  for b in input {
    if b != 10 {
      self.line.push(b)
      let limit = if self.status is Some(_) { 65536 } else { 511 }
      if self.line.length() > limit {
        raise Invalid("reply line too long")
      }
      continue
    }
    if self.line.is_empty() || self.line[self.line.length() - 1] != 13 {
      raise Invalid("expected CRLF")
    }
    ignore(self.line.pop())
    if self.status is Some(message) {
      if self.line.length() == 1 && self.line[0] == 46 {
        replies.push(self.complete(true, message))
      } else {
        let start = if self.line.length() > 0 && self.line[0] == 46 {
          1
        } else {
          0
        }
        if start == 1 && (self.line.length() < 2 || self.line[1] != 46) {
          raise Invalid("invalid dot-stuffed body line")
        }
        if self.body.length() + self.line.length() + 2 > 8388608 {
          raise Invalid("message too large")
        }
        for i in start..<self.line.length() {
          self.body.push(self.line[i])
        }
        self.body.push(13)
        self.body.push(10)
      }
    } else {
      if self.phase != Greeting && self.pending is None {
        raise Invalid("unsolicited reply")
      }
      let line = @utf8.decode(Bytes::from_array(self.line)) catch {
        _ => raise Invalid("invalid status encoding")
      }
      let ok = line == "+OK" || line.has_prefix("+OK ")
      let bad = line == "-ERR" || line.has_prefix("-ERR ")
      if !ok && !bad {
        raise Invalid("invalid status indicator")
      }
      let message = line[if ok { 3 } else { 4 }:].trim_start().to_owned()
      if ok &&
        (match self.pending {
          Some(c) => c.multiline()
          None => false
        }) {
        self.status = Some(message)
      } else {
        replies.push(self.complete(ok, message))
      }
    }
    self.line.clear()
  }
  replies
}

///|
pub fn Session::finish(self : Session) -> Unit raise PopError {
  if self.failed ||
    !self.line.is_empty() ||
    self.status is Some(_) ||
    self.pending is Some(_) ||
    self.phase == Greeting {
    raise Invalid("truncated or failed exchange")
  }
}
