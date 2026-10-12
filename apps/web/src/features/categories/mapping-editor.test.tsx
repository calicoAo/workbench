// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request } from "../../app/api";
import { CategoryMappingEditor } from ".";

const category = { id: 7, name: "工程", color: "#123456", dimensionKey: "career", targetMinutes: 12345, enabled: 0, icon: "star", sortOrder: 42 };
const dimensions = [
  { id: 1, dimensionKey: "career", name: "工程与事业", enabled: 1, sortOrder: 1 },
  { id: 2, dimensionKey: "custom_abc", name: "陶艺进阶", enabled: 1, sortOrder: 2 },
  { id: 3, dimensionKey: "disabled", name: "停用方向", enabled: 0, sortOrder: 3 }
];
afterEach(cleanup);
function setup(initial = "career") {
  let rows = [{ ...category, dimensionKey: initial }];
  let writeFail = false, readFail = false;
  let hold: Promise<void> | undefined;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(['growth-config', 1], { dimensions, categories: rows });
  client.setQueryData(['growth-config', 2], { dimensions, categories: [{ ...category, name: 'User Two', dimensionKey: 'career' }] });
  for (const prefix of ['today', 'settings']) client.setQueryData([prefix, 1], { categories: rows });
  for (const prefix of ['growth-overview','task','tasks','timeline']) client.setQueryData([prefix, 1, 'detail'], { identity: 17 });
  client.setQueryData(['settings', 2], { categories: [{ ...category, name: 'Other private user' }] });
  const onNotice = vi.fn();
  const api = vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method === 'PUT') { await hold; if (writeFail) throw new Error('Write failed'); rows = rows.map(row => ({ ...row, ...JSON.parse(String(init.body)) })); return { id: 7 }; }
    if (path === '/api/task-categories?includeDisabled=true') { if (readFail) throw new Error('Read failed'); return rows; }
    if (path === '/api/growth/dimensions') return { dimensions, categories: rows };
    throw new Error(path);
  });
  const tree = (userId = 1) => <QueryClientProvider client={client}><CategoryMappingEditor request={api as Request} userId={userId} onNotice={onNotice} /></QueryClientProvider>;
  const view = render(tree());
  return { api, client, onNotice, view, tree, rows: () => rows, failWrite: (value: boolean) => { writeFail = value; }, failRead: (value: boolean) => { readFail = value; }, holdWrite: (promise: Promise<void>) => { hold = promise; }, puts: () => api.mock.calls.filter(([,init]) => init?.method === 'PUT') };
}
function choose(value: string, label = '工程成长维度') { fireEvent.change(screen.getByLabelText(label), { target: { value } }); }
function save() { fireEvent.click(screen.getByRole('button', { name: '保存工程映射' })); }
async function saved() { await screen.findByText('分类映射已保存'); }

