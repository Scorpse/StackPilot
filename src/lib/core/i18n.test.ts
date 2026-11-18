import { describe, expect, it } from "vitest";
import { i18n } from "./i18n.svelte";

describe("application language", () => {
  it("starts in English when no preference is stored", () => {
    expect(i18n.locale).toBe("en");
  });

  it("renders environment messages in both locales and preserves literal values", () => {
    const name = "Project $&";
    expect(i18n.translateIn("en", "environments.saved_detail", { name }))
      .toBe("Saved environment “Project $&”");
    expect(i18n.translateIn("ru", "environments.saved_detail", { name }))
      .toBe("Окружение «Project $&» сохранено");
  });
});
