export type DeployProvider = 'local-folder' | 'github-pages';

export type DeployConfig = {
  provider: DeployProvider;
  siteUrl?: string;
  folder?: string;
  repo?: string;
  branch?: string;
};

export type DeployResult = {
  provider: DeployProvider;
  outputDir: string;
  files: number;
  target: string;
};

export function getDeployConfig(siteId: number): Promise<DeployConfig | null> {
  return window.api.invoke('get_deploy_config', { siteId }) as Promise<DeployConfig | null>;
}

export function setDeployConfig(
  siteId: number,
  config: DeployConfig
): Promise<DeployConfig> {
  return window.api.invoke('set_deploy_config', { siteId, config }) as Promise<DeployConfig>;
}

export function deploySite(siteId: number): Promise<DeployResult> {
  return window.api.invoke('deploy_site', { siteId }) as Promise<DeployResult>;
}
