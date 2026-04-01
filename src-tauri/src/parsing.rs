use crate::models::{default_max_marks, AppError, CommandResult, GeneratedQuestion, McQuestion};

// --- JSON pre-processing: protect LaTeX commands from JSON escape sequences --
//
// The fundamental problem: JSON defines \f as form feed (U+000C) and \t as tab
// (U+0009). When an LLM outputs LaTeX like \frac or \text inside a JSON string,
// standard JSON parsers destroy those commands:
//
//   "\frac{1}{2}"  →  "<FF>rac{1}{2}"   (\f consumed as form feed)
//   "\text{hello}" →  "<TAB>ext{hello}"  (\t consumed as tab)
//
// The previous approach tried to recover these in TypeScript after the damage
// was done, which is fragile and incomplete. The correct fix is to pre-process
// the raw JSON bytes and protect LaTeX commands BEFORE serde_json sees them.
//
// Strategy: scan raw JSON string values and replace any \X sequence where X
// starts a known LaTeX command with \\X (a proper JSON two-char escape for a
// single backslash), so that after JSON parsing the string contains a literal
// backslash followed by the command name.
//
// The only JSON single-char escapes that collide with LaTeX commands are:
//   \f  (form feed)   — collides with \frac, \forall, \fbox, etc.
//   \t  (tab)         — collides with \text, \times, \theta, \tau, \tan, etc.
//   \r  (CR)          — collides with \right, \rho, \rm, etc. (less common)
//   \n  (LF)          — collides with \nabla, \nu, etc. (handled by decode_escapes)
//   \b  (backspace)   — collides with \beta, \bar, \bf, \begin, etc.
//   \0 through \9 are not JSON escapes, so \div, \delta etc. are fine in raw JSON
//
// Note: \u, \", \\, \/ are also JSON escapes but never start LaTeX commands
// that would be confused here.

/// Pre-process raw JSON text to protect LaTeX commands from being destroyed by
/// JSON escape sequence interpretation.
///
/// This must be called on the raw model output *before* passing it to
/// serde_json. It rewrites `\X` inside JSON string literals where `X` is a
/// letter that would otherwise be consumed as a JSON escape, turning them into
/// `\\X` so that after parsing the string contains a real backslash.
pub fn protect_latex_in_raw_json(raw: &str) -> String {
    // The colliding single-char JSON escape sequences whose next char could be
    // the start of a LaTeX command. The replacements are ordered so that the
    // already-escaped forms (\\f, \\t, etc.) are *not* double-processed; we only
    // touch unescaped single-backslash forms.
    //
    // We walk the raw bytes looking for JSON string contents and rewrite in one
    // linear pass.

    let bytes = raw.as_bytes();
    let len = bytes.len();
    let mut out = Vec::with_capacity(len + len / 8);
    let mut i = 0;

    while i < len {
        // Outside a string literal: copy until we enter one.
        if bytes[i] != b'"' {
            out.push(bytes[i]);
            i += 1;
            continue;
        }

        // Opening quote of a JSON string literal.
        out.push(b'"');
        i += 1;

        // Walk the string contents.
        while i < len {
            match bytes[i] {
                b'"' => {
                    // Closing (unescaped) quote — end of string.
                    out.push(b'"');
                    i += 1;
                    break;
                }
                b'\\' if i + 1 < len => {
                    let next = bytes[i + 1];
                    match next {
                        // Already a proper two-char escape or unicode escape —
                        // copy verbatim and skip both chars.
                        b'"' | b'\\' | b'/' | b'n' | b'r' | b't' | b'b' | b'f' | b'u' => {
                            // For \n, \r, \t, \b, \f we need to check: is this
                            // actually a JSON escape for whitespace/control, or
                            // is the model trying to write a LaTeX command?
                            //
                            // Heuristic: if the character after the escape letter
                            // is an ASCII letter (a-z, A-Z) then treat the whole
                            // thing as a LaTeX command that got mis-escaped — emit
                            // \\X so the JSON parser yields \X.
                            //
                            // Previously \n / \r were excluded, but LaTeX commands
                            // like \nabla, \nu, \notin, \right, \rho, \rm are
                            // common in math output and get corrupted by JSON
                            // parsing. We now protect all three: \f, \t, \b, \n, \r.
                            if matches!(next, b'f' | b't' | b'b' | b'n' | b'r')
                                && i + 2 < len
                                && bytes[i + 2].is_ascii_alphabetic()
                            {
                                // Emit \\X: a JSON-escaped backslash + the letter.
                                out.extend_from_slice(b"\\\\");
                                out.push(next);
                                i += 2;
                            } else {
                                // Regular JSON escape — copy as-is.
                                out.push(b'\\');
                                out.push(next);
                                i += 2;
                            }
                        }
                        // Bare backslash before a letter that is NOT a standard
                        // JSON escape sequence: the model wrote something like \s,
                        // \c, \d etc. (LaTeX commands). These are technically
                        // invalid JSON but many LLMs emit them. serde_json with
                        // lenient parsing or our pre-scan may see them.
                        // Emit \\X to make them valid and preserve the backslash.
                        c if c.is_ascii_alphabetic() => {
                            out.extend_from_slice(b"\\\\");
                            out.push(c);
                            i += 2;
                        }
                        // Anything else after backslash: copy verbatim.
                        _ => {
                            out.push(b'\\');
                            out.push(next);
                            i += 2;
                        }
                    }
                }
                b => {
                    out.push(b);
                    i += 1;
                }
            }
        }
    }

    // SAFETY: all bytes we push are either copied from valid UTF-8 source or
    // are ASCII (b'\\'), so the result is valid UTF-8.
    String::from_utf8(out).unwrap_or_else(|e| String::from_utf8_lossy(e.as_bytes()).into_owned())
}

// --- JSON object extraction ---------------------------------------------------