describe('Categories-owned Growth mapping', () => {
  it('does not write on open or selection; saves an enabled custom key through canonical partial Category PUT', async () => {
    const run = setup();
    expect(run.puts()).toHaveLength(0);
    expect(screen.getByRole('option', { name: '工程与事业' })).toBeTruthy();
    choose('custom_abc'); expect(run.puts()).toHaveLength(0); save(); await saved();
    expect(run.api).toHaveBeenCalledWith('/api/task-categories/7', { method: 'PUT', body: JSON.stringify({ dimensionKey: 'custom_abc' }) });
    expect(run.api).toHaveBeenCalledWith('/api/task-categories?includeDisabled=true');
    expect(run.rows()[0]).toEqual({ ...category, dimensionKey: 'custom_abc' });
    expect(run.onNotice).toHaveBeenCalledWith('分类映射已保存', '分类已更新');
  });
  it('clears to null while retaining disabled Category metadata and historical availability', async () => {
    const run = setup(); choose(''); save(); await saved();
    expect(JSON.parse(String(run.puts()[0][1]?.body))).toEqual({ dimensionKey: null });
    expect(run.client.getQueryData<{categories:unknown[]}>(['settings',1])!.categories[0]).toEqual({ ...category, dimensionKey: null });
    expect(screen.getByText(/已停用分类（历史仍可归属）/)).toBeTruthy();
  });
  it('displays renamed configured dimensions and excludes disabled/foreign options', () => {
    setup();
    expect(screen.getByRole('option', { name: '陶艺进阶' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: '停用方向' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'foreign' })).toBeNull();
    expect(screen.getByRole('button', { name: '保存工程映射' }).hasAttribute('disabled')).toBe(true);
  });
  it.each(['disabled','missing'])('preserves an unavailable %s current key without silently clearing it', (key) => {
    const run = setup(key);
    expect((screen.getByLabelText('工程成长维度') as HTMLSelectElement).value).toBe(key);
    expect(screen.getByRole('option', { name: /当前映射不可用/ }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(key === 'disabled' ? /维度已停用/ : /已停用分类.*当前映射不可用/)).toBeTruthy();
    expect(run.puts()).toHaveLength(0);
  });
  it('retains failed selection, canonical caches and recoverable retry', async () => {
    const run = setup(); run.failWrite(true); choose('custom_abc'); save();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect((screen.getByLabelText('工程成长维度') as HTMLSelectElement).value).toBe('custom_abc');
    expect(run.client.getQueryData<{categories:typeof category[]}>(['growth-config',1])!.categories[0].dimensionKey).toBe('career');
    expect(run.onNotice).not.toHaveBeenCalledWith('分类映射已保存', expect.anything());
    run.failWrite(false); save(); await saved(); expect(run.puts()).toHaveLength(2);
  });
  it('blocks repeated submissions while pending', async () => {
    const run = setup(); let resolve!: () => void; run.holdWrite(new Promise<void>(done => { resolve = done; }));
    choose('custom_abc'); save(); fireEvent.submit(screen.getByLabelText('工程成长维度').closest('form')!);
    expect(run.puts()).toHaveLength(1); expect(screen.getByLabelText('工程成长维度').hasAttribute('disabled')).toBe(true);
    await act(async () => resolve()); await saved(); expect(run.puts()).toHaveLength(1);
  });
  it('retries only the canonical read after an acknowledged write with read failure', async () => {
    const run = setup(); run.failRead(true); choose('custom_abc'); save();
    expect(await screen.findByText(/映射已保存，分类读取失败/)).toBeTruthy();
    expect(run.puts()).toHaveLength(1);
    expect(run.client.getQueryData<{categories:typeof category[]}>(['growth-config',1])!.categories[0].dimensionKey).toBe('career');
    run.failRead(false); fireEvent.click(screen.getByRole('button', { name: '刷新分类列表' })); await saved();
    expect(run.puts()).toHaveLength(1);
    expect(run.client.getQueryData<{categories:typeof category[]}>(['growth-config',1])!.categories[0].dimensionKey).toBe('custom_abc');
  });
  it('isolates authenticated user drafts and late responses', async () => {
    const run = setup(); let resolve!: () => void; run.holdWrite(new Promise<void>(done => { resolve = done; }));
    choose('custom_abc'); save(); run.view.rerender(run.tree(2));
    expect(screen.queryByLabelText('工程成长维度')).toBeNull();
    expect((screen.getByLabelText('User Two成长维度') as HTMLSelectElement).value).toBe('career');
    await act(async () => resolve());
    expect(run.onNotice).not.toHaveBeenCalled();
    expect(run.client.getQueryData<{categories:typeof category[]}>(['growth-config',2])!.categories[0].dimensionKey).toBe('career');
    expect(run.api).not.toHaveBeenCalledWith('/api/task-categories?includeDisabled=true');
  });
  it('invalidates all affected user queries, keeps other users and source identity intact', async () => {
    const run = setup(); choose('custom_abc'); save(); await saved();
    for (const prefix of ['growth-overview','task','tasks','timeline']) {
      expect(run.client.getQueryState([prefix,1,'detail'])?.isInvalidated).toBe(true);
      expect(run.client.getQueryData([prefix,1,'detail'])).toEqual({ identity: 17 });
    }
    expect(run.client.getQueryData<{categories:typeof category[]}>(['settings',2])!.categories[0].name).toBe('Other private user');
    expect(run.client.getQueryState(['settings',2])?.isInvalidated).toBe(false);
    expect(run.client.getQueryData(['task-categories',1])).toEqual([]); // Disabled Category stays out of Bounty options.
    expect(run.client.getQueryData<{categories:unknown[]}>(['settings',1])!.categories).toEqual(run.rows());
  });
  it('cancels a stale pre-write Growth response before committing confirmed Category state', async () => {
    const run = setup(); let resolve!: (value: unknown) => void;
    const stale = run.client.fetchQuery({ queryKey: ['growth-config',1], queryFn: () => new Promise(done => { resolve = done; }), staleTime: 0 });
    void stale.catch(() => undefined);
    await waitFor(() => expect(resolve).toBeTruthy()); choose('custom_abc'); save(); await saved();
    await act(async () => resolve({ dimensions, categories: [category] }));
    expect(run.client.getQueryData<{categories:typeof category[]}>(['growth-config',1])!.categories[0].dimensionKey).toBe('custom_abc');
  });
  it('uses keyboard-submittable native form and shared Save control', () => {
    setup(); choose('custom_abc');
    expect(screen.getByRole('button', { name: '保存工程映射' }).className).toContain('ui-button');
    expect(screen.getByLabelText('工程成长维度').closest('form')).toBeTruthy();
  });
});
