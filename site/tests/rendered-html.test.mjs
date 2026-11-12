import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const departmentData = JSON.parse(await readFile(
  new URL("../app/department-data.json", import.meta.url), "utf8",
));
const sourceData = JSON.parse(await readFile(
  new URL("../app/source-data.json", import.meta.url), "utf8",
));
const currentOrbitinfer = departmentData.departments.find(
  (department) => department.id === "orbitinfer",
);
const htmlText = (text) => text.replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#x27;");

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the research portal", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>观宇芯算研发部周报<\/title>/i);
  assert.match(html, /按部门进入周报/);
  assert.match(html, /星载大模型/);
  assert.match(html, /星座智算/);
  assert.ok(html.includes(currentOrbitinfer.currentReport.issue.isoWeek));
  assert.match(html, /周一 09:00 更新/);
  assert.match(html, /顶会与重要论文库/);
  assert.match(html, /og:image/);
});

test("server-renders the OrbitInfer department report", async () => {
  const response = await render("/departments/orbitinfer");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /本周趋势雷达/);
  assert.match(html, /\d+<\/strong><span>精选条目/);
  assert.match(html, /查看一手来源/);
  assert.match(html, /等待自动质量门禁|自动质量门禁已通过/);
  assert.match(html, /直接|可由 main 发布/);
  assert.doesNotMatch(html, /github\.com\/SeeSpace-Lab\/weekly_report\/pull\//);
  assert.match(html, /class="oneSentence"/);
  assert.match(html, /<dt>问题<\/dt>/);
  assert.match(html, /class="translatedTitle">/);
  const firstCard = currentOrbitinfer.currentReport.sections[0].items[0];
  assert.ok(html.includes(htmlText(firstCard.deepRead.titleZh)));
  assert.doesNotMatch(html, /C\\$\\^2\\$KV/);
  assert.doesNotMatch(html, /顶会动态/);
  assert.doesNotMatch(html, /论文库回看/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("renders the library, source pool, archive and second department", async () => {
  const [library, sources, archive, department] = await Promise.all([
    render("/library"),
    render("/sources"),
    render("/archive"),
    render("/departments/constellation-simulation"),
  ]);
  for (const response of [library, sources, archive, department]) {
    assert.equal(response.status, 200);
  }
  assert.match(await library.text(), /Mooncake/);
  const sourceHtml = await sources.text();
  for (const account of sourceData.accounts) {
    assert.ok(sourceHtml.includes(htmlText(account.name)));
  }
  const archiveHtml = await archive.text();
  assert.match(archiveHtml, /历史周报/);
  for (const report of currentOrbitinfer.archive) {
    assert.ok(archiveHtml.includes(report.issue.isoWeek));
  }
  assert.match(await department.text(), /L2/);
});

test("ships structured report, library and interaction controls", async () => {
  const [page, departmentDataText, library, sources] = await Promise.all([
    readFile(new URL("../app/components/DepartmentReport.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/department-data.json", import.meta.url), "utf8"),
    readFile(new URL("../app/library-data.json", import.meta.url), "utf8"),
    readFile(new URL("../app/source-data.json", import.meta.url), "utf8"),
  ]);
  const departmentPayload = JSON.parse(departmentDataText);
  const orbitinfer = departmentPayload.departments.find(
    (department) => department.id === "orbitinfer",
  );
  const payload = orbitinfer.currentReport;
  const libraryPayload = JSON.parse(library);
  const sourcePayload = JSON.parse(sources);

  assert.equal(departmentPayload.departments.length, 3);
  assert.equal(orbitinfer.enabled, true);
  assert.match(payload.issue.isoWeek, /^\d{4}-W\d{2}$/);
  for (const department of departmentPayload.departments.filter((d) => d.enabled)) {
    const report = department.currentReport;
    assert.ok(report, `${department.id} has a current report`);
    assert.equal(report.issue.isoWeek, payload.issue.isoWeek);
    assert.ok(report.issue.itemCount >= department.weeklyOutput.min_items);
    assert.ok(report.issue.itemCount <= department.weeklyOutput.max_items);
    assert.ok(report.issue.estimatedReadMinutes <= department.weeklyOutput.target_read_minutes);
    const cards = report.sections.flatMap((section) => section.items);
    assert.equal(report.issue.itemCount, cards.length);
    for (const card of cards) {
      assert.ok(card.deepRead?.methodZh && card.deepRead?.resultZh);
      assert.ok(card.deepRead.evidence.length > 0);
      assert.ok(card.deepRead.confidence >= 0.6);
      assert.ok(!/^(deterministic|fallback:)/.test(card.deepRead.modelVersion));
    }
    if (!cards.length) {
      assert.ok(report.trends.includes("本周无满足范围和证据要求的条目。"));
    }
    const weeks = department.archive.map((entry) => entry.issue.isoWeek);
    assert.deepEqual(weeks, [...new Set(weeks)].sort().reverse());
    assert.equal(weeks[0], report.issue.isoWeek);
  }
  const renderedItemCount = payload.sections.reduce(
    (count, section) => count + section.items.length,
    0,
  );
  assert.equal(payload.issue.itemCount, renderedItemCount);
  assert.ok(payload.issue.itemCount > 0);
  assert.ok(payload.sections.length >= 1);
  assert.ok(payload.sections.every((section) => Array.isArray(section.items)));
  assert.ok(
    payload.sections.some((section) =>
      section.items.some((item) => item.deepRead?.problemZh),
    ),
  );
  assert.match(page, /useState/);
  assert.match(page, /setActiveSection/);
  assert.match(page, /setQuery/);
  assert.match(page, /target="_blank"/);
  assert.ok(libraryPayload.papers.length >= 8);
  assert.equal(new Set(sourcePayload.accounts.map((account) => account.sourceId)).size,
    sourcePayload.accounts.length);
  assert.ok(sourcePayload.accounts.every((account) => account.articles.length > 0));
  assert.equal(orbitinfer.archive[0].issue.isoWeek, payload.issue.isoWeek);
});

test("exports a GitHub Pages-compatible static snapshot", async () => {
  const [home, orbitinfer, archive, library, sources] = await Promise.all([
    readFile(new URL("../out/index.html", import.meta.url), "utf8"),
    readFile(
      new URL("../out/departments/orbitinfer/index.html", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../out/archive/index.html", import.meta.url), "utf8"),
    readFile(new URL("../out/library/index.html", import.meta.url), "utf8"),
    readFile(new URL("../out/sources/index.html", import.meta.url), "utf8"),
  ]);
  assert.match(home, /\/weekly_report\/assets\//);
  assert.match(home, /href="\/weekly_report\/departments\/orbitinfer"/);
  assert.doesNotMatch(home, /weekly_report\/weekly_report/);
  assert.match(orbitinfer, /本周趋势雷达/);
  assert.match(archive, /历史周报/);
  assert.match(library, /固定顶会覆盖/);
  assert.match(sources, /本周值得关注的进展/);
});
