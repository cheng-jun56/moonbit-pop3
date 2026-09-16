///|
fn validate_sasl_base64(
  value : String,
  allow_empty~ : Bool,
) -> Unit raise PopError {
  if value.length() > 16380 ||
    value.length() % 4 != 0 ||
    (!allow_empty && value.is_empty()) {
    raise Invalid("SASL response length")
  }
  let mut padding = 0
  for c in value.iter() {
    if c == '=' {
      padding += 1
    } else if padding > 0 ||
      !((c >= 'a' && c <= 'z') ||
      (c >= 'A' && c <= 'Z') ||
      (c >= '0' && c <= '9') ||
      c == '+' ||
      c == '/') {
      raise Invalid("SASL base64 alphabet")
    }
  }
  if padding > 2 {
    raise Invalid("SASL base64 padding")
  }
}
