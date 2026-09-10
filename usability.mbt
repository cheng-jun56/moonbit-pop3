///|
/// Parse a positive STAT reply as message count and total octets.
pub fn Reply::stat(self : Reply) -> (Int, Int) raise PopError {
  if !self.ok {
    raise Invalid("negative server reply")
  }
  let fields = self.message.split(" ").filter(x => !x.is_empty()).collect()
  if fields.length() != 2 {
    raise Invalid("STAT requires count and octets")
  }
  let count = @string.parse_int(fields[0]) catch {
    _ => raise Invalid("STAT count")
  }
  let octets = @string.parse_int(fields[1]) catch {
    _ => raise Invalid("STAT octets")
  }
  if count < 0 || octets < 0 {
    raise Invalid("negative STAT value")
  }
  (count, octets)
}

///|
/// Parse the unstuffed multiline LIST body; reject duplicate message numbers.
pub fn Reply::listing(self : Reply) -> Array[(Int, Int)] raise PopError {
  if !self.ok {
    raise Invalid("negative server reply")
  }
  let body = @utf8.decode(self.body) catch {
    _ => raise Invalid("invalid LIST text")
  }
  let out = []
  let seen : Map[Int, Bool] = Map([])
  for line in body.split("\r\n") {
    if line.is_empty() {
      continue
    }
    let f = line.split(" ").filter(x => !x.is_empty()).collect()
    if f.length() != 2 {
      raise Invalid("LIST row")
    }
    let id = @string.parse_int(f[0]) catch { _ => raise Invalid("LIST id") }
    let size = @string.parse_int(f[1]) catch {
      _ => raise Invalid("LIST octets")
    }
    if id < 1 || size < 0 || seen.contains(id) {
      raise Invalid("LIST invalid or duplicate id")
    }
    seen[id] = true
    out.push((id, size))
  }
  out
}