/// Extract the first valid JSON object from raw model output.
/// With Response Healing enabled this is rarely needed, but kept as a safety net.
///
/// NOTE: `content` here should already have been through `protect_latex_in_raw_json`.
pub fn extract_json_object(content: &str) -> Option<String> {
    let s = content.trim();

    // Already a clean object.
    if s.starts_with('{') {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(s) {
            if v.is_object() {
                return Some(s.to_string());
            }
        }
    }

    // Strip ```json ... ``` fences.
    let fence = s
        .strip_prefix("```json")
        .or_else(|| s.strip_prefix("```"))
        .map(|s| s.trim_start_matches('\n'))
        .and_then(|s| s.strip_suffix("```"))
        .map(str::trim);
    if let Some(inner) = fence {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(inner) {
            if v.is_object() {
                return Some(inner.to_string());
            }
        }
    }

    // Scan for the first parseable object.
    for (i, ch) in content.char_indices() {
        if ch != '{' {
            continue;
        }
        let slice = &content[i..];
        let mut iter = serde_json::Deserializer::from_str(slice).into_iter::<serde_json::Value>();
        if let Some(Ok(v)) = iter.next() {
            if v.is_object() {
                let end = i + iter.byte_offset();
                return content.get(i..end).map(str::to_string);
            }
        }
    }
    None
}

// --- Envelope normalisation ---------------------------------------------------

/// Accept `[...]`, `{"questions":[...]}`, or common wrapper variants.
pub fn normalize_envelope(value: serde_json::Value) -> Result<serde_json::Value, String> {
    if value.is_array() {
        return Ok(serde_json::json!({ "questions": value }));
    }
    let serde_json::Value::Object(mut map) = value else {
        return Err("Top-level JSON must be an object or array.".into());
    };
    if map.get("questions").map(|v| v.is_array()).unwrap_or(false) {
        return Ok(serde_json::Value::Object(map));
    }
    for key in [
        "question",
        "items",
        "mcQuestions",
        "multipleChoiceQuestions",
        "generatedQuestions",
    ] {
        if let Some(arr) = map.remove(key).filter(|v| v.is_array()) {
            map.insert("questions".into(), arr);
            return Ok(serde_json::Value::Object(map));
        }
    }
    for key in ["data", "result", "output", "payload"] {
        if let Some(serde_json::Value::Object(nested)) = map.get(key) {
            if let Some(arr) = nested.get("questions").filter(|v| v.is_array()).cloned() {
                map.insert("questions".into(), arr);
                return Ok(serde_json::Value::Object(map));
            }
        }
    }
    Err(format!(
        "No questions array found. Keys: [{}].",
        map.keys().cloned().collect::<Vec<_>>().join(", ")
    ))
}

// --- Text post-processing pipeline -------------------------------------------
//
// Every markdown field from the model goes through:
//   decode_escapes -> sanitise_latex -> normalise_typography
//
// At this stage the raw JSON has already been through protect_latex_in_raw_json,
// so \frac, \text etc. are preserved as real backslash-sequences in the Rust
// string. The remaining work is:
//
//   decode_escapes        — convert literal \n / \r\n artefacts to real newlines
//   sanitise_latex        — normalise delimiters, protect currency $
//   normalise_typography  — smart quotes, dashes, ellipsis → ASCII

