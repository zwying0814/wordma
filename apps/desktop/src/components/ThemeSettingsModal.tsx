import { useEffect, useState } from "react";
import {
  App as AntdApp,
  ColorPicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Switch,
} from "antd";
import {
  getThemeSettings,
  setThemeSettings,
  type ThemeMeta,
  type ThemeSetting,
  type ThemeSettingsPayload,
} from "../lib/theme";

// 镜像后端 builtin_number_range（改后端必须同步）
const NUMBER_BOUNDS: Record<string, { min: number; max: number }> = {
  postsPerPage: { min: 1, max: 100 },
};

interface Props {
  siteId: number;
  theme: ThemeMeta | null;
  onClose: () => void;
}

/** 主题设置弹窗：按 theme.json 的 settings schema 生成表单 */
export default function ThemeSettingsModal({ siteId, theme, onClose }: Props) {
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm();
  const [payload, setPayload] = useState<ThemeSettingsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const themeName = theme?.name ?? "";

  useEffect(() => {
    if (!theme) return;
    setLoading(true);
    getThemeSettings(siteId, theme.name)
      .then((payload) => {
        setPayload(payload);
        form.setFieldsValue(payload.values);
      })
      .catch((e) => {
        message.error(String(e));
        onClose();
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, themeName, siteId]);

  if (!theme) {
    return null;
  }

  const handleOk = async () => {
    let values: Record<string, unknown>;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      await setThemeSettings(siteId, theme.name, values);
      message.success("主题设置已保存，点「生成预览」查看效果");
      onClose();
    } catch (e) {
      message.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  const renderControl = (setting: ThemeSetting) => {
    switch (setting.type) {
      case "textarea":
        return <Input.TextArea rows={3} />;
      case "number": {
        const bounds = NUMBER_BOUNDS[setting.key];
        return (
          <InputNumber
            precision={0}
            style={{ width: "100%" }}
            min={bounds?.min}
            max={bounds?.max}
          />
        );
      }
      case "switch":
        return <Switch />;
      case "select":
        return (
          <Select
            options={setting.options.map((o) => ({ value: o, label: o }))}
          />
        );
      case "color":
        return (
          <ColorPicker format="hex" showText />
        );
      default:
        return <Input />;
    }
  };

  const formItemProps = (setting: ThemeSetting) => {
    const props: Record<string, unknown> = {};
    if (setting.type === "switch") {
      props.valuePropName = "checked"; // Switch 绑定 checked 而非 value
    }
    const bounds = NUMBER_BOUNDS[setting.key];
    if (setting.type === "number" && bounds) {
      props.extra = `范围 ${bounds.min} - ${bounds.max}`;
    }
    return props;
  };

  return (
    <Modal
      title={`主题设置 · ${theme.displayName}`}
      open={!!theme}
      onOk={handleOk}
      confirmLoading={saving}
      onCancel={onClose}
      okText="保存"
      cancelText="取消"
      width={520}
    >
      {loading ? null : payload && payload.schema.length === 0 ? (
        <Empty description="该主题没有可配置的设置项" />
      ) : (
        <Form form={form} layout="vertical">
          {(payload?.schema ?? []).map((setting) => (
            <Form.Item
              key={setting.key}
              name={setting.key}
              label={setting.label}
              getValueFromEvent={
                setting.type === "color"
                  ? (c: { toHexString: () => string }) => c.toHexString()
                  : undefined
              }
              {...formItemProps(setting)}
            >
              {renderControl(setting)}
            </Form.Item>
          ))}
        </Form>
      )}
    </Modal>
  );
}
