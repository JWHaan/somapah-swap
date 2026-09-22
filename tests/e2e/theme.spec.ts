import { expect, test, type Page } from "@playwright/test";

const STORAGE_KEY = "somapah-swap-theme";
const THEME_ATTRIBUTE = "data-theme";

async function themeAttribute(page: Page): Promise<string | null> {
  return page.evaluate(
    ([attribute]) => document.documentElement.getAttribute(attribute as string),
    [THEME_ATTRIBUTE],
  );
}

async function bodyBackground(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

async function selectTheme(page: Page, label: "Light" | "Dark" | "System") {
  await page.getByRole("button", { name: label, exact: true }).click();
}

test.describe("theme selection", () => {
  test.use({ colorScheme: "light" });

  test("defaults to system and follows a light system preference", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.getByRole("button", { name: "System", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(await themeAttribute(page)).toBeNull();
    expect(await bodyBackground(page)).toBe("rgb(247, 244, 238)");
  });

  test("explicit Dark applies the dark palette and persists across reload", async ({
    page,
  }) => {
    await page.goto("/");
    await selectTheme(page, "Dark");

    expect(await themeAttribute(page)).toBe("dark");
    expect(await bodyBackground(page)).toBe("rgb(20, 23, 26)");

    await page.reload();

    expect(await themeAttribute(page)).toBe("dark");
    expect(await bodyBackground(page)).toBe("rgb(20, 23, 26)");
    await expect(
      page.getByRole("button", { name: "Dark", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("explicit Light overrides a dark system preference", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");

    await selectTheme(page, "Light");

    expect(await themeAttribute(page)).toBe("light");
    expect(await bodyBackground(page)).toBe("rgb(247, 244, 238)");
  });

  test("returning to System removes the override", async ({ page }) => {
    await page.goto("/");
    await selectTheme(page, "Dark");
    expect(await themeAttribute(page)).toBe("dark");

    await selectTheme(page, "System");

    expect(await themeAttribute(page)).toBeNull();
    await expect(
      page.getByRole("button", { name: "System", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(await bodyBackground(page)).toBe("rgb(247, 244, 238)");
  });

  test("an invalid stored preference falls back to system", async ({
    page,
  }) => {
    await page.addInitScript(
      ([key]) => window.localStorage.setItem(key as string, "solarized"),
      [STORAGE_KEY],
    );
    await page.goto("/");

    expect(await themeAttribute(page)).toBeNull();
    await expect(
      page.getByRole("button", { name: "System", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("the theme control is keyboard operable and announces the change", async ({
    page,
  }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Dark", exact: true }).focus();
    await page.keyboard.press("Enter");

    expect(await themeAttribute(page)).toBe("dark");
    await expect(
      page.locator(".theme-control [aria-live='polite']"),
    ).toContainText(/theme set to dark/i);
  });

  test("core content stays usable when storage is unavailable", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() {
          throw new Error("storage disabled");
        },
      });
    });
    await page.goto("/");

    await expect(
      page.getByRole("heading", { level: 1, name: "Somapah Swap" }),
    ).toBeVisible();
    await expect(page.getByLabel("Your search or question")).toBeVisible();

    await selectTheme(page, "Dark");
    expect(await themeAttribute(page)).toBe("dark");
  });

  test("renders without a hydration error", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });

    await page.goto("/");
    await selectTheme(page, "Dark");
    await page.reload();

    expect(errors.filter((text) => /hydrat/i.test(text))).toEqual([]);
  });
});

test.describe("system preference in dark mode", () => {
  test.use({ colorScheme: "dark" });

  test("system mode follows a dark system preference", async ({ page }) => {
    await page.goto("/");

    expect(await themeAttribute(page)).toBeNull();
    expect(await bodyBackground(page)).toBe("rgb(20, 23, 26)");
  });
});
