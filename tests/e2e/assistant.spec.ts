import { expect, test, type Page } from "@playwright/test";

const comparisonAsk = {
  answer:
    "For a hostel room, the desk gives you a work surface while the stand raises a laptop.",
  cited_ids: ["desk-small-05", "laptop-stand-15"],
  citations: [
    {
      id: "desk-small-05",
      title: "Small folding desk",
      href: "/item/desk-small-05",
    },
    {
      id: "laptop-stand-15",
      title: "Aluminium laptop stand",
      href: "/item/laptop-stand-15",
    },
  ],
  missing: [],
  scope: "catalogue",
  mode: "ai",
};

function helper(page: Page) {
  return page.locator("#catalogue-helper");
}

async function fulfilAsk(page: Page, body: unknown) {
  await page.route("**/api/ask", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

async function ask(page: Page, question: string) {
  await page.getByLabel("Your search or question").fill(question);
  await page.getByRole("button", { name: "Search or ask" }).click();
}

test("buyer asks a catalogue question on a phone", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 2, name: "Find or ask about listings" }),
  ).toBeVisible();

  await ask(page, "What is the iPad battery health?");

  await expect(helper(page).getByText(/does not say/i)).toBeVisible();
  await expect(
    helper(page).getByText(/Battery health is not provided/i),
  ).toBeVisible();

  const citation = helper(page).getByRole("link", {
    name: /iPad 8th gen, 32GB/,
  });
  await expect(citation).toHaveAttribute("href", "/item/ipad-sketch-10");

  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});

test("buyer follows a citation into the authoritative item page", async ({
  page,
}) => {
  await page.goto("/");
  await ask(page, "What is the iPad battery health?");
  await helper(page)
    .getByRole("link", { name: /iPad 8th gen, 32GB/ })
    .click();

  await expect(
    page.getByRole("heading", { level: 1, name: "iPad 8th gen, 32GB" }),
  ).toBeVisible();
  await expect(page.getByText("SGD 220")).toBeVisible();
});

test("a live Q&A answer runs against the local routes without mocking", async ({
  page,
}) => {
  await page.goto("/");
  await ask(page, "What is the iPad battery health?");

  await expect(helper(page).getByText(/does not say/i)).toBeVisible();
  await expect(
    helper(page).getByRole("link", { name: /iPad 8th gen, 32GB/ }),
  ).toHaveAttribute("href", "/item/ipad-sketch-10");
});

test("comparison answers render citations without internal metadata", async ({
  page,
}) => {
  await fulfilAsk(page, comparisonAsk);
  await page.goto("/");
  await ask(page, "Compare the desk and the laptop stand for a hostel room.");

  await expect(helper(page).getByText(/work surface/i)).toBeVisible();
  await expect(
    helper(page).getByRole("link", { name: /Small folding desk/ }),
  ).toHaveAttribute("href", "/item/desk-small-05");
  await expect(
    helper(page).getByRole("link", { name: /Aluminium laptop stand/ }),
  ).toHaveAttribute("href", "/item/laptop-stand-15");

  const region = helper(page);
  await expect(region).not.toContainText("candidateIds");
  await expect(region).not.toContainText("usage");
  await expect(region).not.toContainText("latency");
  await expect(region).not.toContainText("reasoning");

  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});

test("an answer replaces the grid and hides category chips", async ({
  page,
}) => {
  await fulfilAsk(page, comparisonAsk);
  await page.goto("/");
  await expect(page.locator("article[data-listing-id]")).toHaveCount(15);

  await ask(page, "Compare the desk and the laptop stand.");

  await expect(helper(page).getByText(/work surface/i)).toBeVisible();
  await expect(page.locator("article[data-listing-id]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Dorm" })).toHaveCount(0);
});

test("clearing an answer restores the default category catalogue", async ({
  page,
}) => {
  await fulfilAsk(page, comparisonAsk);
  await page.goto("/");
  await ask(page, "Compare the desk and the laptop stand.");
  await expect(page.locator("article[data-listing-id]")).toHaveCount(0);

  await page.getByRole("button", { name: "Clear", exact: true }).click();

  await expect(page.locator("article[data-listing-id]")).toHaveCount(15);
  await expect(page.getByRole("button", { name: "Dorm" })).toBeVisible();
});

test("helper surfaces a recoverable error without provider details", async ({
  page,
}) => {
  await page.route("**/api/ask", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: "The catalogue assistant is temporarily unavailable.",
      }),
    });
  });

  await page.goto("/");
  await ask(page, "What is the iPad battery health?");

  await expect(
    helper(page).getByText(/temporarily unavailable/i),
  ).toBeVisible();
});

test("a q&a fallback explains itself and still links validated listings", async ({
  page,
}) => {
  await fulfilAsk(page, {
    ...comparisonAsk,
    answer:
      "I could not complete the comparison reliably. You can review the relevant listings directly.",
    mode: "fallback",
  });
  await page.goto("/");
  await ask(page, "Compare the desk and the laptop stand.");

  await expect(helper(page).getByText(/could not complete/i)).toBeVisible();
  await expect(
    helper(page).getByRole("link", { name: /Small folding desk/ }),
  ).toBeVisible();
});
