const {
  Document, Packer, Paragraph, TextRun, TabStopType, AlignmentType,
  BorderStyle,
} = require("docx");

const C = {
  name: "1A2636",
  accent: "1F3A5F",
  body: "2C3E4A",
  sec: "5A6B7B",
  line: "9BB0C4",
};
const FONT = "Calibri";
const CONTENT_W = 10512;

const nameBlock = (headline) => [
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 20 },
    children: [new TextRun({ text: "ABDULRAHMAN BELLO", bold: true, size: 42, color: C.name, font: FONT })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 40 },
    children: [new TextRun({ text: headline, size: 21, color: C.accent, font: FONT })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C.accent, space: 4 } },
    children: [
      new TextRun({ text: "belloabdulrahmon345@gmail.com   |   github.com/fabulouschase2   |   USA", size: 19, color: C.sec, font: FONT }),
    ],
  }),
];

const sectionHeading = (text) =>
  new Paragraph({
    spacing: { before: 50, after: 36 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.line, space: 2 } },
    keepNext: true,
    children: [new TextRun({ text, bold: true, size: 22, color: C.accent, font: FONT })],
  });

const jobTitle = (title, org, dates) =>
  new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
    spacing: { before: 36, after: 12 },
    keepNext: true,
    children: [
      new TextRun({ text: title, bold: true, size: 21, color: C.name, font: FONT }),
      new TextRun({ text: `   |   ${org}`, size: 21, color: C.accent, font: FONT }),
      new TextRun({ text: `\t${dates}`, size: 19, color: C.sec, font: FONT }),
    ],
  });

const bullet = (parts) =>
  new Paragraph({
    spacing: { after: 8, line: 252 },
    indent: { left: 260, hanging: 160 },
    children: [
      new TextRun({ text: "\u2022  ", size: 19, color: C.accent, font: FONT }),
      ...parts.map((p) =>
        typeof p === "string"
          ? new TextRun({ text: p, size: 19, color: C.body, font: FONT })
          : new TextRun({ size: 19, color: C.body, font: FONT, ...p })
      ),
    ],
  });

const skillLine = (label, items) =>
  new Paragraph({
    spacing: { after: 16, line: 258 },
    indent: { left: 260, hanging: 260 },
    children: [
      new TextRun({ text: `${label}:  `, bold: true, size: 19, color: C.name, font: FONT }),
      new TextRun({ text: items, size: 19, color: C.body, font: FONT }),
    ],
  });

const edu = (deg, school, dates) =>
  new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
    spacing: { before: 30, after: 12 },
    children: [
      new TextRun({ text: deg, bold: true, size: 20, color: C.name, font: FONT }),
      new TextRun({ text: `   |   ${school}`, size: 20, color: C.accent, font: FONT }),
      new TextRun({ text: `\t${dates}`, size: 19, color: C.sec, font: FONT }),
    ],
  });

const summary = (text) =>
  new Paragraph({
    spacing: { after: 30, line: 264 },
    alignment: AlignmentType.JUSTIFIED,
    children: [new TextRun({ text, size: 20, color: C.body, font: FONT })],
  });

const buildDoc = (children) =>
  new Document({
    creator: "Abdulrahman Bello",
    title: "Abdulrahman Bello - Resume",
    styles: { default: { document: { run: { font: FONT, size: 19, color: C.body } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 640, bottom: 640, left: 864, right: 864 },
          },
        },
        children,
      },
    ],
  });

