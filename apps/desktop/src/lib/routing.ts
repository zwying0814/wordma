export type RouteKey =
  | 'index'
  | 'indexPagination'
  | 'post'
  | 'page'
  | 'category'
  | 'tag'
  | 'archive'
  | 'feed';

export type RoutingRules = Record<RouteKey, string>;

export type RouteCheck = {
  key: RouteKey;
  route: string;
  ok: boolean;
  message?: string;
  example?: string;
};

export function getRoutingRules(siteId: number): Promise<RoutingRules> {
  return window.api.invoke('get_routing_rules', { siteId }) as Promise<RoutingRules>;
}

export function validateRoutingRules(
  siteId: number,
  rules: RoutingRules
): Promise<RouteCheck[]> {
  return window.api.invoke('validate_routing_rules', {
    siteId,
    rules,
  }) as Promise<RouteCheck[]>;
}

export function setRoutingRules(
  siteId: number,
  rules: RoutingRules
): Promise<RouteCheck[]> {
  return window.api.invoke('set_routing_rules', {
    siteId,
    rules,
  }) as Promise<RouteCheck[]>;
}