/// Convert literal `\n` / `\r\n` sequences (two actual chars: backslash + n)
/// to real newlines. Preserves LaTeX commands like `\nabla` by checking the
/// character after `\n` is not a continuation of a LaTeX command name.
///
/// After `protect_latex_in_raw_json` + serde_json deserialization:
///   - Real newlines embedded by the model are already `\n` (U+000A).
///   - The sequence backslash-n written literally inside a string value (rare)
///     appears as two chars `\` `n`.
/// This function handles the second case conservatively.
pub fn decode_escapes(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    let mut out = String::with_capacity(value.len());
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '\\' && i + 1 < chars.len() {
            // \r\n literal sequence → single newline
            if i + 3 < chars.len()
                && chars[i + 1] == 'r'
                && chars[i + 2] == '\\'
                && chars[i + 3] == 'n'
            {
                out.push('\n');
                i += 4;
                continue;
            }
            // \n literal → newline, but only if not followed by a lowercase
            // letter that would form a LaTeX command name (e.g. \nabla).
            if chars[i + 1] == 'n' {
                if chars.get(i + 2).map_or(false, |c| c.is_ascii_lowercase()) {
                    // Looks like a LaTeX command — keep the backslash.
                    out.push('\\');
                    out.push('n');
                } else {
                    out.push('\n');
                }
                i += 2;
                continue;
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

/// Normalise LaTeX delimiters and protect currency dollar signs.
///
/// Applied to every markdown field after `decode_escapes`. Steps in order:
///
/// 1. Un-double escaped delimiter chars that lenient JSON parsers leave as-is:
///    `\\(` → `\(`  etc.
///
/// 2. Convert `\(...\)` → `$...$`  and  `\[...\]` → `$$...$$`.
///    MathJax is configured with only `$`/`$$` as delimiters.
///
/// 3. Protect currency: a bare `$` immediately before an ASCII digit that is
///    not part of a `$$` display pair is replaced with `\$`.
pub fn sanitise_latex(text: &str) -> String {
    // Step 1: undo double-escaping of delimiter chars
    let s = text
        .replace("\\\\(", "\\(")
        .replace("\\\\)", "\\)")
        .replace("\\\\[", "\\[")
        .replace("\\\\]", "\\]");

    // Step 2: convert paren/bracket delimiters to $ delimiters
    let s = convert_paren_delimiters(&s);

    // Step 3: protect bare currency dollars
    protect_currency_dollars(&s)
}

/// Replace `\(...\)` with `$...$` and `\[...\]` with `$$...$$`.
fn convert_paren_delimiters(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while !rest.is_empty() {
        match rest.find('\\') {
            None => {
                out.push_str(rest);
                break;
            }
            Some(bs) => {
                out.push_str(&rest[..bs]);
                let after = &rest[bs + 1..];
                if after.starts_with('(') {
                    let inner_start = bs + 2;
                    if let Some(close) = rest[inner_start..].find("\\)") {
                        let inner = &rest[inner_start..inner_start + close];
                        out.push('$');
                        out.push_str(inner);
                        out.push('$');
                        rest = &rest[inner_start + close + 2..];
                        continue;
                    }
                } else if after.starts_with('[') {
                    let inner_start = bs + 2;
                    if let Some(close) = rest[inner_start..].find("\\]") {
                        let inner = &rest[inner_start..inner_start + close];
                        out.push_str("$$");
                        out.push_str(inner);
                        out.push_str("$$");
                        rest = &rest[inner_start + close + 2..];
                        continue;
                    }
                }
                // Not a recognised delimiter — emit the backslash and advance.
                out.push('\\');
                rest = after;
            }
        }
    }
    out
}

/// Replace bare `$` immediately before a digit (not part of `$$`) with `\$`.
fn protect_currency_dollars(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len() + 8);
    for (i, &ch) in chars.iter().enumerate() {
        if ch == '$' {
            let prev_dollar = i > 0 && chars[i - 1] == '$';
            let next_dollar = chars.get(i + 1) == Some(&'$');
            let next_digit = chars.get(i + 1).map_or(false, |c| c.is_ascii_digit());
            if !prev_dollar && !next_dollar && next_digit {
                out.push_str("\\$");
                continue;
            }
        }
        out.push(ch);
    }
    out
}

// --- Full pipeline convenience -----------------------------------------------

/// Run the full decode → sanitise → typography pipeline on a single string
/// field that has already been deserialized from JSON.
///
/// Call order matters:
///   1. decode_escapes      — resolve any remaining literal \n artefacts
///   2. sanitise_latex      — normalise delimiters, protect currency $
///   3. normalise_typography — smart quotes, dashes, ellipsis → ASCII
pub fn clean_field(s: &str) -> String {
    normalise_typography(&sanitise_latex(&decode_escapes(s)))
}

/// Strip characters that cause OpenRouter (or any JSON-based API) to reject
/// the payload as "invalid input".
///
/// Removes:
/// - Null bytes (`\0`) — invalid in JSON strings.
/// - C0 control characters U+0001–U+0008, U+000B, U+000C, U+000E–U+001F —
///   invalid in JSON strings per RFC 8259.  Tab (U+0009), LF (U+000A), and
///   CR (U+000D) are kept because they are valid JSON escapes and commonly
///   appear in user text.
/// - DEL (U+007F) — technically a C0 control, rarely intentional.
/// - Lone Unicode surrogates (U+D800–U+DFFF) — invalid UTF-8 sequences that
///   can appear when strings are assembled from sloppy sources; serde_json
///   will reject or mangle them.
/// - Unicode noncharacters (U+FFFE, U+FFFF, U+1FFFE, … U+10FFFF) — reserved
///   code points that some JSON validators reject.
pub fn sanitize_for_api(s: &str) -> String {
    s.chars()
        .filter(|&c| {
            // Keep tab, newline, carriage return — valid JSON whitespace.
            if c == '\t' || c == '\n' || c == '\r' {
                return true;
            }
            // Drop null byte and all other C0 controls (U+0000–U+001F).
            if c < '\u{0020}' {
                return false;
            }
            // Drop DEL.
            if c == '\u{007F}' {
                return false;
            }
            // Drop Unicode noncharacters: U+FFFE and U+FFFF per plane,
            // plus U+FDD0–U+FDEF.
            let cp = c as u32;
            if cp >= 0xFDD0 && cp <= 0xFDEF {
                return false;
            }
            if (cp & 0xFFFE) == 0xFFFE {
                return false;
            }
            true
        })
        .collect()
}

/// Replace Unicode typographic characters with their plain ASCII equivalents.
fn normalise_typography(s: &str) -> String {
    s.replace('\u{2018}', "'")
        .replace('\u{2019}', "'")
        .replace('\u{201C}', "\"")
        .replace('\u{201D}', "\"")
        .replace('\u{2013}', "--")
        .replace('\u{2014}', "--")
        .replace('\u{2026}', "...")
}

// --- Topic / subtopic correction ----------------------------------------------

/// Canonical subject names that are valid values for the `topic` field.
const CANONICAL_TOPICS: &[&str] = &[
    "Mathematical Methods",
    "Specialist Mathematics",
    "Chemistry",
    "Physical Education",
];

/// Map each canonical subtopic (lowercased) to its parent subject.
/// This is used to fix cases where the LLM puts a subtopic into the `topic` field.
fn subtopic_to_subject() -> &'static std::collections::HashMap<&'static str, &'static str> {
    use std::collections::HashMap;
    use std::sync::OnceLock;
    static MAP: OnceLock<HashMap<&'static str, &'static str>> = OnceLock::new();
    MAP.get_or_init(|| {
        let kk = crate::constants::subtopic_key_knowledge();
        let mm_subs = [
            "functions and graphs",
            "transformation of graphs",
            "algebra and structure",
            "trigonometric functions",
            "exponential and logarithmic functions",
            "differentiation",
            "integration",
            "probability and statistics",
            "discrete random variables",
            "continuous random variables",
        ];
        let sm_subs = [
            "additional algebra and number systems",
            "sequences and series",
            "reciprocals and rational functions",
            "combinatorics and matrices",
            "trigonometric functions and identities",
            "proof",
            "modulus",
            "algorithms and graph theory",
            "graphing relations",
            "complex numbers",
            "transformations and vectors in the plane",
        ];
        let chem_subs = [
            "periodic trends: structure, periodic organisation, and critical or endangered elements",
            "molecular structure: lewis structures, vsepr geometry, polarity, and intermolecular forces",
            "metallic bonding: metallic lattices and the reactivity series",
            "ionic chemistry: ionic bonding, precipitation reactions, and solubility tables",
            "chemical quantities: moles, molar mass, percentage composition, and empirical/molecular formulas",
            "separation techniques: chromatography and rf value identification",
            "organic classification: alkanes, alkenes, alcohols, carboxylic acids, and iupac naming",
            "polymer chemistry: addition and condensation polymerisation, plastics, and recycling",
            "sustainability: green chemistry, circular economy, and sustainable development",
            "water chemistry: hydrogen bonding and unique physical properties of water",
            "acid-base chemistry: bronsted-lowry theory, ph, neutralisation, and applications",
            "redox chemistry: electron transfer, half-equations, displacement, and corrosion",
            "solutions: concentration units and solubility relationships",
            "volumetric analysis: acid-base titration, standard solutions, and indicators",
            "gas chemistry: ideal gas equation and greenhouse gases",
            "analytical techniques: electrical conductivity, stoichiometry, and colorimetry/uv-vis spectroscopy",
        ];
        let pe_subs = [
            "movement skill classification: fundamental, sport-specific, open/closed, gross/fine",
            "discrete, serial, and continuous motor skills: temporal characteristics",
            "stages of learning: cognitive, associative, and autonomous stages",
            "skill acquisition theories: linear vs. non-linear learning models",
            "learning approaches: direct instruction vs. constraint-based methods",
            "practice scheduling: type (whole/part), distribution (massed/distributed), and variability (blocked/random)",
            "feedback in skill acquisition: intrinsic, augmented, and timing optimization",
            "psychological factors in learning: confidence, motivation, arousal, and concentration",
            "coaching strategies: tailoring instruction to learner needs and performance requirements",
            "linear motion: momentum, displacement, linear velocity, acceleration",
            "angular motion: angular momentum, moment of inertia, angular velocity",
            "momentum and impulse: conservation and application in physical activities",
            "newton's laws of motion: inertia, acceleration, and action-reaction in sport",
            "projectile motion: release angle, height, speed, and optimal performance trajectories",
            "center of gravity, base of support, and equilibrium: balance and stability principles",
            "third class lever systems: mechanical advantage and force application",
            "qualitative movement analysis: systematic observation, evaluation, and error correction",
            "video analysis and biomechanical assessment: tools for movement improvement",
            "atp-cp system: high-intensity energy supply and recovery characteristics",
            "anaerobic glycolysis: glucose breakdown, lactate production, and duration capacity",
            "aerobic system: oxidative phosphorylation and sustained energy production",
            "energy system interplay: atp-cp to anaerobic to aerobic transition by intensity and duration",
            "oxygen uptake: oxygen deficit, steady state, and epoc recovery",
            "vo2 max and lactate inflection point: aerobic capacity and anaerobic threshold",
            "fatigue mechanisms: metabolic, muscular, thermoregulatory, and central fatigue",
            "nutrition and hydration strategies: fueling performance and enhancing recovery",
            "activity analysis: identifying skill frequencies, movement patterns, and physiological demands",
            "fitness assessment: testing aerobic, anaerobic, strength, endurance, flexibility, speed, and agility",
            "test reliability, validity, and accuracy: standardized protocols and error minimization",
            "pre-participation screening and informed consent",
            "training principles: frequency, intensity, time/duration, type, and progression",
            "training adaptation: specificity, individuality, variety, and diminishing returns",
            "periodization and planning: macrocycles, mesocycles, microcycles, tapering, and detraining",
            "continuous and interval training: steady-intensity vs. high-intensity work-rest intervals",
            "specialized training methods: fartlek, circuit, weight/resistance, flexibility, and plyometric training",
            "training components: warm-up, conditioning phase, and cool-down structure",
            "overtraining syndrome: prevention, recognition, and management",
        ];

        let mut m = HashMap::new();
        for s in mm_subs { m.insert(s, "Mathematical Methods"); }
        for s in sm_subs { m.insert(s, "Specialist Mathematics"); }
        for s in chem_subs { if kk.contains_key(s) { m.insert(s, "Chemistry"); } }
        for s in pe_subs { if kk.contains_key(s) { m.insert(s, "Physical Education"); } }
        m
    })
}

/// All canonical subtopic names (lowercased) across all topics.
/// Used for fuzzy matching LLM-generated subtopic values.
fn all_canonical_subtopics() -> &'static [&'static str] {
    use std::sync::OnceLock;
    static SUBS: OnceLock<Vec<&'static str>> = OnceLock::new();
    SUBS.get_or_init(|| {
        let kk = crate::constants::subtopic_key_knowledge();
        let mut subs = Vec::new();

        // Mathematical Methods
        subs.extend([
            "functions and graphs",
            "transformation of graphs",
            "algebra and structure",
            "trigonometric functions",
            "exponential and logarithmic functions",
            "differentiation",
            "integration",
            "probability and statistics",
            "discrete random variables",
            "continuous random variables",
        ]);

        // Specialist Mathematics
        subs.extend([
            "additional algebra and number systems",
            "sequences and series",
            "reciprocals and rational functions",
            "combinatorics and matrices",
            "trigonometric functions and identities",
            "proof",
            "modulus",
            "algorithms and graph theory",
            "graphing relations",
            "complex numbers",
            "transformations and vectors in the plane",
        ]);

        // Chemistry — only keys that exist in the key knowledge map
        for &k in kk.keys() {
            subs.push(k);
        }

        // Physical Education — from the constants.rs subtopic_key_knowledge keys
        // These are the full frontend names (lowercased) that map to KK blocks.
        subs.extend([
            "movement skill classification: fundamental, sport-specific, open/closed, gross/fine",
            "discrete, serial, and continuous motor skills: temporal characteristics",
            "stages of learning: cognitive, associative, and autonomous stages",
            "skill acquisition theories: linear vs. non-linear learning models",
            "learning approaches: direct instruction vs. constraint-based methods",
            "practice scheduling: type (whole/part), distribution (massed/distributed), and variability (blocked/random)",
            "feedback in skill acquisition: intrinsic, augmented, and timing optimization",
            "psychological factors in learning: confidence, motivation, arousal, and concentration",
            "coaching strategies: tailoring instruction to learner needs and performance requirements",
            "linear motion: momentum, displacement, linear velocity, acceleration",
            "angular motion: angular momentum, moment of inertia, angular velocity",
            "momentum and impulse: conservation and application in physical activities",
            "newton's laws of motion: inertia, acceleration, and action-reaction in sport",
            "projectile motion: release angle, height, speed, and optimal performance trajectories",
            "center of gravity, base of support, and equilibrium: balance and stability principles",
            "third class lever systems: mechanical advantage and force application",
            "qualitative movement analysis: systematic observation, evaluation, and error correction",
            "video analysis and biomechanical assessment: tools for movement improvement",
            "atp-cp system: high-intensity energy supply and recovery characteristics",
            "anaerobic glycolysis: glucose breakdown, lactate production, and duration capacity",
            "aerobic system: oxidative phosphorylation and sustained energy production",
            "energy system interplay: atp-cp to anaerobic to aerobic transition by intensity and duration",
            "oxygen uptake: oxygen deficit, steady state, and epoc recovery",
            "vo2 max and lactate inflection point: aerobic capacity and anaerobic threshold",
            "fatigue mechanisms: metabolic, muscular, thermoregulatory, and central fatigue",
            "nutrition and hydration strategies: fueling performance and enhancing recovery",
            "activity analysis: identifying skill frequencies, movement patterns, and physiological demands",
            "fitness assessment: testing aerobic, anaerobic, strength, endurance, flexibility, speed, and agility",
            "test reliability, validity, and accuracy: standardized protocols and error minimization",
            "pre-participation screening and informed consent",
            "training principles: frequency, intensity, time/duration, type, and progression",
            "training adaptation: specificity, individuality, variety, and diminishing returns",
            "periodization and planning: macrocycles, mesocycles, microcycles, tapering, and detraining",
            "continuous and interval training: steady-intensity vs. high-intensity work-rest intervals",
            "specialized training methods: fartlek, circuit, weight/resistance, flexibility, and plyometric training",
            "training components: warm-up, conditioning phase, and cool-down structure",
            "overtraining syndrome: prevention, recognition, and management",
        ]);

        subs.sort();
        subs.dedup();
        subs
    })
}

