import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const sourcePath = new URL("../../CEA 2.X E_E Baseline Plan_2026_07_30_131351.xlsx", import.meta.url);
const outputPath = new URL("../public/CEA 2.X E_E Baseline Plan_2026_08_12_SIMULATED.xlsx", import.meta.url);
const enginePath = new URL("../public/vendor/xlsx.full.min.js", import.meta.url);

const context = {};
context.require = (name) => name === "fs" ? fs : undefined;
vm.createContext(context);
vm.runInContext(fs.readFileSync(enginePath, "utf8"), context);
const XLSX = context.XLSX;

const workbook = XLSX.read(fs.readFileSync(sourcePath), { type: "buffer", cellStyles: true, cellFormula: true });
const dataRows = XLSX.utils.sheet_to_json(workbook.Sheets.Data, { header: 1, raw: true, defval: "" });

function rowByProject(name) {
  const row = dataRows.find((item) => item[0] === name);
  if (!row) throw new Error(`Missing project: ${name}`);
  return row;
}

function milestonesFor(row) {
  return JSON.parse(row[1]);
}

function updateMilestone(projectName, iteration, updates) {
  const row = rowByProject(projectName);
  const milestones = milestonesFor(row);
  const milestone = milestones.find((item) => item.iteration === iteration);
  if (!milestone) throw new Error(`Missing milestone: ${projectName} / ${iteration}`);
  Object.assign(milestone, updates);
  if (updates.releaseDate) {
    const date = new Date(`${updates.releaseDate}T00:00:00Z`);
    milestone.year = date.getUTCFullYear();
    milestone.month = date.getUTCMonth() + 1;
    milestone.day = date.getUTCDate();
  }
  row[1] = JSON.stringify(milestones);
}

// 延期：14 天，触发高风险分类。
updateMilestone("PI Start (1st SW Submit)", "IPD5.0", {
  releaseDate: "2026-10-23",
  detailRemark: "Simulated: integration issue caused a two-week delay",
});

// 提前：7 天。
updateMilestone("HW Baseline Freeze", "IPD6.0", {
  releaseDate: "2026-08-14",
  remark: "Simulated: supplier readiness improved",
});

// 属性变化：颜色和详细说明。
updateMilestone("CSP31 CN B SUV EREV 6S VW416/5CN_E", "CEA 2.2", {
  color: "orange",
  detailRemark: "Simulated: changed from red to orange after risk review",
});

// 删除一个既有里程碑。
{
  const row = rowByProject("VW316/9CS_B1 Vehicle MS");
  row[1] = JSON.stringify(milestonesFor(row).filter((item) => item.iteration !== "PRS"));
}

// 新增一个里程碑。
{
  const row = rowByProject("CMP21 CS A SUV MY27 VW316/9CS_B");
  const milestones = milestonesFor(row);
  milestones.push({
    id: "ms_simulated_cea205_review",
    iteration: "CEA 2.0.5 Review",
    releaseDate: "2027-06-04",
    year: 2027,
    month: 6,
    day: 4,
    remark: "Simulated change",
    detailRemark: "Added for Excel comparison demonstration",
    color: "orange",
    shape: "diamond",
    textColor: "#1a1a1a",
    showWeek: true,
  });
  row[1] = JSON.stringify(milestones);
  row[2] = "Updated";
}

workbook.Sheets.Data = XLSX.utils.aoa_to_sheet(dataRows);
const output = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
fs.writeFileSync(fileURLToPath(outputPath), output);
console.log(`Created ${fileURLToPath(outputPath)}`);
