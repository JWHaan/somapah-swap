import { expect, test, type Page } from "@playwright/test";

const responsiveSizes = [
  { name: "320 x 568", width: 320, height: 568 },
  { name: "375 x 667", width: 375, height: 667 },
  { name: "390 x 844", width: 390, height: 844 },
  { name: "768 x 1024", width: 768, height: 1024 },
  { name: "1024 x 768", width: 1024, height: 768 },
  { name: "1440 x 900", width: 1440, height: 900 },
];

async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
}

for (const size of responsiveSizes) {
  test(`layout holds at ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("/");

    expect(await hasHorizontalOverflow(page)).toBe(false);
    await expect(page.getByLabel("Your search or question")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Search or ask" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "System", exact: true }),
    ).toBeVisible();
    await expect(page.locator("article[data-listing-id]")).toHaveCount(15);
    await expect(page.getByRole("contentinfo")).toBeVisible();

    const cardWidth = await page
      .locator("article[data-listing-id]")
      .first()
      .evaluate((element) => element.getBoundingClientRect().width);

    expect(cardWidth).toBeGreaterThan(200);
  });
}

test("listing cards state condition, category, and a listed defect", async ({
  page,
}) => {
  await page.goto("/");
  const fanCard = page.locator('article[data-listing-id="fan-hostel-01"]');

  await expect(fanCard.getByText("Dorm")).toBeVisible();
  await expect(fanCard.getByText("Used", { exact: true })).toBeVisible();
  await expect(fanCard.getByText(/Wobbles on highest speed/)).toBeVisible();
});

test("a card without listed defects does not claim to be defect-free", async ({
  page,
}) => {
  await page.goto("/");
  const rack = page.locator('article[data-listing-id="drying-rack-04"]');

  await expect(rack).toBeVisible();
  await expect(rack.getByText(/defect/i)).toHaveCount(0);
  await expect(rack).not.toContainText("defect-free");
});

test("example chips run through the same router and validation", async ({
  page,
}) => {
  const calls: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) {
      calls.push(url.pathname);
    }
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Fan under $30" }).click();
  await expect(page.locator("article[data-listing-id]")).toHaveCount(1);

  expect(calls).toEqual(["/api/search"]);
  await expect(page.getByLabel("Your search or question")).toHaveValue(
    "Fan under $30",
  );
});

test("the calculator example chip exercises the deterministic answer path", async ({
  page,
}) => {
  const calls: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) {
      calls.push(url.pathname);
    }
  });

  await page.goto("/");
  await page
    .getByRole("button", { name: "What comes with the calculator?" })
    .click();

  await expect(
    page.getByText(/Casio fx-991EX listing includes Case/i),
  ).toBeVisible();
  expect(calls).toEqual(["/api/ask"]);
});

test("heading hierarchy and landmarks are coherent", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("contentinfo")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(
    page.getByRole("heading", { level: 2, name: "Find or ask about listings" }),
  ).toBeVisible();
});

test("category filters expose a non-colour selected cue", async ({ page }) => {
  await page.goto("/");
  const dorm = page.getByRole("button", { name: "Dorm", exact: true });

  await dorm.click();
  await expect(dorm).toHaveAttribute("aria-pressed", "true");

  const dotted = await dorm.evaluate(
    (element) => getComputedStyle(element, "::before").borderTopWidth,
  );
  expect(Number.parseFloat(dotted)).toBeGreaterThan(0);

  const borderColor = await dorm.evaluate(
    (element) => getComputedStyle(element).borderTopColor,
  );
  expect(borderColor).not.toBe("");
});

test("text resized to 200% keeps the layout usable", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/");
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });

  expect(await hasHorizontalOverflow(page)).toBe(false);
  await expect(page.getByLabel("Your search or question")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Search or ask" }),
  ).toBeVisible();
});

test("interactive controls meet a comfortable touch target", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const heights = await page.evaluate(() => {
    const nodes = Array.from(
      document.querySelectorAll(
        "main button, main input, header button, header a, footer a, .category-filter button",
      ),
    );

    return nodes
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        // Skip controls that are intentionally hidden at this breakpoint.
        return rect.width > 0 && rect.height > 0;
      })
      .map((node) => Math.round(node.getBoundingClientRect().height));
  });

  expect(heights.length).toBeGreaterThan(5);
  for (const height of heights) {
    expect(height).toBeGreaterThanOrEqual(44);
  }
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("nonessential animation is removed", async ({ page }) => {
    await page.goto("/");
    const card = page.locator("article[data-listing-id]").first();

    const durations = await card.evaluate((element) =>
      getComputedStyle(element)
        .transitionDuration.split(",")
        .map((value) => Number.parseFloat(value)),
    );

    expect(durations.length).toBeGreaterThan(0);
    for (const duration of durations) {
      // Browsers normalise 0.001ms to a value expressed in seconds.
      expect(duration).toBeLessThan(0.01);
    }
  });
});

test("item page keeps its structure, defect emphasis, and simulated reserve", async ({
  page,
}) => {
  await page.goto("/item/fan-hostel-01");

  await expect(
    page.getByRole("heading", { level: 1, name: "Stand fan, used one term" }),
  ).toBeVisible();
  await expect(page.getByText("SGD 25")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Back to listings/ }),
  ).toBeVisible();

  const defectPanel = page.locator(".defect-panel");
  await expect(defectPanel).toContainText("Wobbles on highest speed");

  await page.getByRole("button", { name: "Reserve (simulated)" }).click();
  await expect(page.getByText(/reservation is simulated/i)).toBeVisible();
});

test("/notes exposes jump links and stays readable", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/notes");

  const contents = page.getByRole("navigation", { name: "Notes contents" });
  await expect(contents).toBeVisible();

  await contents
    .getByRole("link", { name: "Release evaluation, 23 September 2026" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Release evaluation, 23 September 2026",
    }),
  ).toBeVisible();
  expect(await hasHorizontalOverflow(page)).toBe(false);
});