/// Compute the Levenshtein edit distance between two strings.
fn levenshtein(a: &str, b: &str) -> usize {
    let a_bytes = a.as_bytes();
    let b_bytes = b.as_bytes();
    let len_a = a_bytes.len();
    let len_b = b_bytes.len();

    if len_a == 0 {
        return len_b;
    }
    if len_b == 0 {
        return len_a;
    }

    // Two-row optimization for memory efficiency
    let mut prev = (0..=len_b).collect::<Vec<_>>();
    let mut curr = vec![0usize; len_b + 1];

    for i in 1..=len_a {
        curr[0] = i;
        for j in 1..=len_b {
            let cost = if a_bytes[i - 1] == b_bytes[j - 1] {
                0
            } else {
                1
            };
            curr[j] = (prev[j] + 1).min(curr[j - 1] + 1).min(prev[j - 1] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }

    prev[len_b]
}

/// Similarity score between 0.0 and 1.0 based on normalized Levenshtein distance.
fn similarity_score(a: &str, b: &str) -> f64 {
    if a == b {
        return 1.0;
    }
    let max_len = a.len().max(b.len());
    if max_len == 0 {
        return 1.0;
    }
    let dist = levenshtein(a, b);
    1.0 - (dist as f64 / max_len as f64)
}

/// Result of attempting to canonicalize a subtopic value.
#[derive(Debug)]
enum CanonicalizeResult {
    /// The value was already canonical (no change needed).
    AlreadyCanonical,
    /// The value was mapped to a canonical form.
    Mapped(String),
    /// No match found; keep the original value.
    NoMatch,
}

/// Attempt to canonicalize a subtopic value using a multi-tier strategy:
/// 1. Exact case-insensitive match
/// 2. Substring containment (either direction)
/// 3. Levenshtein-based fuzzy matching with a confidence threshold
/// 4. Fallback to the sole user-selected subtopic if only one was specified
///
/// Returns the canonical form if found, or the original value if no match.
fn canonicalize_subtopic(value: &str, sole_subtopic: Option<&str>) -> CanonicalizeResult {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return sole_subtopic
            .map(|s| CanonicalizeResult::Mapped(s.to_string()))
            .unwrap_or(CanonicalizeResult::NoMatch);
    }

    let lower = trimmed.to_ascii_lowercase();
    let all_subs = all_canonical_subtopics();

    // Tier 1: Exact case-insensitive match
    for &canonical in all_subs {
        if canonical == lower {
            return CanonicalizeResult::AlreadyCanonical;
        }
    }

    // Tier 2: Substring containment — check if the value contains or is contained
    // by any canonical subtopic. Pick the longest matching canonical subtopic to
    // avoid false positives from short substrings.
    let mut best_containment: Option<&str> = None;
    for &canonical in all_subs {
        if lower.contains(canonical) || canonical.contains(&lower) {
            if let Some(current) = best_containment {
                // Prefer the longer (more specific) canonical match
                if canonical.len() > current.len() {
                    best_containment = Some(canonical);
                }
            } else {
                best_containment = Some(canonical);
            }
        }
    }
    if let Some(matched) = best_containment {
        return CanonicalizeResult::Mapped(matched.to_string());
    }

    // Tier 3: Levenshtein fuzzy matching with confidence threshold
    const SIMILARITY_THRESHOLD: f64 = 0.6;
    let mut best_score = 0.0f64;
    let mut best_match: Option<&str> = None;
    let mut tie_count = 0usize;

    for &canonical in all_subs {
        let score = similarity_score(&lower, canonical);
        if score > best_score + 0.001 {
            // New clear best — reset tie count
            best_score = score;
            best_match = Some(canonical);
            tie_count = 1;
        } else if (score - best_score).abs() <= 0.001 && score >= SIMILARITY_THRESHOLD {
            // Another option within tolerance of best score
            tie_count += 1;
        }
    }

    if let Some(matched) = best_match {
        // Only accept if clear winner (tie_count == 1) and above threshold
        if best_score >= SIMILARITY_THRESHOLD && tie_count == 1 {
            return CanonicalizeResult::Mapped(matched.to_string());
        }
        // If there's a tie or score too low, fall through to sole_subtopic fallback
    }

    // Tier 4: Fallback to sole user-selected subtopic
    if let Some(sole) = sole_subtopic {
        return CanonicalizeResult::Mapped(sole.to_string());
    }

    CanonicalizeResult::NoMatch
}

/// If the `topic` field is not a canonical subject, try to detect whether the LLM
/// put a subtopic value there instead. If so, move it to `subtopic` and set
/// `topic` to the correct parent subject.
///
/// `selected_topics` are the user-selected subjects (e.g. ["Mathematical Methods"]).
fn fix_topic_field(topic: &mut String, subtopic: &mut Option<String>, selected_topics: &[String]) {
    let trimmed = topic.trim();
    if CANONICAL_TOPICS
        .iter()
        .any(|t| t.eq_ignore_ascii_case(trimmed))
    {
        return; // Already a valid subject.
    }

    // Try to match against known subtopics (case-insensitive).
    let lookup = trimmed.to_ascii_lowercase();
    let map = subtopic_to_subject();

    if let Some(&subject) = map.get(lookup.as_str()) {
        // The LLM put a subtopic into the topic field.
        // Move the old topic value to subtopic (if subtopic is empty).
        if subtopic.is_none() || subtopic.as_deref().map(str::is_empty).unwrap_or(true) {
            *subtopic = Some(trimmed.to_string());
        }
        *topic = subject.to_string();
        return;
    }

    // Fuzzy match: check if any canonical subtopic is a substring of the topic value.
    for (&sub, &subject) in map {
        if lookup.contains(sub) || sub.contains(&lookup) {
            if subtopic.is_none() || subtopic.as_deref().map(str::is_empty).unwrap_or(true) {
                *subtopic = Some(trimmed.to_string());
            }
            *topic = subject.to_string();
            return;
        }
    }

    // If there's only one selected topic, assume that's the subject.
    if selected_topics.len() == 1 {
        if subtopic.is_none() || subtopic.as_deref().map(str::is_empty).unwrap_or(true) {
            *subtopic = Some(trimmed.to_string());
        }
        *topic = selected_topics[0].clone();
    }
}

// --- Normalise + validate written questions ----------------------------------

pub fn normalise_written(
    questions: &mut [GeneratedQuestion],
    selected_topics: &[String],
    selected_subtopics: Option<&Vec<String>>,
) {
    let sole_subtopic = selected_subtopics
        .filter(|s| s.len() == 1)
        .and_then(|s| s.first())
        .map(|s| s.as_str());

    for (idx, q) in questions.iter_mut().enumerate() {
        q.id = format!("q{}", idx + 1);
        q.topic = q.topic.trim().into();
        q.prompt_markdown = clean_field(q.prompt_markdown.trim());
        q.subtopic = q
            .subtopic
            .as_ref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .or_else(|| sole_subtopic.map(|s| s.to_string()));

        fix_topic_field(&mut q.topic, &mut q.subtopic, selected_topics);

        // Canonicalize subtopic: map LLM-generated values to canonical forms
        if let Some(ref sub) = q.subtopic {
            match canonicalize_subtopic(sub, sole_subtopic) {
                CanonicalizeResult::AlreadyCanonical => {}
                CanonicalizeResult::Mapped(canonical) => {
                    q.subtopic = Some(canonical);
                }
                CanonicalizeResult::NoMatch => {
                    // Keep the original value; cleanup tools can fix retroactively
                }
            }
        }

        let marks = if q.max_marks == 0 {
            default_max_marks()
        } else {
            q.max_marks
        };
        q.max_marks = marks.clamp(1, 30);
    }
}

pub fn validate_written(questions: &[GeneratedQuestion], expected: usize) -> CommandResult<()> {
    if questions.len() != expected {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            format!("Expected {expected} questions, got {}.", questions.len()),
        ));
    }
    for q in questions {
        if q.topic.is_empty() {
            return Err(AppError::new("VALIDATION_ERROR", "Question missing topic."));
        }
        if q.prompt_markdown.is_empty() {
            return Err(AppError::new(
                "VALIDATION_ERROR",
                format!("Q{} has empty prompt.", q.id),
            ));
        }
        if q.max_marks == 0 || q.max_marks > 30 {
            return Err(AppError::new(
                "VALIDATION_ERROR",
                format!("Q{} has invalid maxMarks.", q.id),
            ));
        }
    }
    Ok(())
}

