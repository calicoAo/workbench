// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider, useI18n } from ".";

afterEach(() => localStorage.clear());

function Probe() { const { locale, setLocale, t, number, date, currency } = useI18n(); return <div><span>{locale}</span><span>{t("设置")}</span><span>{number(1234)}</span><span>{date("2026-09-25T12:00:00Z", { timeZone: "UTC", dateStyle: "medium" })}</span><span>{currency("1234")}</span><span>{currency("900719925474099312")}</span><button onClick={() => setLocale("en")}>switch</button></div>; }

describe("application i18n", () => {
  it("defaults to Chinese and switches copy plus Intl formatting", async () => {
    render(<I18nProvider><Probe /></I18nProvider>);
    expect(screen.getByText("设置")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "switch" }));
    expect(await screen.findByText("Settings")).toBeTruthy();
    await waitFor(() => expect(document.documentElement.lang).toBe("en"));
    expect(localStorage.getItem("workbench:locale")).toBe("en");
    expect(screen.getByText("1,234")).toBeTruthy();
    expect(screen.getByText("Sep 25, 2026")).toBeTruthy();
    expect(screen.getByText("CN¥12.34")).toBeTruthy();
    expect(screen.getByText("CN¥9,007,199,254,740,993.12")).toBeTruthy();
  });
});
