// @vitest-environment jsdom

import { type ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CategoriesFeature, type Category } from ".";

type Props = ComponentProps<typeof CategoriesFeature>;
afterEach(cleanup);

const categories: Category[] = [{ id: 7, name: "编程", dimensionKey: "career", color: "#5B8DEF", targetMinutes: 6000, totalMinutes: 120 }];

function feature(overrides: Partial<Props> = {}) {
  return <CategoriesFeature request={overrides.request ?? (vi.fn(async () => ({})) as Props["request"])} categories={overrides.categories ?? categories} onError={overrides.onError ?? vi.fn()} onConfirm={overrides.onConfirm ?? vi.fn()} onChanged={overrides.onChanged ?? vi.fn()} />;
}

describe("CategoriesFeature workflow ownership", () => {
  it("creates a category and clears the owned draft on success", async () => {
    const requestMock = vi.fn(async (_path: string, _init?: RequestInit) => ({}));
    const onChanged = vi.fn(async () => undefined);
    render(feature({ request: requestMock as Props["request"], onChanged }));
    fireEvent.change(screen.getByLabelText("技能或主题名称"), { target: { value: "  写作  " } });
    fireEvent.change(screen.getByLabelText("新增能力维度"), { target: { value: "creative" } });
    fireEvent.click(screen.getByRole("button", { name: "新增技能或主题" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(requestMock).toHaveBeenCalledWith("/api/task-categories", { method: "POST", body: JSON.stringify({ name: "写作", dimensionKey: "creative", color: "#FF8FA3", targetMinutes: 6000 }) });
    expect((screen.getByLabelText("技能或主题名称") as HTMLInputElement).value).toBe("");
  });

  it("updates an edited category and closes only on success", async () => {
    const requestMock = vi.fn(async (_path: string, _init?: RequestInit) => ({}));
    const onChanged = vi.fn(async () => undefined);
    render(feature({ request: requestMock as Props["request"], onChanged }));
    fireEvent.click(screen.getByRole("button", { name: "编辑编程" }));
    fireEvent.change(screen.getByLabelText("类型名称"), { target: { value: "工程" } });
    fireEvent.change(screen.getByLabelText("目标小时"), { target: { value: "200" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(requestMock).toHaveBeenCalledWith("/api/task-categories/7", { method: "PUT", body: JSON.stringify({ name: "工程", dimensionKey: "career", color: "#5B8DEF", targetMinutes: 12000 }) });
    expect(screen.queryByRole("heading", { name: "编辑类型" })).toBeNull();
  });

  it("preserves the editor when updating fails", async () => {
    const request = vi.fn(async () => { throw new Error("保存失败"); }) as Props["request"];
    const onError = vi.fn();
    render(feature({ request, onError }));
    fireEvent.click(screen.getByRole("button", { name: "编辑编程" }));
    fireEvent.change(screen.getByLabelText("类型名称"), { target: { value: "未保存" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("保存失败", "操作没有成功"));
    expect((screen.getByLabelText("类型名称") as HTMLInputElement).value).toBe("未保存");
  });

  it("delegates destructive confirmation and deletes only after confirmation", async () => {
    const requestMock = vi.fn(async (_path: string, _init?: RequestInit) => ({}));
    const onChanged = vi.fn(async () => undefined);
    let confirmAction: (() => void | Promise<void>) | undefined;
    const onConfirm: Props["onConfirm"] = (_title, _message, action) => { confirmAction = action; };
    render(feature({ request: requestMock as Props["request"], onChanged, onConfirm }));
    fireEvent.click(screen.getByRole("button", { name: "删除编程" }));
    expect(requestMock).not.toHaveBeenCalled();

    await confirmAction?.();

    expect(requestMock).toHaveBeenCalledWith("/api/task-categories/7", { method: "DELETE" });
    expect(onChanged).toHaveBeenCalledOnce();
  });
});
