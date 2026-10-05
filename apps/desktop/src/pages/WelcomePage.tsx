import { useEffect, useState } from "react";
import { Alert, Button, Form } from "antd";
import * as stylex from "@stylexjs/stylex";
import x from "@stylexjs/atoms";
import { useLocation } from "wouter";
import SiteFormItems, { type SiteFormValues } from "../components/SiteFormItems";
import { createSite, listSites, setActiveSite } from "../lib/site";

export default function WelcomePage() {
  const [form] = Form.useForm<SiteFormValues>();
  const [, navigate] = useLocation();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 已有站点时回到主页（处理直接访问 /welcome 的情况）
  useEffect(() => {
    listSites()
      .then((sites) => {
        if (sites.length > 0) {
          navigate("/", { replace: true });
        }
      })
      .catch(() => {
        // 后端异常时留在欢迎页，创建时会把具体错误展示出来
      });
  }, [navigate]);

  const onFinish = async (values: SiteFormValues) => {
    setSubmitting(true);
    setError(null);
    try {
      const site = await createSite(
        values.name.trim(),
        values.description?.trim() || null,
      );
      // 首个站点即当前站点；失败不阻塞跳转，HomePage 有兜底逻辑
      await setActiveSite(site.id).catch(() => {});
      navigate("/", { replace: true });
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      {...stylex.props(
        x.display.flex,
        x.flexDirection.column,
        x.alignItems.center,
        x.justifyContent.center,
        x.height["100%"],
      )}
    >
      <div {...stylex.props(x.width["400px"])}>
        <div {...stylex.props(x.fontSize._28px, x.fontWeight._700)}>
          Wordma
        </div>
        <div
          {...stylex.props(
            x.fontSize._14px,
            x.marginTop._8px,
            x.marginBottom._28px,
            x.color["var(--ant-color-text-tertiary)"],
          )}
        >
          创建你的第一个站点空间，开始写作。
        </div>
        {error && (
          <div {...stylex.props(x.marginBottom._16px)}>
            <Alert type="error" showIcon message={error} />
          </div>
        )}
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <SiteFormItems />
          <Button type="primary" htmlType="submit" block loading={submitting}>
            创建站点
          </Button>
        </Form>
      </div>
    </div>
  );
}
