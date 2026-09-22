import { expect, test, type Page } from "@playwright/test";

const searchBody = {
  mode: "deterministic",
  interpreted: { max_price_sgd: 30 },
  results: [{ id: "fan-hostel-01", reason: "A hostel fan under your budget." }],
};

const askBody = {
  answer: "The listing does not say what the battery health is.",
  cited_ids: ["ipad-sketch-10"],
  citations: [
    {
      id: "ipad-sketch-10",
      title: "iPad 8th gen, 32GB",
      href: "/item/ipad-sketch-10",
    },
  ],
  missing: ["Battery health is not provided."],
  scope: "catalogue",
  mode: "deterministic",
};

type Counters = { search: number; ask: number };

async function routeBoth(page: Page, counters: Counters) {
  await page.route("**/api/search", async (route) => {
    counters.search += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(searchBody),
    });
  });
  await page.route("**/api/ask", async (route) => {
    counters.ask += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(askBody),
    });
  });
}

async function submit(page: Page, text: string) {
  await page.getByLabel("Your search or question").fill(text);
  await page.getByRole("button", { name: "Search or ask" }).click();
}

const searchCases = [
  "fan under $30",
  "show tech items",
  "something to raise my laptop",
  "used iPad for sketching",
  "best item for studying",
  "laptop stand",
  "course books",
  "anything for a hostel room",
];

test("there is exactly one catalogue input on the home page", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Your search or question")).toHaveCount(1);
  await expect(page.locator("input, textarea")).toHaveCount(1);
  await expect(
    page.locator('#catalogue-helper button[type="submit"]'),
  ).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Search or ask" })).toHaveCount(
    1,
  );
});

for (const query of searchCases) {
  test(`routes "${query}" to the search endpoint only`, async ({ page }) => {
    const counters: Counters = { search: 0, ask: 0 };
    await routeBoth(page, counters);
    await page.goto("/");
    await submit(page, query);

    await expect(page.locator("article[data-listing-id]")).toHaveCount(1);
    await expect(
      page.locator('article[data-listing-id="fan-hostel-01"]'),
    ).toBeVisible();
    expect(counters.search).toBe(1);
    expect(counters.ask).toBe(0);
  });
}

const askCases = [
  "What is the iPad battery health?",
  "Does the Keychron Bluetooth work?",
  "Compare the desk and laptop stand.",
  "Which drawing device includes a pen?",
  "which item is best for studying?",
  "iPad battery health",
  "Tell me about the monitor",
];

for (const question of askCases) {
  test(`routes "${question}" to the ask endpoint only`, async ({ page }) => {
    const counters: Counters = { search: 0, ask: 0 };
    await routeBoth(page, counters);
    await page.goto("/");
    await submit(page, question);

    await expect(page.getByText(/does not say/i)).toBeVisible();
    expect(counters.ask).toBe(1);
    expect(counters.search).toBe(0);
  });
}

test("duplicate submission while pending sends one request", async ({
  page,
}) => {
  const counters: Counters = { search: 0, ask: 0 };
  await page.route("**/api/search", async (route) => {
    counters.search += 1;
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(searchBody),
    });
  });
  await page.route("**/api/ask", async (route) => {
    counters.ask += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(askBody),
    });
  });

  await page.goto("/");
  await page.getByLabel("Your search or question").fill("fan under $30");
  const button = page.locator('button[type="submit"]');
  await button.click();
  await expect(button).toBeDisabled();
  await expect(button).toHaveText(/searching the catalogue/i);
  await page
    .getByLabel("Your search or question")
    .press("Enter")
    .catch(() => undefined);
  await button.click({ force: true });

  await expect(page.locator("article[data-listing-id]")).toHaveCount(1);
  expect(counters.search).toBe(1);
  expect(counters.ask).toBe(0);
});

test("a pending answer keeps the previous results visible", async ({
  page,
}) => {
  const counters: Counters = { search: 0, ask: 0 };
  await page.route("**/api/search", async (route) => {
    counters.search += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(searchBody),
    });
  });
  await page.route("**/api/ask", async (route) => {
    counters.ask += 1;
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(askBody),
    });
  });

  await page.goto("/");
  await submit(page, "fan under $30");
  await expect(page.locator("article[data-listing-id]")).toHaveCount(1);

  await submit(page, "What is the iPad battery health?");
  await expect(
    page.locator('article[data-listing-id="fan-hostel-01"]'),
  ).toBeVisible();

  await expect(page.getByText(/does not say/i)).toBeVisible();
  await expect(page.locator("article[data-listing-id]")).toHaveCount(0);
  expect(counters.search).toBe(1);
  expect(counters.ask).toBe(1);
});