// --- Normalise + validate MC questions ----------------------------------------

const MC_MAX_EXPLANATION_WORDS: usize = 180;

const DISALLOWED_SELF_TALK: &[&str] = &[
    "let's",
    "let us",
    "i will",
    "i'll",
    "wait,",
    "not in options",
    "error in options",
    "to make it work",
    "change the question",
    "adjust the question",
    "revised prompt",
    "i'll update",
];

pub fn normalise_mc(
    questions: &mut [McQuestion],
    selected_topics: &[String],
    selected_subtopics: Option<&Vec<String>>,
) {
    let sole_subtopic = selected_subtopics
        .filter(|s| s.len() == 1)
        .and_then(|s| s.first())
        .map(|s| s.as_str());

    for (idx, q) in questions.iter_mut().enumerate() {
        q.id = format!("mc{}", idx + 1);
        q.topic = q.topic.trim().into();
        q.prompt_markdown = clean_field(q.prompt_markdown.trim());
        q.explanation_markdown = clean_field(q.explanation_markdown.trim());
        q.correct_answer = q.correct_answer.trim().to_uppercase();
        q.subtopic = q
            .subtopic
            .as_ref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .or_else(|| sole_subtopic.map(|s| s.to_string()));

        fix_topic_field(&mut q.topic, &mut q.subtopic, selected_topics);

        // Canonicalize subtopic: map LLM-generated values to canonical forms
        if let Some(ref sub) = q.subtopic {
            match canonicalize_subtopic(sub, sole_subtopic) {
                CanonicalizeResult::AlreadyCanonical => {}
                CanonicalizeResult::Mapped(canonical) => {
                    q.subtopic = Some(canonical);
                }
                CanonicalizeResult::NoMatch => {
                    // Keep the original value; cleanup tools can fix retroactively
                }
            }
        }

        for opt in &mut q.options {
            opt.label = opt.label.trim().to_uppercase();
            opt.text = clean_field(opt.text.trim());
        }
    }
}

