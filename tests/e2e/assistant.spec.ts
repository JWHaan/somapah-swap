import { expect, test } from "@playwright/test";

function assistant(page: import("@playwright/test").Page) {
  return page.locator("#catalogue-assistant");
}

test("buyer asks a deterministic catalogue question on a phone", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 2, name: "Ask about the catalogue" }),
  ).toBeVisible();

  await page
    .getByLabel("Your question")
    .fill("What is the iPad battery health?");
  await page
    .getByRole("button", { name: "Ask the catalogue assistant" })
    .click();

  await expect(assistant(page).getByText(/does not say/i)).toBeVisible();
  await expect(
    assistant(page).getByText(/Battery health is not provided/i),
  ).toBeVisible();

  const citation = assistant(page).getByRole("link", {
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
  await page
    .getByLabel("Your question")
    .fill("What is the iPad battery health?");
  await page
    .getByRole("button", { name: "Ask the catalogue assistant" })
    .click();
  await assistant(page)
    .getByRole("link", { name: /iPad 8th gen, 32GB/ })
    .click();

  await expect(
    page.getByRole("heading", { level: 1, name: "iPad 8th gen, 32GB" }),
  ).toBeVisible();
  await expect(page.getByText("SGD 220")).toBeVisible();
});

test("comparison answers render citations without internal metadata", async ({
  page,
}) => {
  await page.route("**/api/ask", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
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
      }),
    });
  });

  await page.goto("/");
  await page
    .getByLabel("Your question")
    .fill("Which desk or stand is better for a hostel room?");
  await page
    .getByRole("button", { name: "Ask the catalogue assistant" })
    .click();

  await expect(assistant(page).getByText(/work surface/i)).toBeVisible();
  await expect(
    assistant(page).getByRole("link", { name: /Small folding desk/ }),
  ).toHaveAttribute("href", "/item/desk-small-05");
  await expect(
    assistant(page).getByRole("link", { name: /Aluminium laptop stand/ }),
  ).toHaveAttribute("href", "/item/laptop-stand-15");

  const assistantRegion = assistant(page);
  await expect(assistantRegion).not.toContainText("candidateIds");
  await expect(assistantRegion).not.toContainText("usage");
  await expect(assistantRegion).not.toContainText("latency");

  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});

test("assistant surfaces a recoverable error without provider details", async ({
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
  await page
    .getByLabel("Your question")
    .fill("What is the iPad battery health?");
  await page
    .getByRole("button", { name: "Ask the catalogue assistant" })
    .click();

  await expect(
    assistant(page).getByText(/temporarily unavailable/i),
  ).toBeVisible();
});
