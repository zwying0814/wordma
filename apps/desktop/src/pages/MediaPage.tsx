import { useEffect, useState } from "react";
import { App as AntdApp, Button, Empty, Popconfirm, Upload } from "antd";
import { Copy, Film, Trash2, Upload as UploadIcon } from "lucide-react";
import * as stylex from "@stylexjs/stylex";
import x from "@stylexjs/atoms";
import { useSite } from "../context/SiteContext";
import {
  deleteMedia,
  formatBytes,
  mediaItemSrc,
  mediaPublicUrl,
  uploadMedia,
  type MediaItem,
} from "../lib/media";
import { pageStyles } from "../styles/page.stylex";

const styles = stylex.create({
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: 14,
  },
  item: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "var(--ant-color-bg-container)",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "var(--ant-color-border-secondary)",
    borderRadius: 10,
    overflow: "hidden",
  },
  thumb: {
    aspectRatio: "4 / 3",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "var(--ant-color-fill-tertiary)",
  },
  thumbMedia: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  videoBadge: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    color: "var(--ant-color-text-tertiary)",
    fontSize: 12,
    padding: 12,
    textAlign: "center",
    wordBreak: "break-all",
  },
  info: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "8px 10px",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "var(--ant-color-border-secondary)",
  },
  name: {
    fontSize: 12,
    color: "var(--ant-color-text-secondary)",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    minWidth: 0,
  },
  size: {
    flexShrink: 0,
    fontSize: 11,
    color: "var(--ant-color-text-quaternary)",
  },
});

export default function MediaPage() {
  const { message } = AntdApp.useApp();
  const { activeSite, media, reloadMedia } = useSite();
  const items = media;
  const [uploading, setUploading] = useState(false);

  const reload = reloadMedia;

  useEffect(() => {
    reload();
  }, [reload]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await uploadMedia(activeSite.id, file);
      reload();
      message.success(`「${file.name}」已上传`);
    } catch (e) {
      message.error(String(e));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (item: MediaItem) => {
    try {
      await deleteMedia(item.id);
      reload();
      message.success("媒体文件已删除");
    } catch (e) {
      message.error(String(e));
    }
  };

  const copyMarkdown = (item: MediaItem) => {
    const md = item.kind === "image"
      ? `![${item.originalName}](${mediaPublicUrl(item)})`
      : `[${item.originalName}](${mediaPublicUrl(item)})`;
    navigator.clipboard
      .writeText(md)
      .then(() => message.success("Markdown 已复制，可粘贴到文章中"))
      .catch(() => message.error("复制失败"));
  };

  return (
    <div {...stylex.props(pageStyles.view)}>
      <div {...stylex.props(pageStyles.pageHead)}>
        <div>
          <div {...stylex.props(pageStyles.pageTitle)}>媒体库</div>
          <div {...stylex.props(pageStyles.pageSub)}>
            共 {items?.length ?? 0} 个文件 · 上传图片和视频，在文章编辑器中插入
          </div>
        </div>
        <Upload
          multiple
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,video/mp4,video/webm,video/quicktime"
          showUploadList={false}
          customRequest={({ file }) => {
            handleUpload(file as File);
          }}
        >
          <Button type="primary" icon={<UploadIcon size={14} />} loading={uploading}>
            上传
          </Button>
        </Upload>
      </div>

      {items.length === 0 ? (
        <div {...stylex.props(pageStyles.card, pageStyles.emptyBox)}>
          <Empty description="媒体库还是空的，上传图片或视频后即可在文章中插入。" />
        </div>
      ) : (
        <div {...stylex.props(styles.grid)}>
          {items.map((item) => (
            <div key={item.id} {...stylex.props(styles.item)}>
              <div {...stylex.props(styles.thumb)}>
                {item.kind === "image" ? (
                  <img
                    src={mediaItemSrc(item)}
                    alt={item.originalName}
                    loading="lazy"
                    {...stylex.props(styles.thumbMedia)}
                  />
                ) : (
                  <div {...stylex.props(styles.videoBadge)}>
                    <Film size={26} />
                    {item.originalName}
                  </div>
                )}
              </div>
              <div {...stylex.props(styles.info)}>
                <span {...stylex.props(styles.name)} title={item.originalName}>
                  {item.originalName}
                </span>
                <span {...stylex.props(styles.size)}>
                  {formatBytes(item.size)}
                </span>
              </div>
              <div
                {...stylex.props(
                  x.display.flex,
                  x.gap._4px,
                  x.paddingBottom._8px,
                  x.justifyContent.center,
                )}
              >
                <Button
                  size="small"
                  icon={<Copy size={13} />}
                  onClick={() => copyMarkdown(item)}
                  title="复制 Markdown 引用"
                />
                <Popconfirm
                  title="删除媒体"
                  description="文章中的引用将失效，确定删除？"
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => handleDelete(item)}
                >
                  <Button
                    size="small"
                    danger
                    icon={<Trash2 size={13} />}
                    aria-label={`删除「${item.originalName}」`}
                  />
                </Popconfirm>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
