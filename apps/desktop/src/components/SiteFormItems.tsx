import { Form, Input } from "antd";

export interface SiteFormValues {
  name: string;
  description?: string;
}

export const SITE_NAME_MAX = 30;
export const SITE_DESC_MAX = 100;

/** 站点名称/描述两个字段，欢迎页与新建站点弹窗共用 */
export default function SiteFormItems() {
  return (
    <>
      <Form.Item<SiteFormValues>
        name="name"
        label="站点名称"
        rules={[
          { required: true, whitespace: true, message: "请输入站点名称" },
          { max: SITE_NAME_MAX, message: `名称不能超过 ${SITE_NAME_MAX} 个字符` },
        ]}
      >
        <Input placeholder="例如：我的博客" />
      </Form.Item>
      <Form.Item<SiteFormValues>
        name="description"
        label="站点描述（可选）"
        rules={[{ max: SITE_DESC_MAX, message: `描述不能超过 ${SITE_DESC_MAX} 个字符` }]}
      >
        <Input placeholder="一句话介绍这个站点" />
      </Form.Item>
    </>
  );
}
