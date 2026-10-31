import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { mediaItemSrc, mediaPublicUrl, uploadMedia } from "@/lib/media";
import { useSite } from "@/context/SiteContext";

/** 编辑器媒体：公开 URL ↔ asset URL 映射、粘贴上传、媒体库选择 */
export function useEditorMedia() {
  const { activeSite, media, reloadMedia } = useSite();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickResolver = useRef<((url: string | null) => void) | null>(null);

  const imageUrls = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of media) {
      map.set(mediaPublicUrl(item), mediaItemSrc(item));
    }
    return map;
  }, [media]);

  const handlePasteImage = async (file: File) => {
    const toastId = toast.loading(`正在上传 ${file.name}…`);
    try {
      const item = await uploadMedia(activeSite.id, file);
      reloadMedia();
      toast.success("图片已上传", { id: toastId });
      return mediaPublicUrl(item);
    } catch (e) {
      toast.error(String(e), { id: toastId });
      return null;
    }
  };

  const handlePickImage = () =>
    new Promise<string | null>((resolve) => {
      pickResolver.current = resolve;
      setPickerOpen(true);
    });

  const closePicker = (url: string | null) => {
    pickResolver.current?.(url);
    pickResolver.current = null;
    setPickerOpen(false);
  };

  return {
    imageUrls,
    pickerOpen,
    handlePasteImage,
    handlePickImage,
    closePicker,
  };
}
