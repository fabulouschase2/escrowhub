const {
  Document, Packer, Paragraph, TextRun, TabStopType, AlignmentType,
  BorderStyle,
} = require("docx");
const fs = require("fs");

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
      new TextRun({ text: "belloabdulrahmon345@gmail.com   |   github.com/fabulouschase2   |   Canada", size: 19, color: C.sec, font: FONT }),
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

// ---------- Resume A: Generative AI Generalist ----------
const docA = buildDoc([
  ...nameBlock("Generative AI Specialist  |  AI Evaluation, Operations & Quality"),

  sectionHeading("PROFILE SUMMARY"),
  summary(
    "Generative AI specialist with a software engineering foundation and 3+ years across frontier-model evaluation, data operations, and quality systems \u2014 currently evaluating frontier AI outputs at Turing, with prior annotation and peer QA at Mindrift and two-plus years of structured evaluation for Outlier and OneForma. Founded and operated Chopbit, a usage-analytics platform serving 2,000+ active users. M.S. in Software Engineering (Carnegie Mellon). I pair operational discipline \u2014 metrics, escalation paths, process design \u2014 with the hands-on ability to build the tooling behind them."
  ),

  sectionHeading("CORE SKILLS"),
  skillLine("AI Evaluation & Quality", "Rubric-based model-output evaluation, factuality / accuracy / safety assessment, hallucination detection, side-by-side comparison, escalation & edge-case handling, citation-supported rationales"),
  skillLine("Operations & Process", "End-to-end delivery, KPI definition & tracking, workflow design, quality-control standards, cross-functional coordination, continuous improvement"),
  skillLine("Data & Engineering", "Python, SQL / SQLite, Django, React, REST APIs, JSON, structured data analysis, API debugging, Git & GitHub"),
  skillLine("Annotation & Tooling", "Structured labeling, taxonomy application, peer review, Label Studio, CVAT, PySceneDetect"),

  sectionHeading("WORK EXPERIENCE"),

  jobTitle("AI Model Evaluator", "Turing", "Oct 2026 \u2013 Present"),
  bullet(["Evaluate frontier AI model responses for accuracy, relevance, completeness, and safety against project-specific rubrics, sustaining consistent output across high task volumes."]),
  bullet(["Convert evaluation judgments into usable training signal: citation-supported, evidence-based rationales that downstream teams rely on for model-improvement decisions."]),
  bullet(["Identify ambiguous and edge-case samples and escalate with reasoned notes, keeping labeling decisions consistent, documented, and auditable."]),

  jobTitle("Data Annotator / QA Expert", "Mindrift", "May 2026 \u2013 Jul 2026"),
  bullet(["Ran high-volume structured annotation and quality review against detailed guidelines, then reviewed peer annotations and delivered written feedback that improved quality and taxonomy consistency."]),
  bullet(["Flagged ambiguous, inconsistent, and edge-case samples with reasoned explanations, operating the escalation loop between frontline raters and project leads."]),

  jobTitle("Founder & Software Engineer", "Chopbit", "Mar 2025 \u2013 Dec 2025"),
  bullet(["Founded and operated a usage-analytics and product-intelligence platform serving 2,000+ active users, owning the full lifecycle end to end: scoping, architecture, delivery, QA, deployment, and iteration."]),
  bullet(["Built the backend (Python/Django REST APIs), frontend (React), and SQL/SQLite data layer; established the internal quality-control standards and review processes that kept delivery reliable."]),
  bullet(["Defined and tracked product and operational metrics; analyzed application data, API responses, and user-behavior patterns to drive data-driven roadmap decisions."]),

  jobTitle("Content Evaluation & Quality Assessment", "Outlier & OneForma", "2023 \u2013 2025"),
  bullet(["Two-plus years of rubric-based content review, fact-checking, and evidence-based written assessments on AI projects, delivered independently on remote, project-based assignments."]),

  jobTitle("Software Engineer & Product Developer", "Independent / Freelance", "2021 \u2013 Present"),
  bullet(["Design, develop, test, and deploy full-stack web applications (Python, Django, React, SQL/SQLite, Git), managing requirements, QA, and deliverable standards end to end."]),

  sectionHeading("PROJECT"),
  jobTitle("IVC \u2014 Instant Verification for Campers", "Founder & Developer", ""),
  bullet(["Replaced a manual, multi-step camper check-in workflow with a web-based registration and verification system \u2014 process clarity, usability for non-technical staff, and iterative testing for accuracy and reliability."]),

  sectionHeading("EDUCATION"),
  edu("M.S., Software Engineering", "Carnegie Mellon University", "2025"),
  edu("B.S., Computer Science", "Columbia University", "2019"),
]);