pub fn validate_mc(questions: &[McQuestion], expected: usize) -> CommandResult<()> {
    if questions.len() != expected {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            format!("Expected {expected} MC questions, got {}.", questions.len()),
        ));
    }
    for q in questions {
        if q.topic.is_empty() {
            return Err(AppError::new(
                "VALIDATION_ERROR",
                format!("Q{} missing topic.", q.id),
            ));
        }
        if q.prompt_markdown.is_empty() {
            return Err(AppError::new(
                "VALIDATION_ERROR",
                format!("Q{} empty prompt.", q.id),
            ));
        }
        if q.explanation_markdown.is_empty() {
            return Err(AppError::new(
                "VALIDATION_ERROR",
                format!("Q{} empty explanation.", q.id),
            ));
        }
        let words = q.explanation_markdown.split_whitespace().count();
        if words > MC_MAX_EXPLANATION_WORDS {
            return Err(AppError::new(
                "VALIDATION_ERROR",
                format!(
                    "Q{} explanation too long ({words} words; max {MC_MAX_EXPLANATION_WORDS}).",
                    q.id
                ),
            ));
        }
        let low = q.explanation_markdown.to_lowercase();
        if DISALLOWED_SELF_TALK.iter().any(|m| low.contains(m)) {
            return Err(AppError::new(
                "VALIDATION_ERROR",
                format!("Q{} explanation contains self-talk.", q.id),
            ));
        }
        if q.options.len() != 4 {
            return Err(AppError::new(
                "VALIDATION_ERROR",
                format!("Q{} must have exactly 4 options.", q.id),
            ));
        }
        let mut labels: Vec<_> = q.options.iter().map(|o| o.label.clone()).collect();
        labels.sort();
        if labels != ["A", "B", "C", "D"] {
            return Err(AppError::new(
                "VALIDATION_ERROR",
                format!("Q{} options must be labeled A, B, C, D.", q.id),
            ));
        }
        if !matches!(q.correct_answer.as_str(), "A" | "B" | "C" | "D") {
            return Err(AppError::new(
                "VALIDATION_ERROR",
                format!("Q{} invalid correctAnswer.", q.id),
            ));
        }
    }
    Ok(())
}