// ---------- Tailored Resume: AI Model Evaluation Specialist (USA-based) ----------
const doc = buildDoc([
  ...nameBlock("AI Model Evaluation Specialist  |  Quality Assessment & Written Rationale"),

  sectionHeading("PROFESSIONAL SUMMARY"),
  summary(
    "AI evaluation specialist with 3+ years of rubric-based assessment of model outputs, content, and quality systems. Currently evaluating frontier AI responses at Turing with prior high-volume annotation and peer QA at Mindrift, plus two-plus years of structured evaluation for Outlier and OneForma. Experienced at assessing accuracy, consistency, and edge cases, then writing clear, evidence-based justifications that improve downstream model performance. Strong attention to detail, independent guideline-following, and disciplined written feedback. M.S. Software Engineering (Carnegie Mellon University). Based in the USA, authorized to work remotely for US-based AI evaluation contracts."
  ),

  sectionHeading("CORE SKILLS"),
  skillLine("AI Evaluation & Quality", "Rubric-based evaluation of text/image/video/document outputs, factuality & accuracy assessment, error & inconsistency detection, side-by-side comparison, edge-case identification, citation-supported written rationales"),
  skillLine("Written Judgment & Feedback", "Clear evidence-based justifications, peer review, constructive written feedback, guideline adherence, escalation with reasoned notes, taxonomy consistency"),
  skillLine("Operations & Process", "High-volume delivery, quality-control standards, workflow design, continuous improvement, cross-functional coordination"),
  skillLine("Technical Foundation", "Python, SQL, structured data analysis, Label Studio, CVAT, Git — supports precise evaluation of technical and creative work"),

  sectionHeading("WORK EXPERIENCE"),

  jobTitle("AI Model Evaluator", "Turing", "Oct 2026 – Present"),
  bullet(["Evaluate frontier AI model outputs (text and multimodal) for accuracy, relevance, completeness, consistency, and safety against detailed project rubrics; maintain high throughput while protecting quality."]),
  bullet(["Write clear, citation-supported, evidence-based rationales that convert judgments into usable training signal for model improvement — the exact feedback loop this role requires."]),
  bullet(["Spot ambiguous, inconsistent, and edge-case samples; escalate with reasoned notes so decisions stay consistent, documented, and auditable."]),

  jobTitle("Data Annotator / QA Expert", "Mindrift", "May 2026 – Jul 2026"),
  bullet(["Performed high-volume structured annotation and quality review against detailed written guidelines; independently followed complex criteria while catching errors others missed."]),
  bullet(["Reviewed peer annotations and delivered precise written feedback that improved quality and taxonomy consistency; flagged edge cases with reasoned explanations to project leads."]),

  jobTitle("Content Evaluation & Quality Assessment", "Outlier & OneForma", "2023 – 2025"),
  bullet(["Two-plus years of independent, remote rubric-based content review, fact-checking, and evidence-based written assessments on AI projects — sustained attention to detail and clear written judgment under project guidelines."]),

  jobTitle("Founder & Software Engineer", "Chopbit", "Mar 2025 – Dec 2025"),
  bullet(["Built and operated a usage-analytics platform serving 2,000+ active users; owned end-to-end quality standards, review processes, and iterative testing for accuracy and reliability."]),
  bullet(["Defined and tracked quality metrics; analyzed application data and user-behavior patterns to drive precise, data-informed improvements."]),

  jobTitle("Software Engineer & Product Developer", "Independent / Freelance", "2021 – Present"),
  bullet(["Designed, developed, tested, and delivered full-stack applications; managed requirements, QA standards, and clear written specifications end to end."]),

  sectionHeading("PROJECT"),
  jobTitle("IVC — Instant Verification for Campers", "Founder & Developer", ""),
  bullet(["Replaced a manual multi-step check-in workflow with a web-based registration and verification system focused on process clarity, usability for non-technical staff, and iterative testing for accuracy and reliability."]),

  sectionHeading("EDUCATION"),
  edu("M.S., Software Engineering", "Carnegie Mellon University", "2025"),
  edu("B.S., Computer Science", "Columbia University", "2019"),
]);

(async () => {
  const buffer = await Packer.toBuffer(doc);
  require("fs").writeFileSync(
    "C:/Users/Lenovo/Downloads/Abdulrahman_Bello_Resume_AI_Evaluation_US.docx",
    buffer
  );
  console.log("OK - tailored resume written");
})();