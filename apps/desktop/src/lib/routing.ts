import { invoke } from "@tauri-apps/api/core";

/** 路由规则表：占位符语法 [var]（post 支持 slug/id/year/month/day，其余仅 slug） */
export interface RoutingRules {
  index: string;
  indexPagination: string;
  post: string;
  page: string;
  category: string;
  tag: string;
  archive: string;
  feed: string;
}

/** 单条路由校验结果（供设置页可视化） */
export interface RouteCheck {
  route: string;
  ok: boolean;
  message: string | null;
  example: string | null;
}

export const getRoutingRules = (siteId: number): Promise<RoutingRules> =>
  invoke("get_routing_rules_cmd", { siteId });

export const setRoutingRules = (
  siteId: number,
  rules: RoutingRules,
): Promise<void> => invoke("set_routing_rules_cmd", { siteId, rules });

export const validateRouting = (rules: RoutingRules): Promise<RouteCheck[]> =>
  invoke("validate_routing_cmd", { rules });