test("a stale answer cannot overwrite a newer search", async ({ page }) => {
  const counters: Counters = { search: 0, ask: 0 };
  await page.route("**/api/search", async (route) => {
    counters.search += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(searchBody),
    });
  });
  await page.route("**/api/ask", async (route) => {
    counters.ask += 1;
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(askBody),
    });
  });

  await page.goto("/");
  await submit(page, "What is the iPad battery health?");
  await submit(page, "fan under $30");

  await expect(page.locator("article[data-listing-id]")).toHaveCount(1);
  await expect(page.getByText(/does not say/i)).toHaveCount(0);
  expect(counters.search).toBe(1);
  expect(counters.ask).toBe(1);
});

test("a too-long search is rejected locally without a request", async ({
  page,
}) => {
  const counters: Counters = { search: 0, ask: 0 };
  await routeBoth(page, counters);
  await page.goto("/");
  await submit(page, `used ${"x".repeat(320)}`);

  await expect(page.getByText(/too long/i)).toBeVisible();
  expect(counters.search).toBe(0);
  expect(counters.ask).toBe(0);
});

test("empty and whitespace-only input are rejected locally", async ({
  page,
}) => {
  const counters: Counters = { search: 0, ask: 0 };
  await routeBoth(page, counters);
  await page.goto("/");

  await page.getByRole("button", { name: "Search or ask" }).click();
  await expect(page.getByText(/at least/i)).toBeVisible();

  await page.getByLabel("Your search or question").fill("     ");
  await page.getByRole("button", { name: "Search or ask" }).click();
  await expect(page.getByText(/at least/i)).toBeVisible();

  expect(counters.search).toBe(0);
  expect(counters.ask).toBe(0);
  await expect(page.locator("article[data-listing-id]")).toHaveCount(15);
});

test("a stale search response cannot replace a newer answer", async ({
  page,
}) => {
  const counters: Counters = { search: 0, ask: 0 };
  await page.route("**/api/search", async (route) => {
    counters.search += 1;
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(searchBody),
    });
  });
  await page.route("**/api/ask", async (route) => {
    counters.ask += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(askBody),
    });
  });

  await page.goto("/");
  await submit(page, "fan under $30");
  await submit(page, "What is the iPad battery health?");

  await expect(page.getByText(/does not say/i)).toBeVisible();
  await page.waitForTimeout(1_200);
  await expect(page.getByText(/does not say/i)).toBeVisible();
  await expect(page.locator("article[data-listing-id]")).toHaveCount(0);
  expect(counters.search).toBe(1);
  expect(counters.ask).toBe(1);
});

test("an answer keeps its citations despite a previously selected category", async ({
  page,
}) => {
  const counters: Counters = { search: 0, ask: 0 };
  await routeBoth(page, counters);
  await page.goto("/");

  await submit(page, "fan under $30");
  await expect(page.locator("article[data-listing-id]")).toHaveCount(1);
  await page.getByRole("button", { name: "Course", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Show all categories" }),
  ).toBeVisible();

  await submit(page, "What is the iPad battery health?");

  await expect(page.getByText(/does not say/i)).toBeVisible();
  await expect(
    page.locator('#catalogue-answer a[href="/item/ipad-sketch-10"]'),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Course" })).toHaveCount(0);
  expect(counters.search).toBe(1);
  expect(counters.ask).toBe(1);
});

test("aria-live status announces pending and result states", async ({
  page,
}) => {
  const counters: Counters = { search: 0, ask: 0 };
  await page.route("**/api/search", async (route) => {
    counters.search += 1;
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(searchBody),
    });
  });
  await page.route("**/api/ask", async (route) => {
    counters.ask += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(askBody),
    });
  });

  await page.goto("/");
  const live = page.locator('#catalogue-helper [aria-live="polite"]');
  await expect(live).toHaveCount(1);

  await submit(page, "fan under $30");
  await expect(live).toContainText(/searching the catalogue/i);
  await expect(live).toContainText(/Matched from catalogue details/i);
  await expect(live).toContainText(/1 catalogue match/i);
});

test("the unified input keeps a visible keyboard focus indicator", async ({
  page,
}) => {
  await page.goto("/");
  const input = page.getByLabel("Your search or question");
  await input.focus();

  const focus = await input.evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      style: styles.outlineStyle,
      width: styles.outlineWidth,
    };
  });

  expect(focus.style).not.toBe("none");
  expect(Number.parseFloat(focus.width)).toBeGreaterThan(0);
});

test("a short input is rejected locally without a request", async ({
  page,
}) => {
  const counters: Counters = { search: 0, ask: 0 };
  await routeBoth(page, counters);
  await page.goto("/");
  await page.getByLabel("Your search or question").fill("ab");
  await page.getByRole("button", { name: "Search or ask" }).click();

  await expect(page.getByText(/at least/i)).toBeVisible();
  expect(counters.search).toBe(0);
  expect(counters.ask).toBe(0);
});
