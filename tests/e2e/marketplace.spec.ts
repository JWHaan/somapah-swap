import { expect, test } from "@playwright/test";

test("buyer can filter, inspect, and simulate reserving a listing", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: "Somapah Swap" }),
  ).toBeVisible();
  await expect(page.locator("article[data-listing-id]")).toHaveCount(15);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);

  await page.getByRole("button", { name: "Dorm" }).click();
  await expect(page.getByRole("button", { name: "Dorm" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("article[data-listing-id]")).toHaveCount(6);

  await page.getByRole("link", { name: /Stand fan, used one term/ }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Stand fan, used one term" }),
  ).toBeVisible();
  await expect(page.getByText("Wobbles on highest speed")).toBeVisible();

  await page.getByRole("button", { name: "Reserve (simulated)" }).click();
  await expect(
    page.getByText(
      "The reservation is simulated. No seller was contacted and no payment was taken.",
    ),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});
