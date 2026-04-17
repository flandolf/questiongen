use once_cell::sync::Lazy;
use serde::Deserialize;
use std::collections::HashMap;

// ─── Catalog types ────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TechniqueNotes {
    pub core_concepts: String,
    pub exam_style_guidelines: String,
    #[serde(default)]
    pub anti_prompts: Vec<String>,
    #[serde(default)]
    pub tech_free_rules: String,
    #[serde(default)]
    pub tech_active_rules: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ComplexityLevers {
    pub easy: String,
    pub hard: String,
    pub extreme: String,
}

#[derive(Debug, Deserialize)]
struct RawTopic {
    name: String,
    #[serde(default, alias = "examPdfs")]
    exam_pdfs: Vec<String>,
    #[serde(default, alias = "reportPdfs")]
    report_pdfs: Vec<String>,
    #[serde(default, alias = "examGuidance")]
    exam_guidance: String,
    #[serde(default)]
    out_of_scope: Vec<String>,
    subtopics: Vec<RawSubtopic>,
}

#[derive(Debug, Deserialize)]
struct RawSubtopic {
    name: String,
    technique_notes: serde_json::Value,
    #[serde(default)]
    out_of_scope: Vec<String>,
    #[serde(default)]
    complexity_levers: Option<ComplexityLevers>,
    #[serde(default)]
    synthesis_rules: Option<String>,
}

// ─── Public structs ───────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct TopicEntry {
    pub name: String,
    pub exam_pdfs: Vec<String>,
    pub report_pdfs: Vec<String>,
    pub exam_guidance: String,
    pub out_of_scope: Vec<String>,
    pub subtopics: Vec<SubtopicEntry>,
}

#[derive(Debug, Clone)]
pub struct SubtopicEntry {
    pub name: String,
    pub technique_notes: TechniqueNotes,
    pub out_of_scope: Vec<String>,
    pub complexity_levers: Option<ComplexityLevers>,
    pub synthesis_rules: Option<String>,
}

// ─── Compile-time loaded catalog ──────────────────────────────────────────────

static CATALOG: Lazy<Vec<TopicEntry>> = Lazy::new(|| {
    let raw_subjects = vec![
        include_str!("../../src/shared/subjects/biology.json"),
        include_str!("../../src/shared/subjects/chemistry.json"),
        include_str!("../../src/shared/subjects/general-mathematics.json"),
        include_str!("../../src/shared/subjects/mathematical-methods.json"),
        include_str!("../../src/shared/subjects/physical-education.json"),
        include_str!("../../src/shared/subjects/specialist-mathematics.json"),
    ];

    let mut all_raw_topics = Vec::new();
    for raw in raw_subjects {
        match serde_json::from_str::<RawTopic>(raw) {
            Ok(topic) => all_raw_topics.push(topic),
            Err(e) => {
                eprintln!("WARNING: Failed to parse a subject JSON: {}", e);
            }
        }
    }

    all_raw_topics
        .into_iter()
        .map(|t| TopicEntry {
            name: t.name.clone(),
            exam_pdfs: t.exam_pdfs.clone(),
            report_pdfs: t.report_pdfs.clone(),
            exam_guidance: t.exam_guidance.clone(),
            out_of_scope: t.out_of_scope.clone(),
            subtopics: t
                .subtopics
                .into_iter()
                .map(|s| {
                    let notes = if s.technique_notes.is_string() {
                        TechniqueNotes {
                            core_concepts: s.technique_notes.as_str().unwrap_or("").to_string(),
                            exam_style_guidelines: String::new(),
                            anti_prompts: Vec::new(),
                            tech_free_rules: String::new(),
                            tech_active_rules: String::new(),
                        }
                    } else {
                        serde_json::from_value(s.technique_notes).unwrap_or(TechniqueNotes {
                            core_concepts: String::new(),
                            exam_style_guidelines: String::new(),
                            anti_prompts: Vec::new(),
                            tech_free_rules: String::new(),
                            tech_active_rules: String::new(),
                        })
                    };

                    SubtopicEntry {
                        name: s.name,
                        technique_notes: notes,
                        out_of_scope: s.out_of_scope,
                        complexity_levers: s.complexity_levers,
                        synthesis_rules: s.synthesis_rules,
                    }
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

pub fn topic_out_of_scope(name: &str) -> &'static [String] {
    find_topic(name)
        .map(|t| t.out_of_scope.as_slice())
        .unwrap_or(&[])
}

pub fn find_subtopic(topic_name: &str, subtopic_name: &str) -> Option<&'static SubtopicEntry> {
    let topic = find_topic(topic_name)?;
    topic
        .subtopics
        .iter()
        .find(|s| s.name.eq_ignore_ascii_case(subtopic_name))
}

/// All canonical subtopic names (lowercased) across all topics.
pub fn all_subtopic_names_lower() -> Vec<&'static str> {
    SUBTOPIC_INDEX.keys().map(|s| s.as_str()).collect()
}
