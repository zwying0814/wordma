import { useState } from "react";
import {
  App as AntdApp,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Spin,
} from "antd";
import { Pencil, Plus, Trash2 } from "lucide-react";
import * as stylex from "@stylexjs/stylex";
import x from "@stylexjs/atoms";
import { useSite } from "../context/SiteContext";
import {
  createCategory,
  createTag,
  deleteCategory,
  deleteTag,
  renameCategory,
  renameTag,
} from "../lib/taxonomy";
import { pageStyles } from "../styles/page.stylex";

export type TaxonomyKind = "tag" | "category";

const NAME_MAX = 20;

interface Row {
  id: number;
  name: string;
  articleCount: number;
}

export function TagsPage() {
  return <TaxonomyPage kind="tag" />;
}

export function CategoriesPage() {
  return <TaxonomyPage kind="category" />;
}

/** 标签页与分类页共用：列表 + 新建/重命名弹窗 + 删除确认（布局对应设计稿 .card/.rowitem） */
function TaxonomyPage({ kind }: { kind: TaxonomyKind }) {
  const { message } = AntdApp.useApp();
  const {
    activeSite,
    tags,
    categories,
    taxonomyLoading,
    reloadTaxonomy,
    reloadArticles,
  } = useSite();
  const isTag = kind === "tag";
  const noun = isTag ? "标签" : "分类";
  const list: Row[] = isTag ? tags : categories;

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<{ name: string }>();

  const openRename = (row: Row) => {
    setEditing(row);
    setModalOpen(true);
  };

  const handleOk = async () => {
    let values: { name: string };
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const name = values.name.trim();
    setSaving(true);
    try {
      if (editing) {
        await (isTag ? renameTag(editing.id, name) : renameCategory(editing.id, name));
        message.success(`${noun}已重命名`);
      } else {
        await (isTag ? createTag(activeSite.id, name) : createCategory(activeSite.id, name));
        message.success(`${noun}已创建`);
      }
      setModalOpen(false);
      // 重命名/删除会影响文章的分类名与计数
      reloadTaxonomy();
      reloadArticles();
    } catch (e) {
      message.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: Row) => {
    try {
      await (isTag ? deleteTag(row.id) : deleteCategory(row.id));
      reloadTaxonomy();
      reloadArticles();
      message.success(`${noun}已删除`);
    } catch (e) {
      message.error(String(e));
    }
  };

  return (
    <div {...stylex.props(pageStyles.view)}>
      <div {...stylex.props(pageStyles.pageHead)}>
        <div>
          <div {...stylex.props(pageStyles.pageTitle)}>{noun}</div>
          <div {...stylex.props(pageStyles.pageSub)}>共 {list.length} 个</div>
        </div>
        {list.length > 0 && (
          <Button
            type="primary"
            icon={<Plus size={14} />}
            onClick={() => {
              form.resetFields();
              setEditing(null);
              setModalOpen(true);
            }}
          >
            新建{noun}
          </Button>
        )}
      </div>

      {taxonomyLoading ? (
        <div
          {...stylex.props(
            x.display.flex,
            x.justifyContent.center,
            x.padding._48px,
          )}
        >
          <Spin />
        </div>
      ) : list.length === 0 ? (
        <div {...stylex.props(pageStyles.card, pageStyles.emptyBox)}>
          <Empty
            description={
              isTag
                ? "还没有标签，标签帮助读者按主题找到相关文章。"
                : "还没有分类，分类是文章的一级归属，一篇文章只属于一个分类。"
            }
          >
            <Button
              type="primary"
              icon={<Plus size={14} />}
              onClick={() => {
                form.resetFields();
                setEditing(null);
                setModalOpen(true);
              }}
            >
              新建{noun}
            </Button>
          </Empty>
        </div>
      ) : (
        <div {...stylex.props(pageStyles.card)}>
          {list.map((row, i) => (
            <div
              key={row.id}
              {...stylex.props(
                pageStyles.row,
                i < list.length - 1 && pageStyles.rowBorder,
              )}
            >
              <div {...stylex.props(pageStyles.rowMain)}>
                <span {...stylex.props(pageStyles.rowTitle)}>{row.name}</span>
                <span {...stylex.props(pageStyles.rowMeta)}>
                  {row.articleCount} 篇文章
                </span>
              </div>
              <div {...stylex.props(pageStyles.rowSide)}>
                <Button
                  type="text"
                  size="small"
                  icon={<Pencil size={14} />}
                  aria-label={`重命名${noun}「${row.name}」`}
                  onClick={() => {
                    form.setFieldsValue({ name: row.name });
                    openRename(row);
                  }}
                />
                <Popconfirm
                  title={`删除${noun}`}
                  description="相关文章将解除关联，确定删除？"
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => handleDelete(row)}
                >
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<Trash2 size={14} />}
                    aria-label={`删除${noun}「${row.name}」`}
                  />
                </Popconfirm>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        title={editing ? `重命名${noun}` : `新建${noun}`}
        open={modalOpen}
        onOk={handleOk}
        confirmLoading={saving}
        onCancel={() => setModalOpen(false)}
        okText={editing ? "保存" : "创建"}
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="名称"
            rules={[
              { required: true, whitespace: true, message: "名称不能为空" },
              { max: NAME_MAX, message: `名称不能超过 ${NAME_MAX} 个字符` },
            ]}
          >
            <Input
              placeholder={isTag ? "例如：旅行" : "例如：户外"}
              onPressEnter={handleOk}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
