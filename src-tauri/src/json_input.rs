/// Strip a leading markdown ``` or ```json (case-insensitive) fence and trailing ```.
fn strip_json_code_fence(s: &str) -> Option<&str> {
    let t = s.trim();
    let b = t.as_bytes();
    if b.len() < 3 || b[0] != b'`' || b[1] != b'`' || b[2] != b'`' {
        return None;
    }

    let mut i = 3usize;
    if i + 4 <= b.len() && t[i..i + 4].eq_ignore_ascii_case("json") {
        i += 4;
    }

    let inner = t[i..].trim_start_matches(['\n', '\r']);
    inner.strip_suffix("```").map(str::trim)
}

/// Remove trailing commas before `}` or `]` outside of JSON string literals.
/// LLMs often emit `{"a":1,}`; this repairs the extracted snippet only.
pub fn repair_llm_json_trailing_commas(input: &str) -> String {
    let chars: Vec<char> = input.chars().collect();
    let mut out: Vec<char> = Vec::with_capacity(chars.len());
    let mut i = 0;
    let mut in_string = false;
    let mut string_escape = false;

    while i < chars.len() {
        let c = chars[i];
        if in_string {
            out.push(c);
            if string_escape {
                string_escape = false;
            } else if c == '\\' {
                string_escape = true;
            } else if c == '"' {
                in_string = false;
            }
            i += 1;
            continue;
        }

        if c == '"' {
            in_string = true;
            out.push(c);
            i += 1;
            continue;
        }

        if c == ',' {
            let mut j = i + 1;
            while j < chars.len() && chars[j].is_whitespace() {
                j += 1;
            }
            if j < chars.len() && (chars[j] == '}' || chars[j] == ']') {
                i += 1;
                continue;
            }
        }

        out.push(c);
        i += 1;
    }

    out.into_iter().collect()
}

/// Try to parse the first JSON value from `text` and return the exact substring that was consumed.
fn first_json_value_snippet(text: &str, want_array: bool) -> Option<String> {
    let is_expected = |v: &serde_json::Value| {
        if want_array {
            v.is_array()
        } else {
            v.is_object()
        }
    };

    let mut iter = serde_json::Deserializer::from_str(text).into_iter::<serde_json::Value>();
    if let Some(Ok(v)) = iter.next() {
        if is_expected(&v) {
            let end = iter.byte_offset();
            return text.get(..end).map(str::to_string);
        }
    }
    None
}

/// Extract the first valid JSON value (object or array) from raw model output.
fn extract_json_value(content: &str, want_array: bool) -> Option<String> {
    let s = content.trim();
    let opener = if want_array { '[' } else { '{' };

    // Already a clean value (optional trailing-comma repair).
    if s.starts_with(opener) {
        if let Some(snippet) = first_json_value_snippet(s, want_array) {
            return Some(snippet);
        }
        let fixed = repair_llm_json_trailing_commas(s);
        if fixed != s {
            if let Some(snippet) = first_json_value_snippet(&fixed, want_array) {
                return Some(snippet);
            }
        }
    }

    // Strip ``` / ```json (any case) ... ``` fences.
    if let Some(inner) = strip_json_code_fence(s) {
        if inner.starts_with(opener) {
            if let Some(snippet) = first_json_value_snippet(inner, want_array) {
                return Some(snippet);
            }
            let fixed = repair_llm_json_trailing_commas(inner);
            if fixed != inner {
                if let Some(snippet) = first_json_value_snippet(&fixed, want_array) {
                    return Some(snippet);
                }
            }
        }
    }

    // Scan for the first parseable value.
    for (i, ch) in content.char_indices() {
        if ch != opener {
            continue;
        }
        let slice = &content[i..];
        if let Some(snippet) = first_json_value_snippet(slice, want_array) {
            return Some(snippet);
        }
        let fixed = repair_llm_json_trailing_commas(slice);
        if fixed != slice {
            if let Some(snippet) = first_json_value_snippet(&fixed, want_array) {
                return Some(snippet);
            }
        }
    }

    None
}

/// Extract the first valid JSON object from raw model output.
pub fn extract_json_object(content: &str) -> Option<String> {
    extract_json_value(content, false)
}

/// Extract the first valid JSON array from raw model output.
pub fn extract_json_array(content: &str) -> Option<String> {
    extract_json_value(content, true)
}

#[cfg(test)]
mod tests {
    use super::{extract_json_array, extract_json_object, repair_llm_json_trailing_commas};

    #[test]
    fn repair_trailing_commas_in_object() {
        let bad = r#"{"a":1,}"#;
        let fixed = repair_llm_json_trailing_commas(bad);
        let v: serde_json::Value = serde_json::from_str(&fixed).unwrap();
        assert_eq!(v["a"], 1);
    }

    #[test]
    fn extract_json_array_bare_array() {
        let s = r#"  [  {"id":"q1"} ]  "#;
        let out = extract_json_array(s).unwrap();
        let v: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert!(v.is_array());
    }

    #[test]
    fn extract_json_object_case_insensitive_json_fence() {
        let input = "```JSON\n{\"questions\":[]}\n```";
        let out = extract_json_object(input).unwrap();
        let v: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert!(v.get("questions").is_some());
    }

    #[test]
    fn extract_json_object_trailing_comma() {
        let input = "{\"questions\":[],}";
        let out = extract_json_object(input).unwrap();
        let v: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert!(v.get("questions").is_some());
    }
}
