import { expect, test, type Page } from "@playwright/test";

const deterministic = {
  mode: "deterministic",
  interpreted: {
    category: "tech",
    max_price_sgd: 20,
    max_price_operator: "lt",
  },
  results: [
    {
      id: "dongle-usbc-13",
      reason: "In the tech category within your S$20 budget.",
    },
    {
      id: "laptop-stand-15",
      reason: "In the tech category within your S$20 budget.",
    },
  ],
};

const aiReranked = {
  mode: "ai-reranked",
  interpreted: { concepts: ["desk"] },
  results: [
    { id: "desk-small-05", reason: "A compact folding desk for a small room." },
    { id: "laptop-stand-15", reason: "Raises a laptop to save desk space." },
  ],
};

const keywordFallback = {
  mode: "keyword-fallback",
  interpreted: { concepts: ["desk"] },
  results: [{ id: "desk-small-05", reason: "Matches your workspace search." }],
};

const noMatch = {
  mode: "no-match",
  interpreted: { concepts: ["gaming pc"] },
  results: [],
};

async function fulfil(page: Page, body: unknown) {
  await page.route("**/api/search", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

async function submitToHelper(page: Page, text: string) {
  await page.getByLabel("Your search or question").fill(text);
  await page.getByRole("button", { name: "Search or ask" }).click();
}

test("default catalogue renders all listings before searching", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("article[data-listing-id]")).toHaveCount(15);
});

test("deterministic search renders authoritative cards with reasons", async ({
  page,
}) => {
  await fulfil(page, deterministic);
  await page.goto("/");
  await submitToHelper(page, "tech item under $20");

  await expect(page.locator("article[data-listing-id]")).toHaveCount(2);
  await expect(
    page.locator('article[data-listing-id="dongle-usbc-13"]'),
  ).toBeVisible();
  await expect(
    page.getByText(/within your S\$20 budget/i).first(),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});

test("ai-reranked search shows the AI mode label", async ({ page }) => {
  await fulfil(page, aiReranked);
  await page.goto("/");
  await submitToHelper(
    page,
    "something compact for studying in a small hostel room",
  );

  await expect(page.getByText("AI-ranked results")).toBeVisible();
  await expect(page.locator("article[data-listing-id]")).toHaveCount(2);
});

test("keyword fallback shows the non-alarming fallback label", async ({
  page,
}) => {
  await fulfil(page, keywordFallback);
  await page.goto("/");
  await submitToHelper(page, "best option for a hostel workspace");

  await expect(page.getByText(/AI ranking was unavailable/i)).toBeVisible();
});

test("no-match shows guidance and no cards", async ({ page }) => {
  await fulfil(page, noMatch);
  await page.goto("/");
  await submitToHelper(page, "gaming PC under $100");

  await expect(page.getByText(/No listings match/i)).toBeVisible();
  await expect(page.locator("article[data-listing-id]")).toHaveCount(0);
});

test("clear restores the full catalogue", async ({ page }) => {
  await fulfil(page, aiReranked);
  await page.goto("/");
  await submitToHelper(
    page,
    "something compact for studying in a small hostel room",
  );
  await expect(page.locator("article[data-listing-id]")).toHaveCount(2);

  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.locator("article[data-listing-id]")).toHaveCount(15);
  await expect(page.getByLabel("Your search or question")).toHaveValue("");
});

test("category chip filters active search results without a new request", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/search", async (route) => {
    calls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(aiReranked),
    });
  });
  await page.goto("/");
  await submitToHelper(
    page,
    "something compact for studying in a small hostel room",
  );
  await expect(page.locator("article[data-listing-id]")).toHaveCount(2);

  await page.getByRole("button", { name: "Course" }).click();
  // desk and laptop stand are dorm/tech, so Course hides them and offers recovery.
  await expect(
    page.getByRole("button", { name: "Show all categories" }),
  ).toBeVisible();
  expect(calls).toBe(1);
});

test("a stale response cannot overwrite a newer search", async ({ page }) => {
  let call = 0;
  await page.route("**/api/search", async (route) => {
    call += 1;
    if (call === 1) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(aiReranked),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(deterministic),
    });
  });

  await page.goto("/");
  await page
    .getByLabel("Your search or question")
    .fill("something compact for studying in a small hostel room");
  await page.getByRole("button", { name: "Search or ask" }).click();
  await page.getByLabel("Your search or question").fill("tech item under $20");
  await page.getByRole("button", { name: "Search or ask" }).click();

  // The newer deterministic response (2 tech items) must win.
  await expect(
    page.locator('article[data-listing-id="dongle-usbc-13"]'),
  ).toBeVisible();
  await expect(page.locator("article[data-listing-id]")).toHaveCount(2);
});

test("the helper is keyboard operable and a result card links to its item", async ({
  page,
}) => {
  await fulfil(page, deterministic);
  await page.goto("/");
  await page.getByLabel("Your search or question").fill("tech under $20");
  await page.keyboard.press("Enter");
  await expect(page.locator("article[data-listing-id]")).toHaveCount(2);

  await page.getByRole("link", { name: /USB-C hub/ }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: /USB-C hub/ }),
  ).toBeVisible();
});

test("search results resolve through the authoritative catalogue only", async ({
  page,
}) => {
  await fulfil(page, {
    mode: "ai-reranked",
    interpreted: { concepts: ["invented"] },
    results: [
      { id: "desk-small-05", reason: "A real listing." },
      { id: "invented-item-99", reason: "Not a real listing." },
    ],
  });
  await page.goto("/");
  await submitToHelper(page, "something for a desk");

  await expect(page.getByText(/temporarily unavailable/i)).toBeVisible();
  await expect(page.locator("article[data-listing-id]")).toHaveCount(15);
});
