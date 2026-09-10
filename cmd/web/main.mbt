///|
pub fn run(input : String) -> String {
  try {
    let s = @lib.Session::new()
    ignore(s.feed(b"+OK\r\n"))
    ignore(s.issue(@lib.User("demo")))
    ignore(s.feed(b"+OK\r\n"))
    ignore(s.issue(@lib.Pass("example")))
    ignore(s.feed(b"+OK\r\n"))
    ignore(s.issue(@lib.Retr(1)))
    let replies = s.feed(
      @utf8.encode(
        input
        .replace_all(old="\r\n", new="\n")
        .replace_all(old="\n", new="\r\n"),
      ),
    )
    s.finish()
    Repr(replies).to_string()
  } catch {
    e => "ERROR: " + Repr(e).to_string()
  }
}

///|
fn main {

}
