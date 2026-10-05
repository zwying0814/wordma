import { useState } from "react";
import { App as AntdApp, Button, Empty, Form, Input, Modal, Popconfirm, Spin } from "antd";
import { Pencil, Plus, Trash2 } from "lucide-react";
import * as stylex from "@stylexjs/stylex";
import x from "@stylexjs/atoms";
import { useLocation } from "wouter";
import { useSite } from "../context/SiteContext";
import { createPage, deletePage, type SitePage } from "../lib/pages";
import { pageStyles } from "../styles/page.stylex";

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function PageRow({
  page,
  showBorder,
  onDelete,
}: {
  page: SitePage;
  showBorder: boolean;
  onDelete: (id: number) => void;
}) {
  const [, navigate] = useLocation();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/pages/edit/${page.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter") navigate(`/pages/edit/${page.id}`);
      }}
      {...stylex.props(
        pageStyles.row,
        pageStyles.rowClickable,
        showBorder && pageStyles.rowBorder,
      )}
    >
      <div {...stylex.props(pageStyles.rowMain)}>
        <span {...stylex.props(pageStyles.rowTitle)}>
          {page.title || "（未命名页面）"}
        </span>
        <span {...stylex.props(pageStyles.rowMeta)}>
          /{page.slug} · {page.showInNav ? "显示在导航" : "不在导航中"}
        </span>
      </div>
      <div {...stylex.props(pageStyles.rowSide)}>
        <Button
          type="text"
          size="small"
          icon={<Pencil size={14} />}
          aria-label={`编辑页面「${page.title}」`}
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/pages/edit/${page.id}`);
          }}
        />
        <Popconfirm
          title="删除页面"
          description="删除后无法恢复，确定删除？"
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          onConfirm={() => onDelete(page.id)}
        >
          <Button
            type="text"
            size="small"
            danger
            icon={<Trash2 size={14} />}
            aria-label={`删除页面「${page.title}」`}
            onClick={(e) => e.stopPropagation()}
          />
        </Popconfirm>
      </div>
    </div>
  );
}

export default function PagesPage() {
  const { message } = AntdApp.useApp();
  const { activeSite, pages, pagesLoading, reloadPages } = useSite();
  const [, navigate] = useLocation();
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm<{ title: string; slug: string }>();

  const openCreate = () => {
    // 预填一个可用 slug，用户可改
    form.setFieldsValue({ title: "", slug: `page-${pages.length + 1}` });
    setModalOpen(true);
  };

  const handleCreate = async () => {
    let values: { title: string; slug: string };
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const slug = values.slug.trim().toLowerCase();
    if (!SLUG_RE.test(slug)) {
      message.error("slug 只能包含小写字母、数字和中划线");
      return;
    }
    setCreating(true);
    try {
      const page = await createPage(activeSite.id, values.title.trim(), slug);
      reloadPages();
      setModalOpen(false);
      navigate(`/pages/edit/${page.id}`);
    } catch (e) {
      message.error(String(e));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deletePage(id);
      reloadPages();
      message.success("页面已删除");
    } catch (e) {
      message.error(String(e));
    }
  };

  return (
    <div {...stylex.props(pageStyles.view)}>
      <div {...stylex.props(pageStyles.pageHead)}>
        <div>
          <div {...stylex.props(pageStyles.pageTitle)}>页面</div>
          <div {...stylex.props(pageStyles.pageSub)}>
            共 {pages.length} 个 · 独立页面会出现在站点导航中
          </div>
        </div>
        <Button type="primary" icon={<Plus size={14} />} onClick={openCreate}>
          新建页面
        </Button>
      </div>

      {pagesLoading ? (
        <div
          {...stylex.props(
            x.display.flex,
            x.justifyContent.center,
            x.padding._48px,
          )}
        >
          <Spin />
        </div>
      ) : pages.length === 0 ? (
        <div {...stylex.props(pageStyles.card, pageStyles.emptyBox)}>
          <Empty description="还没有页面，独立页面适合放置「关于」「友链」等内容。">
            <Button type="primary" icon={<Plus size={14} />} onClick={openCreate}>
              新建页面
            </Button>
          </Empty>
        </div>
      ) : (
        <div {...stylex.props(pageStyles.card)}>
          {pages.map((p, i) => (
            <PageRow
              key={p.id}
              page={p}
              showBorder={i < pages.length - 1}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <Modal
        title="新建页面"
        open={modalOpen}
        onOk={handleCreate}
        confirmLoading={creating}
        onCancel={() => setModalOpen(false)}
        okText="创建并编辑"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="title"
            label="页面标题"
            rules={[
              { required: true, whitespace: true, message: "请输入页面标题" },
            ]}
          >
            <Input placeholder="例如：关于我" />
          </Form.Item>
          <Form.Item
            name="slug"
            label="slug（生成访问路径 /slug）"
            rules={[
              { required: true, whitespace: true, message: "请输入 slug" },
              {
                pattern: SLUG_RE,
                message: "slug 只能包含小写字母、数字和中划线",
              },
            ]}
          >
            <Input placeholder="例如：about" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
