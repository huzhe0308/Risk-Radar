export type MilestoneShape = string;

export type Milestone = {
  id: string;
  iteration: string;
  releaseDate: string;
  remark: string;
  detailRemark: string;
  color: string;
  textColor: string;
  shape: MilestoneShape;
  week?: number;
  year?: number;
};

export type Project = {
  uuid: string;
  name: string;
  tag: string;
  detailRemark: string;
  bgColor: string;
  textColor: string;
  milestones: Milestone[];
  viewId: string;
  rowHeight?: number;
  showSeparatorAbove?: boolean;
};

export type View = {
  id: string;
  parentViewId?: string;
  name: string;
  type: "chart" | "whiteboard" | "plan";
  startDate: string;
  endDate: string;
  content: string;
  columnWidth?: number;
  projects: Project[];
  connections: Connection[];
  planItems?: PlanItem[];
};

export type PlanItem = {
  id: string;
  kind: "frame" | "text";
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
  fontSize?: number;
  manualSize?: boolean;
  startWeek?: number;
  startYear?: number;
  endWeek?: number;
  endYear?: number;
  projectId?: string;
  parentFrameId?: string;
  bindingDisabled?: boolean;
};

export type Connection = {
  id: string;
  fromProject: string;
  fromMsId: string;
  toProject: string;
  toMsId: string;
  shape: "straight" | "polyline";
  lineType: string;
  color: string;
};

export type AppData = {
  version: number;
  title: string;
  theme: string;
  background: string;
  activeViewId: string;
  views: View[];
  deletedConnectionIds?: string[];
};
