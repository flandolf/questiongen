use genanki_rs::{Deck, Field, Model, Note, Package, Template};
use regex::Regex;

fn format_for_anki(text: &str) -> String {
    // 1. Handle block math: $$ ... $$ or \$$ ... \$$ -> \[ ... \]
    // 2. Handle inline math: $ ... $ or \$ ... \$ -> \( ... \)

    // We match an optional backslash before the dollars to consume it if present.
    // This prevents "extra \" in Anki when models escape the dollar signs.

    let block_re = Regex::new(r"(?s)\\?\$\$(.*?)\\?\$\$").unwrap();
    let text = block_re.replace_all(text, |caps: &regex::Captures| format!(r"\[{}\]", &caps[1]));

    let inline_re = Regex::new(r"\\?\$(.*?)\\?\$").unwrap();
    let text = inline_re.replace_all(&text, |caps: &regex::Captures| format!(r"\({}\)", &caps[1]));

    // Handle Headings
    let h3_re = Regex::new(r"(?m)^### (.*)$").unwrap();
    let text = h3_re.replace_all(&text, "<h3>$1</h3>");
    let h2_re = Regex::new(r"(?m)^## (.*)$").unwrap();
    let text = h2_re.replace_all(&text, "<h2>$1</h2>");
    let h1_re = Regex::new(r"(?m)^# (.*)$").unwrap();
    let text = h1_re.replace_all(&text, "<h1>$1</h1>");

    // Handle Bold, Italic, Code
    let bold_re = Regex::new(r"\*\*(.*?)\*\*").unwrap();
    let text = bold_re.replace_all(&text, "<b>$1</b>");
    let italic_re = Regex::new(r"\*(.*?)\*").unwrap();
    let text = italic_re.replace_all(&text, "<i>$1</i>");
    let code_re = Regex::new(r"`(.*?)`").unwrap();
    let text = code_re.replace_all(&text, "<code>$1</code>");

    // Replace remaining newlines with <br> for Anki display
    text.replace("\n", "<br>")
}

pub fn model() -> Model {
    Model::new(
        32904823094,
        "QuestionGen Model",
        vec![
            Field::new("Question"),
            Field::new("Answer"),
            Field::new("Topic"),
            Field::new("Subtopic"),
        ],
        vec![Template::new("Card 1")
            .qfmt(r#"
<div class="container">
  <div class="topic-wrapper">
    <span class="topic">{{Topic}}</span>
    <span class="subtopic">/ {{Subtopic}}</span>
  </div>
  <div class="question">{{Question}}</div>
</div>
"#)
            .afmt(r#"
<div class="container">
  <div class="topic-wrapper">
    <span class="topic">{{Topic}}</span>
    <span class="subtopic">/ {{Subtopic}}</span>
  </div>
  <div class="question">{{Question}}</div>
  <hr id="answer">
  <div class="answer">{{Answer}}</div>
</div>
"#)],
    ).css(r#"
.card {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 20px;
    text-align: center;
    color: #333;
    background-color: #f8f9fa;
    line-height: 1.6;
    margin: 0;
}

.container {
    background-color: white;
    border-radius: 12px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.1);
    margin: 20px auto;
    padding: 40px;
    max-width: 600px;
}

.topic-wrapper {
    font-size: 12px;
    color: #6c757d;
    margin-bottom: 24px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 600;
}

.subtopic {
    color: #adb5bd;
    font-weight: 400;
}

.question {
    font-size: 24px;
    font-weight: 700;
    color: #212529;
}

.answer {
    font-size: 22px;
    color: #495057;
}

#answer {
    border: none;
    border-top: 2px solid #e9ecef;
    margin: 30px 0;
}

h1, h2, h3 {
    margin-top: 0.5em;
    margin-bottom: 0.2em;
}

h1 { font-size: 1.4em; }
h2 { font-size: 1.2em; }
h3 { font-size: 1.1em; }

code {
    background-color: #f0f0f0;
    padding: 2px 4px;
    border-radius: 4px;
    font-family: monospace;
}

/* Dark mode support */
.nightMode .card {
    background-color: #1a1a1a;
    color: #e9ecef;
}

.nightMode .container {
    background-color: #2d2d2d;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
}

.nightMode .topic-wrapper {
    color: #adb5bd;
}

.nightMode .subtopic {
    color: #6c757d;
}

.nightMode .question {
    color: #f8f9fa;
}

.nightMode .answer {
    color: #dee2e6;
}

.nightMode #answer {
    border-top-color: #404040;
}

.nightMode code {
    background-color: #404040;
}

/* MathJax centering */
.anki-mathjax {
    font-size: 1.1em;
}
"#)
}

pub fn create_note(
    model: &Model,
    question: &str,
    answer: &str,
    topic: &str,
    subtopic: &str,
) -> Result<Note, Box<dyn std::error::Error>> {
    Note::new(
        model.clone(),
        vec![
            &format_for_anki(question),
            &format_for_anki(answer),
            topic,
            subtopic,
        ],
    )
    .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)
}

pub fn export_deck_to_file(deck: Deck, file_path: &str) -> Result<(), Box<dyn std::error::Error>> {
    let mut package = Package::new(vec![deck], vec![])?;
    package.write_to_file(file_path)?;
    Ok(())
}
