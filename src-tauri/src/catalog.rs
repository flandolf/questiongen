use once_cell::sync::Lazy;
use serde::Deserialize;
use std::collections::HashMap;

// ─── Catalog types ────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct RawCatalog {
    topics: Vec<RawTopic>,
}

#[derive(Debug, Deserialize)]
struct RawTopic {
    name: String,
    #[serde(default)]
    exam_pdfs: Vec<String>,
    #[serde(default)]
    report_pdfs: Vec<String>,
    #[serde(default)]
    exam_guidance: String,
    subtopics: Vec<RawSubtopic>,
}

#[derive(Debug, Deserialize)]
struct RawSubtopic {
    name: String,
    #[serde(default)]
    key_knowledge: String,
}

// ─── Public structs ───────────────────────────────────────────────────────────

#[derive(Debug)]
pub struct TopicEntry {
    pub name: String,
    pub exam_pdfs: Vec<String>,
    pub report_pdfs: Vec<String>,
    pub exam_guidance: String,
    pub subtopics: Vec<SubtopicEntry>,
}

#[derive(Debug)]
pub struct SubtopicEntry {
    pub name: String,
    pub key_knowledge: String,
}

// ─── Compile-time loaded catalog ──────────────────────────────────────────────

static CATALOG: Lazy<Vec<TopicEntry>> = Lazy::new(|| {
    let raw = include_str!("../../src/shared/subtopic-catalog.json");
    let Ok(parsed) = serde_json::from_str::<RawCatalog>(raw) else {
        eprintln!("WARNING: Failed to parse subtopic catalog JSON");
        return Vec::new();
    };

    parsed
        .topics
        .into_iter()
        .map(|t| TopicEntry {
            name: t.name.clone(),
            exam_pdfs: t.exam_pdfs.clone(),
            report_pdfs: t.report_pdfs.clone(),
            exam_guidance: t.exam_guidance.clone(),
            subtopics: t
                .subtopics
                .into_iter()
                .map(|s| SubtopicEntry {
                    name: s.name,
                    key_knowledge: s.key_knowledge,
                })
                .collect(),
        })
        .collect()
});

// ─── Index maps (built once at startup) ───────────────────────────────────────

/// Lowercased topic name -> index in CATALOG
static TOPIC_INDEX: Lazy<HashMap<String, usize>> = Lazy::new(|| {
    CATALOG
        .iter()
        .enumerate()
        .map(|(i, t)| (t.name.to_lowercase(), i))
        .collect()
});

/// Lowercased subtopic name -> (topic_index, subtopic_index)
static SUBTOPIC_INDEX: Lazy<HashMap<String, (usize, usize)>> = Lazy::new(|| {
    let mut m = HashMap::new();
    for (ti, topic) in CATALOG.iter().enumerate() {
        for (si, sub) in topic.subtopics.iter().enumerate() {
            m.insert(sub.name.to_lowercase(), (ti, si));
        }
    }
    m
});

/// Lowercased subtopic name -> parent topic name
static SUBTOPIC_TO_TOPIC: Lazy<HashMap<String, String>> = Lazy::new(|| {
    let mut m = HashMap::new();
    for topic in &*CATALOG {
        for sub in &topic.subtopics {
            m.insert(sub.name.to_lowercase(), topic.name.clone());
        }
    }
    m
});

// ─── Public accessors ─────────────────────────────────────────────────────────

pub fn all_topics() -> &'static [TopicEntry] {
    &CATALOG
}

fn find_topic(name: &str) -> Option<&'static TopicEntry> {
    let idx = *TOPIC_INDEX.get(&name.to_lowercase())?;
    CATALOG.get(idx)
}

pub fn topic_names() -> Vec<&'static str> {
    CATALOG.iter().map(|t| t.name.as_str()).collect()
}

pub fn topic_exam_guidance(name: &str) -> &'static str {
    find_topic(name)
        .map(|t| t.exam_guidance.as_str())
        .unwrap_or("")
}

pub fn topic_exam_pdfs(name: &str) -> &'static [String] {
    find_topic(name)
        .map(|t| t.exam_pdfs.as_slice())
        .unwrap_or(&[])
}

pub fn topic_report_pdfs(name: &str) -> &'static [String] {
    find_topic(name)
        .map(|t| t.report_pdfs.as_slice())
        .unwrap_or(&[])
}

fn find_subtopic(topic_name: &str, subtopic_name: &str) -> Option<&'static SubtopicEntry> {
    let topic = find_topic(topic_name)?;
    topic
        .subtopics
        .iter()
        .find(|s| s.name.eq_ignore_ascii_case(subtopic_name))
}

pub fn subtopic_key_knowledge(topic_name: &str, subtopic_name: &str) -> &'static str {
    find_subtopic(topic_name, subtopic_name)
        .map(|s| s.key_knowledge.as_str())
        .unwrap_or("")
}

/// Map a lowercased subtopic name to its parent topic name.
pub fn subtopic_to_topic(subtopic_lower: &str) -> Option<&'static str> {
    SUBTOPIC_TO_TOPIC.get(subtopic_lower).map(|s| s.as_str())
}

/// All canonical subtopic names (lowercased) across all topics.
pub fn all_subtopic_names_lower() -> Vec<&'static str> {
    SUBTOPIC_INDEX.keys().map(|s| s.as_str()).collect()
}