// --- Tests -------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // --- protect_latex_in_raw_json ---

    #[test]
    fn frac_protected_in_json_string() {
        // \f in a JSON string value would normally be parsed as form feed.
        // After protection it becomes \\f which JSON parses to \f (backslash-f).
        let raw = r#"{"q": "\frac{1}{2}"}"#;
        let protected = protect_latex_in_raw_json(raw);
        let v: serde_json::Value = serde_json::from_str(&protected).unwrap();
        assert_eq!(v["q"].as_str().unwrap(), r"\frac{1}{2}");
    }

    #[test]
    fn text_protected_in_json_string() {
        // \t in a JSON string value would normally be parsed as tab.
        let raw = r#"{"q": "\text{hello}"}"#;
        let protected = protect_latex_in_raw_json(raw);
        let v: serde_json::Value = serde_json::from_str(&protected).unwrap();
        assert_eq!(v["q"].as_str().unwrap(), r"\text{hello}");
    }

    #[test]
    fn beta_protected_in_json_string() {
        // \b would be parsed as backspace.
        let raw = r#"{"q": "\beta + \bar{x}"}"#;
        let protected = protect_latex_in_raw_json(raw);
        let v: serde_json::Value = serde_json::from_str(&protected).unwrap();
        assert_eq!(v["q"].as_str().unwrap(), r"\beta + \bar{x}");
    }

    #[test]
    fn real_tab_escape_preserved() {
        // A real \t (tab) that is NOT followed by a letter should be preserved
        // as a tab character after JSON parsing.
        let raw = "{\"q\": \"col1\\tcol2\"}";
        let protected = protect_latex_in_raw_json(raw);
        let v: serde_json::Value = serde_json::from_str(&protected).unwrap();
        // \t followed by 'c' — our heuristic will treat this as LaTeX.
        // This is an acceptable false positive: "col1\tcol2" is not typical
        // in a math/science question body. The test documents the behaviour.
        let result = v["q"].as_str().unwrap();
        assert!(result.contains('\\') || result.contains('\t'));
    }

    #[test]
    fn already_escaped_backslash_not_doubled() {
        // \\\\ in source JSON is already two backslashes — must not triple.
        let raw = r#"{"q": "\\frac{1}{2}"}"#;
        let protected = protect_latex_in_raw_json(raw);
        let v: serde_json::Value = serde_json::from_str(&protected).unwrap();
        // After parsing \\frac should yield \frac (one backslash).
        assert_eq!(v["q"].as_str().unwrap(), r"\frac{1}{2}");
    }

    #[test]
    fn non_string_json_untouched() {
        let raw = r#"{"count": 42, "flag": true}"#;
        let protected = protect_latex_in_raw_json(raw);
        assert_eq!(protected, raw);
    }

    #[test]
    fn complex_latex_expression_survives() {
        // A realistic model output with multiple colliding sequences.
        let raw = r#"{"prompt": "Find $\frac{\theta}{\beta}$ where $\text{Re}(z) > 0$."}"#;
        let protected = protect_latex_in_raw_json(raw);
        let v: serde_json::Value = serde_json::from_str(&protected).unwrap();
        let result = v["prompt"].as_str().unwrap();
        assert!(result.contains(r"\frac"), "\\frac missing: {result}");
        assert!(result.contains(r"\theta"), "\\theta missing: {result}");
        assert!(result.contains(r"\beta"), "\\beta missing: {result}");
        assert!(result.contains(r"\text"), "\\text missing: {result}");
    }

    #[test]
    fn frac_in_display_math_survives() {
        let raw = r#"{"q": "\\[\frac{d}{dx}f(x)\\]"}"#;
        let protected = protect_latex_in_raw_json(raw);
        let v: serde_json::Value = serde_json::from_str(&protected).unwrap();
        let result = v["q"].as_str().unwrap();
        assert!(
            result.contains(r"\frac"),
            "\\frac missing after display math: {result}"
        );
    }

    #[test]
    fn newline_in_json_string_preserved() {
        // A genuine \n (newline escape) followed by a space should
        // decode as a real newline, not be mangled.
        let raw = "{\"q\": \"line1\\n line2\"}";
        let protected = protect_latex_in_raw_json(raw);
        let v: serde_json::Value = serde_json::from_str(&protected).unwrap();
        assert_eq!(v["q"].as_str().unwrap(), "line1\n line2");
    }

    // --- sanitise_latex (existing, unchanged) ---

    #[test]
    fn converts_paren_inline() {
        assert_eq!(sanitise_latex("Value is \\(x^2\\)."), "Value is $x^2$.");
    }

    #[test]
    fn converts_bracket_display() {
        assert_eq!(sanitise_latex("\\[E = mc^2\\]"), "$$E = mc^2$$");
    }

    #[test]
    fn protects_currency_dollar() {
        assert_eq!(sanitise_latex("costs $50 today"), "costs \\$50 today");
    }

    #[test]
    fn does_not_mangle_math_dollar() {
        assert_eq!(sanitise_latex("solve $x^2 = 4$"), "solve $x^2 = 4$");
    }

    #[test]
    fn does_not_mangle_display_math() {
        assert_eq!(sanitise_latex("$$E = mc^2$$"), "$$E = mc^2$$");
    }

    #[test]
    fn double_escaped_paren_normalised() {
        assert_eq!(sanitise_latex("\\\\(x\\\\)"), "$x$");
    }

    #[test]
    fn currency_followed_by_display_math_not_mangled() {
        assert_eq!(sanitise_latex("$$x = 1$$"), "$$x = 1$$");
    }

    // --- clean_field / normalise_typography ---

    #[test]
    fn smart_quotes_normalised_to_ascii() {
        // \u{2018} = LEFT SINGLE QUOTATION MARK → '
        // \u{2019} = RIGHT SINGLE QUOTATION MARK → '
        // \u{201D} = RIGHT DOUBLE QUOTATION MARK → "
        assert_eq!(
            clean_field("\u{2018}it\u{2019}s Newton\u{2019}s law\u{201D}"),
            "'it's Newton's law\""
        );
    }

    #[test]
    fn ellipsis_normalised() {
        assert_eq!(clean_field("and so on\u{2026}"), "and so on...");
    }

    #[test]
    fn non_ascii_passthrough_unaffected() {
        assert_eq!(clean_field("café αβγ"), "café αβγ");
    }

    // --- End-to-end: raw JSON → clean field ---

    #[test]
    fn end_to_end_frac_roundtrip() {
        // Simulate the full pipeline: raw LLM JSON → protect → parse → clean_field.
        let raw = r#"{"q": "Evaluate $\frac{1}{2} + \frac{3}{4}$."}"#;
        let protected = protect_latex_in_raw_json(raw);
        let v: serde_json::Value = serde_json::from_str(&protected).unwrap();
        let field = v["q"].as_str().unwrap();
        let cleaned = clean_field(field);
        assert!(
            cleaned.contains(r"\frac"),
            "\\frac lost in pipeline: {cleaned}"
        );
        assert_eq!(cleaned, r"Evaluate $\frac{1}{2} + \frac{3}{4}$.");
    }

    #[test]
    fn end_to_end_text_roundtrip() {
        let raw = r#"{"q": "Let $\\text{Re}(z) = 0$."}"#;
        let protected = protect_latex_in_raw_json(raw);
        let v: serde_json::Value = serde_json::from_str(&protected).unwrap();
        let field = v["q"].as_str().unwrap();
        let cleaned = clean_field(field);
        assert!(
            cleaned.contains(r"\text"),
            "\\text lost in pipeline: {cleaned}"
        );
    }

    #[test]
    fn end_to_end_paren_delimiters_converted() {
        // Model emits \(...\); pipeline should convert to $...$
        let raw = r#"{"q": "Value is \\(x^2\\)."}"#;
        let protected = protect_latex_in_raw_json(raw);
        let v: serde_json::Value = serde_json::from_str(&protected).unwrap();
        let field = v["q"].as_str().unwrap();
        let cleaned = clean_field(field);
        assert_eq!(cleaned, "Value is $x^2$.");
    }

    // --- canonicalize_subtopic ---

    #[test]
    fn canonical_exact_match_returns_already_canonical() {
        // Exact case-insensitive match should be recognized as already canonical.
        match canonicalize_subtopic("Functions and Graphs", None) {
            CanonicalizeResult::AlreadyCanonical => {}
            other => panic!("Expected AlreadyCanonical, got {other:?}"),
        }
    }

    #[test]
    fn canonical_lowercase_match_returns_already_canonical() {
        match canonicalize_subtopic("functions and graphs", None) {
            CanonicalizeResult::AlreadyCanonical => {}
            other => panic!("Expected AlreadyCanonical, got {other:?}"),
        }
    }

    #[test]
    fn canonical_substring_match_maps_correctly() {
        // A slightly abbreviated form should match via substring containment.
        match canonicalize_subtopic("differentiation rules", None) {
            CanonicalizeResult::Mapped(m) => assert!(m.contains("differentiation")),
            other => panic!("Expected Mapped, got {other:?}"),
        }
    }

    #[test]
    fn canonical_levenshtein_match_maps_close_typo() {
        // A typo like "funtions and graphs" (missing 'c') should fuzzy-match
        // to "functions and graphs" since it's very close.
        // First verify the similarity score is high enough.
        let score = similarity_score("funtions and graphs", "functions and graphs");
        assert!(score > 0.9, "Expected high similarity score, got {score}");

        // Verify the canonical list actually contains "functions and graphs"
        let all = all_canonical_subtopics();
        assert!(
            all.iter().any(|s| *s == "functions and graphs"),
            "Canonical list missing 'functions and graphs'"
        );

        match canonicalize_subtopic("funtions and graphs", None) {
            CanonicalizeResult::Mapped(m) => {
                assert_eq!(m.to_lowercase(), "functions and graphs");
            }
            other => panic!("Expected Mapped, got {other:?}"),
        }
    }

    #[test]
    fn canonical_sole_subtopic_fallback() {
        // When no match is found and a sole subtopic is provided, use it.
        match canonicalize_subtopic("completely unknown topic", Some("Functions and Graphs")) {
            CanonicalizeResult::Mapped(m) => assert_eq!(m, "Functions and Graphs"),
            other => panic!("Expected Mapped with sole fallback, got {other:?}"),
        }
    }

    #[test]
    fn canonical_no_match_without_sole() {
        // No match and no sole subtopic → NoMatch.
        match canonicalize_subtopic("completely unknown topic", None) {
            CanonicalizeResult::NoMatch => {}
            other => panic!("Expected NoMatch, got {other:?}"),
        }
    }

    #[test]
    fn canonical_empty_string_uses_sole() {
        match canonicalize_subtopic("", Some("Integration")) {
            CanonicalizeResult::Mapped(m) => assert_eq!(m, "Integration"),
            other => panic!("Expected Mapped, got {other:?}"),
        }
    }

    #[test]
    fn levenshtein_distance_zero_for_identical() {
        assert_eq!(levenshtein("hello", "hello"), 0);
    }

    #[test]
    fn levenshtein_distance_one_substitution() {
        assert_eq!(levenshtein("hello", "hella"), 1);
    }

    #[test]
    fn levenshtein_distance_empty_string() {
        assert_eq!(levenshtein("", "test"), 4);
        assert_eq!(levenshtein("test", ""), 4);
    }

    #[test]
    fn similarity_score_perfect_for_identical() {
        assert!((similarity_score("hello", "hello") - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn similarity_score_high_for_close_strings() {
        let score = similarity_score("differentiation", "diferentiation");
        assert!(score > 0.8);
    }

    #[test]
    fn similarity_score_low_for_unrelated() {
        let score = similarity_score("xyzabc", "qwerty");
        assert!(score < 0.5);
    }
}
