import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizePayload, mapToProject, mapToMilestone } from "../app/feishu/field-mapping.ts";

describe("normalizePayload", () => {
  it("parses flat payload", () => {
    const result = normalizePayload({
      record_id: "rec1",
      project_name: "项目A",
      tag: "PEP",
    });
    assert.equal(result.recordId, "rec1");
    assert.equal(result.type, "project");
    assert.equal(result.fields.project_name, "项目A");
    assert.equal(result.fields.tag, "PEP");
  });

  it("parses feishu native format with fields object", () => {
    const result = normalizePayload({
      record_id: "rec2",
      fields: { "项目名称": "CEA 2.X", "标签": "PEP" },
    });
    assert.equal(result.recordId, "rec2");
    assert.equal(result.fields["项目名称"], "CEA 2.X");
    assert.equal(result.fields["标签"], "PEP");
  });

  it("infers milestone type from milestone fields", () => {
    const result = normalizePayload({
      record_id: "rec3",
      "里程碑名称": "SOP",
      "发布日期": "2027-09-10",
    });
    assert.equal(result.type, "milestone");
  });

  it("respects explicit type field", () => {
    const result = normalizePayload({
      record_id: "rec4",
      type: "milestone",
      "名称": "SOP",
    });
    assert.equal(result.type, "milestone");
  });

  it("extracts action from event_type", () => {
    const result = normalizePayload({
      record_id: "rec5",
      event_type: "record.created",
      project_name: "A",
    });
    assert.equal(result.action, "create");
  });

  it("defaults action to update", () => {
    const result = normalizePayload({
      record_id: "rec6",
      project_name: "A",
    });
    assert.equal(result.action, "update");
  });
});

describe("mapToProject", () => {
  it("maps chinese field names", () => {
    const payload = normalizePayload({
      record_id: "rec1",
      "项目名称": "CEA 2.X",
      "标签": "PEP",
      "备注": "测试项目",
      "视图": "CEA Platform",
    });
    const project = mapToProject(payload);
    assert.equal(project.name, "CEA 2.X");
    assert.equal(project.tag, "PEP");
    assert.equal(project.detailRemark, "测试项目");
    assert.equal(project.viewId, "CEA Platform");
  });

  it("maps english field names", () => {
    const payload = normalizePayload({
      record_id: "rec2",
      project_name: "Project A",
      project_id: "P001",
      tag: "IPD",
    });
    const project = mapToProject(payload);
    assert.equal(project.name, "Project A");
    assert.equal(project.uuid, "P001");
    assert.equal(project.tag, "IPD");
  });

  it("uses recordId as uuid fallback", () => {
    const payload = normalizePayload({
      record_id: "rec3",
      "项目名称": "No ID Project",
    });
    const project = mapToProject(payload);
    assert.equal(project.uuid, "rec3");
  });

  it("defaults viewId to Default", () => {
    const payload = normalizePayload({
      record_id: "rec4",
      "项目名称": "Test",
    });
    const project = mapToProject(payload);
    assert.equal(project.viewId, "Default");
  });
});

describe("mapToMilestone", () => {
  it("maps chinese milestone fields", () => {
    const payload = normalizePayload({
      record_id: "ms1",
      "里程碑名称": "SOP",
      "迭代": "V1.0",
      "发布日期": "2027-09-10",
      "所属项目": "P001",
    });
    const ms = mapToMilestone(payload);
    assert.equal(ms.remark, "SOP");
    assert.equal(ms.iteration, "V1.0");
    assert.equal(ms.releaseDate, "2027-09-10");
    assert.equal(ms.projectId, "P001");
  });

  it("maps english milestone fields", () => {
    const payload = normalizePayload({
      record_id: "ms2",
      type: "milestone",
      milestone_name: "IPD3.0",
      iteration: "V2.0",
      release_date: "2026-12-01",
      project_id: "P002",
    });
    const ms = mapToMilestone(payload);
    assert.equal(ms.remark, "IPD3.0");
    assert.equal(ms.iteration, "V2.0");
    assert.equal(ms.releaseDate, "2026-12-01");
    assert.equal(ms.projectId, "P002");
  });

  it("converts various date formats to ISO", () => {
    const payload = normalizePayload({
      record_id: "ms3",
      type: "milestone",
      milestone_name: "Test",
      deadline: "2027/03/15",
      project_id: "P003",
    });
    const ms = mapToMilestone(payload);
    assert.equal(ms.releaseDate, "2027-03-15");
  });

  it("defaults shape to diamond", () => {
    const payload = normalizePayload({
      record_id: "ms4",
      type: "milestone",
      milestone_name: "Test",
      project_id: "P004",
    });
    const ms = mapToMilestone(payload);
    assert.equal(ms.shape, "diamond");
  });

  it("uses recordId as milestone id fallback", () => {
    const payload = normalizePayload({
      record_id: "ms5",
      type: "milestone",
      milestone_name: "Test",
      project_id: "P005",
    });
    const ms = mapToMilestone(payload);
    assert.equal(ms.id, "ms5");
  });
});
