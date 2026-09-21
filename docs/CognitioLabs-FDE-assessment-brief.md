# CognitioLabs — Candidate Assessment

**Associate Forward Deployed Engineer**

Build an AI-enabled second-hand marketplace.

---

## 01 / The assignment

Do your best and aim for the highest level of completion you can within the time available. This is a demo exercise: you are not expected to deliver a production-ready product. Submit your best attempt, even if some parts remain unfinished.

Illustrative catalogue. Choose your own audience and product category.

### The demo you will build

Build a second-hand marketplace demo for an audience you choose, such as a campus exchange. Work towards the goals below. Incomplete demos are welcome; explain your progress and remaining work in `/notes`.

| Focus area                     | What to explore in your demo                                                                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **01 Marketplace**             | Aim for a browse view with listings and an item detail view that work on a phone. Let reviewers explore your demo without signing in.                                         |
| **02 Natural-language search** | Work towards natural-language queries that return relevant catalogue listings. If language understanding is unfinished, explain your implementation and attempts in `/notes`. |
| **03 Catalogue Q&A**           | Use catalogue information to answer questions and comparisons. Acknowledge missing facts. Explain any unfinished catalogue grounding in `/notes`.                             |
| **04 A public `/notes` page**  | Add an accessible `/notes` page to the deployed site. Explain the product and your decisions in your own words, using the checklist below.                                    |

Seeded listings, simulated payments and a demo without real users are acceptable. Choose your own technology stack.

Real payments, authentication and logistics integrations are not expected.

_Associate FDE / Candidate Assessment — 01 / 03_

---

## 02 / AI resources & implementation

### Use AI with intention

AI is part of both the development process and the experience you deliver.

**01 / Build with AI**

Use an AI coding tool to develop the project. Codex CLI is supported through our gateway; you may also use other tools. You remain responsible for understanding and explaining the work you submit.

**02 / Add AI to the demo**

Explore model-powered search and catalogue Q&A. Take them as far as you can, and explain unfinished features in `/notes`.

### Connect your submitted AI to a model

Connect the AI or agent in your submitted demo to its underlying model and verify that it returns real responses from the deployed site. Reviewers should be able to try it without entering an API key. The wider demo may be unfinished; clearly label simulated or unavailable features.

Store the API key in a server-side environment variable and make model calls through your backend or serverless function. Keep credentials out of browser JavaScript, public repositories, `/notes`, recordings and uploaded ZIP files.

### Safe connection pattern

Public demo (no API key in the browser) → your server / function (API key in an environment variable) → AI gateway (authenticated model calls)

### Provided access

Your candidate page provides your gateway access, setup instructions and console link after the brief download. Use the console to check model documentation, usage and remaining allowance. We provide gateway access at no personal cost, within the allowances shown in your console.

### Your `/notes` checklist

1. What you built and who it is for.
2. What is seeded, simulated or otherwise limited in the demo.
3. Which AI coding tools you used, and which models power search and Q&A.
4. What you chose not to build, and why.
5. Known issues and unfinished parts.

_Associate FDE / Candidate Assessment — 02 / 03_

---

## 03 / Submission & review

### Deliver a reviewable result

Submit the best demo you can by the deadline, even if it is unfinished. We consider your progress, decisions and level of completion; a production-ready product is not expected.

**Required — Public HTTPS demo**

The deployed site must load for a reviewer without local setup. No login may be required for its core flow. Include the `/notes` page.

**Required — Public GitHub repository**

Provide the project source and retain your commit history. Keep credentials and other secrets out of the repository.

**Optional attachments:** You may also provide an accessible video walkthrough and a source-code ZIP of up to 20 MB. A ZIP does not replace the required GitHub link. Exclude dependencies, generated build files and secrets.

### Before you confirm

1. Open the site and repository in a private browser window; verify the links and phone layout.
2. Test your deployed AI or agent in that private window: check real model responses without exposing or asking the reviewer for a key.
3. Submit your best attempt through your candidate page before its deadline, even if unfinished. Confirm carefully: the submission is final.
4. Check the receipt on that page. Your result and next steps will appear there after the team's review.

### How we review your work

| Criterion               | Question                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| **Usability**           | Does the public demo load on a phone, and can a buyer browse an item without instructions?           |
| **Search relevance**    | Does natural-language search return catalogue items that match the request?                          |
| **Grounded answers**    | Does the assistant use the listings and acknowledge what it cannot establish?                        |
| **Product coherence**   | Do the catalogue, interface and AI form a consistent buying experience?                              |
| **Transparency**        | Does `/notes` explain the demo boundaries, AI usage and known limitations honestly?                  |
| **Scope and execution** | How far did you take the demo, how did you prioritise, and what do your attempts and decisions show? |

If access or submission fails, email [talents@cognitiolabs.ai](mailto:talents@cognitiolabs.ai) before your deadline. Include your application reference and a brief description of the issue; never send passwords or API keys.

Candidate page: [https://fde.cognitiolabs.ai/candidate](https://fde.cognitiolabs.ai/candidate)

_Associate FDE / Candidate Assessment — 03 / 03_
