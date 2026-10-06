import { useCallback, useEffect, useRef, useState } from "react";
import { App as AntdApp, Button, Empty, Modal, Popconfirm, Spin } from "antd";
import { Film, Trash2, Upload } from "lucide-react";
import * as stylex from "@stylexjs/stylex";
import x from "@stylexjs/atoms";
import {
  deleteMedia,
  formatBytes,
  listMedia,
  mediaItemSrc,
  mediaPublicUrl,
  uploadMedia,
  type MediaItem,
} from "../lib/media";
import { useSite } from "../context/SiteContext";

const styles = stylex.create({
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
    gap: 12,
  },
  item: {
    position: "relative",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "var(--ant-color-border-secondary)",
    borderRadius: 8,
    overflow: "hidden",
    cursor: "pointer",
    backgroundColor: "var(--ant-color-fill-quaternary)",
  },
  itemSelected: {
    borderColor: "var(--ant-color-primary)",
    borderWidth: 2,
  },
  thumb: {
    width: "100%",
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
  meta: {
    padding: "6px 8px",
    fontSize: 11,
    color: "var(--ant-color-text-tertiary)",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
  videoBadge: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    color: "var(--ant-color-text-tertiary)",
    fontSize: 11,
    padding: 8,
    textAlign: "center",
  },
  uploadRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
});

interface Props {
  open: boolean;
  /** 关闭弹窗：url 为 null 表示取消 */
  onClose: (url: string | null) => void;
}

/** 媒体库选择弹窗：供编辑器插入图片（选择已有或先上传） */
export default function MediaPickerModal({ open, onClose }: Props) {
  const { message } = AntdApp.useApp();
  const { activeSite } = useSite();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(() => {
    setLoading(true);
    listMedia(activeSite.id)
      .then(setItems)
      .catch((e) => message.error(String(e)))
      .finally(() => setLoading(false));
  }, [activeSite.id, message]);

  useEffect(() => {
    if (open) {
      setSelected(null);
      reload();
    }
  }, [open, reload]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await uploadMedia(activeSite.id, file);
      }
      reload();
    } catch (e) {
      message.error(String(e));
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async (item: MediaItem) => {
    try {
      await deleteMedia(item.id);
      if (selected?.id === item.id) setSelected(null);
      reload();
    } catch (e) {
      message.error(String(e));
    }
  };

  const handleOk = () => {
    if (!selected) {
      message.warning("请先选择一个媒体文件");
      return;
    }
    onClose(mediaPublicUrl(selected));
  };

  return (
    <Modal
      title="从媒体库插入图片"
      open={open}
      width={720}
      onCancel={() => onClose(null)}
      onOk={handleOk}
      okText="插入"
      cancelText="取消"
      okButtonProps={{ disabled: selected === null }}
    >
      <div {...stylex.props(styles.uploadRow)}>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,video/mp4,video/webm,video/quicktime"
          hidden
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <Button
          type="primary"
          icon={<Upload size={14} />}
          loading={uploading}
          onClick={() => inputRef.current?.click()}
        >
          上传图片/视频
        </Button>
      </div>

      {loading ? (
        <div {...stylex.props(x.display.flex, x.justifyContent.center, x.padding._48px)}>
          <Spin />
        </div>
      ) : items.length === 0 ? (
        <Empty description="媒体库还是空的，先上传几张图片吧。" />
      ) : (
        <div {...stylex.props(styles.grid)}>
          {items.map((item) => (
            <div
              key={item.id}
              onClick={(e) => {
                // 点击删除按钮时不要误选中该条目
                if ((e.target as HTMLElement).closest("button")) return;
                setSelected(item);
              }}
              {...stylex.props(
                styles.item,
                selected?.id === item.id && styles.itemSelected,
              )}
            >
              <div {...stylex.props(styles.thumb)}>
                {item.kind === "image" ? (
                  <img
                    src={mediaItemSrc(item)}
                    alt={item.originalName}
                    {...stylex.props(styles.thumbMedia)}
                  />
                ) : (
                  <div {...stylex.props(styles.videoBadge)}>
                    <Film size={22} />
                    {item.originalName}
                  </div>
                )}
              </div>
              <div {...stylex.props(styles.meta)}>
                {item.originalName} · {formatBytes(item.size)}
              </div>
              {open && (
                <div
                  style={{ position: "absolute", top: 4, right: 4 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Popconfirm
                    title="删除媒体"
                    description="文章中的引用将失效，确定删除？"
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => handleRemove(item)}
                  >
                    <Button size="small" danger icon={<Trash2 size={14} />} />
                  </Popconfirm>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
