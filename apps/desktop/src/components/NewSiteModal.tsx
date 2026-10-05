import { useEffect, useState } from "react";
import { Alert, Form, Modal } from "antd";
import SiteFormItems, { type SiteFormValues } from "./SiteFormItems";
import { createSite, setActiveSite, type Site } from "../lib/site";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (site: Site) => void;
}

export default function NewSiteModal({ open, onClose, onCreated }: Props) {
  const [form] = Form.useForm<SiteFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 每次打开时重置表单
  useEffect(() => {
    if (open) {
      form.resetFields();
      setError(null);
    }
  }, [open, form]);

  const handleOk = async () => {
    let values: SiteFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return; // 校验失败，错误已显示在字段上
    }
    setSubmitting(true);
    setError(null);
    try {
      const site = await createSite(
        values.name.trim(),
        values.description?.trim() || null,
      );
      // 新站点设为当前站点；失败不阻塞创建结果
      await setActiveSite(site.id).catch(() => {});
      onCreated(site);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="新建站点"
      open={open}
      onOk={handleOk}
      confirmLoading={submitting}
      onCancel={onClose}
      okText="创建"
      cancelText="取消"
      mask={{ closable: !submitting }}
    >
      {error && (
        <Alert
          type="error"
          showIcon
          title={error}
          style={{ marginBottom: 16 }}
        />
      )}
      <Form form={form} layout="vertical">
        <SiteFormItems />
      </Form>
    </Modal>
  );
}