// ---------- Resume B: SWE, Coding Evaluation & Training Data ----------
const docB = buildDoc([
  ...nameBlock("Software Engineer  |  AI Evaluation & Training Data"),

  sectionHeading("PROFILE SUMMARY"),
  summary(
    "Software engineer with 5+ years building and shipping real systems \u2014 Python/Django/React/SQL and asyncio network infrastructure \u2014 and 3+ years evaluating frontier AI model outputs at Turing, Mindrift, and Outlier/OneForma with rubrics, golden standards, and citation-supported rationales. Founded and engineered Chopbit end to end (2,000+ active users); built ProxyForge, an asyncio proxy server with health-aware rotation and a REST API. Strong engineering taste applied to evaluation: rubrics and reward signals that capture real engineering value, not just \u201Cdoes it compile.\u201D"
  ),

  sectionHeading("CORE SKILLS"),
  skillLine("Software Engineering", "Python (primary), Django, REST APIs, React / JavaScript, SQL / SQLite, asyncio, Git & GitHub, software testing, code review, API debugging"),
  skillLine("Systems & Environments", "Proxy / networking (HTTP CONNECT, SOCKS4/5), concurrent health checking & weighted scoring, SQLite data design, REST API design, automated test harnesses"),
  skillLine("AI Evaluation & Data", "Rubric design & iteration, golden sets, factuality & safety assessment, hallucination detection, peer review feedback, Label Studio, CVAT"),

  sectionHeading("WORK EXPERIENCE"),

  jobTitle("AI Model Evaluator", "Turing", "Oct 2026 \u2013 Present"),
  bullet(["Evaluate frontier AI model responses for accuracy, relevance, completeness, and safety against project-specific rubrics and labeling guidelines."]),
  bullet(["Write citation-supported, evidence-based rationales that convert evaluation judgments into reliable training signal \u2014 every judgment traceable to verifiable evidence."]),
  bullet(["Identify ambiguous and edge-case samples and escalate with reasoned documentation, keeping decisions consistent and reproducible at high volume."]),

  jobTitle("Data Annotator / QA Expert", "Mindrift", "May 2026 \u2013 Jul 2026"),
  bullet(["Performed high-volume structured annotation and quality review against detailed labeling guidelines, including hands-on assessment of peer annotators\u2019 coding and reasoning output."]),
  bullet(["Compared AI-generated responses against prompts and evaluation criteria for safety, helpfulness, and factuality; flagged ambiguous samples with reasoned explanations that tightened taxonomy definitions."]),

  jobTitle("Founder & Software Engineer", "Chopbit", "Mar 2025 \u2013 Dec 2025"),
  bullet(["Founded and engineered a usage-analytics and product-intelligence platform serving 2,000+ active users \u2014 owned architecture, development, testing, QA, deployment, and iteration end to end."]),
  bullet(["Built the full stack: Python/Django REST APIs, React frontend, and SQL/SQLite data layer, with internal quality-control standards and automated review checks before every release."]),
  bullet(["Diagnosed and resolved issues across frontend, backend, API, and database layers; analyzed API responses and application data to support engineering decisions."]),

  jobTitle("Content Evaluation & Quality Assessment", "Outlier & OneForma", "2023 \u2013 2025"),
  bullet(["Two-plus years of rubric-based content review, fact-checking, and evidence-based written assessments on AI-related projects, delivered independently on remote, project-based assignments."]),

  jobTitle("Software Engineer & Product Developer", "Independent / Freelance", "2021 \u2013 Present"),
  bullet(["Design, develop, test, and deploy full-stack web applications (Python, Django, React, REST APIs, SQL/SQLite, Git), owning requirements, testing, and deliverable standards."]),

  sectionHeading("PROJECT"),
  jobTitle("ProxyForge \u2014 Self-Hosted Rotating Proxy Service", "Developer \u2014 Python / asyncio", ""),
  bullet(["Built from scratch: an asyncio proxy server supporting HTTP CONNECT and SOCKS4/5 upstreams, with a concurrent checker validating thousands of proxies for latency, anonymity, and HTTPS tunneling."]),
  bullet(["Designed health-aware rotation \u2014 weighted scoring by latency, success rate, and anonymity \u2014 plus sticky sessions, country targeting, and automatic retry on failed upstreams, backed by a SQLite pool and REST API."]),

  sectionHeading("EDUCATION"),
  edu("M.S., Software Engineering", "Carnegie Mellon University", "2025"),
  edu("B.S., Computer Science", "Columbia University", "2019"),
]);

(async () => {
  fs.writeFileSync("C:/Users/Lenovo/Downloads/Abdulrahman_Bello_Resume_Generalist.docx",
    await Packer.toBuffer(docA));
  fs.writeFileSync("C:/Users/Lenovo/Downloads/Abdulrahman_Bello_Resume_SWE_Coding_Eval.docx",
    await Packer.toBuffer(docB));
  console.log("OK - both resumes written");
})();
