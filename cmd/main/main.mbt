///|
fn main raise {
  let s = @lib.Session::new()
  ignore(s.feed(b"+OK mailbox ready\r\n"))
  println(s.issue(@lib.User("demo")))
  ignore(s.feed(b"+OK\r\n"))
  ignore(s.issue(@lib.Pass("example")))
  ignore(s.feed(b"+OK\r\n"))
  ignore(s.issue(@lib.List(None)))
  let replies = s.feed(b"+OK listing\r\n1 120\r\n2 450\r\n.\r\n")
  println("Parsed listing payload bytes: \{replies[0].body.length()}")
  s.finish()
}
