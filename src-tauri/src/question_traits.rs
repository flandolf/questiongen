use crate::constants;
use crate::models::{CommandResult, GeneratedQuestion, McQuestion};
use crate::normalization;
use crate::quality;

pub trait TechAllowed {
    fn set_tech_allowed(&mut self, v: bool);
}

impl TechAllowed for GeneratedQuestion {
    fn set_tech_allowed(&mut self, v: bool) {
        self.tech_allowed = v;
    }
}

impl TechAllowed for McQuestion {
    fn set_tech_allowed(&mut self, v: bool) {
        self.tech_allowed = v;
    }
}

pub trait QuestionWithMarkdown {
    fn get_id(&self) -> &str;
    fn get_prompt(&self) -> &str;
    fn get_explanation(&self) -> Option<&str>;
    fn get_subtopic(&self) -> Option<&str>;
}

impl QuestionWithMarkdown for GeneratedQuestion {
    fn get_id(&self) -> &str {
        &self.id
    }
    fn get_prompt(&self) -> &str {
        &self.prompt_markdown
    }
    fn get_explanation(&self) -> Option<&str> {
        None
    }
    fn get_subtopic(&self) -> Option<&str> {
        self.subtopic.as_deref()
    }
}

impl QuestionWithMarkdown for McQuestion {
    fn get_id(&self) -> &str {
        &self.id
    }
    fn get_prompt(&self) -> &str {
        &self.prompt_markdown
    }
    fn get_explanation(&self) -> Option<&str> {
        Some(&self.explanation_markdown)
    }
    fn get_subtopic(&self) -> Option<&str> {
        self.subtopic.as_deref()
    }
}

pub trait NormalizableQuestion: QuestionWithMarkdown + TechAllowed {
    fn normalize(questions: &mut [Self], topics: &[String], subtopics: Option<&Vec<String>>)
    where
        Self: Sized;
    fn validate(questions: &[Self], expected: usize) -> CommandResult<()>
    where
        Self: Sized;
    fn extract_texts(questions: &[Self]) -> Vec<String>
    where
        Self: Sized;
    fn apply_metrics(&mut self, metrics: &quality::QuestionQualityMetrics);
    fn get_max_marks(&self) -> u8;
    fn get_distinctness(&self) -> Option<f32>;
    fn adjust_marks(questions: &mut [Self], total_marks: usize)
    where
        Self: Sized;
}

impl NormalizableQuestion for GeneratedQuestion {
    fn normalize(questions: &mut [Self], topics: &[String], subtopics: Option<&Vec<String>>) {
        normalization::normalise_written(questions, topics, subtopics);
    }
    fn validate(questions: &[Self], expected: usize) -> CommandResult<()> {
        normalization::validate_written(questions, expected)
    }
    fn extract_texts(questions: &[Self]) -> Vec<String> {
        questions
            .iter()
            .map(|q| q.prompt_markdown.clone())
            .collect()
    }
    fn apply_metrics(&mut self, m: &quality::QuestionQualityMetrics) {
        self.distinctness_score = Some(m.distinctness);
        self.multi_step_depth = Some(m.depth);
        self.verb_diversity_count = Some(m.verb_diversity);
        self.scaffold_pattern = Some(m.scaffold_pattern.clone());
    }
    fn get_max_marks(&self) -> u8 {
        self.max_marks
    }
    fn get_distinctness(&self) -> Option<f32> {
        self.distinctness_score
    }
    fn adjust_marks(questions: &mut [Self], total_marks: usize) {
        if questions.is_empty() {
            return;
        }
        let current_total: i64 = questions.iter().map(|q| q.max_marks as i64).sum();
        let diff = total_marks as i64 - current_total;
        if diff == 0 {
            return;
        }
        let q_count = questions.len();
        let base_adj = diff / q_count as i64;
        let remainder = diff.abs() % q_count as i64;
        let mut indices: Vec<usize> = (0..q_count).collect();
        if diff > 0 {
            indices.sort_by_key(|&i| questions[i].max_marks);
        } else {
            indices.sort_by_key(|&i| std::cmp::Reverse(questions[i].max_marks));
        }
        for (pos, &i) in indices.iter().enumerate() {
            let adj = base_adj
                + if (pos as i64) < remainder {
                    diff.signum()
                } else {
                    0
                };
            let new_marks = (questions[i].max_marks as i64 + adj).clamp(
                constants::MIN_MARKS_PER_QUESTION as i64,
                constants::MAX_MARKS_PER_QUESTION as i64,
            );
            questions[i].max_marks = new_marks as u8;
        }
    }
}

impl NormalizableQuestion for McQuestion {
    fn normalize(questions: &mut [Self], topics: &[String], subtopics: Option<&Vec<String>>) {
        normalization::normalise_mc(questions, topics, subtopics);
    }
    fn validate(questions: &[Self], expected: usize) -> CommandResult<()> {
        normalization::validate_mc(questions, expected)
    }
    fn extract_texts(questions: &[Self]) -> Vec<String> {
        questions
            .iter()
            .map(|q| {
                let opts = q
                    .options
                    .iter()
                    .map(|o| format!("{}: {}", o.label, o.text))
                    .collect::<Vec<_>>()
                    .join(" ");
                format!("{} {opts}", q.prompt_markdown)
            })
            .collect()
    }
    fn apply_metrics(&mut self, m: &quality::QuestionQualityMetrics) {
        self.distinctness_score = Some(m.distinctness);
        self.multi_step_depth = Some(m.depth);
        self.verb_diversity_count = Some(m.verb_diversity);
        self.scaffold_pattern = Some(m.scaffold_pattern.clone());
    }
    fn get_max_marks(&self) -> u8 {
        1
    }
    fn get_distinctness(&self) -> Option<f32> {
        self.distinctness_score
    }
    fn adjust_marks(_questions: &mut [Self], _total_marks: usize) {
        // MC questions are always 1 mark each, no adjustment.
    }
}
